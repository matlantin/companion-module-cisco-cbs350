import type { CompanionVariableDefinitions, CompanionVariableValues } from '@companion-module/base'
import type Cbs350Instance from './main.js'
import { portVlan } from './profiles.js'
import type { Port } from './switch.js'

// Variable ids depend on the ports of the switch (port_<n>_...), so they are not statically typed
export type VariablesSchema = CompanionVariableValues

// Variables defined for each port (port_<n>_<key>) and for the selected port (selected_port_<key>)
const PORT_VARIABLES: Record<string, string> = {
	name: 'name',
	alias: 'description',
	status: 'link (Up/Down)',
	enabled: 'enabled (Yes/No)',
	speed: 'link speed (1G/100M/10M)',
	mode: 'mode (access/trunk)',
	vlan: 'VLAN (native VLAN for trunks)',
	vlan_name: 'VLAN name',
	summary: 'summary (access VLAN or "T native")',
	poe: 'PoE state (delivering/searching/fault/off)',
	poe_power: 'PoE power',
	neighbor: 'LLDP neighbor',
	neighbor_port: 'LLDP neighbor port',
}

export function UpdateVariableDefinitions(self: Cbs350Instance): void {
	const variables: CompanionVariableDefinitions = {
		model_name: { name: 'Model name' },
		system_name: { name: 'System name' },
		port_count: { name: 'Port count' },
		unsaved_changes: { name: 'Unsaved changes (Yes/No)' },
		last_save: { name: 'Last config save time' },
		current_profile: { name: 'Current port layout (profile syntax)' },
		selected_port_id: { name: 'Selected port ID' },
		selected_profile: { name: 'Selected profile slot' },
		selected_profile_name: { name: 'Selected profile name' },
	}
	for (const [key, label] of Object.entries(PORT_VARIABLES)) {
		variables[`selected_port_${key}`] = { name: `Selected port ${label}` }
	}
	for (const port of self.state.ports.values()) {
		for (const [key, label] of Object.entries(PORT_VARIABLES)) {
			variables[`port_${port.id}_${key}`] = { name: `${port.shortName} ${label}` }
		}
	}
	for (const slot of self.profileSlots()) {
		variables[`profile_${slot}_name`] = { name: `Profile ${slot} name` }
		variables[`profile_${slot}`] = { name: `Profile ${slot} content` }
	}
	self.setVariableDefinitions(variables)
}

// Short text for buttons: "1013" for an access port, "T 1" for a trunk with native VLAN 1
export function portSummary(port: Port): string {
	return port.mode === 'trunk' ? `T ${port.nativeVlan}` : String(port.accessVlan)
}

function portValues(self: Cbs350Instance, port: Port | undefined): Record<string, string | number> {
	if (!port) return Object.fromEntries(Object.keys(PORT_VARIABLES).map((key) => [key, key === 'name' ? 'None' : '']))
	const vlan = portVlan(port)
	return {
		name: port.shortName,
		alias: port.description,
		status: port.linkUp ? 'Up' : 'Down',
		enabled: port.enabled ? 'Yes' : 'No',
		speed: !port.linkUp ? '' : port.speedMbps >= 1000 ? `${port.speedMbps / 1000}G` : `${port.speedMbps}M`,
		mode: port.mode,
		vlan,
		vlan_name: self.state.vlans.get(vlan)?.name ?? '',
		summary: portSummary(port),
		poe: !port.poe ? '' : port.poe.enabled ? port.poe.status : 'off',
		poe_power: port.poe ? `${(port.poe.powerMw / 1000).toFixed(1)} W` : '',
		neighbor: port.neighbor,
		neighbor_port: port.neighborPort,
	}
}

export function getVariableValues(self: Cbs350Instance): CompanionVariableValues {
	const values: CompanionVariableValues = {
		model_name: self.state.model,
		system_name: self.state.systemName,
		port_count: self.state.ports.size,
		unsaved_changes: self.unsavedChanges ? 'Yes' : 'No',
		last_save: self.lastSave,
		current_profile: self.currentProfile,
		selected_port_id: self.selectedPortId ?? '',
		selected_profile: self.selectedProfile ?? '',
		selected_profile_name: self.selectedProfile === null ? 'None' : self.profileName(self.selectedProfile),
	}
	for (const [key, value] of Object.entries(portValues(self, self.selectedPort))) {
		values[`selected_port_${key}`] = value
	}
	for (const port of self.state.ports.values()) {
		for (const [key, value] of Object.entries(portValues(self, port))) {
			values[`port_${port.id}_${key}`] = value
		}
	}
	for (const slot of self.profileSlots()) {
		values[`profile_${slot}_name`] = self.profileName(slot)
		values[`profile_${slot}`] = self.profileText(slot)
	}
	return values
}
