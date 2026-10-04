// -----------------------------------------------------------------------------
// Daikin Airbase (BRP15B61) -> Gladys external integration.
//
// One Gladys device per Airbase adapter, reached over the LAN by IP, with:
//   - Power, Mode, Target temperature, Fan speed (air-conditioning features)
//   - Indoor temperature, and Outdoor temperature when the unit reports one
//   - one switch per ducted zone
// The adapter has no event stream, so state comes from a poll; every command
// is followed by a re-read so Gladys shows what the unit actually accepted.
// -----------------------------------------------------------------------------

import {
  GladysIntegration,
  logger,
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { AirbaseClient } from './src/airbase.js';
import {
  modeToGladys,
  modeFromGladys,
  fanToGladys,
  fanFromGladys,
  fanOptions,
  setpointOf,
  indoorOf,
  outdoorOf,
  setpointRange,
  zonesOf,
  prettyZoneName,
} from './src/mapping.js';

const gladys = new GladysIntegration();

let config = {};
let pollTimer = null;
// Adapter MAC -> { client, info } where info is the last AirbaseClient.read().
const units = new Map();

// --- Helpers -----------------------------------------------------------------

function normalizeConfig(raw = {}) {
  return {
    hosts: String(raw.hosts ?? '')
      .split(/[\s,;]+/)
      .map((h) => h.trim())
      .filter(Boolean),
    poll_frequency: Math.max(10, Number(raw.poll_frequency ?? 30)),
  };
}

function ids(mac) {
  return gladys.externalIds('airbase', mac.toLowerCase());
}

function nameOf(info) {
  try {
    return decodeURIComponent(info.basic.name ?? '') || 'Daikin Airbase';
  } catch {
    return 'Daikin Airbase';
  }
}

function buildDevice(mac, info) {
  const id = ids(mac);
  const range = setpointRange(info.model);
  const ac = (type, extra) => ({
    external_id: id.feature(type),
    category: DEVICE_FEATURE_CATEGORIES.AIR_CONDITIONING,
    type,
    read_only: false,
    has_feedback: true,
    keep_history: true,
    ...extra,
  });
  const sensor = (key, name) => ({
    name,
    external_id: id.feature(key),
    category: DEVICE_FEATURE_CATEGORIES.TEMPERATURE_SENSOR,
    type: DEVICE_FEATURE_TYPES.SENSOR.DECIMAL,
    unit: DEVICE_FEATURE_UNITS.CELSIUS,
    read_only: true,
    has_feedback: false,
    keep_history: true,
    min: -20,
    max: 60,
  });

  const features = [
    ac(DEVICE_FEATURE_TYPES.AIR_CONDITIONING.BINARY, { name: 'Power', min: 0, max: 1 }),
    ac(DEVICE_FEATURE_TYPES.AIR_CONDITIONING.MODE, { name: 'Mode', min: 0, max: 4 }),
    ac(DEVICE_FEATURE_TYPES.AIR_CONDITIONING.TARGET_TEMPERATURE, {
      name: 'Target temperature',
      unit: DEVICE_FEATURE_UNITS.CELSIUS,
      min: range.min,
      max: range.max,
    }),
    ac(DEVICE_FEATURE_TYPES.AIR_CONDITIONING.FAN_SPEED, {
      name: 'Fan speed',
      min: 0,
      max: 5,
      supported_options: fanOptions(info.model),
    }),
    sensor('indoor-temperature', 'Indoor temperature'),
  ];
  if (outdoorOf(info.sensor) != null) features.push(sensor('outdoor-temperature', 'Outdoor temperature'));
  for (const zone of zonesOf(info)) {
    features.push({
      name: `${prettyZoneName(zone.name)} zone`,
      external_id: id.feature(`zone-${zone.index + 1}`),
      category: DEVICE_FEATURE_CATEGORIES.SWITCH,
      type: DEVICE_FEATURE_TYPES.SWITCH.BINARY,
      read_only: false,
      has_feedback: true,
      keep_history: true,
      min: 0,
      max: 1,
    });
  }

  return {
    name: nameOf(info),
    external_id: id.device,
    params: [
      { name: 'host', value: info.host },
      { name: 'model', value: info.model.model === 'NOTSUPPORT' ? 'Airbase BRP15B61' : info.model.model },
      { name: 'firmware', value: String(info.basic.ver ?? 'unknown').replace(/_/g, '.') },
    ],
    features,
  };
}

/** Every feature state of one unit, derived from its last read. */
function statesOf(mac, info) {
  const id = ids(mac);
  const t = DEVICE_FEATURE_TYPES.AIR_CONDITIONING;
  const states = [
    { device_feature_external_id: id.feature(t.BINARY), state: info.control.pow === '1' ? 1 : 0 },
    { device_feature_external_id: id.feature(t.MODE), state: modeToGladys(info.control) },
    { device_feature_external_id: id.feature(t.TARGET_TEMPERATURE), state: setpointOf(info.control) },
    { device_feature_external_id: id.feature(t.FAN_SPEED), state: fanToGladys(info.control) },
    { device_feature_external_id: id.feature('indoor-temperature'), state: indoorOf(info.sensor) },
    { device_feature_external_id: id.feature('outdoor-temperature'), state: outdoorOf(info.sensor) },
    ...zonesOf(info).map((zone) => ({
      device_feature_external_id: id.feature(`zone-${zone.index + 1}`),
      state: zone.on ? 1 : 0,
    })),
  ];
  // A setpoint reads "--" in fan mode, an absent sensor "-": skip, don't zero.
  return states.filter((s) => s.state != null);
}

async function publishAllStates() {
  const states = [...units.entries()].flatMap(([mac, unit]) => statesOf(mac, unit.info));
  if (states.length === 0) return;
  try {
    await gladys.publishStates(states);
  } catch (err) {
    // Expected until the user has created the device from the Discovery tab.
    logger.debug(`publishStates skipped: ${err.message}`);
  }
}

/** Read one adapter; returns its MAC, or null when it does not answer. */
async function readHost(host) {
  const client = new AirbaseClient(host);
  const info = { host, ...(await client.read()) };
  const mac = info.basic.mac;
  if (!mac) throw new Error(`${host} answered without a MAC address`);
  units.set(mac, { client, info });
  return mac;
}

async function refreshAll() {
  const results = await Promise.allSettled(config.hosts.map(readHost));
  const failed = results
    .map((r, i) => (r.status === 'rejected' ? `${config.hosts[i]}: ${r.reason.message}` : null))
    .filter(Boolean);
  await publishAllStates();

  const reachable = results.length - failed.length;
  if (failed.length) logger.warn(`Unreachable: ${failed.join('; ')}`);
  if (reachable === 0) {
    await gladys.setConnectionStatus(false, { en: `No Airbase adapter answered (${failed.join('; ')})` });
  } else {
    await gladys.setConnectionStatus(true);
  }
  return reachable;
}

async function refreshUnit(mac) {
  const unit = units.get(mac);
  if (!unit) return;
  await readHost(unit.info.host);
  await publishAllStates();
}

async function publishDevices() {
  await gladys.publishDiscoveredDevices([...units.entries()].map(([mac, unit]) => buildDevice(mac, unit.info)));
}

// --- Lifecycle -----------------------------------------------------------------

async function start() {
  stop();
  units.clear();
  if (config.hosts.length === 0) {
    await gladys.setConnectionStatus(false, {
      en: 'Enter the IP address of each Airbase adapter in the Configuration tab.',
      fr: "Saisissez l'adresse IP de chaque adaptateur Airbase dans l'onglet Configuration.",
    });
    return;
  }

  try {
    const found = await refreshAll();
    await publishDevices();
    logger.info(`Found ${found} of ${config.hosts.length} Airbase adapter(s)`);
  } catch (err) {
    logger.error('Airbase initialization failed', err);
  }

  pollTimer = setInterval(async () => {
    try {
      const before = units.size;
      await refreshAll();
      // An adapter that was offline at start-up appears once it answers.
      if (units.size !== before) await publishDevices();
    } catch (err) {
      logger.warn(`Poll failed: ${err.message}`);
    }
  }, config.poll_frequency * 1000);
}

function stop() {
  clearInterval(pollTimer);
  pollTimer = null;
}

// --- Gladys handlers -------------------------------------------------------------

gladys.onScanRequest(async () => {
  await refreshAll();
  await publishDevices();
});

gladys.onPoll(async () => {
  await refreshAll();
});

gladys.onDeviceCreated(async () => {
  await publishAllStates();
});

gladys.onSetValue(async (device, feature, value) => {
  const mac = [...units.keys()].find((m) => ids(m).device === device.external_id);
  const unit = mac && units.get(mac);
  if (!unit) throw new Error(`Unknown Airbase device ${device.external_id}`);
  const key = feature.external_id.slice(device.external_id.length + 1);
  const t = DEVICE_FEATURE_TYPES.AIR_CONDITIONING;

  const zone = /^zone-(\d+)$/.exec(key);
  if (zone) {
    await unit.client.setZone(Number(zone[1]) - 1, Number(value) === 1);
  } else if (key === t.BINARY) {
    await unit.client.setControl({ pow: Number(value) === 1 ? '1' : '0' });
  } else if (key === t.MODE) {
    await unit.client.setControl({ mode: modeFromGladys(value) });
  } else if (key === t.TARGET_TEMPERATURE) {
    const { min, max } = setpointRange(unit.info.model);
    await unit.client.setControl({ stemp: String(Math.min(max, Math.max(min, Math.round(Number(value))))) });
  } else if (key === t.FAN_SPEED) {
    await unit.client.setControl(fanFromGladys(value));
  } else {
    throw new Error(`Unknown feature ${feature.external_id}`);
  }

  // Publish what the unit accepted, not what was asked.
  await refreshUnit(mac);
});

gladys.onConfigUpdated(async (newConfig) => {
  config = normalizeConfig(newConfig);
  await start();
});

gladys.on('connected', async () => {
  try {
    config = normalizeConfig(await gladys.getConfig());
    await start();
  } catch (err) {
    logger.error('Post-connection initialization failed', err);
  }
});

gladys.handleShutdown(() => stop());

logger.info('Starting the Daikin Airbase integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
