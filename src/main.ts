import { InstanceBase, InstanceStatus, type SomeCompanionConfigField } from '@companion-module/base'
import { UpdateActions, type ActionsSchema } from './actions.js'
import { GetConfigFields, parseProtectedPorts, PROFILE_SLOTS, type ModuleConfig } from './config.js'
import { UpdateFeedbacks, type FeedbacksSchema } from './feedbacks.js'
import { UpdatePresets } from './presets.js'
import { entryMatches, formatProfile, parseProfile } from './profiles.js'
import { SwitchClient, type Port, type SwitchState } from './switch.js'
import { UpgradeScripts } from './upgrades.js'
import { getVariableValues, UpdateVariableDefinitions, type VariablesSchema } from './variables.js'

export type ModuleSchema = {
	config: ModuleConfig
	secrets: undefined
	actions: ActionsSchema
	feedbacks: FeedbacksSchema
	variables: VariablesSchema
}

export { UpgradeScripts }

const sleep = async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const EMPTY_STATE: SwitchState = { model: '', systemName: '', ports: new Map(), vlans: new Map() }

export default class Cbs350Instance extends InstanceBase<ModuleSchema> {
	config!: ModuleConfig // Set in init()

	state: SwitchState = EMPTY_STATE
	selectedPortId: number | null = null
	selectedProfile: number | null = null
	// True when the running-config was changed by this module and not saved yet
	unsavedChanges = false
	lastSave = ''

