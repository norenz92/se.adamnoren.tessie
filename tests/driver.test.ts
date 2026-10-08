import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createMockFlow } from './helpers/homey-stubs';

// ---- Module mocking setup ----
const originalResolve = (Module as any)._resolveFilename;

let mockVehicles: any[] = [];
function MockTessieClient(this: any, token: string) {
  this.token = token;
  this.getVehicles = async () => mockVehicles;
}

(Module as any)._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
  if (request === 'homey') return '__mock_homey_driver__';
  if (parent && parent.filename && parent.filename.includes('drivers/car/driver')) {
    if (request === '../../lib/tessie-client') return '__mock_tessie_client_driver__';
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

const mockHomeyModule = new Module('__mock_homey_driver__');
(mockHomeyModule as any).exports = {
  Driver: class MockDriver {
    _devices: any[] = [];
    homey = { flow: createMockFlow() };
    getDevices() { return this._devices; }
    log(..._args: any[]) {}
    error(..._args: any[]) {}
  },
};
(mockHomeyModule as any).loaded = true;
(require as any).cache['__mock_homey_driver__'] = mockHomeyModule;

const mockTessieModule = new Module('__mock_tessie_client_driver__');
(mockTessieModule as any).exports = MockTessieClient;
(mockTessieModule as any).loaded = true;
(require as any).cache['__mock_tessie_client_driver__'] = mockTessieModule;

const VehicleDriver = require('../drivers/car/driver');

// ---- Helpers ----

function flowCardIds(kind: string): string[] {
  return readdirSync(join(process.cwd(), '.homeycompose', 'flow', kind))
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace('.json', ''));
}

async function createDriver() {
  const driver = new VehicleDriver();
  await driver.onInit();
  return driver;
}

function createFakeDevice(capabilities: Record<string, any> = {}, settings: Record<string, any> = {}) {
  const calls = {
    triggerCapabilityListener: [] as any[][],
    executeCommand: [] as any[][],
    setSeatHeater: [] as any[][],
    setSeatCooling: [] as any[][],
    setTargetTemperature: [] as any[][],
    setSpeedLimit: [] as any[][],
  };
  return {
    calls,
    getCapabilityValue: (id: string) => capabilities[id],
    getSetting: (key: string) => settings[key],
    getSpeedLimitPin: () => settings.speed_limit_pin,
    isAtHome: () => capabilities.__home === true,
    triggerCapabilityListener: async (...args: any[]) => { calls.triggerCapabilityListener.push(args); },
    executeCommand: async (...args: any[]) => { calls.executeCommand.push(args); },
    setSeatHeater: async (...args: any[]) => { calls.setSeatHeater.push(args); },
    setSeatCooling: async (...args: any[]) => { calls.setSeatCooling.push(args); },
    setTargetTemperature: async (...args: any[]) => { calls.setTargetTemperature.push(args); },
    setSpeedLimit: async (...args: any[]) => { calls.setSpeedLimit.push(args); },
    wake: async () => {},
    refreshState: async () => {},
  };
}

function createPairSession() {
  const handlers: Record<string, Function> = {};
  return {
    handlers,
    setHandler(name: string, fn: Function) { handlers[name] = fn; },
  };
}

// ---- Tests ----

