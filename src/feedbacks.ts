import type { CompanionFeedbackDefinitions, SomeCompanionFeedbackInputField } from '@companion-module/base'
import { portChoices, profileSlotChoices, vlanChoices } from './choices.js'
import type Cbs350Instance from './main.js'
import { portVlan } from './profiles.js'
import type { Port } from './switch.js'

type Mode = 'access' | 'trunk'
type PoeState = 'enabled' | 'delivering'

export type FeedbacksSchema = {
	port_selected: { type: 'boolean'; options: { port: string } }
	port_status: { type: 'boolean'; options: { port: string } }
	port_enabled: { type: 'boolean'; options: { port: string } }
	port_speed_below: { type: 'boolean'; options: { port: string; speed: number } }
	port_vlan: { type: 'boolean'; options: { port: string; vlan: number } }
	port_mode: { type: 'boolean'; options: { port: string; mode: Mode } }
	port_poe: { type: 'boolean'; options: { port: string; state: PoeState } }
	selected_port_status: { type: 'boolean'; options: Record<string, never> }
	selected_port_enabled: { type: 'boolean'; options: Record<string, never> }
	selected_port_speed_below: { type: 'boolean'; options: { speed: number } }
	selected_port_vlan_match: { type: 'boolean'; options: { vlan: number } }
	selected_port_mode_match: { type: 'boolean'; options: { mode: Mode } }
	selected_port_poe: { type: 'boolean'; options: { state: PoeState } }
	profile_active: { type: 'boolean'; options: { profile: string } }
	profile_slot_active: { type: 'boolean'; options: { slot: number } }
	profile_selected: { type: 'boolean'; options: { slot: number } }
	selected_profile_active: { type: 'boolean'; options: Record<string, never> }
	unsaved_changes: { type: 'boolean'; options: Record<string, never> }
}

// Link up, but negotiated below the given speed (bad cable, 100 Mb/s device...)
function isSlowLink(port: Port | undefined, speedMbps: number): boolean {
	return port !== undefined && port.linkUp && port.speedMbps < speedMbps
}

function poeMatches(port: Port | undefined, state: PoeState): boolean {
	return state === 'enabled' ? port?.poe?.enabled === true : port?.poe?.status === 'delivering'
}

