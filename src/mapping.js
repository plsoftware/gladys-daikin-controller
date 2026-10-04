// -----------------------------------------------------------------------------
// Airbase values <-> Gladys feature values.
//
// Pure functions of the adapter payloads returned by AirbaseClient.read(), so
// they are testable without an adapter or Gladys.
// -----------------------------------------------------------------------------

import { decodeList } from './airbase.js';

// Gladys AC_MODE: AUTO 0, COOLING 1, HEATING 2, DRYING 3, FAN 4.
const MODE_TO_GLADYS = { 3: 0, 2: 1, 1: 2, 7: 3, 0: 4 };
const MODE_FROM_GLADYS = { 0: '3', 1: '2', 2: '1', 3: '7', 4: '0' };

// Gladys AC_FAN_SPEED: AUTO 0, LOW 1, LOW_MID 2, MID 3, MID_HIGH 4, HIGH 5,
// QUIET 6, TURBO 7. The Airbase has low (1), mid (3), high (5) plus an auto
// flag (f_auto) layered over the rate.
const RATE_FROM_GLADYS = { 1: '1', 2: '1', 3: '3', 4: '5', 5: '5', 6: '1', 7: '5' };

function number(value) {
  const n = Number(value);
  return value == null || value === '' || value === '-' || value === '--' || Number.isNaN(n) ? null : n;
}

export function modeToGladys(control) {
  return MODE_TO_GLADYS[control.mode] ?? null;
}

export function modeFromGladys(value) {
  const mode = MODE_FROM_GLADYS[Number(value)];
  if (mode == null) throw new Error(`Unsupported mode ${value}`);
  return mode;
}

export function fanToGladys(control) {
  if (control.f_auto === '1' || control.f_rate === '0') return 0;
  return number(control.f_rate);
}

/** Raw adapter changes for a Gladys fan speed. */
export function fanFromGladys(value) {
  const v = Number(value);
  if (v === 0) return { f_auto: '1' };
  const rate = RATE_FROM_GLADYS[v];
  if (rate == null) throw new Error(`Unsupported fan speed ${value}`);
  return { f_auto: '0', f_rate: rate };
}

/**
 * `supported_options` of the fan speed feature: only the speeds this unit has
 * (frate_steps 2 = low/high, 3 = low/mid/high), plus Auto when en_frate_auto.
 */
export function fanOptions(model) {
  const speeds = model?.frate_steps === '2' ? [[1, 'Low'], [5, 'High']] : [[1, 'Low'], [3, 'Mid'], [5, 'High']];
  if (model?.en_frate_auto !== '0') speeds.unshift([0, 'Auto']);
  return speeds.map(([value, label], sort_order) => ({ value, label, sort_order }));
}

export function setpointOf(control) {
  return number(control.stemp);
}

export function indoorOf(sensor) {
  return number(sensor.htemp);
}

export function outdoorOf(sensor) {
  return number(sensor.otemp);
}

/** Setpoint range of the unit: the widest of its cool and heat ranges. */
export function setpointRange(model) {
  const lows = [number(model.cool_l), number(model.heat_l)].filter((n) => n != null);
  const highs = [number(model.cool_h), number(model.heat_h)].filter((n) => n != null);
  return {
    min: lows.length ? Math.min(...lows) : 16,
    max: highs.length ? Math.max(...highs) : 32,
  };
}

/**
 * The zones the unit actually has: `en_zone` of them (the adapter always
 * returns 8 names, padded "      Zone5"…), each { index, name, on }.
 */
export function zonesOf({ model, zones }) {
  if (!zones?.zone_name) return [];
  const names = decodeList(zones.zone_name);
  const onoff = decodeList(zones.zone_onoff);
  const count = number(model?.en_zone) ?? names.length;
  return names.slice(0, count).map((name, index) => ({
    index,
    name: name.trim() || `Zone ${index + 1}`,
    on: onoff[index] === '1',
  }));
}

/** "Zone name" in title case: the adapter stores them upper case. */
export function prettyZoneName(name) {
  return name.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}
