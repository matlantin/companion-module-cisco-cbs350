// Promise wrappers around the callback based net-snmp session API
import type { Session, Varbind, VarbindValue } from 'net-snmp'

export async function snmpGet(session: Session, oids: string[]): Promise<Varbind[]> {
	return new Promise((resolve, reject) => {
		session.get(oids, (error, varbinds) => {
			if (error) reject(error)
			else resolve(varbinds ?? [])
		})
	})
}

export async function snmpSet(session: Session, varbinds: Varbind[]): Promise<void> {
	return new Promise((resolve, reject) => {
		session.set(varbinds, (error) => {
			if (error) reject(error)
			else resolve()
		})
	})
}

/**
 * Walks a table column and returns its values keyed by a number taken from the row index:
 * by default its first component (ifIndex, VLAN id...), or the one picked by keyOf for
 * multi-component indexes (e.g. <group>.<port> for PoE)
 */
export async function snmpWalkColumn(
	session: Session,
	baseOid: string,
	keyOf: (index: number[]) => number = (index) => index[0],
): Promise<Map<number, VarbindValue>> {
	return new Promise((resolve, reject) => {
		const values = new Map<number, VarbindValue>()
		session.subtree(
			baseOid,
			20,
			(varbinds) => {
				for (const vb of varbinds) {
					const index = vb.oid
						.substring(baseOid.length + 1)
						.split('.')
						.map(Number)
					values.set(keyOf(index), vb.value)
				}
			},
			(error) => {
				if (error) reject(error)
				else resolve(values)
			},
		)
	})
}
