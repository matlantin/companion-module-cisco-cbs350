// SNMP client for a Cisco CBS350 switch: reads the port/VLAN state and applies changes.
// It has no knowledge of Companion; validation and logging are done by the module instance.
import snmp, { type Session, type Varbind, type VarbindValue } from 'net-snmp'
import {
	IF_TYPE_ETHERNET,
	LLDP_CHASSIS_ID_SUBTYPE_NETWORK_ADDRESS,
	OIDS,
	POE_DETECTION_STATUS,
	PORT_MODE_STATE,
	RL_COPY,
} from './oids.js'
import { snmpGet, snmpSet, snmpWalkColumn } from './snmp.js'

export type PortMode = 'access' | 'trunk' | 'other'

export interface Poe {
	enabled: boolean // admin state
	status: string // see POE_DETECTION_STATUS
	powerMw: number
}

export interface Port {
	id: number // ifIndex
	name: string // GigabitEthernet6
	shortName: string // gi6
	description: string
	linkUp: boolean
	enabled: boolean // not "shutdown"
	speedMbps: number
	mode: PortMode
	accessVlan: number
	nativeVlan: number
	poe?: Poe // undefined on ports without PoE
	neighbor: string // LLDP system name, or chassis id
	neighborPort: string // LLDP port description, or port id
}

export interface Vlan {
	id: number
	name: string
}

export interface SwitchState {
	model: string
	systemName: string
	ports: Map<number, Port>
	vlans: Map<number, Vlan>
}

// Text if all bytes are printable, otherwise aa:bb:cc... (MAC addresses, binary ids)
function formatOctets(value: VarbindValue): string {
	if (!Buffer.isBuffer(value)) return value === undefined || value === null ? '' : String(value)
	if (value.every((b) => b >= 32 && b < 127)) return value.toString()
	return [...value].map((b) => b.toString(16).padStart(2, '0')).join(':')
}

function formatChassisId(subtype: VarbindValue, value: VarbindValue): string {
	// Network address: IANA address family (1 = IPv4) followed by the address
	if (
		subtype === LLDP_CHASSIS_ID_SUBTYPE_NETWORK_ADDRESS &&
		Buffer.isBuffer(value) &&
		value.length === 5 &&
		value[0] === 1
	) {
		return [...value.subarray(1)].join('.')
	}
	return formatOctets(value)
}

function portMode(state: VarbindValue): PortMode {
	if (state === PORT_MODE_STATE.access) return 'access'
	if (state === PORT_MODE_STATE.trunk) return 'trunk'
	return 'other'
}

export class SwitchClient {
	readonly #session: Session

	constructor(host: string, community: string) {
		this.#session = snmp.createSession(host, community, { version: snmp.Version2c, timeout: 3000, retries: 1 })
	}

	close(): void {
		this.#session.close()
	}

	onError(listener: (error: Error) => void): void {
		this.#session.on('error', listener)
	}

	async readState(): Promise<SwitchState> {
		const session = this.#session
		const [sysDescr, sysName] = await snmpGet(session, [OIDS.sysDescr, OIDS.sysName])

		const walk = async (oid: string) => snmpWalkColumn(session, oid)
		const [types, descrs, names, aliases, operStatus, adminStatus, speeds, modes, accessVlans, nativeVlans, vlanNames] =
			await Promise.all(
				[
					OIDS.ifType,
					OIDS.ifDescr,
					OIDS.ifName,
					OIDS.ifAlias,
					OIDS.ifOperStatus,
					OIDS.ifAdminStatus,
					OIDS.ifHighSpeed,
					OIDS.vlanPortModeState,
					OIDS.vlanAccessPortModeVlanId,
					OIDS.vlanTrunkPortModeNativeVlanId,
					OIDS.dot1qVlanStaticName,
				].map(walk),
			)

		// Optional tables: missing on models without PoE, empty without LLDP neighbors.
		// PoE (<group>.<port>) and LLDP (<timeMark>.<port>.<remIndex>) are both keyed by index[1].
		const walkByPort = async (oid: string) =>
			snmpWalkColumn(session, oid, (index) => index[1]).catch(() => new Map<number, VarbindValue>())
		const [poeAdmin, poeStatus, poePower, chassisSubtypes, chassisIds, remPortIds, remPortDescs, remSysNames] =
			await Promise.all(
				[
					OIDS.pethPsePortAdminEnable,
					OIDS.pethPsePortDetectionStatus,
					OIDS.rlPethPsePortOutputPower,
					OIDS.lldpRemChassisIdSubtype,
					OIDS.lldpRemChassisId,
					OIDS.lldpRemPortId,
					OIDS.lldpRemPortDesc,
					OIDS.lldpRemSysName,
				].map(walkByPort),
			)

		const vlans = new Map<number, Vlan>()
		for (const [id, name] of vlanNames) vlans.set(id, { id, name: formatOctets(name) })

		const ports = new Map<number, Port>()
		for (const [id, type] of types) {
			if (type !== IF_TYPE_ETHERNET) continue
			ports.set(id, {
				id,
				name: formatOctets(descrs.get(id)) || `Port ${id}`,
				shortName: formatOctets(names.get(id)) || String(id),
				description: formatOctets(aliases.get(id)),
				linkUp: operStatus.get(id) === 1,
				enabled: adminStatus.get(id) !== 2,
				speedMbps: Number(speeds.get(id) ?? 0),
				mode: portMode(modes.get(id)),
				accessVlan: Number(accessVlans.get(id) ?? 0),
				nativeVlan: Number(nativeVlans.get(id) ?? 0),
				poe: poeAdmin.has(id)
					? {
							enabled: poeAdmin.get(id) === 1,
							status: POE_DETECTION_STATUS[Number(poeStatus.get(id))] ?? '',
							powerMw: Number(poePower.get(id) ?? 0),
						}
					: undefined,
				neighbor: formatOctets(remSysNames.get(id)) || formatChassisId(chassisSubtypes.get(id), chassisIds.get(id)),
				neighborPort: formatOctets(remPortDescs.get(id)) || formatOctets(remPortIds.get(id)),
			})
		}

		return { model: formatOctets(sysDescr?.value), systemName: formatOctets(sysName?.value), ports, vlans }
	}