export function UpdateFeedbacks(self: Cbs350Instance): void {
	const ports = portChoices(self)
	const vlans = vlanChoices(self)

	const portOption = {
		type: 'dropdown',
		label: 'Port',
		id: 'port',
		choices: ports,
		default: ports[0]?.id ?? '1',
	} as const satisfies SomeCompanionFeedbackInputField
	const vlanOption = {
		type: 'dropdown',
		label: 'VLAN',
		id: 'vlan',
		choices: vlans,
		default: vlans[0]?.id ?? 1,
	} as const satisfies SomeCompanionFeedbackInputField
	const modeOption = {
		type: 'dropdown',
		label: 'Mode',
		id: 'mode',
		choices: [
			{ id: 'access', label: 'Access' },
			{ id: 'trunk', label: 'Trunk' },
		],
		default: 'trunk',
	} as const satisfies SomeCompanionFeedbackInputField
	const speedOption = {
		type: 'dropdown',
		label: 'Link up below',
		id: 'speed',
		choices: [
			{ id: 1000, label: '1 Gb/s' },
			{ id: 100, label: '100 Mb/s' },
		],
		default: 1000,
	} as const satisfies SomeCompanionFeedbackInputField
	const poeStateOption = {
		type: 'dropdown',
		label: 'PoE state',
		id: 'state',
		choices: [
			{ id: 'enabled', label: 'Enabled (admin)' },
			{ id: 'delivering', label: 'Delivering power' },
		],
		default: 'delivering',
	} as const satisfies SomeCompanionFeedbackInputField
	const profileSlotOption = {
		type: 'dropdown',
		label: 'Profile slot',
		id: 'slot',
		choices: profileSlotChoices(self),
		default: 1,
	} as const satisfies SomeCompanionFeedbackInputField

	const port = (id: string) => self.state.ports.get(Number(id))
	const green = { bgcolor: 0x009900, color: 0xffffff }
	const blue = { bgcolor: 0x0066ff, color: 0xffffff }
	const orange = { bgcolor: 0xff9900, color: 0x000000 }
	const grey = { bgcolor: 0x484848, color: 0xffffff }
	const yellowText = { color: 0xffff00 }

	const feedbacks: CompanionFeedbackDefinitions<FeedbacksSchema> = {
		port_selected: {
			type: 'boolean',
			name: 'Port is selected',
			defaultStyle: orange,
			options: [portOption],
			callback: ({ options }) => self.selectedPortId === Number(options.port),
		},
		port_status: {
			type: 'boolean',
			name: 'Port link is up',
			defaultStyle: green,
			options: [portOption],
			callback: ({ options }) => port(options.port)?.linkUp === true,
		},
		port_enabled: {
			type: 'boolean',
			name: 'Port is enabled (not shutdown)',
			defaultStyle: green,
			options: [portOption],
			callback: ({ options }) => port(options.port)?.enabled === true,
		},
		port_speed_below: {
			type: 'boolean',
			name: 'Port link speed below',
			description: 'Link up but negotiated below the given speed (bad cable, limited device...)',
			defaultStyle: yellowText,
			options: [portOption, speedOption],
			callback: ({ options }) => isSlowLink(port(options.port), Number(options.speed)),
		},
		port_vlan: {
			type: 'boolean',
			name: 'Port is on VLAN',
			description: 'Access VLAN, or native VLAN for trunk ports',
			defaultStyle: blue,
			options: [portOption, vlanOption],
			callback: ({ options }) => {
				const p = port(options.port)
				return p !== undefined && portVlan(p) === Number(options.vlan)
			},
		},
		port_mode: {
			type: 'boolean',
			name: 'Port mode',
			defaultStyle: grey,
			options: [portOption, modeOption],
			callback: ({ options }) => port(options.port)?.mode === options.mode,
		},
		port_poe: {
			type: 'boolean',
			name: 'Port PoE',
			defaultStyle: green,
			options: [portOption, poeStateOption],
			callback: ({ options }) => poeMatches(port(options.port), options.state),
		},

		selected_port_status: {
			type: 'boolean',
			name: 'Selected port link is up',
			defaultStyle: green,
			options: [],
			callback: () => self.selectedPort?.linkUp === true,
		},
		selected_port_enabled: {
			type: 'boolean',
			name: 'Selected port is enabled (not shutdown)',
			defaultStyle: green,
			options: [],
			callback: () => self.selectedPort?.enabled === true,
		},
		selected_port_speed_below: {
			type: 'boolean',
			name: 'Selected port link speed below',
			defaultStyle: yellowText,
			options: [speedOption],
			callback: ({ options }) => isSlowLink(self.selectedPort, Number(options.speed)),
		},
		selected_port_vlan_match: {
			type: 'boolean',
			name: 'Selected port is on VLAN',
			description: 'Access VLAN, or native VLAN for trunk ports',
			defaultStyle: blue,
			options: [vlanOption],
			callback: ({ options }) => {
				const p = self.selectedPort
				return p !== undefined && portVlan(p) === Number(options.vlan)
			},
		},
		selected_port_mode_match: {
			type: 'boolean',
			name: 'Selected port mode',
			defaultStyle: grey,
			options: [modeOption],
			callback: ({ options }) => self.selectedPort?.mode === options.mode,
		},
		selected_port_poe: {
			type: 'boolean',
			name: 'Selected port PoE',
			defaultStyle: green,
			options: [poeStateOption],
			callback: ({ options }) => poeMatches(self.selectedPort, options.state),
		},

		profile_active: {
			type: 'boolean',
			name: 'Profile is active',
			description: 'All ports of the profile match the switch (same syntax as the "Apply profile" action)',
			defaultStyle: blue,
			options: [{ type: 'textinput', label: 'Profile', id: 'profile', default: '', multiline: true }],
			callback: ({ options }) => self.isProfileActive(String(options.profile)),
		},
		profile_slot_active: {
			type: 'boolean',
			name: 'Profile slot is active',
			description: 'All ports of the stored profile match the switch',
			defaultStyle: blue,
			options: [profileSlotOption],
			callback: ({ options }) => self.isProfileActive(self.profileText(Number(options.slot))),
		},
		profile_selected: {
			type: 'boolean',
			name: 'Profile slot is selected',
			defaultStyle: orange,
			options: [profileSlotOption],
			callback: ({ options }) => self.selectedProfile === Number(options.slot),
		},
		selected_profile_active: {
			type: 'boolean',
			name: 'Selected profile is active',
			description: 'All ports of the selected profile match the switch',
			defaultStyle: blue,
			options: [],
			callback: () => self.selectedProfile !== null && self.isProfileActive(self.profileText(self.selectedProfile)),
		},

		unsaved_changes: {
			type: 'boolean',
			name: 'Unsaved changes on the switch',
			description: 'Running-config modified by this module and not yet saved to startup-config',
			defaultStyle: orange,
			options: [],
			callback: () => self.unsavedChanges,
		},
	}

	self.setFeedbackDefinitions(feedbacks)
}
