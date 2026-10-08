import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mapStreamData from '../lib/stream-mapper';

describe('mapStreamData', () => {

  it('maps Soc to measure_battery', () => {
    const result = mapStreamData(
      [{ key: 'Soc', value: { stringValue: '85' } }], true, false
    );
    assert.deepStrictEqual(result, [{ id: 'measure_battery', value: 85 }]);
  });

  it('maps IdealBatteryRange to measure_range (metric, miles to km)', () => {
    const result = mapStreamData(
      [{ key: 'IdealBatteryRange', value: { stringValue: '171.833' } }], true, false
    );
    assert.deepStrictEqual(result, [{ id: 'measure_range', value: 277 }]);
  });

  it('maps IdealBatteryRange to measure_range (imperial, miles rounded)', () => {
    const result = mapStreamData(
      [{ key: 'IdealBatteryRange', value: { stringValue: '171.833' } }], false, false
    );
    assert.deepStrictEqual(result, [{ id: 'measure_range', value: 172 }]);
  });

  it('maps InsideTemp to measure_temperature.inside', () => {
    const result = mapStreamData(
      [{ key: 'InsideTemp', value: { stringValue: '22.5' } }], true, false
    );
    assert.deepStrictEqual(result, [{ id: 'measure_temperature.inside', value: 22.5 }]);
  });

  it('maps OutsideTemp to measure_temperature.outside', () => {
    const result = mapStreamData(
      [{ key: 'OutsideTemp', value: { stringValue: '18.3' } }], true, false
    );
    assert.deepStrictEqual(result, [{ id: 'measure_temperature.outside', value: 18.3 }]);
  });

  it('maps Location to measure_latitude and measure_longitude', () => {
    const result = mapStreamData(
      [{ key: 'Location', value: { locationValue: { latitude: 37.49, longitude: -121.94 } } }], true, false
    );
    assert.deepStrictEqual(result, [
      { id: 'measure_latitude', value: 37.49 },
      { id: 'measure_longitude', value: -121.94 },
    ]);
  });

  it('maps Locked "true" to locked true', () => {
    const result = mapStreamData(
      [{ key: 'Locked', value: { stringValue: 'true' } }], true, false
    );
    assert.deepStrictEqual(result, [{ id: 'locked', value: true }]);
  });

  it('maps Locked "false" to locked false', () => {
    const result = mapStreamData(
      [{ key: 'Locked', value: { stringValue: 'false' } }], true, false
    );
    assert.deepStrictEqual(result, [{ id: 'locked', value: false }]);
  });

  it('maps SentryMode "Off" to sentry_mode false', () => {
    const result = mapStreamData(
      [{ key: 'SentryMode', value: { stringValue: 'Off' } }], true, false
    );
    assert.deepStrictEqual(result, [{ id: 'sentry_mode', value: false }]);
  });

  it('maps SentryMode "On" to sentry_mode true', () => {
    const result = mapStreamData(
      [{ key: 'SentryMode', value: { stringValue: 'On' } }], true, false
    );
    assert.deepStrictEqual(result, [{ id: 'sentry_mode', value: true }]);
  });

  it('maps ChargeLimitSoc to charge_limit (decimal fraction)', () => {
    const result = mapStreamData(
      [{ key: 'ChargeLimitSoc', value: { stringValue: '80' } }], true, false
    );
    assert.deepStrictEqual(result, [{ id: 'charge_limit', value: 0.8 }]);
  });

  it('maps ChargeState "Charging" to charging_status and charging_control true', () => {
    const result = mapStreamData(
      [{ key: 'ChargeState', value: { stringValue: 'Charging' } }], true, false
    );
    assert.deepStrictEqual(result, [
      { id: 'charging_status', value: 'Charging' },
      { id: 'charging_control', value: true },
    ]);
  });

  it('maps ChargeState "Stopped" to charging_status and charging_control false', () => {
    const result = mapStreamData(
      [{ key: 'ChargeState', value: { stringValue: 'Stopped' } }], true, false
    );
    assert.deepStrictEqual(result, [
      { id: 'charging_status', value: 'Stopped' },
      { id: 'charging_control', value: false },
      { id: 'charger_power', value: 0 },
      { id: 'charge_time_remaining', value: 0 },
    ]);
  });

  it('maps HvacPower "On" to climate_onoff true', () => {
    const result = mapStreamData(
      [{ key: 'HvacPower', value: { stringValue: 'On' } }], true, false
    );
    assert.deepStrictEqual(result, [{ id: 'climate_onoff', value: true }]);
  });

  it('maps HvacPower "Off" to climate_onoff false', () => {
    const result = mapStreamData(
      [{ key: 'HvacPower', value: { stringValue: 'Off' } }], true, false
    );
    assert.deepStrictEqual(result, [{ id: 'climate_onoff', value: false }]);
  });

  it('maps ChargeCurrentRequest to charging_amps and ignores actual ChargeAmps', () => {
    const result = mapStreamData([
      { key: 'ChargeAmps', value: { stringValue: '0' } },
      { key: 'ChargeCurrentRequest', value: { stringValue: '16' } },
    ], true, false);
    assert.deepEqual(result, [{ id: 'charging_amps', value: 16 }]);
  });

  it('reads typed Fleet Telemetry values and strips enum prefixes', () => {
    const result = mapStreamData([
      { key: 'HvacPower', value: { hvacPowerValue: 'HvacPowerStateOff' } },
      { key: 'SentryMode', value: { sentryModeStateValue: 'SentryModeStateArmed' } },
      { key: 'Gear', value: { shiftStateValue: 'ShiftStateD' } },
      { key: 'Locked', value: { booleanValue: true } },
    ] as any, true, false);
    assert.deepEqual(result, [
      { id: 'climate_onoff', value: false },
      { id: 'sentry_mode', value: true },
      { id: 'shift_state', value: 'D' },
      { id: 'locked', value: true },
    ]);
  });

  it('maps DetailedChargeState and resets charger power when not charging', () => {
    const result = mapStreamData([
      { key: 'ChargeState', value: { stringValue: 'Charging' } },
      { key: 'DetailedChargeState', value: { detailedChargeStateValue: 'DetailedChargeStateComplete' } },
    ] as any, true, false);
    assert.deepEqual(result, [
      { id: 'charging_status', value: 'Complete' },
      { id: 'charging_control', value: false },
      { id: 'charger_power', value: 0 },
      { id: 'charge_time_remaining', value: 0 },
    ]);
  });

  it('prefers BatteryLevel and RatedRange over Soc and IdealBatteryRange', () => {
    const result = mapStreamData([
      { key: 'Soc', value: { stringValue: '80.6' } },
      { key: 'BatteryLevel', value: { stringValue: '78.2' } },
      { key: 'IdealBatteryRange', value: { stringValue: '300' } },
      { key: 'RatedRange', value: { stringValue: '250' } },
    ], false, false);
    assert.deepEqual(result, [
      { id: 'measure_battery', value: 78 },
      { id: 'measure_range', value: 250 },
    ]);
  });

  it('ignores unknown gears, invalid charge states and malformed points', () => {
    const result = mapStreamData([
      { key: 'Gear', value: { stringValue: 'ShiftStateSNA' } },
      { key: 'ChargeState', value: { stringValue: 'Bogus' } },
      { key: 'Soc', value: null },
      null,
    ] as any, true, false);
    assert.deepEqual(result, []);
    assert.deepEqual(mapStreamData(undefined as any, true, false), []);
  });

  it('maps Odometer to measure_odometer (metric, miles to km)', () => {
    const result = mapStreamData(
      [{ key: 'Odometer', value: { stringValue: '25000' } }], true, false
    );
    assert.deepStrictEqual(result, [{ id: 'measure_odometer', value: 40234 }]);
  });

  it('returns empty array for unknown key', () => {
    const result = mapStreamData(
      [{ key: 'UnknownField', value: { stringValue: '42' } }], true, false
    );
    assert.deepStrictEqual(result, []);
  });

  it('returns empty array when stringValue is null for a known key', () => {
    const result = mapStreamData(
      [{ key: 'Soc', value: { stringValue: undefined } }], true, false
    );
    assert.deepStrictEqual(result, []);
  });

  it('maps multiple data points in a single call', () => {
    const result = mapStreamData([
      { key: 'Soc', value: { stringValue: '85' } },
      { key: 'InsideTemp', value: { stringValue: '22.5' } },
      { key: 'Locked', value: { stringValue: 'true' } },
    ], true, false);
    assert.deepStrictEqual(result, [
      { id: 'measure_battery', value: 85 },
      { id: 'measure_temperature.inside', value: 22.5 },
      { id: 'locked', value: true },
    ]);
  });

});
