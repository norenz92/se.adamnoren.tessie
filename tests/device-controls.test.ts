import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import Module from 'node:module';

// ---- Module mocking setup ----
const originalResolve = (Module as any)._resolveFilename;

function MockTessieClient(this: any, token: string) {
  this.getVehicles = async () => [];
  this.getVehicle = async () => ({});
  this.getStatus = async () => ({ status: 'awake' });
  this.getBatteryHealth = async () => null;
  this.command = async () => true;
  this.wake = async () => true;
}

(Module as any)._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
  if (request === 'homey') return '__mock_homey_controls__';
  if (parent && parent.filename && parent.filename.includes('drivers/vehicle/device')) {
    if (request === '../../lib/tessie-client') return '__mock_tessie_client_controls__';
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

// Mock Homey module
const mockHomeyModule = new Module('__mock_homey_controls__');
(mockHomeyModule as any).exports = {
  Device: class MockDevice {
    _data: Record<string, any> = {};
    _store: Record<string, any> = {};
    _capabilities: Record<string, any> = {};
    _capabilityListeners: Record<string, Function> = {};
    _capabilityOptions: Record<string, any> = {};
    _declaredCapabilities: Set<string> = new Set([
      'measure_battery', 'locked',
      'measure_temperature.inside', 'measure_temperature.outside',
      'measure_range', 'charging_status',
      'measure_tire_pressure_fl', 'measure_tire_pressure_fr',
      'measure_tire_pressure_rl', 'measure_tire_pressure_rr',
      'measure_odometer', 'vehicle_state_status',
      'measure_latitude', 'measure_longitude',
      'software_update', 'measure_battery_health',
      'charge_limit', 'charging_amps', 'target_temperature',
      'climate_onoff', 'sentry_mode', 'charge_port',
      'trunk', 'frunk', 'charging_control',
    ]);
    _available = true;
    _unavailableMessage: string | null = null;
    _timeoutCalls: Array<{ fn: Function; ms: number; id: number }> = [];
    _intervalCalls: Array<{ fn: Function; ms: number; id: number }> = [];
    _nextTimerId = 1;
    _clearedTimeouts: number[] = [];
    _clearedIntervals: number[] = [];
    homey = {
      setTimeout: (fn: Function, ms: number) => {
        const id = this._nextTimerId++;
        this._timeoutCalls.push({ fn, ms, id });
        return id;
      },
      clearTimeout: (id: number) => {
        this._clearedTimeouts.push(id);
      },
      setInterval: (fn: Function, ms: number) => {
        const id = this._nextTimerId++;
        this._intervalCalls.push({ fn, ms, id });
        return id;
      },
      clearInterval: (id: number) => {
        this._clearedIntervals.push(id);
      },
    };

    getData() { return this._data; }
    getStoreValue(key: string) { return this._store[key]; }
    async setStoreValue(key: string, value: any) { this._store[key] = value; }
    async setCapabilityValue(name: string, value: any) { this._capabilities[name] = value; }
    getCapabilityValue(name: string) { return this._capabilities[name]; }
    hasCapability(name: string) { return this._declaredCapabilities.has(name); }
    async addCapability(name: string) { this._declaredCapabilities.add(name); }
    async setCapabilityOptions(name: string, opts: any) { this._capabilityOptions[name] = opts; }
    registerCapabilityListener(name: string, fn: Function) { this._capabilityListeners[name] = fn; }
    async setAvailable() { this._available = true; this._unavailableMessage = null; }
    async setUnavailable(msg: string) { this._available = false; this._unavailableMessage = msg; }
    log(..._args: any[]) {}
    error(..._args: any[]) {}
  },
};
(mockHomeyModule as any).loaded = true;
(require as any).cache['__mock_homey_controls__'] = mockHomeyModule;

// Mock TessieClient module
const mockTessieModule = new Module('__mock_tessie_client_controls__');
(mockTessieModule as any).exports = MockTessieClient;
(mockTessieModule as any).loaded = true;
(require as any).cache['__mock_tessie_client_controls__'] = mockTessieModule;

// Now require the device module
const VehicleDevice = require('../drivers/vehicle/device');

// ---- Test fixtures ----

function fullTessieState(overrides: any = {}): any {
  return {
    charge_state: {
      battery_level: 78,
      battery_range: 200,
      charging_state: 'Disconnected',
      charge_limit_soc: 80,
      charge_current_request: 32,
      charge_current_request_max: 48,
      charge_port_door_open: false,
      ...overrides.charge_state,
    },
    climate_state: {
      inside_temp: 22.5,
      outside_temp: 15.3,
      is_climate_on: false,
      driver_temp_setting: 21.0,
      ...overrides.climate_state,
    },
    drive_state: {
      latitude: 59.3293,
      longitude: 18.0686,
      ...overrides.drive_state,
    },
    vehicle_state: {
      locked: true,
      odometer: 12345.6,
      tpms_pressure_fl: 2.9,
      tpms_pressure_fr: 2.85,
      tpms_pressure_rl: 2.95,
      tpms_pressure_rr: 2.88,
      software_update: {
        status: 'available',
        version: '2024.26.3',
      },
      sentry_mode: false,
      rt: 0,
      ft: 0,
      ...overrides.vehicle_state,
    },
    gui_settings: {
      gui_distance_units: 'km/hr',
      gui_temperature_units: 'C',
      gui_tirepressure_units: 'Bar',
      ...overrides.gui_settings,
    },
  };
}

// ---- Helpers ----

interface TrackedCall {
  args: any[];
}

function createDevice({ vin = '5YJXCAE43LF123456', token = 'test-token-abc' } = {}) {
  const device = new VehicleDevice();
  device._data = { id: vin };
  device._store = { token };
  return device;
}

function createTrackedClient(overrides: {
  getVehicleResult?: any;
  getStatusResult?: any;
  commandResult?: boolean;
  commandError?: Error;
  wakeResult?: boolean;
} = {}) {
  const calls: {
    command: TrackedCall[];
    wake: TrackedCall[];
    getVehicle: TrackedCall[];
    getStatus: TrackedCall[];
  } = {
    command: [],
    wake: [],
    getVehicle: [],
    getStatus: [],
  };

  const client = {
    calls,
    getVehicles: async () => [],
    getVehicle: async (...args: any[]) => {
      calls.getVehicle.push({ args });
      return overrides.getVehicleResult || {};
    },
    getStatus: async (...args: any[]) => {
      calls.getStatus.push({ args });
      return overrides.getStatusResult || { status: 'awake' };
    },
    getBatteryHealth: async () => null,
    command: async (...args: any[]) => {
      calls.command.push({ args });
      if (overrides.commandError) throw overrides.commandError;
      return overrides.commandResult !== undefined ? overrides.commandResult : true;
    },
    wake: async (...args: any[]) => {
      calls.wake.push({ args });
      return overrides.wakeResult !== undefined ? overrides.wakeResult : true;
    },
  };

  return client;
}

describe('VehicleDevice Controls', () => {

  describe('ensureAwake', () => {
    it('calls client.wake() when vehicle_state_status is Asleep', async () => {
      const device = createDevice();
      const client = createTrackedClient({
        getStatusResult: { status: 'awake' },
      });
      device.client = client;
      device._capabilities['vehicle_state_status'] = 'Asleep';

      // Override homey.setTimeout to execute callback immediately
      device.homey.setTimeout = (fn: Function, _ms: number) => {
        fn();
        return device._nextTimerId++;
      };

      await device.ensureAwake();

      assert.equal(client.calls.wake.length, 1);
      assert.equal(client.calls.wake[0].args[0], '5YJXCAE43LF123456');
    });

    it('does NOT call wake when vehicle_state_status is Awake', async () => {
      const device = createDevice();
      const client = createTrackedClient();
      device.client = client;
      device._capabilities['vehicle_state_status'] = 'Awake';

      await device.ensureAwake();

      assert.equal(client.calls.wake.length, 0);
    });

    it('throws "Vehicle did not wake up in time" after timeout', async () => {
      const device = createDevice();
      const client = createTrackedClient({
        getStatusResult: { status: 'asleep' }, // never wakes
      });
      device.client = client;
      device._capabilities['vehicle_state_status'] = 'Asleep';

      // Override homey.setTimeout to execute callback immediately (no real delay)
      device.homey.setTimeout = (fn: Function, _ms: number) => {
        fn();
        return device._nextTimerId++;
      };

      await assert.rejects(
        async () => device.ensureAwake(),
        { message: 'Vehicle did not wake up in time' },
      );
    });
  });

  describe('executeCommand', () => {
    it('calls ensureAwake then client.command with correct args', async () => {
      const device = createDevice();
      const client = createTrackedClient({
        getStatusResult: { status: 'awake' },
        getVehicleResult: fullTessieState(),
      });
      device.client = client;
      device._capabilities['vehicle_state_status'] = 'Awake';
      device.isMetric = true;
      device.usesPsi = false;

      // Override homey.setTimeout for refreshState delay
      device.homey.setTimeout = (fn: Function, _ms: number) => {
        fn();
        return device._nextTimerId++;
      };

      await device.executeCommand('lock', { test: 'value' });

      assert.equal(client.calls.command.length, 1);
      assert.equal(client.calls.command[0].args[0], '5YJXCAE43LF123456');
      assert.equal(client.calls.command[0].args[1], 'lock');
      assert.deepEqual(client.calls.command[0].args[2], { test: 'value' });
    });

    it('calls refreshState after successful command', async () => {
      const device = createDevice();
      const client = createTrackedClient({
        getStatusResult: { status: 'awake' },
        getVehicleResult: fullTessieState({ charge_state: { battery_level: 90 } }),
      });
      device.client = client;
      device._capabilities['vehicle_state_status'] = 'Awake';
      device.isMetric = true;
      device.usesPsi = false;

      // Override homey.setTimeout for refreshState delay
      device.homey.setTimeout = (fn: Function, _ms: number) => {
        fn();
        return device._nextTimerId++;
      };

      await device.executeCommand('lock');

      // refreshState calls getVehicle + updateCapabilities
      assert.equal(client.calls.getVehicle.length, 1);
    });

    it('throws error when command returns false', async () => {
      const device = createDevice();
      const client = createTrackedClient({
        commandResult: false,
      });
      device.client = client;
      device._capabilities['vehicle_state_status'] = 'Awake';

      await assert.rejects(
        async () => device.executeCommand('lock'),
        { message: 'Command lock failed' },
      );
    });
  });

  describe('capability listeners', () => {
    // Helper to set up device with onInit and capture listeners
    async function setupDeviceWithListeners() {
      const device = createDevice();

      await device.onInit();

      // Replace auto-created client with our tracked mock
      const client = createTrackedClient({
        getStatusResult: { status: 'awake' },
        getVehicleResult: fullTessieState(),
      });
      device.client = client;
      device._capabilities['vehicle_state_status'] = 'Awake';
      device.isMetric = true;
      device.usesPsi = false;

      // Override homey.setTimeout for refreshState delay
      device.homey.setTimeout = (fn: Function, _ms: number) => {
        fn();
        return device._nextTimerId++;
      };

      return { device, client };
    }

    it('locked listener calls command("lock") when true', async () => {
      const { device, client } = await setupDeviceWithListeners();
      await device._capabilityListeners['locked'](true);
      assert.equal(client.calls.command.length, 1);
      assert.equal(client.calls.command[0].args[1], 'lock');
    });

    it('locked listener calls command("unlock") when false', async () => {
      const { device, client } = await setupDeviceWithListeners();
      await device._capabilityListeners['locked'](false);
      assert.equal(client.calls.command.length, 1);
      assert.equal(client.calls.command[0].args[1], 'unlock');
    });

    it('sentry_mode listener calls command("enable_sentry") when true', async () => {
      const { device, client } = await setupDeviceWithListeners();
      await device._capabilityListeners['sentry_mode'](true);
      assert.equal(client.calls.command[0].args[1], 'enable_sentry');
    });

    it('sentry_mode listener calls command("disable_sentry") when false', async () => {
      const { device, client } = await setupDeviceWithListeners();
      await device._capabilityListeners['sentry_mode'](false);
      assert.equal(client.calls.command[0].args[1], 'disable_sentry');
    });

    it('climate_onoff listener calls command("start_climate") when true', async () => {
      const { device, client } = await setupDeviceWithListeners();
      await device._capabilityListeners['climate_onoff'](true);
      assert.equal(client.calls.command[0].args[1], 'start_climate');
    });

    it('climate_onoff listener calls command("stop_climate") when false', async () => {
      const { device, client } = await setupDeviceWithListeners();
      await device._capabilityListeners['climate_onoff'](false);
      assert.equal(client.calls.command[0].args[1], 'stop_climate');
    });

    it('target_temperature listener calls command("set_temperatures", { temperature: value })', async () => {
      const { device, client } = await setupDeviceWithListeners();
      await device._capabilityListeners['target_temperature'](22.5);
      assert.equal(client.calls.command[0].args[1], 'set_temperatures');
      assert.deepEqual(client.calls.command[0].args[2], { temperature: 22.5 });
    });

    it('charge_limit listener calls command("set_charge_limit", { percent: value })', async () => {
      const { device, client } = await setupDeviceWithListeners();
      await device._capabilityListeners['charge_limit'](80);
      assert.equal(client.calls.command[0].args[1], 'set_charge_limit');
      assert.deepEqual(client.calls.command[0].args[2], { percent: 80 });
    });

    it('charging_amps listener calls command("set_charging_amps", { amps: value })', async () => {
      const { device, client } = await setupDeviceWithListeners();
      await device._capabilityListeners['charging_amps'](16);
      assert.equal(client.calls.command[0].args[1], 'set_charging_amps');
      assert.deepEqual(client.calls.command[0].args[2], { amps: 16 });
    });

    it('charge_port listener calls command("open_charge_port") when true', async () => {
      const { device, client } = await setupDeviceWithListeners();
      await device._capabilityListeners['charge_port'](true);
      assert.equal(client.calls.command[0].args[1], 'open_charge_port');
    });

    it('charge_port listener calls command("close_charge_port") when false', async () => {
      const { device, client } = await setupDeviceWithListeners();
      await device._capabilityListeners['charge_port'](false);
      assert.equal(client.calls.command[0].args[1], 'close_charge_port');
    });

    it('charging_control listener calls command("start_charging") when true', async () => {
      const { device, client } = await setupDeviceWithListeners();
      await device._capabilityListeners['charging_control'](true);
      assert.equal(client.calls.command[0].args[1], 'start_charging');
    });

    it('charging_control listener calls command("stop_charging") when false', async () => {
      const { device, client } = await setupDeviceWithListeners();
      await device._capabilityListeners['charging_control'](false);
      assert.equal(client.calls.command[0].args[1], 'stop_charging');
    });

    it('trunk listener always calls command("activate_rear_trunk") regardless of value', async () => {
      const { device, client } = await setupDeviceWithListeners();
      await device._capabilityListeners['trunk'](true);
      assert.equal(client.calls.command[0].args[1], 'activate_rear_trunk');
    });

    it('frunk listener calls command("activate_front_trunk")', async () => {
      const { device, client } = await setupDeviceWithListeners();
      await device._capabilityListeners['frunk'](true);
      assert.equal(client.calls.command[0].args[1], 'activate_front_trunk');
    });
  });

  describe('updateCapabilities - control fields', () => {
    it('maps charge_limit_soc to charge_limit', async () => {
      const device = createDevice();
      device.isMetric = true;
      device.usesPsi = false;
      await device.updateCapabilities(fullTessieState({ charge_state: { charge_limit_soc: 90 } }));
      assert.equal(device._capabilities['charge_limit'], 90);
    });

    it('maps charge_current_request to charging_amps', async () => {
      const device = createDevice();
      device.isMetric = true;
      device.usesPsi = false;
      await device.updateCapabilities(fullTessieState({ charge_state: { charge_current_request: 24 } }));
      assert.equal(device._capabilities['charging_amps'], 24);
    });

    it('updates charging_amps max via setCapabilityOptions when charge_current_request_max present', async () => {
      const device = createDevice();
      device.isMetric = true;
      device.usesPsi = false;
      await device.updateCapabilities(fullTessieState({ charge_state: { charge_current_request_max: 48 } }));
      assert.deepEqual(device._capabilityOptions['charging_amps'], { max: 48 });
    });

    it('maps charge_port_door_open to charge_port', async () => {
      const device = createDevice();
      device.isMetric = true;
      device.usesPsi = false;
      await device.updateCapabilities(fullTessieState({ charge_state: { charge_port_door_open: true } }));
      assert.equal(device._capabilities['charge_port'], true);
    });

    it('maps is_climate_on to climate_onoff', async () => {
      const device = createDevice();
      device.isMetric = true;
      device.usesPsi = false;
      await device.updateCapabilities(fullTessieState({ climate_state: { is_climate_on: true } }));
      assert.equal(device._capabilities['climate_onoff'], true);
    });

    it('maps driver_temp_setting to target_temperature', async () => {
      const device = createDevice();
      device.isMetric = true;
      device.usesPsi = false;
      await device.updateCapabilities(fullTessieState({ climate_state: { driver_temp_setting: 23.5 } }));
      assert.equal(device._capabilities['target_temperature'], 23.5);
    });

    it('maps vehicle_state.sentry_mode to sentry_mode', async () => {
      const device = createDevice();
      device.isMetric = true;
      device.usesPsi = false;
      await device.updateCapabilities(fullTessieState({ vehicle_state: { sentry_mode: true } }));
      assert.equal(device._capabilities['sentry_mode'], true);
    });

    it('maps vehicle_state.rt to trunk (0=false, non-zero=true)', async () => {
      const device = createDevice();
      device.isMetric = true;
      device.usesPsi = false;
      await device.updateCapabilities(fullTessieState({ vehicle_state: { rt: 0 } }));
      assert.equal(device._capabilities['trunk'], false);

      await device.updateCapabilities(fullTessieState({ vehicle_state: { rt: 1 } }));
      assert.equal(device._capabilities['trunk'], true);
    });

    it('maps charge_state.charging_state to charging_control (Charging=true, else=false)', async () => {
      const device = createDevice();
      device.isMetric = true;
      device.usesPsi = false;
      await device.updateCapabilities(fullTessieState({ charge_state: { charging_state: 'Charging' } }));
      assert.equal(device._capabilities['charging_control'], true);

      await device.updateCapabilities(fullTessieState({ charge_state: { charging_state: 'Disconnected' } }));
      assert.equal(device._capabilities['charging_control'], false);
    });
  });

});
