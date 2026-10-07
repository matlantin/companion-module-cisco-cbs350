// Dropdown choices shared by actions and feedbacks
import type { DropdownChoice } from '@companion-module/base'
import type Cbs350Instance from './main.js'

export function portChoices(self: Cbs350Instance): DropdownChoice<string>[] {
	if (self.state.ports.size === 0) {
		// Switch not read yet: offer plain port numbers so options stay editable
		return Array.from({ length: 52 }, (_, i) => ({ id: String(i + 1), label: `Port ${i + 1}` }))
	}
	return [...self.state.ports.values()].map((p) => ({
		id: String(p.id),
		label: p.description ? `${p.label} (${p.description})` : p.label,
	}))
}

export function vlanChoices(self: Cbs350Instance): DropdownChoice<number>[] {
	return [...self.state.vlans.values()].map((v) => ({ id: v.id, label: `${v.id} - ${v.name}` }))
}

export function profileSlotChoices(self: Cbs350Instance): DropdownChoice<number>[] {
	return self.profileSlots().map((slot) => ({ id: slot, label: `${slot} - ${self.profileName(slot)}` }))
}
