import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseResponse, decodeList, encodeList } from '../src/airbase.js';
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
} from '../src/mapping.js';

// Captured from a real BRP15B61 (firmware 1_3_0, reg=au).
const control = parseResponse(
  'ret=OK,pow=0,mode=1,operate=1,bk_auto=1,stemp=23,dt1=23,dt2=16,f_rate=1,dfr1=1,dfr2=1,f_airside=0,airside1=0,airside2=0,f_auto=0,auto1=0,auto2=1,f_dir=0,dfd1=0,dfd2=1,filter_sign_info=0,cent=0,en_cent=0,remo=2',
);
const sensor = parseResponse('ret=OK,err=0,htemp=30,otemp=-');
const model = parseResponse(
  'ret=OK,err=0,model=NOTSUPPORT,type=N,humd=0,s_humd=7,en_zone=4,en_linear_zone=0,en_filter_sign=1,acled=1,land=0,elec=0,temp=1,m_dtct=0,ac_dst=au,dmnd=0,en_temp_setting=1,en_frate=1,en_fdir=0,en_rtemp_a=0,en_spmode=0,en_ipw_sep=0,en_scdltmr=0,en_mompow=0,en_patrol=0,en_airside=1,en_quick_timer=1,en_auto=1,en_dry=1,en_common_zone=0,cool_l=16,cool_h=32,heat_l=16,heat_h=32,frate_steps=3,en_frate_auto=1',
);
const zones = parseResponse(
  'ret=OK,zone_name=%4d%41%53%54%45%52%20%42%45%44%3b%42%45%44%20%33%34%3b%4c%49%56%49%4e%47%3b%4f%46%46%49%43%45%3b%20%20%20%20%20%20%20%5a%6f%6e%65%35%3b%20%20%20%20%20%20%20%5a%6f%6e%65%36%3b%20%20%20%20%20%20%20%5a%6f%6e%65%37%3b%20%20%20%20%20%20%20%5a%6f%6e%65%38,zone_onoff=0%3b0%3b1%3b0%3b0%3b0%3b0%3b0',
);

test('parses an adapter answer', () => {
  assert.equal(control.ret, 'OK');
  assert.equal(control.stemp, '23');
  assert.equal(sensor.otemp, '-');
});

test('zone lists round-trip in the adapter encoding', () => {
  assert.deepEqual(decodeList(zones.zone_onoff), ['0', '0', '1', '0', '0', '0', '0', '0']);
  assert.equal(encodeList(['0', '0', '1', '0', '0', '0', '0', '0']), zones.zone_onoff);
});

test('maps modes both ways', () => {
  assert.equal(modeToGladys(control), 2); // hot -> HEATING
  for (const daikin of ['0', '1', '2', '3', '7']) {
    assert.equal(modeFromGladys(modeToGladys({ mode: daikin })), daikin);
  }
  assert.throws(() => modeFromGladys(9));
});

test('maps fan speeds both ways', () => {
  assert.equal(fanToGladys(control), 1);
  assert.equal(fanToGladys({ f_rate: '3', f_auto: '1' }), 0);
  assert.deepEqual(fanFromGladys(0), { f_auto: '1' });
  assert.deepEqual(fanFromGladys(3), { f_auto: '0', f_rate: '3' });
  assert.deepEqual(fanFromGladys(5), { f_auto: '0', f_rate: '5' });
  assert.deepEqual(
    fanOptions(model).map((o) => o.value),
    [0, 1, 3, 5],
  );
  assert.deepEqual(
    fanOptions({ frate_steps: '2', en_frate_auto: '0' }).map((o) => o.value),
    [1, 5],
  );
});

test('reads temperatures, skipping absent values', () => {
  assert.equal(setpointOf(control), 23);
  assert.equal(setpointOf({ stemp: '--' }), null);
  assert.equal(indoorOf(sensor), 30);
  assert.equal(outdoorOf(sensor), null);
  assert.deepEqual(setpointRange(model), { min: 16, max: 32 });
});

test('lists only the zones the unit has', () => {
  assert.deepEqual(zonesOf({ model, zones }), [
    { index: 0, name: 'MASTER BED', on: false },
    { index: 1, name: 'BED 34', on: false },
    { index: 2, name: 'LIVING', on: true },
    { index: 3, name: 'OFFICE', on: false },
  ]);
  assert.equal(prettyZoneName('MASTER BED'), 'Master Bed');
  assert.deepEqual(zonesOf({ model, zones: null }), []);
});