	#client: SwitchClient | null = null
	#pollTimer: NodeJS.Timeout | null = null
	#runningPoll: Promise<void> | null = null
	#queuedPoll: Promise<void> | null = null
	// Detects when the port/VLAN lists change, to rebuild the definitions only then
	#definitionsSignature = ''

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig): Promise<void> {
		this.config = config
		this.updateDefinitions(true)
		this.connect()
	}

	async destroy(): Promise<void> {
		this.disconnect()
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		const previous = this.config
		this.config = config
		// Storing or renaming a profile saves the config too: only reconnect when the connection changed
		if (
			config.host !== previous.host ||
			config.community !== previous.community ||
			config.pollInterval !== previous.pollInterval ||
			!this.#client
		) {
			this.connect()
		} else {
			this.updateDefinitions(true)
			this.updateVariables()
			this.checkAllFeedbacks()
		}
	}

	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	// ---------------------------------------------------------------- Connection and polling

	disconnect(): void {
		if (this.#pollTimer) clearInterval(this.#pollTimer)
		this.#pollTimer = null
		this.#client?.close()
		this.#client = null
	}

	connect(): void {
		this.disconnect()

		if (!this.config.host) {
			this.updateStatus(InstanceStatus.BadConfig, 'Missing switch IP')
			return
		}

		this.updateStatus(InstanceStatus.Connecting)
		this.#client = new SwitchClient(this.config.host, this.config.community)
		this.#client.onError((e) => this.log('error', `SNMP session error: ${e.message}`))

		void this.poll()
		this.#pollTimer = setInterval(() => {
			if (!this.#runningPoll) void this.poll()
		}, this.config.pollInterval || 10000)
	}

	// Resolves once the switch has been read entirely after this call, so awaiting it after
	// a change always gives fresh values (a poll already running may have read stale ones)
	async poll(): Promise<void> {
		if (!this.#runningPoll) {
			this.#runningPoll = this.#readSwitch().finally(() => {
				this.#runningPoll = null
			})
			return this.#runningPoll
		}
		this.#queuedPoll ??= this.#runningPoll.then(async () => {
			this.#queuedPoll = null
			return this.poll()
		})
		return this.#queuedPoll
	}

	async #readSwitch(): Promise<void> {
		const client = this.#client
		if (!client) return
		try {
			const state = await client.readState()
			if (client !== this.#client) return // disconnected meanwhile
			this.state = state
			this.updateStatus(InstanceStatus.Ok)
			this.updateDefinitions()
			this.updateVariables()
			this.checkAllFeedbacks()
		} catch (e) {
			if (client !== this.#client) return
			const message = e instanceof Error ? e.message : String(e)
			this.log('error', `Polling failed: ${message}`)
			this.updateStatus(InstanceStatus.ConnectionFailure, message)
		}
	}

	// ---------------------------------------------------------------- Port changes

	get protectedPorts(): Set<number> {
		return parseProtectedPorts(this.config)
	}

	get selectedPort(): Port | undefined {
		return this.selectedPortId === null ? undefined : this.state.ports.get(this.selectedPortId)
	}

	selectPort(portId: number): void {
		this.selectedPortId = portId
		this.updateVariables()
		this.checkAllFeedbacks()
	}

	// Returns the port if it exists and is not protected, logs the reason otherwise
	#writablePort(portId: number): Port | undefined {
		const port = this.state.ports.get(portId)
		if (!port) {
			this.log('warn', `Port ${portId} unknown`)
			return undefined
		}
		if (this.protectedPorts.has(portId)) {
			this.log('warn', `Port ${port.shortName} is protected (module config), not modified`)
			return undefined
		}
		return port
	}

	#vlanExists(vlan: number): boolean {
		// The switch silently accepts nonexistent VLANs, which leaves the port inactive
		if (this.state.vlans.has(vlan)) return true
		this.log('warn', `VLAN ${vlan} does not exist on the switch`)
		return false
	}

	// Runs a configuration change; returns false (and logs) on failure
	async #change(port: Port, description: string, write: (client: SwitchClient) => Promise<void>): Promise<boolean> {
		const client = this.#client
		if (!client) return false
		try {
			await write(client)
			this.log('info', `Port ${port.shortName}: ${description}`)
			this.unsavedChanges = true
			return true
		} catch (e) {
			this.log('error', `Port ${port.shortName}: failed to set ${description}: ${e instanceof Error ? e.message : e}`)
			return false
		}
	}

	// Saves if requested or configured, then refreshes the state from the switch
	async #afterChange(save = false): Promise<void> {
		if (save || this.config.saveOnChange) await this.saveSwitchConfig()
		await this.poll()
	}

	// Access mode on the given VLAN; without vlan, keeps the port's previous access VLAN
	async setPortAccess(portId: number, vlan: number | undefined, resetLink: boolean): Promise<void> {
		const port = this.#writablePort(portId)
		if (!port) return
		const targetVlan = vlan ?? (port.accessVlan || 1)
		if (!this.#vlanExists(targetVlan)) return

		if (await this.#change(port, `access VLAN ${targetVlan}`, async (c) => c.setAccess(port, targetVlan))) {
			if (resetLink) await this.resetPortLink(portId)
			await this.#afterChange()
		}
	}

	async setPortTrunk(portId: number, nativeVlan: number, resetLink: boolean): Promise<void> {
		const port = this.#writablePort(portId)
		if (!port || !this.#vlanExists(nativeVlan)) return

		if (await this.#change(port, `trunk, native VLAN ${nativeVlan}`, async (c) => c.setTrunk(port, nativeVlan))) {
			if (resetLink) await this.resetPortLink(portId)
			await this.#afterChange()
		}
	}

	async setPortEnabled(portId: number, state: 'enable' | 'disable' | 'toggle'): Promise<void> {
		const port = this.#writablePort(portId)
		if (!port) return
		const enable = state === 'toggle' ? !port.enabled : state === 'enable'

		if (await this.#change(port, enable ? 'enabled' : 'disabled (shutdown)', async (c) => c.setEnabled(port, enable))) {
			await this.#afterChange()
		}
	}

	async setPortDescription(portId: number, description: string): Promise<void> {
		const port = this.#writablePort(portId)
		if (!port) return

		if (await this.#change(port, `description "${description}"`, async (c) => c.setDescription(port, description))) {
			await this.#afterChange()
		}
	}

	#poePort(portId: number): (Port & { poe: NonNullable<Port['poe']> }) | undefined {
		const port = this.#writablePort(portId)
		if (!port) return undefined
		if (!port.poe) {
			this.log('warn', `Port ${port.shortName} has no PoE`)
			return undefined
		}
		return port as Port & { poe: NonNullable<Port['poe']> }
	}

	async setPortPoe(portId: number, state: 'on' | 'off' | 'toggle'): Promise<void> {
		const port = this.#poePort(portId)
		if (!port) return
		const enable = state === 'toggle' ? !port.poe.enabled : state === 'on'

		if (await this.#change(port, enable ? 'PoE on' : 'PoE off', async (c) => c.setPoe(port, enable))) {
			await this.#afterChange()
		}
	}

	// Power-cycles the connected device; the configuration is unchanged at the end
	async resetPortPoe(portId: number, offSeconds: number): Promise<void> {
		const port = this.#poePort(portId)
		const client = this.#client
		if (!port || !client) return
		if (!port.poe.enabled) {
			this.log('warn', `Port ${port.shortName}: PoE is off, nothing to reset`)
			return
		}
		try {
			await client.setPoe(port, false)
			this.log('info', `Port ${port.shortName}: PoE off for ${offSeconds}s`)
			void this.poll()
			await sleep(offSeconds * 1000)
			await client.setPoe(port, true)
			this.log('info', `Port ${port.shortName}: PoE back on`)
		} catch (e) {
			this.log('error', `Port ${port.shortName}: PoE reset failed: ${e instanceof Error ? e.message : e}`)
		}
		await this.poll()
	}

	// Shut / no shut: renews the link (and the device DHCP lease) without changing the configuration
	async resetPortLink(portId: number): Promise<void> {
		const port = this.#writablePort(portId)
		const client = this.#client
		if (!port || !client) return
		try {
			await client.setEnabled(port, false)
			await sleep(3000)
			await client.setEnabled(port, true)
			this.log('info', `Port ${port.shortName}: link reset`)
		} catch (e) {
			this.log('error', `Port ${port.shortName}: link reset failed: ${e instanceof Error ? e.message : e}`)
		}
		await this.poll()
	}

	// Equivalent of "copy running-config startup-config" (write memory)
	async saveSwitchConfig(): Promise<void> {
		const client = this.#client
		if (!client) return
		try {
			await client.saveConfig()
			this.unsavedChanges = false
			this.lastSave = new Date().toLocaleTimeString()
			this.log('info', 'Running-config saved to startup-config')
		} catch (e) {
			this.log('error', `Failed to save config: ${e instanceof Error ? e.message : e}`)
		}
		this.updateVariables()
		this.checkFeedbacks('unsaved_changes')
	}

	// ---------------------------------------------------------------- Profiles

	profileName(slot: number): string {
		return this.config[`profile_${slot}_name`] || `Profile ${slot}`
	}

	profileText(slot: number): string {
		return this.config[`profile_${slot}`] ?? ''
	}

	// Current layout of the non-protected ports, in profile syntax
	get currentProfile(): string {
		const protectedPorts = this.protectedPorts
		return formatProfile([...this.state.ports.values()].filter((p) => !protectedPorts.has(p.id)))
	}

	isProfileActive(text: string): boolean {
		const { entries, errors } = parseProfile(text)
		return (
			entries.length > 0 && errors.length === 0 && entries.every((e) => entryMatches(e, this.state.ports.get(e.portId)))
		)
	}

	selectProfile(slot: number): void {
		this.selectedProfile = slot
		this.updateVariables()
		this.checkFeedbacks('profile_selected', 'selected_profile_active')
	}

	// Validates the whole profile first so it is never applied partially because of a typo
	async applyProfile(text: string, save: boolean): Promise<void> {
		const { entries, errors } = parseProfile(text)
		for (const entry of entries) {
			if (!this.state.ports.has(entry.portId)) errors.push(`port ${entry.portId} unknown`)
			else if (this.protectedPorts.has(entry.portId)) errors.push(`port ${entry.portId} is protected`)
			if (!this.state.vlans.has(entry.vlan)) errors.push(`VLAN ${entry.vlan} does not exist`)
		}
		if (entries.length === 0 && errors.length === 0) errors.push('profile is empty')
		if (errors.length > 0) {
			this.log('warn', `Profile not applied: ${errors.join('; ')}`)
			return
		}

		let changed = 0
		for (const entry of entries) {
			const port = this.state.ports.get(entry.portId)
			if (!port || entryMatches(entry, port)) continue
			const ok =
				entry.mode === 'trunk'
					? await this.#change(port, `trunk, native VLAN ${entry.vlan}`, async (c) => c.setTrunk(port, entry.vlan))
					: await this.#change(port, `access VLAN ${entry.vlan}`, async (c) => c.setAccess(port, entry.vlan))
			if (ok) changed++
		}
		this.log('info', `Profile applied: ${changed} port(s) changed, ${entries.length - changed} already set`)
		if (changed > 0) await this.#afterChange(save)
	}

	async recallProfile(slot: number, save: boolean): Promise<void> {
		const text = this.profileText(slot)
		if (!text) {
			this.log('warn', `${this.profileName(slot)} is empty`)
			return
		}
		await this.applyProfile(text, save)
	}

	storeProfile(slot: number): void {
		const profile = this.currentProfile
		if (!profile) {
			this.log('warn', 'Switch state unknown, profile not stored')
			return
		}
		this.config = { ...this.config, [`profile_${slot}`]: profile }
		this.saveConfig(this.config)
		this.log('info', `${this.profileName(slot)} stored: ${profile}`)
		this.updateVariables()
		this.checkFeedbacks('profile_slot_active', 'selected_profile_active')
	}

	renameProfile(slot: number, name: string): void {
		const newName = name.trim()
		if (!newName) {
			this.log('warn', 'Empty profile name, not renamed')
			return
		}
		this.config = { ...this.config, [`profile_${slot}_name`]: newName }
		this.saveConfig(this.config)
		this.log('info', `Profile ${slot} renamed to "${newName}"`)
		this.updateDefinitions(true) // dropdowns show the profile names
		this.updateVariables()
	}

	// ---------------------------------------------------------------- Definitions and variables

	updateVariables(): void {
		this.setVariableValues(getVariableValues(this))
	}

	// Rebuilds the definitions when forced or when the port/VLAN lists changed,
	// so dropdowns and presets follow the switch without resetting them on every poll
	updateDefinitions(force = false): void {
		const signature = JSON.stringify([
			[...this.state.ports.values()].map((p) => [p.id, p.shortName, p.description, p.poe !== undefined]),
			[...this.state.vlans.values()].map((v) => [v.id, v.name]),
		])
		if (!force && signature === this.#definitionsSignature) return
		this.#definitionsSignature = signature

		UpdateActions(this)
		UpdateFeedbacks(this)
		UpdateVariableDefinitions(this)
		UpdatePresets(this)
	}

	profileSlots(): number[] {
		return Array.from({ length: PROFILE_SLOTS }, (_, i) => i + 1)
	}
}
