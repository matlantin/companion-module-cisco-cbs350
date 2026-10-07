import type { CompanionActionDefinitions, SomeCompanionActionInputField } from '@companion-module/base'
import { portChoices, profileSlotChoices, vlanChoices } from './choices.js'
import type Cbs350Instance from './main.js'

type ModeOptions = { mode: 'access' | 'trunk'; native_vlan?: number; bounce?: boolean }
type PoeState = 'on' | 'off' | 'toggle'
type EnabledState = 'enable' | 'disable' | 'toggle'

// Port actions exist for a given port and for the selected port.
// Action ids are kept from earlier versions so that existing buttons keep working.
export type ActionsSchema = {
	select_port: { options: { port: string } }
	set_access_vlan: { options: { port: string; vlan: number; bounce?: boolean } }
	set_selected_port_vlan: { options: { vlan: number; bounce?: boolean } }
	set_port_mode: { options: { port: string } & ModeOptions }
	set_selected_port_mode: { options: ModeOptions }
	bounce_port: { options: { port: string } }
	bounce_selected_port: { options: Record<string, never> }
	poe_reset_port: { options: { port: string; off_seconds: number } }
	poe_reset_selected_port: { options: { off_seconds: number } }
	set_poe_port: { options: { port: string; state: PoeState } }
	set_poe_selected_port: { options: { state: PoeState } }
	set_enabled_port: { options: { port: string; state: EnabledState } }
	set_enabled_selected_port: { options: { state: EnabledState } }
	set_description_port: { options: { port: string; description: string } }
	set_description_selected_port: { options: { description: string } }
	apply_profile: { options: { profile: string; save: boolean } }
	select_profile: { options: { slot: number } }
	store_profile: { options: { slot: number } }
	store_selected_profile: { options: Record<string, never> }
	recall_profile: { options: { slot: number; save: boolean } }
	recall_selected_profile: { options: { save: boolean } }
	rename_profile: { options: { slot: number; name: string } }
	rename_selected_profile: { options: { name: string } }
	save_config: { options: Record<string, never> }
	refresh_status: { options: Record<string, never> }
}

