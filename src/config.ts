import { Regex, type SomeCompanionConfigField } from '@companion-module/base'

export const PROFILE_SLOTS = 8

export type ModuleConfig = {
	host: string
	community: string
	pollInterval: number
	saveOnChange: boolean
	protectedPorts: string
	// Profile slots live in the config so they persist and can be edited by hand
	[profileKey: `profile_${number}` | `profile_${number}_name`]: string
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'static-text',
			id: 'snmpInfo',
			label: 'Prerequisite',
			value:
				'SNMP must be enabled on the switch with a Read-Write v2c community. ' +
				'See the help of this module for the switch configuration (CLI or web interface).',
			width: 12,
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'Switch IP',
			width: 6,
			regex: Regex.IP,
		},
		{
			type: 'textinput',
			id: 'community',
			label: 'SNMP v2c community (Read-Write)',
			width: 6,
			default: 'private',
		},
		{
			type: 'number',
			id: 'pollInterval',
			label: 'Polling interval (ms)',
			width: 6,
			default: 10000,
			min: 1000,
			max: 60000,
		},
		{
			type: 'checkbox',
			id: 'saveOnChange',
			label: 'Save running-config to startup-config after each change',
			width: 6,
			default: false,
		},
		{
			type: 'textinput',
			id: 'protectedPorts',
			label: 'Protected ports, never modified (e.g. uplinks: 9,10)',
			width: 12,
			default: '',
		},
		{
			type: 'static-text',
			id: 'profilesInfo',
			label: 'Profiles',
			value:
				'Filled by the "Store" actions with the current port layout, or by hand: ' +
				'Port 5=1013, Port 6=1013, Port 3=T1 (T = trunk with that native VLAN).',
			width: 12,
		},
		...Array.from({ length: PROFILE_SLOTS }, (_, i): SomeCompanionConfigField[] => [
			{
				type: 'textinput',
				id: `profile_${i + 1}_name`,
				label: `Profile ${i + 1} name`,
				width: 3,
				default: `Profile ${i + 1}`,
			},
			{
				type: 'textinput',
				id: `profile_${i + 1}`,
				label: `Profile ${i + 1}`,
				width: 9,
				default: '',
			},
		]).flat(),
	]
}

// Port numbers listed in the "Protected ports" field ("9,10", "Port 9, Port 10"...)
export function parseProtectedPorts(config: ModuleConfig): Set<number> {
	return new Set((config.protectedPorts ?? '').match(/\d+/g)?.map(Number) ?? [])
}
