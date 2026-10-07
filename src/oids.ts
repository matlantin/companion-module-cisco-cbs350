// SNMP OIDs used by the module, validated against a CBS350-8P-2G running firmware 3.5.3.2.
// Port tables are indexed by ifIndex, which is the port number for GigabitEthernet ports (gi6 = 6).

export const OIDS = {
	sysDescr: '1.3.6.1.2.1.1.1.0',
	sysName: '1.3.6.1.2.1.1.5.0',

	// IF-MIB
	ifDescr: '1.3.6.1.2.1.2.2.1.2',
	ifType: '1.3.6.1.2.1.2.2.1.3',
	ifAdminStatus: '1.3.6.1.2.1.2.2.1.7', // read-write, 1 = up, 2 = down ("shutdown")
	ifOperStatus: '1.3.6.1.2.1.2.2.1.8', // 1 = up, 2 = down
	ifName: '1.3.6.1.2.1.31.1.1.1.1', // short name, e.g. gi6
	ifHighSpeed: '1.3.6.1.2.1.31.1.1.1.15', // Mb/s
	ifAlias: '1.3.6.1.2.1.31.1.1.1.18', // read-write, port description

	// Q-BRIDGE-MIB, indexed by VLAN id
	dot1qVlanStaticName: '1.3.6.1.2.1.17.7.1.4.3.1.1',

	// CISCOSB-vlan-MIB. Note: the standard dot1qPvid always returns 1 on these switches.
	vlanPortModeState: '1.3.6.1.4.1.9.6.1.101.48.22.1.1', // read-write, see PORT_MODE_STATE
	vlanTrunkPortModeNativeVlanId: '1.3.6.1.4.1.9.6.1.101.48.61.1.1', // read-write, Gauge
	vlanAccessPortModeVlanId: '1.3.6.1.4.1.9.6.1.101.48.62.1.1', // read-write, Gauge

	// POWER-ETHERNET-MIB, indexed by <group>.<port>, group is always 1
	pethPsePortAdminEnable: '1.3.6.1.2.1.105.1.1.1.3', // read-write, 1 = on, 2 = off
	pethPsePortDetectionStatus: '1.3.6.1.2.1.105.1.1.1.6', // see POE_DETECTION_STATUS
	// CISCOSB-Poe-MIB, same index
	rlPethPsePortOutputPower: '1.3.6.1.4.1.9.6.1.101.108.1.1.5', // mW

	// LLDP-MIB remote systems table, indexed by <timeMark>.<localPortNum = ifIndex>.<remIndex>
	lldpRemChassisIdSubtype: '1.0.8802.1.1.2.1.4.1.1.4',
	lldpRemChassisId: '1.0.8802.1.1.2.1.4.1.1.5',
	lldpRemPortId: '1.0.8802.1.1.2.1.4.1.1.7',
	lldpRemPortDesc: '1.0.8802.1.1.2.1.4.1.1.8',
	lldpRemSysName: '1.0.8802.1.1.2.1.4.1.1.9',

	// CISCOSB-copy-MIB rlCopyEntry, indexed by <column>.<row>
	rlCopyEntry: '1.3.6.1.4.1.9.6.1.101.87.2.1',
} as const

export const IF_TYPE_ETHERNET = 6

export const PORT_MODE_STATE = {
	access: 11,
	trunk: 12,
} as const

export const POE_DETECTION_STATUS: Record<number, string> = {
	1: 'disabled',
	2: 'searching',
	3: 'delivering',
	4: 'fault', // also reported when the connected device is not PoE powered
	5: 'test',
	6: 'fault',
}

export const LLDP_CHASSIS_ID_SUBTYPE_NETWORK_ADDRESS = 5

// "copy running-config startup-config": one SET creating an rlCopyEntry row.
// The switch deletes the row once the copy is done, so the same row index can be reused.
export const RL_COPY = {
	row: 1,
	columns: {
		sourceLocation: 3,
		sourceFileType: 7,
		destinationLocation: 8,
		destinationFileType: 12,
		rowStatus: 17,
	},
	locationLocal: 1,
	fileRunningConfig: 2,
	fileStartupConfig: 3,
	rowCreateAndGo: 4,
} as const
