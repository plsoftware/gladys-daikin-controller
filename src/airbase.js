// -----------------------------------------------------------------------------
// Daikin Airbase (BRP15B61) local client.
//
// Plain HTTP on the LAN, no login: every call is a GET under /skyfi/ and every
// answer is a `key=value,key=value` line starting with `ret=OK`. Protocol and
// value encoding taken from pydaikin (daikin_airbase.py / daikin_brp069.py),
// the library behind Home Assistant's `daikin` integration.
// -----------------------------------------------------------------------------

import http from 'node:http';

const TIMEOUT_MS = 8_000;
const RETRY_DELAY_MS = 500;

// The adapter answers one request at a time and returns HTTP 403 to a second
// one in flight, so every request to a host goes through that host's queue —
// a poll and a command can never overlap, whichever client object made them.
const queues = new Map();

function enqueue(host, task) {
  const run = (queues.get(host) ?? Promise.resolve()).then(task, task);
  queues.set(host, run.catch(() => {}));
  return run;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * GET with node:http, deliberately not fetch(): the adapter answers 403 to a
 * lowercase `host:` header, which is all undici (fetch) ever sends. node:http
 * sends `Host:`.
 */
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: TIMEOUT_MS }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error(`timed out after ${TIMEOUT_MS / 1000}s`)));
    req.on('error', reject);
  });
}

/** "a=1,b=%41" -> { a: '1', b: '%41' } (values left URL-encoded). */
export function parseResponse(body) {
  const out = {};
  for (const pair of String(body).trim().split(',')) {
    const i = pair.indexOf('=');
    if (i > 0) out[pair.slice(0, i)] = pair.slice(i + 1);
  }
  return out;
}

/** "%4d%41;..." -> ['MA', ...] — zone lists are `;`-separated, URL-encoded. */
export function decodeList(value) {
  return decodeURIComponent(value ?? '').split(';');
}

/** The inverse of decodeList, in the lowercase form the adapter expects. */
export function encodeList(items) {
  return encodeURIComponent(items.join(';')).toLowerCase();
}

export class AirbaseClient {
  constructor(host) {
    this.host = host;
  }

  get(path, query = '') {
    return enqueue(this.host, () => this.fetchOnce(path, query));
  }

  async fetchOnce(path, query) {
    const url = `http://${this.host}/skyfi/${path}${query ? `?${query}` : ''}`;
    let res = await httpGet(url);
    if (res.status === 403) {
      // Busy (the Daikin app or another controller got in first): once more.
      await sleep(RETRY_DELAY_MS);
      res = await httpGet(url);
    }
    if (res.status !== 200) throw new Error(`${this.host} ${path}: HTTP ${res.status}`);
    const data = parseResponse(res.body);
    if (data.ret !== 'OK') throw new Error(`${this.host} ${path}: ${data.ret ?? 'no answer'}`);
    return data;
  }

  /** Everything the integration reads, in one object per section. */
  async read() {
    const basic = await this.get('common/basic_info');
    const model = await this.get('aircon/get_model_info');
    const control = await this.get('aircon/get_control_info');
    const sensor = await this.get('aircon/get_sensor_info');
    const zones = await this.get('aircon/get_zone_setting').catch(() => null);
    return { basic, model, control, sensor, zones };
  }

  /**
   * Change control settings. `changes` holds raw adapter values for any of
   * pow, mode, stemp, f_rate, f_auto. Everything else is re-sent as read, so
   * a change never resets another setting.
   */
  async setControl(changes) {
    const current = await this.get('aircon/get_control_info');
    const v = { ...current, ...changes };

    // A mode change without an explicit setpoint / fan speed takes the ones
    // the unit remembers for that mode (dt<mode>, dfr<mode>, auto<mode>).
    if ('mode' in changes) {
      if (!('stemp' in changes) && current[`dt${v.mode}`] != null) v.stemp = current[`dt${v.mode}`];
      if (!('f_rate' in changes) && current[`dfr${v.mode}`] != null) v.f_rate = current[`dfr${v.mode}`];
      if (!('f_auto' in changes) && current[`auto${v.mode}`] != null) v.f_auto = current[`auto${v.mode}`];
    }

    const params = new URLSearchParams({
      f_airside: v.f_airside ?? '0',
      f_auto: v.f_auto ?? '0',
      f_dir: v.f_dir ?? '0',
      f_rate: String(v.f_rate ?? '1')[0],
      lpw: '',
      mode: v.mode,
      pow: v.pow,
      shum: v.shum ?? '--',
      stemp: v.stemp,
    });
    await this.get('aircon/set_control_info', params.toString());
  }

  /** Switch one zone (0-based index) on or off. */
  async setZone(index, on) {
    const current = await this.get('aircon/get_zone_setting');
    const onoff = decodeList(current.zone_onoff);
    if (index < 0 || index >= onoff.length) throw new Error(`No zone ${index + 1}`);
    onoff[index] = on ? '1' : '0';
    // zone_name goes back exactly as read: re-encoding it breaks the %20s.
    await this.get('aircon/set_zone_setting', `zone_name=${current.zone_name}&zone_onoff=${encodeList(onoff)}`);
  }
}
