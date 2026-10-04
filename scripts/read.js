// Read-only check of a live adapter, without Gladys: prints what the
// integration would publish. Usage: node scripts/read.js 192.168.1.50
import { AirbaseClient } from '../src/airbase.js';
import {
  modeToGladys,
  fanToGladys,
  fanOptions,
  setpointOf,
  indoorOf,
  outdoorOf,
  setpointRange,
  zonesOf,
} from '../src/mapping.js';

const host = process.argv[2];
if (!host) {
  console.error('Usage: node scripts/read.js <adapter-ip>');
  process.exit(1);
}

const info = await new AirbaseClient(host).read();
console.log({
  name: decodeURIComponent(info.basic.name ?? ''),
  mac: info.basic.mac,
  firmware: info.basic.ver,
  power: info.control.pow === '1' ? 1 : 0,
  mode: modeToGladys(info.control),
  setpoint: setpointOf(info.control),
  setpointRange: setpointRange(info.model),
  fan: fanToGladys(info.control),
  fanOptions: fanOptions(info.model).map((o) => o.label),
  indoor: indoorOf(info.sensor),
  outdoor: outdoorOf(info.sensor),
  zones: zonesOf(info),
});
