// A profile is a text describing the VLAN of several ports, one entry per line or comma separated:
//   gi5=1013, gi6=1013, 3=T1
// <port>=<vlan> puts the port in access mode, <port>=T<vlan> in trunk mode with that native VLAN.
import type { Port } from './switch.js'

export interface ProfileEntry {
	portId: number
	mode: 'access' | 'trunk'
	vlan: number // access VLAN, or native VLAN for trunks
}

export function parseProfile(text: string): { entries: ProfileEntry[]; errors: string[] } {
	const entries: ProfileEntry[] = []
	const errors: string[] = []
	for (const raw of text.split(/[\n,;]+/)) {
		const item = raw.trim()
		if (!item) continue
		const match = /^[a-z]*(\d+)\s*[=:]\s*(t)?\s*(\d+)$/i.exec(item)
		if (!match) {
			errors.push(`"${item}" is not <port>=<vlan> or <port>=T<native vlan>`)
			continue
		}
		entries.push({ portId: Number(match[1]), mode: match[2] ? 'trunk' : 'access', vlan: Number(match[3]) })
	}
	return { entries, errors }
}

// VLAN shown for a port: the access VLAN, or the native VLAN for trunks
export function portVlan(port: Port): number {
	return port.mode === 'trunk' ? port.nativeVlan : port.accessVlan
}

export function entryMatches(entry: ProfileEntry, port: Port | undefined): boolean {
	return port !== undefined && port.mode === entry.mode && portVlan(port) === entry.vlan
}

// Current layout of the given ports, in profile syntax
export function formatProfile(ports: Iterable<Port>): string {
	return [...ports]
		.filter((p) => p.mode !== 'other')
		.map((p) => `${p.shortName}=${p.mode === 'trunk' ? 'T' : ''}${portVlan(p)}`)
		.join(', ')
}
