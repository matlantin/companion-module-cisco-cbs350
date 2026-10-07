import type {
	CompanionButtonStyleProps,
	CompanionPresetDefinitions,
	CompanionPresetSection,
} from '@companion-module/base'
import type Cbs350Instance from './main.js'
import type { ModuleSchema } from './main.js'

// Companion converts preset text sizes from the legacy unit (x2.1 for buttons with the top bar),
// so 27 / 2.1 gives a text size of 27 on the created button
const TEXT_SIZE_27 = 12.86
const TEXT_SIZE_26 = 12.38 // 26 / 2.1, for three lines of text

const WHITE = 0xffffff
const BLACK = 0x000000
const RED = 0xcc0000
const DARK_RED = 0x660000
const GREEN = 0x009900
const DARK_GREEN = 0x006600
const ORANGE = 0xff9900
const BLUE = 0x0066ff
const DARK_BLUE = 0x000066
const GREY = 0x333333
const MID_GREY = 0x444444

function style(
	text: string,
	bgcolor: number,
	size: CompanionButtonStyleProps['size'] = 'auto',
): CompanionButtonStyleProps {
	return { text, size, color: WHITE, bgcolor }
}

export function UpdatePresets(self: Cbs350Instance): void {
	const presets: CompanionPresetDefinitions<ModuleSchema> = {}
	const v = (variable: string) => `$(${self.label}:${variable})`

	// Ports: select a port; red = down, green = up, yellow text = below 1 Gb/s, grey = disabled, orange = selected
	const portPresets: string[] = []
	for (const port of self.state.ports.values()) {
		const options = { port: String(port.id) }
		const id = `port_${port.id}`
		portPresets.push(id)
		presets[id] = {
			type: 'simple',
			name: port.shortName,
			style: style(`${v(`port_${port.id}_name`)}\\n${v(`port_${port.id}_summary`)}`, RED),
			steps: [{ down: [{ actionId: 'select_port', options }], up: [] }],
			feedbacks: [
				{ feedbackId: 'port_status', options, style: { bgcolor: GREEN, color: WHITE } },
				{ feedbackId: 'port_speed_below', options: { ...options, speed: 1000 }, style: { color: 0xffff00 } },
				{ feedbackId: 'port_enabled', options, isInverted: true, style: { bgcolor: MID_GREY, color: 0x999999 } },
				{ feedbackId: 'port_selected', options, style: { bgcolor: ORANGE, color: BLACK } },
			],
		}
	}

	// VLANs: move the selected port to the VLAN, highlighted when the selected port is on it
	const vlanPresets: string[] = []
	for (const vlan of self.state.vlans.values()) {
		const id = `vlan_${vlan.id}`
		vlanPresets.push(id)
		presets[id] = {
			type: 'simple',
			name: `${vlan.id} - ${vlan.name}`,
			style: style(`${vlan.id}\\n${vlan.name}`, DARK_BLUE),
			steps: [{ down: [{ actionId: 'set_selected_port_vlan', options: { vlan: vlan.id, bounce: false } }], up: [] }],
			feedbacks: [{ feedbackId: 'selected_port_vlan_match', options: { vlan: vlan.id }, style: { bgcolor: BLUE } }],
		}
	}

	presets['selected_port_info'] = {
		type: 'simple',
		name: 'Selected port info (speed, VLAN, LLDP neighbor)',
		style: style(
			`${v('selected_port_name')} ${v('selected_port_speed')}\\n${v('selected_port_vlan_name')}\\n${v('selected_port_neighbor')}`,
			RED,
		),
		steps: [],
		feedbacks: [
			{ feedbackId: 'selected_port_status', options: {}, style: { bgcolor: GREEN, color: WHITE } },
			{ feedbackId: 'selected_port_speed_below', options: { speed: 1000 }, style: { color: 0xffff00 } },
		],
	}
	presets['selected_port_description'] = {
		type: 'simple',
		name: 'Selected port description',
		style: style(`${v('selected_port_name')}\\n${v('selected_port_alias')}`, BLACK),
		steps: [],
		feedbacks: [],
	}
	presets['selected_port_lldp'] = {
		type: 'simple',
		name: 'Selected port LLDP neighbor',
		style: style(`${v('selected_port_neighbor')}\\n${v('selected_port_neighbor_port')}`, BLACK),
		steps: [],
		feedbacks: [],
	}
	presets['mode_trunk'] = {
		type: 'simple',
		name: 'Set selected port to trunk (native VLAN 1)',
		style: style('TRUNK', GREY, TEXT_SIZE_27),
		steps: [
			{
				down: [{ actionId: 'set_selected_port_mode', options: { mode: 'trunk', native_vlan: 1, bounce: false } }],
				up: [],
			},
		],
		feedbacks: [
			{ feedbackId: 'selected_port_mode_match', options: { mode: 'trunk' }, style: { bgcolor: WHITE, color: BLACK } },
		],
	}
	presets['mode_access'] = {
		type: 'simple',
		name: 'Set selected port to access',
		style: style('ACCESS', GREY, TEXT_SIZE_27),
		steps: [{ down: [{ actionId: 'set_selected_port_mode', options: { mode: 'access', bounce: false } }], up: [] }],
		feedbacks: [
			{ feedbackId: 'selected_port_mode_match', options: { mode: 'access' }, style: { bgcolor: WHITE, color: BLACK } },
		],
	}
	presets['bounce_selected_port'] = {
		type: 'simple',
		name: 'Reset Link',
		style: style('Reset\\nLink', DARK_RED, TEXT_SIZE_27),
		steps: [{ down: [{ actionId: 'bounce_selected_port', options: {} }], up: [] }],
		feedbacks: [],
	}
	presets['poe_reset_selected_port'] = {
		type: 'simple',
		name: 'Reset PoE',
		style: style('Reset\\nPoE', DARK_RED, TEXT_SIZE_27),
		steps: [{ down: [{ actionId: 'poe_reset_selected_port', options: { off_seconds: 5 } }], up: [] }],
		feedbacks: [],
	}
	presets['poe_toggle_selected_port'] = {
		type: 'simple',
		name: 'PoE on/off',
		style: style(`PoE\\n${v('selected_port_poe')}\\n${v('selected_port_poe_power')}`, GREY, TEXT_SIZE_26),
		steps: [{ down: [{ actionId: 'set_poe_selected_port', options: { state: 'toggle' } }], up: [] }],
		feedbacks: [
			{ feedbackId: 'selected_port_poe', options: { state: 'enabled' }, style: { bgcolor: DARK_GREEN } },
			{ feedbackId: 'selected_port_poe', options: { state: 'delivering' }, style: { bgcolor: GREEN } },
		],
	}
	presets['enable_toggle_selected_port'] = {
		type: 'simple',
		name: 'Port enable/disable',
		style: style(`Port\\nenabled:\\n${v('selected_port_enabled')}`, MID_GREY),
		steps: [{ down: [{ actionId: 'set_enabled_selected_port', options: { state: 'toggle' } }], up: [] }],
		feedbacks: [{ feedbackId: 'selected_port_enabled', options: {}, style: { bgcolor: GREEN } }],
	}

	// Profiles: select a slot, then STORE or RECALL it
	const profilePresets: string[] = []
	for (const slot of self.profileSlots()) {
		const id = `profile_${slot}_select`
		profilePresets.push(id)
		presets[id] = {
			type: 'simple',
			name: `Select profile ${slot}`,
			style: style(v(`profile_${slot}_name`), DARK_BLUE, TEXT_SIZE_27),
			steps: [{ down: [{ actionId: 'select_profile', options: { slot } }], up: [] }],
			feedbacks: [
				{ feedbackId: 'profile_slot_active', options: { slot }, style: { bgcolor: BLUE } },
				{ feedbackId: 'profile_selected', options: { slot }, style: { bgcolor: ORANGE, color: BLACK } },
			],
		}
	}
	presets['profile_store'] = {
		type: 'simple',
		name: 'Store current layout in selected profile',
		style: style(`STORE\\n${v('selected_profile_name')}`, DARK_RED, TEXT_SIZE_27),
		steps: [{ down: [{ actionId: 'store_selected_profile', options: {} }], up: [] }],
		feedbacks: [],
	}
	presets['profile_recall'] = {
		type: 'simple',
		name: 'Recall selected profile',
		style: style(`RECALL\\n${v('selected_profile_name')}`, DARK_BLUE, TEXT_SIZE_27),
		steps: [{ down: [{ actionId: 'recall_selected_profile', options: { save: false } }], up: [] }],
		feedbacks: [{ feedbackId: 'selected_profile_active', options: {}, style: { bgcolor: BLUE } }],
	}

	presets['save_config'] = {
		type: 'simple',
		name: 'Save config (orange when there are unsaved changes)',
		style: style('SAVE\\nCONFIG', GREY, TEXT_SIZE_27),
		steps: [{ down: [{ actionId: 'save_config', options: {} }], up: [] }],
		feedbacks: [{ feedbackId: 'unsaved_changes', options: {}, style: { bgcolor: ORANGE, color: BLACK } }],
	}

	const structure: CompanionPresetSection<ModuleSchema>[] = [
		{
			id: 'ports',
			name: 'Ports',
			description: 'Select a port. Red = down, green = up, yellow text = below 1 Gb/s, grey = disabled',
			definitions: portPresets,
		},
		{
			id: 'vlans',
			name: 'VLANs',
			description: 'Move the selected port to a VLAN (access mode)',
			definitions: vlanPresets,
		},
		{
			id: 'selected_port',
			name: 'Selected port',
			definitions: [
				'selected_port_info',
				'selected_port_description',
				'selected_port_lldp',
				'mode_trunk',
				'mode_access',
				'bounce_selected_port',
				'poe_reset_selected_port',
				'poe_toggle_selected_port',
				'enable_toggle_selected_port',
			],
		},
		{
			id: 'profiles',
			name: 'Profiles',
			description: 'Select a profile slot, then STORE the current layout in it or RECALL it',
			definitions: [...profilePresets, 'profile_store', 'profile_recall'],
		},
		{
			id: 'switch',
			name: 'Switch',
			definitions: ['save_config'],
		},
	]

	self.setPresetDefinitions(structure, presets)
}