describe('VehicleDriver', () => {

  describe('flow card registration', () => {
    it('registers a run listener for every action and condition card', async () => {
      const driver = await createDriver();
      const registered = driver.homey.flow.runListeners;
      for (const id of [...flowCardIds('actions'), ...flowCardIds('conditions')]) {
        assert.ok(registered[id], `No run listener registered for flow card "${id}"`);
      }
    });

    it('capability-backed actions go through triggerCapabilityListener (so the command is sent)', async () => {
      const driver = await createDriver();
      const device = createFakeDevice();
      await driver.homey.flow.runListeners['lock']({ device });
      await driver.homey.flow.runListeners['vent_windows']({ device });
      assert.deepEqual(device.calls.triggerCapabilityListener, [['locked', true, { source: 'flow' }], ['windows', false, { source: 'flow' }]]);
    });

    it('flash_lights sends the Tessie "flash" command', async () => {
      const driver = await createDriver();
      const device = createFakeDevice();
      await driver.homey.flow.runListeners['flash_lights']({ device });
      assert.deepEqual(device.calls.executeCommand, [['flash']]);
    });

    it('on/off toggle actions map to enable/disable commands', async () => {
      const driver = await createDriver();
      const device = createFakeDevice();
      await driver.homey.flow.runListeners['set_low_power_mode']({ device, state: 'on' });
      await driver.homey.flow.runListeners['set_guest_mode']({ device, state: 'off' });
      assert.deepEqual(device.calls.executeCommand, [['enable_low_power_mode'], ['disable_guest']]);
    });

    it('set_bioweapon_mode, set_cop_temperature, boombox and software update send typed params', async () => {
      const driver = await createDriver();
      const device = createFakeDevice();
      const run = driver.homey.flow.runListeners;
      await run['set_bioweapon_mode']({ device, state: 'on' });
      await run['set_cop_temperature']({ device, level: '2' });
      await run['play_boombox']({ device, sound: '2000' });
      await run['schedule_software_update']({ device, minutes: 5 });
      assert.deepEqual(device.calls.executeCommand, [
        ['set_bioweapon_mode', { on: true }],
        ['set_cop_temp', { cop_temp: 2 }],
        ['remote_boombox', { sound: 2000 }],
        ['schedule_software_update', { in_seconds: 300 }],
      ]);
    });

    it('share_destination rejects an empty destination', async () => {
      const driver = await createDriver();
      const device = createFakeDevice();
      await assert.rejects(async () => driver.homey.flow.runListeners['share_destination']({ device, destination: '  ' }));
      await driver.homey.flow.runListeners['share_destination']({ device, destination: 'Stockholm' });
      assert.deepEqual(device.calls.executeCommand, [['share', { value: 'Stockholm' }]]);
    });

    it('set_temperature and set_speed_limit pass the unit, defaulting to legacy units', async () => {
      const driver = await createDriver();
      const device = createFakeDevice();
      const run = driver.homey.flow.runListeners;
      await run['set_temperature']({ device, temperature: 70, unit: 'F' });
      await run['set_temperature']({ device, temperature: 21 });
      await run['set_speed_limit']({ device, speed: 120, unit: 'kmh' });
      await run['set_speed_limit']({ device, speed: 70 });
      assert.deepEqual(device.calls.setTargetTemperature, [[70, 'F'], [21, 'C']]);
      assert.deepEqual(device.calls.setSpeedLimit, [[120, 'kmh'], [70, 'mph']]);
    });

    it('seat heater and cooling actions pass the logical seat to the device', async () => {
      const driver = await createDriver();
      const device = createFakeDevice();
      await driver.homey.flow.runListeners['set_seat_heater']({ device, seat: 'third_row_left', level: '3' });
      await driver.homey.flow.runListeners['set_seat_cooling']({ device, seat: 'driver', level: '1' });
      assert.deepEqual(device.calls.setSeatHeater, [['third_row_left', 3]]);
      assert.deepEqual(device.calls.setSeatCooling, [['driver', 1]]);
    });

    it('conditions read capability state', async () => {
      const driver = await createDriver();
      const run = driver.homey.flow.runListeners;
      const device = createFakeDevice({
        charging_status: 'Stopped', vehicle_state_status: 'Asleep', shift_state: 'D',
        measure_battery: 60, software_update: 'Available: 2026.20', windows: true, __home: true,
      });
      assert.equal(await run['is_plugged_in']({ device }), true);
      assert.equal(await run['is_charging']({ device }), false);
      assert.equal(await run['is_asleep']({ device }), true);
      assert.equal(await run['is_driving']({ device }), true);
      assert.equal(await run['windows_closed']({ device }), true);
      assert.equal(await run['software_update_available']({ device }), true);
      assert.equal(await run['is_home']({ device }), true);
      assert.equal(await run['battery_above']({ device, percent: 50 }), true);
      assert.equal(await run['battery_above']({ device, percent: 60 }), false);

      const unplugged = createFakeDevice({ charging_status: 'Disconnected', software_update: 'Up to date' });
      assert.equal(await run['is_plugged_in']({ device: unplugged }), false);
      assert.equal(await run['software_update_available']({ device: unplugged }), false);
    });

    it('battery_below only fires when the threshold is crossed downwards', async () => {
      const driver = await createDriver();
      const run = driver.homey.flow.runListeners['battery_below'];
      assert.equal(await run({ percent: 20 }, { previous: 21, current: 19 }), true);
      assert.equal(await run({ percent: 20 }, { previous: 20, current: 19 }), true);
      assert.equal(await run({ percent: 20 }, { previous: 19, current: 18 }), false);
      assert.equal(await run({ percent: 20 }, { previous: 18, current: 25 }), false);
    });
  });

  describe('pairing', () => {
    it('seeds unit settings from the car gui_settings and skips paired VINs', async () => {
      const driver = await createDriver();
      driver._devices = [{ getData: () => ({ id: 'PAIRED_VIN_0001' }) }];
      mockVehicles = [
        { vin: 'PAIRED_VIN_0001', last_state: {} },
        {
          vin: '5YJ3E1EA0KF000042',
          last_state: {
            display_name: 'Sparky',
            vehicle_config: { car_type: 'model3' },
            gui_settings: { gui_distance_units: 'mi/hr', gui_tirepressure_units: 'Psi', gui_temperature_units: 'F' },
          },
        },
      ];
      const session = createPairSession();
      await driver.onPair(session);
      await session.handlers['validate_token']('tok');
      const devices = await session.handlers['list_devices']();

      assert.equal(devices.length, 1);
      assert.equal(devices[0].name, 'Sparky');
      assert.equal(devices[0].description, 'Model 3 · 0042');
      assert.deepEqual(devices[0].store, { token: 'tok' });
      assert.deepEqual(devices[0].settings, {
        unit_distance: 'mi', unit_pressure: 'psi', unit_temperature: 'F', unit_speed: 'mph',
      });
    });
  });

  describe('repair', () => {
    it('hands the new token to the device', async () => {
      const driver = await createDriver();
      mockVehicles = [{ vin: 'VIN_REPAIR' }];
      let updatedToken: string | null = null;
      const device = { getData: () => ({ id: 'VIN_REPAIR' }), updateToken: async (t: string) => { updatedToken = t; } };
      const session = createPairSession();
      await driver.onRepair(session, device);
      await session.handlers['validate_token']('new-token');
      assert.equal(updatedToken, 'new-token');
    });

    it('rejects a token that cannot see the vehicle', async () => {
      const driver = await createDriver();
      mockVehicles = [{ vin: 'OTHER_VIN' }];
      const device = { getData: () => ({ id: 'VIN_REPAIR' }), updateToken: async () => {} };
      const session = createPairSession();
      await driver.onRepair(session, device);
      await assert.rejects(async () => session.handlers['validate_token']('wrong-account'), /Vehicle not found/);
    });
  });

  describe('v1.x compatibility', () => {
    it('start_climate still honours the temperature argument of v1 Flows', async () => {
      const driver = await createDriver();
      const device = createFakeDevice();
      await driver.homey.flow.runListeners['start_climate']({ device, climate_temperature: 21.5 });
      await driver.homey.flow.runListeners['start_climate']({ device });
      assert.deepEqual(device.calls.triggerCapabilityListener, [['climate_onoff', true, { source: 'flow' }], ['climate_onoff', true, { source: 'flow' }]]);
      assert.deepEqual(device.calls.setTargetTemperature, [[21.5, 'C']]);
    });
  });
});