export function UpdateActions(self: Cbs350Instance): void {
	const ports = portChoices(self)
	const vlans = vlanChoices(self)

	const portOption = {
		type: 'dropdown',
		label: 'Port',
		id: 'port',
		choices: ports,
		default: ports[0]?.id ?? '1',
	} as const satisfies SomeCompanionActionInputField
	const vlanOption = {
		type: 'dropdown',
		label: 'VLAN',
		id: 'vlan',
		choices: vlans,
		default: vlans[0]?.id ?? 1,
	} as const satisfies SomeCompanionActionInputField
	const resetLinkOption = {
		type: 'checkbox',
		label: 'Reset link after change (forces a DHCP renewal on the device)',
		id: 'bounce',
		default: false,
	} as const satisfies SomeCompanionActionInputField
	const modeOptions = [
		{
			type: 'dropdown',
			label: 'Mode',
			id: 'mode',
			choices: [
				{ id: 'access', label: 'Access (keep previous access VLAN)' },
				{ id: 'trunk', label: 'Trunk (all VLANs tagged)' },
			],
			default: 'access',
			disableAutoExpression: true, // used by isVisibleExpression below
		},
		{
			type: 'dropdown',
			label: 'Native (untagged) VLAN',
			id: 'native_vlan',
			choices: vlans,
			default: 1,
			isVisibleExpression: `$(options:mode) == 'trunk'`,
		},
		resetLinkOption,
	] as const satisfies SomeCompanionActionInputField[]
	const poeResetOptions = [
		{ type: 'number', label: 'Power off duration (s)', id: 'off_seconds', default: 5, min: 1, max: 60 },
	] as const satisfies SomeCompanionActionInputField[]
	const poeStateOptions = [
		{
			type: 'dropdown',
			label: 'PoE',
			id: 'state',
			choices: [
				{ id: 'toggle', label: 'Toggle' },
				{ id: 'on', label: 'On' },
				{ id: 'off', label: 'Off (power inline never)' },
			],
			default: 'toggle',
		},
	] as const satisfies SomeCompanionActionInputField[]
	const enabledStateOptions = [
		{
			type: 'dropdown',
			label: 'State',
			id: 'state',
			choices: [
				{ id: 'toggle', label: 'Toggle' },
				{ id: 'enable', label: 'Enable' },
				{ id: 'disable', label: 'Disable (shutdown)' },
			],
			default: 'toggle',
		},
	] as const satisfies SomeCompanionActionInputField[]
	const descriptionOptions = [
		{ type: 'textinput', label: 'Description (empty to clear)', id: 'description', default: '', useVariables: true },
	] as const satisfies SomeCompanionActionInputField[]
	const profileSlotOption = {
		type: 'dropdown',
		label: 'Profile slot',
		id: 'slot',
		choices: profileSlotChoices(self),
		default: 1,
	} as const satisfies SomeCompanionActionInputField
	const saveOption = {
		type: 'checkbox',
		label: 'Save config after applying',
		id: 'save',
		default: false,
	} as const satisfies SomeCompanionActionInputField
	const profileNameOption = {
		type: 'textinput',
		label: 'New name',
		id: 'name',
		default: '',
		useVariables: true,
	} as const satisfies SomeCompanionActionInputField

	const onSelectedPort = async (run: (portId: number) => Promise<void>) => {
		if (self.selectedPortId === null) self.log('warn', 'No port selected')
		else await run(self.selectedPortId)
	}
	const onSelectedProfile = async (run: (slot: number) => Promise<void> | void) => {
		if (self.selectedProfile === null) self.log('warn', 'No profile selected')
		else await run(self.selectedProfile)
	}
	const setMode = async (portId: number, options: ModeOptions) =>
		options.mode === 'trunk'
			? self.setPortTrunk(portId, Number(options.native_vlan ?? 1), Boolean(options.bounce))
			: self.setPortAccess(portId, undefined, Boolean(options.bounce))

	const actions: CompanionActionDefinitions<ActionsSchema> = {
		select_port: {
			name: 'Select port',
			options: [portOption],
			callback: ({ options }) => self.selectPort(Number(options.port)),
		},

		set_access_vlan: {
			name: 'Set access VLAN of port',
			description: 'Puts the port in access mode on the VLAN (also from trunk mode)',
			options: [portOption, vlanOption, resetLinkOption],
			callback: async ({ options }) =>
				self.setPortAccess(Number(options.port), Number(options.vlan), Boolean(options.bounce)),
		},
		set_selected_port_vlan: {
			name: 'Set access VLAN of selected port',
			description: 'Puts the port in access mode on the VLAN (also from trunk mode)',
			options: [vlanOption, resetLinkOption],
			callback: async ({ options }) =>
				onSelectedPort(async (id) => self.setPortAccess(id, Number(options.vlan), Boolean(options.bounce))),
		},

		set_port_mode: {
			name: 'Set mode of port (access/trunk)',
			options: [portOption, ...modeOptions],
			callback: async ({ options }) => setMode(Number(options.port), options),
		},
		set_selected_port_mode: {
			name: 'Set mode of selected port (access/trunk)',
			options: [...modeOptions],
			callback: async ({ options }) => onSelectedPort(async (id) => setMode(id, options)),
		},

		bounce_port: {
			name: 'Reset link of port (shut / no shut)',
			options: [portOption],
			callback: async ({ options }) => self.resetPortLink(Number(options.port)),
		},
		bounce_selected_port: {
			name: 'Reset link of selected port (shut / no shut)',
			options: [],
			callback: async () => onSelectedPort(async (id) => self.resetPortLink(id)),
		},

		poe_reset_port: {
			name: 'Reset PoE of port (power cycle the device)',
			options: [portOption, ...poeResetOptions],
			callback: async ({ options }) => self.resetPortPoe(Number(options.port), Number(options.off_seconds)),
		},
		poe_reset_selected_port: {
			name: 'Reset PoE of selected port (power cycle the device)',
			options: [...poeResetOptions],
			callback: async ({ options }) => onSelectedPort(async (id) => self.resetPortPoe(id, Number(options.off_seconds))),
		},

		set_poe_port: {
			name: 'Set PoE of port',
			options: [portOption, ...poeStateOptions],
			callback: async ({ options }) => self.setPortPoe(Number(options.port), options.state),
		},
		set_poe_selected_port: {
			name: 'Set PoE of selected port',
			options: [...poeStateOptions],
			callback: async ({ options }) => onSelectedPort(async (id) => self.setPortPoe(id, options.state)),
		},

		set_enabled_port: {
			name: 'Enable / disable port',
			options: [portOption, ...enabledStateOptions],
			callback: async ({ options }) => self.setPortEnabled(Number(options.port), options.state),
		},
		set_enabled_selected_port: {
			name: 'Enable / disable selected port',
			options: [...enabledStateOptions],
			callback: async ({ options }) => onSelectedPort(async (id) => self.setPortEnabled(id, options.state)),
		},

		set_description_port: {
			name: 'Set description of port',
			options: [portOption, ...descriptionOptions],
			callback: async ({ options }) => self.setPortDescription(Number(options.port), String(options.description)),
		},
		set_description_selected_port: {
			name: 'Set description of selected port',
			options: [...descriptionOptions],
			callback: async ({ options }) =>
				onSelectedPort(async (id) => self.setPortDescription(id, String(options.description))),
		},

		apply_profile: {
			name: 'Apply profile (several ports at once)',
			description: 'One entry per line or comma separated: <port>=<vlan> for access, <port>=T<vlan> for trunk',
			options: [
				{
					type: 'textinput',
					label: 'Profile (e.g. Port 5=1013, Port 6=1013, Port 3=T1)',
					id: 'profile',
					default: '',
					multiline: true,
				},
				saveOption,
			],
			callback: async ({ options }) => self.applyProfile(String(options.profile), Boolean(options.save)),
		},
		select_profile: {
			name: 'Select profile slot',
			options: [profileSlotOption],
			callback: ({ options }) => self.selectProfile(Number(options.slot)),
		},
		store_profile: {
			name: 'Store current layout in profile slot',
			description: 'Records the VLAN and mode of all non-protected ports into the slot (module config)',
			options: [profileSlotOption],
			callback: ({ options }) => self.storeProfile(Number(options.slot)),
		},
		store_selected_profile: {
			name: 'Store current layout in selected profile',
			description: 'Records the VLAN and mode of all non-protected ports into the slot (module config)',
			options: [],
			callback: async () => onSelectedProfile((slot) => self.storeProfile(slot)),
		},
		recall_profile: {
			name: 'Recall profile slot',
			options: [profileSlotOption, saveOption],
			callback: async ({ options }) => self.recallProfile(Number(options.slot), Boolean(options.save)),
		},
		recall_selected_profile: {
			name: 'Recall selected profile',
			options: [saveOption],
			callback: async ({ options }) =>
				onSelectedProfile(async (slot) => self.recallProfile(slot, Boolean(options.save))),
		},
		rename_profile: {
			name: 'Rename profile slot',
			options: [profileSlotOption, profileNameOption],
			callback: ({ options }) => self.renameProfile(Number(options.slot), String(options.name)),
		},
		rename_selected_profile: {
			name: 'Rename selected profile',
			options: [profileNameOption],
			callback: async ({ options }) => onSelectedProfile((slot) => self.renameProfile(slot, String(options.name))),
		},

		save_config: {
			name: 'Save running-config to startup-config',
			options: [],
			callback: async () => self.saveSwitchConfig(),
		},
		refresh_status: {
			name: 'Refresh status',
			options: [],
			callback: async () => self.poll(),
		},
	}

	self.setActionDefinitions(actions)
}