	// Access mode on the given VLAN. Leaving trunk mode also resets the native VLAN to its default,
	// otherwise a stale "switchport trunk native vlan" line stays in the configuration.
	async setAccess(port: Port, vlan: number): Promise<void> {
		const varbinds: Varbind[] = []
		if (port.mode !== 'access') {
			varbinds.push(
				integer(`${OIDS.vlanPortModeState}.${port.id}`, PORT_MODE_STATE.access),
				gauge(`${OIDS.vlanTrunkPortModeNativeVlanId}.${port.id}`, 1),
			)
		}
		varbinds.push(gauge(`${OIDS.vlanAccessPortModeVlanId}.${port.id}`, vlan))
		await snmpSet(this.#session, varbinds)
	}

	// Trunk mode carrying all VLANs tagged, with the given native (untagged) VLAN
	async setTrunk(port: Port, nativeVlan: number): Promise<void> {
		await snmpSet(this.#session, [
			integer(`${OIDS.vlanPortModeState}.${port.id}`, PORT_MODE_STATE.trunk),
			gauge(`${OIDS.vlanTrunkPortModeNativeVlanId}.${port.id}`, nativeVlan),
		])
	}

	// false = "shutdown"
	async setEnabled(port: Port, enabled: boolean): Promise<void> {
		await snmpSet(this.#session, [integer(`${OIDS.ifAdminStatus}.${port.id}`, enabled ? 1 : 2)])
	}

	async setDescription(port: Port, description: string): Promise<void> {
		await snmpSet(this.#session, [
			{ oid: `${OIDS.ifAlias}.${port.id}`, type: snmp.ObjectType.OctetString, value: Buffer.from(description) },
		])
	}

	// false = "power inline never"
	async setPoe(port: Port, enabled: boolean): Promise<void> {
		await snmpSet(this.#session, [integer(`${OIDS.pethPsePortAdminEnable}.1.${port.id}`, enabled ? 1 : 2)])
	}

	// Equivalent of "copy running-config startup-config" (write memory)
	async saveConfig(): Promise<void> {
		const cell = (column: number) => `${OIDS.rlCopyEntry}.${column}.${RL_COPY.row}`
		const { columns } = RL_COPY
		await snmpSet(this.#session, [
			integer(cell(columns.sourceLocation), RL_COPY.locationLocal),
			integer(cell(columns.sourceFileType), RL_COPY.fileRunningConfig),
			integer(cell(columns.destinationLocation), RL_COPY.locationLocal),
			integer(cell(columns.destinationFileType), RL_COPY.fileStartupConfig),
			integer(cell(columns.rowStatus), RL_COPY.rowCreateAndGo),
		])
	}
}

function integer(oid: string, value: number): Varbind {
	return { oid, type: snmp.ObjectType.Integer, value }
}

function gauge(oid: string, value: number): Varbind {
	return { oid, type: snmp.ObjectType.Gauge, value }
}
