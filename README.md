# companion-module-cisco-cbs350

[Bitfocus Companion](https://bitfocus.io/companion) module for Cisco CBS350 switches, using SNMP: read the VLAN of
each port, change the access VLAN of a port, switch ports between access and trunk mode, control PoE, and recall
complete port layouts (profiles).

See [HELP.md](./companion/HELP.md) for the full user documentation and [LICENSE](./LICENSE).

## Prerequisite: enable SNMP on the switch

**SNMP is disabled by factory default.** The module needs SNMP enabled and an SNMP v2c community with **Read-Write**
access.

### Web interface

1. Log in to the switch web interface.
2. **Security > TCP/UDP Services**: check **SNMP Service**, then click **Apply**.
3. **SNMP > Communities**: click **Add**, then set:
   - **SNMP Management Station**: **User Defined** with the IP address of the Companion computer (recommended), or **All**
   - **Community String**: a name of your choice, e.g. `companion`
   - **Basic**, **Access Mode**: **Read Write** (leave **View Name** unchecked)
4. Click **Apply**.
5. Click the **Save** icon at the top of the page so the settings survive a reboot.

### CLI (SSH or console)

```
configure terminal
snmp-server server
snmp-server community companion rw 192.168.1.10
end
write memory
```

Replace `companion` with your community name and `192.168.1.10` with the IP address of the Companion computer.
Without the IP address, any device can use the community.

> SNMP v2c sends the community in clear text, and a Read-Write community allows changing the switch configuration.
> Restrict it to the Companion IP address and keep the switch management on a trusted network.

## Development

The module uses `yarn`. Run `yarn` to install the dependencies, then:

- `yarn build`: build the module once into `dist/`, loadable by Companion as a developer module
- `yarn dev`: rebuild on every change
- `yarn lint` / `yarn format`: check and format the code
- `yarn package`: build the `.tgz` package to share or install the module

### Source layout

| File                | Content                                                                   |
| ------------------- | ------------------------------------------------------------------------- |
| `src/main.ts`       | Module instance: connection, polling, state and validated port operations |
| `src/switch.ts`     | SNMP client of the switch: reads the state and applies changes            |
| `src/oids.ts`       | SNMP OIDs and values, with the MIB they come from                         |
| `src/snmp.ts`       | Promise wrappers around `net-snmp`                                        |
| `src/profiles.ts`   | Profile syntax: parsing, formatting and matching                          |
| `src/config.ts`     | Module configuration fields                                               |
| `src/actions.ts`    | Actions                                                                   |
| `src/feedbacks.ts`  | Feedbacks                                                                 |
| `src/variables.ts`  | Variables                                                                 |
| `src/presets.ts`    | Presets                                                                   |
| `src/choices.ts`    | Dropdown choices shared by actions and feedbacks                          |
| `src/upgrades.ts`   | Upgrade scripts                                                           |
| `companion/HELP.md` | User documentation shown in Companion                                     |

### SNMP OIDs

The CBS350 does not report the port VLANs through the standard `dot1qPvid` (it always returns 1), so the module uses
the Cisco Small Business MIBs. All OIDs are listed in [`src/oids.ts`](./src/oids.ts).

| Purpose                             | OID                                                       | MIB            |
| ----------------------------------- | --------------------------------------------------------- | -------------- |
| Port mode (11 = access, 12 = trunk) | `1.3.6.1.4.1.9.6.1.101.48.22.1.1.<ifIndex>`               | CISCOSB-vlan   |
| Access VLAN                         | `1.3.6.1.4.1.9.6.1.101.48.62.1.1.<ifIndex>`               | CISCOSB-vlan   |
| Trunk native VLAN                   | `1.3.6.1.4.1.9.6.1.101.48.61.1.1.<ifIndex>`               | CISCOSB-vlan   |
| VLAN names                          | `1.3.6.1.2.1.17.7.1.4.3.1.1.<vlan>`                       | Q-BRIDGE-MIB   |
| Link, speed, enable, description    | `ifOperStatus`, `ifHighSpeed`, `ifAdminStatus`, `ifAlias` | IF-MIB         |
| PoE admin and status                | `1.3.6.1.2.1.105.1.1.1.{3,6}.1.<ifIndex>`                 | POWER-ETHERNET |
| PoE output power (mW)               | `1.3.6.1.4.1.9.6.1.101.108.1.1.5.1.<ifIndex>`             | CISCOSB-Poe    |
| LLDP neighbors                      | `1.0.8802.1.1.2.1.4.1.1.{4,5,7,8,9}.<time>.<ifIndex>.<n>` | LLDP-MIB       |
| Save config (`write memory`)        | `1.3.6.1.4.1.9.6.1.101.87.2.1.<column>.1` (rlCopyTable)   | CISCOSB-copy   |
