import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import Module from 'node:module';
import { createMockFlow, createMockGeolocation, StubTessieStreamer } from './helpers/homey-stubs';

// ---- Module mocking setup ----
const originalResolve = (Module as any)._resolveFilename;

function MockTessieClient(this: any, token: string) {
  this.getVehicles = async () => [];
  this.getVehicle = async () => ({});
  this.getStatus = async () => ({ status: 'awake' });
  this.getBatteryHealth = async () => null;
  this.getCharges = async () => [];
  this.command = async () => true;
  this.wake = async () => true;
}

(Module as any)._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
  if (request === 'homey') return '__mock_homey_controls__';
  if (parent && parent.filename && parent.filename.includes('drivers/vehicle/device')) {
    if (request === '../../lib/tessie-client') return '__mock_tessie_client_controls__';
    if (request === '../../lib/tessie-streamer') return '__mock_tessie_streamer_controls__';
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
      'software_update', 'measure_soh',
      'charge_limit', 'charging_amps', 'target_temperature',
      'climate_onoff', 'sentry_mode', 'charge_port',
      'trunk', 'frunk', 'charging_control',
      'seat_heater_driver', 'seat_heater_passenger',
      'seat_heater_rear_left', 'seat_heater_rear_center', 'seat_heater_rear_right',
      'climate_keeper_mode', 'cabin_overheat_protection',
      'defrost_mode', 'steering_wheel_heater',
      'windows', 'valet_mode', 'speed_limit_mode', 'speed_limit_speed',
      'last_charge_energy', 'last_charge_location', 'last_charge_cost',
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
      flow: createMockFlow(),
      geolocation: createMockGeolocation(),
    };

    getData() { return this._data; }
    getStoreValue(key: string) { return this._store[key]; }
    async setStoreValue(key: string, value: any) { this._store[key] = value; }
    async setCapabilityValue(name: string, value: any) { this._capabilities[name] = value; }
    getCapabilityValue(name: string) { return this._capabilities[name]; }
    hasCapability(name: string) { return this._declaredCapabilities.has(name); }
    async addCapability(name: string) { this._declaredCapabilities.add(name); }
    async removeCapability(name: string) { this._declaredCapabilities.delete(name); }
    _settings: Record<string, any> = {};
    async setSettings(settings: Record<string, any>) { Object.assign(this._settings, settings); }
    async setCapabilityOptions(name: string, opts: any) { this._capabilityOptions[name] = opts; }
    registerCapabilityListener(name: string, fn: Function) { this._capabilityListeners[name] = fn; }
    getSetting(key: string) { return this._settings[key]; }
    getSettings() { return { ...this._settings }; }
    async triggerCapabilityListener(name: string, value: any) {
      await this._capabilityListeners[name](value, {});
      this._capabilities[name] = value;
    }
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

const stubStreamerModule = new Module('__mock_tessie_streamer_controls__');
(stubStreamerModule as any).exports = StubTessieStreamer;
(stubStreamerModule as any).loaded = true;
(require as any).cache['__mock_tessie_streamer_controls__'] = stubStreamerModule;

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
      seat_heater_left: 0,
      seat_heater_right: 0,
      seat_heater_rear_left: 0,
      seat_heater_rear_center: 0,
      seat_heater_rear_right: 0,
      steering_wheel_heater: false,
      defrost_mode: 0,
      climate_keeper_mode: 'off',
      cabin_overheat_protection: 'Off',
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
      fd_window: 0,
      fp_window: 0,
      rd_window: 0,
      rp_window: 0,
      valet_mode: false,
      speed_limit_mode: { active: false, current_limit_mph: 70 },
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
  getChargesResult?: any[];
} = {}) {
  const calls: {
    command: TrackedCall[];
    wake: TrackedCall[];
    getVehicle: TrackedCall[];
    getStatus: TrackedCall[];
    getCharges: TrackedCall[];
  } = {
    command: [],
    wake: [],
    getVehicle: [],
    getStatus: [],
    getCharges: [],
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
    getCharges: async (...args: any[]) => {
      calls.getCharges.push({ args });
      return overrides.getChargesResult !== undefined ? overrides.getChargesResult : [];
    },
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

    it('throws "Vehicle did not wake up in time" when Tessie wake times out', async () => {
      const device = createDevice();
      const client = createTrackedClient({
        wakeResult: false, // Tessie gave up after ~90s
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
      await device._capabilityListeners['charge_limit'](0.8);
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
      assert.equal(device._capabilities['charge_limit'], 0.9);
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
      assert.equal(device._capabilityOptions['charging_amps']?.max, 48);
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

  describe('seat heater listeners', () => {
    async function setupDeviceWithListeners() {
      const device = createDevice();
      await device.onInit();
      const client = createTrackedClient({
        getStatusResult: { status: 'awake' },
        getVehicleResult: fullTessieState(),
      });
      device.client = client;
      device._capabilities['vehicle_state_status'] = 'Awake';
      device.isMetric = true;
      device.usesPsi = false;
      device.homey.setTimeout = (fn: Function, _ms: number) => {
        fn();
        return device._nextTimerId++;
      };
      return { device, client };
    }

    it('seat_heater_driver sends set_seat_heat with seat=front_left', async () => {
      const { device, client } = await setupDeviceWithListeners();
      await device._capabilityListeners['seat_heater_driver']('2');
      assert.equal(client.calls.command[0].args[1], 'set_seat_heat');
      assert.deepEqual(client.calls.command[0].args[2], { seat: 'front_left', level: 2 });
    });

    it('seat_heater_passenger sends set_seat_heat with seat=front_right', async () => {
      const { device, client } = await setupDeviceWithListeners();
      await device._capabilityListeners['seat_heater_passenger']('3');
      assert.equal(client.calls.command[0].args[1], 'set_seat_heat');
      assert.deepEqual(client.calls.command[0].args[2], { seat: 'front_right', level: 3 });
    });

    it('seat_heater_rear_left sends set_seat_heat with seat=rear_left', async () => {
      const { device, client } = await setupDeviceWithListeners();
      await device._capabilityListeners['seat_heater_rear_left']('1');
      assert.equal(client.calls.command[0].args[1], 'set_seat_heat');
      assert.deepEqual(client.calls.command[0].args[2], { seat: 'rear_left', level: 1 });
    });

    it('seat_heater_rear_center sends set_seat_heat with seat=rear_center', async () => {
      const { device, client } = await setupDeviceWithListeners();
      await device._capabilityListeners['seat_heater_rear_center']('1');
      assert.equal(client.calls.command[0].args[1], 'set_seat_heat');
      assert.deepEqual(client.calls.command[0].args[2], { seat: 'rear_center', level: 1 });
    });

    it('seat_heater_rear_right sends set_seat_heat with seat=rear_right', async () => {
      const { device, client } = await setupDeviceWithListeners();
      await device._capabilityListeners['seat_heater_rear_right']('0');
      assert.equal(client.calls.command[0].args[1], 'set_seat_heat');
      assert.deepEqual(client.calls.command[0].args[2], { seat: 'rear_right', level: 0 });
    });
  });

  describe('steering wheel heater listener', () => {
    async function setupDeviceWithListeners() {
      const device = createDevice();
      await device.onInit();
      const client = createTrackedClient({
        getStatusResult: { status: 'awake' },
        getVehicleResult: fullTessieState(),
      });
      device.client = client;
      device._capabilities['vehicle_state_status'] = 'Awake';
      device.isMetric = true;
      device.usesPsi = false;
      device.homey.setTimeout = (fn: Function, _ms: number) => {
        fn();
        return device._nextTimerId++;
      };
      return { device, client };
    }

    it('calls start_steering_wheel_heater when true', async () => {
      const { device, client } = await setupDeviceWithListeners();
      await device._capabilityListeners['steering_wheel_heater'](true);
      assert.equal(client.calls.command[0].args[1], 'start_steering_wheel_heater');
    });

    it('calls stop_steering_wheel_heater when false', async () => {
      const { device, client } = await setupDeviceWithListeners();
      await device._capabilityListeners['steering_wheel_heater'](false);
      assert.equal(client.calls.command[0].args[1], 'stop_steering_wheel_heater');
    });
  });

  describe('defrost mode listener', () => {
    async function setupDeviceWithListeners() {
      const device = createDevice();
      await device.onInit();
      const client = createTrackedClient({
        getStatusResult: { status: 'awake' },
        getVehicleResult: fullTessieState(),
      });
      device.client = client;
      device._capabilities['vehicle_state_status'] = 'Awake';
      device.isMetric = true;
      device.usesPsi = false;
      device.homey.setTimeout = (fn: Function, _ms: number) => {
        fn();
        return device._nextTimerId++;
      };
      return { device, client };
    }

    it('calls start_max_defrost when true', async () => {
      const { device, client } = await setupDeviceWithListeners();
      await device._capabilityListeners['defrost_mode'](true);
      assert.equal(client.calls.command[0].args[1], 'start_max_defrost');
    });

    it('calls stop_max_defrost when false', async () => {
      const { device, client } = await setupDeviceWithListeners();
      await device._capabilityListeners['defrost_mode'](false);
      assert.equal(client.calls.command[0].args[1], 'stop_max_defrost');
    });
  });

  describe('climate keeper mode listener', () => {
    async function setupDeviceWithListeners() {
      const device = createDevice();
      await device.onInit();
      const client = createTrackedClient({
        getStatusResult: { status: 'awake' },
        getVehicleResult: fullTessieState(),
      });
      device.client = client;
      device._capabilities['vehicle_state_status'] = 'Awake';
      device.isMetric = true;
      device.usesPsi = false;
      device.homey.setTimeout = (fn: Function, _ms: number) => {
        fn();
        return device._nextTimerId++;
      };
      return { device, client };
    }

    it('sends mode=0 for Off', async () => {
      const { device, client } = await setupDeviceWithListeners();
      await device._capabilityListeners['climate_keeper_mode']('Off');
      assert.equal(client.calls.command[0].args[1], 'set_climate_keeper_mode');
      assert.deepEqual(client.calls.command[0].args[2], { mode: 0 });
    });

    it('sends mode=1 for Keep', async () => {
      const { device, client } = await setupDeviceWithListeners();
      await device._capabilityListeners['climate_keeper_mode']('Keep');
      assert.deepEqual(client.calls.command[0].args[2], { mode: 1 });
    });

    it('sends mode=2 for Dog', async () => {
      const { device, client } = await setupDeviceWithListeners();
      await device._capabilityListeners['climate_keeper_mode']('Dog');
      assert.deepEqual(client.calls.command[0].args[2], { mode: 2 });
    });

    it('sends mode=3 for Camp', async () => {
      const { device, client } = await setupDeviceWithListeners();
      await device._capabilityListeners['climate_keeper_mode']('Camp');
      assert.deepEqual(client.calls.command[0].args[2], { mode: 3 });
    });
  });

  describe('cabin overheat protection listener', () => {
    async function setupDeviceWithListeners() {
      const device = createDevice();
      await device.onInit();
      const client = createTrackedClient({
        getStatusResult: { status: 'awake' },
        getVehicleResult: fullTessieState(),
      });
      device.client = client;
      device._capabilities['vehicle_state_status'] = 'Awake';
      device.isMetric = true;
      device.usesPsi = false;
      device.homey.setTimeout = (fn: Function, _ms: number) => {
        fn();
        return device._nextTimerId++;
      };
      return { device, client };
    }

    it('sends on=false, fan_only=false for Off', async () => {
      const { device, client } = await setupDeviceWithListeners();
      await device._capabilityListeners['cabin_overheat_protection']('Off');
      assert.equal(client.calls.command[0].args[1], 'set_cabin_overheat_protection');
      assert.deepEqual(client.calls.command[0].args[2], { on: false, fan_only: false });
    });

    it('sends on=true, fan_only=true for FanOnly', async () => {
      const { device, client } = await setupDeviceWithListeners();
      await device._capabilityListeners['cabin_overheat_protection']('FanOnly');
      assert.deepEqual(client.calls.command[0].args[2], { on: true, fan_only: true });
    });

    it('sends on=true, fan_only=false for AC', async () => {
      const { device, client } = await setupDeviceWithListeners();
      await device._capabilityListeners['cabin_overheat_protection']('AC');
      assert.deepEqual(client.calls.command[0].args[2], { on: true, fan_only: false });
    });
  });

  describe('updateCapabilities - climate controls', () => {
    it('maps seat_heater_left to seat_heater_driver as String', async () => {
      const device = createDevice();
      device.isMetric = true;
      device.usesPsi = false;
      await device.updateCapabilities(fullTessieState({ climate_state: { seat_heater_left: 2 } }));
      assert.equal(device._capabilities['seat_heater_driver'], '2');
    });

    it('maps seat_heater_right to seat_heater_passenger as String', async () => {
      const device = createDevice();
      device.isMetric = true;
      device.usesPsi = false;
      await device.updateCapabilities(fullTessieState({ climate_state: { seat_heater_right: 3 } }));
      assert.equal(device._capabilities['seat_heater_passenger'], '3');
    });

    it('maps seat_heater_rear_left to seat_heater_rear_left as String', async () => {
      const device = createDevice();
      device.isMetric = true;
      device.usesPsi = false;
      await device.updateCapabilities(fullTessieState({ climate_state: { seat_heater_rear_left: 1 } }));
      assert.equal(device._capabilities['seat_heater_rear_left'], '1');
    });

    it('maps seat_heater_rear_center to seat_heater_rear_center as String', async () => {
      const device = createDevice();
      device.isMetric = true;
      device.usesPsi = false;
      await device.updateCapabilities(fullTessieState({ climate_state: { seat_heater_rear_center: 0 } }));
      assert.equal(device._capabilities['seat_heater_rear_center'], '0');
    });

    it('maps seat_heater_rear_right to seat_heater_rear_right as String', async () => {
      const device = createDevice();
      device.isMetric = true;
      device.usesPsi = false;
      await device.updateCapabilities(fullTessieState({ climate_state: { seat_heater_rear_right: 3 } }));
      assert.equal(device._capabilities['seat_heater_rear_right'], '3');
    });

    it('maps steering_wheel_heater boolean', async () => {
      const device = createDevice();
      device.isMetric = true;
      device.usesPsi = false;
      await device.updateCapabilities(fullTessieState({ climate_state: { steering_wheel_heater: true } }));
      assert.equal(device._capabilities['steering_wheel_heater'], true);
    });

    it('maps defrost_mode integer to boolean (0=false, non-zero=true)', async () => {
      const device = createDevice();
      device.isMetric = true;
      device.usesPsi = false;
      await device.updateCapabilities(fullTessieState({ climate_state: { defrost_mode: 0 } }));
      assert.equal(device._capabilities['defrost_mode'], false);

      await device.updateCapabilities(fullTessieState({ climate_state: { defrost_mode: 2 } }));
      assert.equal(device._capabilities['defrost_mode'], true);
    });

    it('maps climate_keeper_mode string to capitalized enum id', async () => {
      const device = createDevice();
      device.isMetric = true;
      device.usesPsi = false;
      await device.updateCapabilities(fullTessieState({ climate_state: { climate_keeper_mode: 'dog' } }));
      assert.equal(device._capabilities['climate_keeper_mode'], 'Dog');

      await device.updateCapabilities(fullTessieState({ climate_state: { climate_keeper_mode: 'camp' } }));
      assert.equal(device._capabilities['climate_keeper_mode'], 'Camp');

      await device.updateCapabilities(fullTessieState({ climate_state: { climate_keeper_mode: 'keep' } }));
      assert.equal(device._capabilities['climate_keeper_mode'], 'Keep');

      await device.updateCapabilities(fullTessieState({ climate_state: { climate_keeper_mode: 'off' } }));
      assert.equal(device._capabilities['climate_keeper_mode'], 'Off');
    });

    it('maps cabin_overheat_protection state to enum id', async () => {
      const device = createDevice();
      device.isMetric = true;
      device.usesPsi = false;
      await device.updateCapabilities(fullTessieState({ climate_state: { cabin_overheat_protection: 'Off' } }));
      assert.equal(device._capabilities['cabin_overheat_protection'], 'Off');

      await device.updateCapabilities(fullTessieState({ climate_state: { cabin_overheat_protection: 'FanOnly' } }));
      assert.equal(device._capabilities['cabin_overheat_protection'], 'FanOnly');

      await device.updateCapabilities(fullTessieState({ climate_state: { cabin_overheat_protection: 'On' } }));
      assert.equal(device._capabilities['cabin_overheat_protection'], 'AC');
    });

    it('defaults climate_keeper_mode to Off for unknown values', async () => {
      const device = createDevice();
      device.isMetric = true;
      device.usesPsi = false;
      await device.updateCapabilities(fullTessieState({ climate_state: { climate_keeper_mode: 'unknown' } }));
      assert.equal(device._capabilities['climate_keeper_mode'], 'Off');
    });

    it('defaults cabin_overheat_protection to Off for unknown values', async () => {
      const device = createDevice();
      device.isMetric = true;
      device.usesPsi = false;
      await device.updateCapabilities(fullTessieState({ climate_state: { cabin_overheat_protection: 'Unknown' } }));
      assert.equal(device._capabilities['cabin_overheat_protection'], 'Off');
    });
  });

  describe('windows listener', () => {
    async function setupDeviceWithListeners() {
      const device = createDevice();
      await device.onInit();
      const client = createTrackedClient({
        getStatusResult: { status: 'awake' },
        getVehicleResult: fullTessieState(),
      });
      device.client = client;
      device._capabilities['vehicle_state_status'] = 'Awake';
      device.isMetric = true;
      device.usesPsi = false;
      device.homey.setTimeout = (fn: Function, _ms: number) => {
        fn();
        return device._nextTimerId++;
      };
      return { device, client };
    }

    it('calls close_windows when true', async () => {
      const { device, client } = await setupDeviceWithListeners();
      await device._capabilityListeners['windows'](true);
      assert.equal(client.calls.command[0].args[1], 'close_windows');
    });

    it('calls vent_windows when false', async () => {
      const { device, client } = await setupDeviceWithListeners();
      await device._capabilityListeners['windows'](false);
      assert.equal(client.calls.command[0].args[1], 'vent_windows');
    });
  });

  describe('valet mode listener', () => {
    async function setupDeviceWithListeners() {
      const device = createDevice();
      await device.onInit();
      const client = createTrackedClient({
        getStatusResult: { status: 'awake' },
        getVehicleResult: fullTessieState(),
      });
      device.client = client;
      device._capabilities['vehicle_state_status'] = 'Awake';
      device.isMetric = true;
      device.usesPsi = false;
      device.homey.setTimeout = (fn: Function, _ms: number) => {
        fn();
        return device._nextTimerId++;
      };
      return { device, client };
    }

    it('calls enable_valet when true', async () => {
      const { device, client } = await setupDeviceWithListeners();
      await device._capabilityListeners['valet_mode'](true);
      assert.equal(client.calls.command[0].args[1], 'enable_valet');
    });

    it('calls disable_valet when false', async () => {
      const { device, client } = await setupDeviceWithListeners();
      await device._capabilityListeners['valet_mode'](false);
      assert.equal(client.calls.command[0].args[1], 'disable_valet');
    });
  });

  describe('speed limit mode listener', () => {
    async function setupDeviceWithListeners() {
      const device = createDevice();
      await device.onInit();
      const client = createTrackedClient({
        getStatusResult: { status: 'awake' },
        getVehicleResult: fullTessieState(),
      });
      device.client = client;
      device._capabilities['vehicle_state_status'] = 'Awake';
      device.isMetric = true;
      device.usesPsi = false;
      device.homey.setTimeout = (fn: Function, _ms: number) => {
        fn();
        return device._nextTimerId++;
      };
      return { device, client };
    }

    it('calls enable_speed_limit with pin when true and PIN is set', async () => {
      const { device, client } = await setupDeviceWithListeners();
      device._settings = { speed_limit_pin: '1234' };
      await device._capabilityListeners['speed_limit_mode'](true);
      assert.equal(client.calls.command[0].args[1], 'enable_speed_limit');
      assert.deepEqual(client.calls.command[0].args[2], { pin: '1234' });
    });

    it('calls disable_speed_limit with pin when false and PIN is set', async () => {
      const { device, client } = await setupDeviceWithListeners();
      device._settings = { speed_limit_pin: '5678' };
      await device._capabilityListeners['speed_limit_mode'](false);
      assert.equal(client.calls.command[0].args[1], 'disable_speed_limit');
      assert.deepEqual(client.calls.command[0].args[2], { pin: '5678' });
    });

    it('throws error when PIN is not configured', async () => {
      const { device } = await setupDeviceWithListeners();
      device._settings = {};
      await assert.rejects(
        async () => device._capabilityListeners['speed_limit_mode'](true),
        { message: 'Speed limit PIN not configured. Set it in device settings.' },
      );
    });
  });

  describe('speed limit speed listener', () => {
    async function setupDeviceWithListeners() {
      const device = createDevice();
      await device.onInit();
      const client = createTrackedClient({
        getStatusResult: { status: 'awake' },
        getVehicleResult: fullTessieState(),
      });
      device.client = client;
      device._capabilities['vehicle_state_status'] = 'Awake';
      device.isMetric = true;
      device.usesPsi = false;
      device.homey.setTimeout = (fn: Function, _ms: number) => {
        fn();
        return device._nextTimerId++;
      };
      return { device, client };
    }

    it('calls set_speed_limit with mph param', async () => {
      const { device, client } = await setupDeviceWithListeners();
      await device.applyUnitSettings({ unit_speed: 'mph' });
      await device._capabilityListeners['speed_limit_speed'](75);
      assert.equal(client.calls.command[0].args[1], 'set_speed_limit');
      assert.deepEqual(client.calls.command[0].args[2], { mph: 75 });
    });

    it('rejects speed limits outside the 50-90 mph range without calling the API', async () => {
      const { device, client } = await setupDeviceWithListeners();
      await device.applyUnitSettings({ unit_speed: 'mph' });
      await assert.rejects(async () => device._capabilityListeners['speed_limit_speed'](120));
      assert.equal(client.calls.command.length, 0);
    });
  });

  describe('updateCapabilities - access controls', () => {
    it('maps all windows closed (all 0) to windows=true', async () => {
      const device = createDevice();
      device.isMetric = true;
      device.usesPsi = false;
      await device.updateCapabilities(fullTessieState({
        vehicle_state: { fd_window: 0, fp_window: 0, rd_window: 0, rp_window: 0 },
      }));
      assert.equal(device._capabilities['windows'], true);
    });

    it('maps any window vented (non-zero) to windows=false', async () => {
      const device = createDevice();
      device.isMetric = true;
      device.usesPsi = false;
      await device.updateCapabilities(fullTessieState({
        vehicle_state: { fd_window: 0, fp_window: 1, rd_window: 0, rp_window: 0 },
      }));
      assert.equal(device._capabilities['windows'], false);
    });

    it('maps vehicle_state.valet_mode to valet_mode', async () => {
      const device = createDevice();
      device.isMetric = true;
      device.usesPsi = false;
      await device.updateCapabilities(fullTessieState({
        vehicle_state: { valet_mode: true },
      }));
      assert.equal(device._capabilities['valet_mode'], true);
    });

    it('maps vehicle_state.speed_limit_mode.active to speed_limit_mode', async () => {
      const device = createDevice();
      device.isMetric = true;
      device.usesPsi = false;
      await device.updateCapabilities(fullTessieState({
        vehicle_state: { speed_limit_mode: { active: true, current_limit_mph: 70 } },
      }));
      assert.equal(device._capabilities['speed_limit_mode'], true);
    });

    it('maps vehicle_state.speed_limit_mode.current_limit_mph to speed_limit_speed', async () => {
      const device = createDevice();
      device.isMetric = true;
      device.usesPsi = false;
      await device.updateCapabilities(fullTessieState({
        vehicle_state: { speed_limit_mode: { active: false, current_limit_mph: 85 } },
      }));
      // Default unit is km/h: 85 mph -> 137 km/h
      assert.equal(device._capabilities['speed_limit_speed'], 137);
    });
  });

  describe('updateChargingHistory', () => {
    it('sets last_charge_energy, last_charge_location, last_charge_cost from getCharges', async () => {
      const device = createDevice();
      const client = createTrackedClient({
        getChargesResult: [
          {
            charge_energy_added: 42.3,
            location: 'Home',
            total_cost: 4.32,
            currency: '$',
          },
        ],
      });
      device.client = client;
      await device.updateChargingHistory();

      assert.equal(device._capabilities['last_charge_energy'], 42.3);
      assert.equal(device._capabilities['last_charge_location'], 'Home');
      assert.equal(device._capabilities['last_charge_cost'], 4.32);
    });

    it('handles empty charges array gracefully', async () => {
      const device = createDevice();
      const client = createTrackedClient({ getChargesResult: [] });
      device.client = client;
      await device.updateChargingHistory();
      // Should not throw, capabilities unchanged
      assert.equal(device._capabilities['last_charge_energy'], undefined);
    });

    it('handles getCharges error gracefully', async () => {
      const device = createDevice();
      const client = createTrackedClient();
      client.getCharges = async () => { throw new Error('Network error'); };
      device.client = client;
      await device.updateChargingHistory();
      // Should not throw
      assert.equal(device._capabilities['last_charge_energy'], undefined);
    });
  });

  describe('unit settings and conversions', () => {
    it('applyUnitSettings sets metric capability options', async () => {
      const device = createDevice();
      device._settings = { unit_distance: 'km', unit_pressure: 'bar', unit_temperature: 'C', unit_speed: 'kmh', currency: 'USD' };
      await device.applyUnitSettings();

      assert.equal(device._capabilityOptions['measure_range']?.units, 'km');
      assert.equal(device._capabilityOptions['measure_odometer']?.units, 'km');
      assert.equal(device._capabilityOptions['measure_tire_pressure_fl']?.units, 'bar');
      assert.equal(device._capabilityOptions['target_temperature']?.units, '°C');
      assert.equal(device._capabilityOptions['target_temperature']?.min, 15);
      assert.equal(device._capabilityOptions['target_temperature']?.max, 28);
      assert.equal(device._capabilityOptions['speed_limit_speed']?.units, 'km/h');
      assert.equal(device._capabilityOptions['speed_limit_speed']?.min, 80);
      assert.equal(device._capabilityOptions['last_charge_cost']?.units, '$');
      assert.equal(device.isMetric, true);
      assert.equal(device.usesPsi, false);
    });

    it('applyUnitSettings sets imperial capability options', async () => {
      const device = createDevice();
      device._settings = { unit_distance: 'mi', unit_pressure: 'psi', unit_temperature: 'F', unit_speed: 'mph', currency: 'SEK' };
      await device.applyUnitSettings();

      assert.equal(device._capabilityOptions['measure_range']?.units, 'mi');
      assert.equal(device._capabilityOptions['measure_tire_pressure_fl']?.units, 'psi');
      assert.equal(device._capabilityOptions['target_temperature']?.units, '°F');
      assert.equal(device._capabilityOptions['target_temperature']?.min, 59);
      assert.equal(device._capabilityOptions['target_temperature']?.max, 82);
      assert.equal(device._capabilityOptions['speed_limit_speed']?.units, 'mph');
      assert.equal(device._capabilityOptions['speed_limit_speed']?.min, 50);
      assert.equal(device._capabilityOptions['last_charge_cost']?.units, 'kr');
      assert.equal(device.isMetric, false);
      assert.equal(device.usesPsi, true);
    });

    it('onSettings triggers applyUnitSettings and refreshState', async () => {
      const device = createDevice();
      device._settings = { unit_distance: 'km', unit_pressure: 'bar', unit_temperature: 'C', unit_speed: 'kmh', currency: 'USD' };
      const client = createTrackedClient({ getVehicleResult: fullTessieState(), getChargesResult: [] });
      device.client = client;
      device.homey.setTimeout = (fn: Function, _ms: number) => {
        fn();
        return device._nextTimerId++;
      };

      await device.onSettings({
        oldSettings: { unit_distance: 'km' },
        newSettings: { unit_distance: 'mi' },
        changedKeys: ['unit_distance'],
      });

      // Background refresh (refreshState -> getVehicle) is kicked off
      await new Promise((resolve) => setImmediate(resolve));
      assert.ok(client.calls.getVehicle.length >= 1);
      // Units come from newSettings, not the stale persisted settings
      assert.equal(device._capabilityOptions['measure_range']?.units, 'mi');
      assert.equal(device.isMetric, false);
    });

    it('speed limit converts mph->km/h when unit_speed is kmh', async () => {
      const device = createDevice();
      device._settings = { unit_speed: 'kmh' };
      await device.applyUnitSettings();
      const state = fullTessieState({ vehicle_state: { speed_limit_mode: { active: true, current_limit_mph: 70 } } });
      await device.updateCapabilities(state);
      // 70 mph / 0.621371 = ~112.65 -> rounds to 113
      assert.equal(device._capabilities['speed_limit_speed'], 113);
    });

    it('speed limit stays in mph when unit_speed is mph', async () => {
      const device = createDevice();
      device._settings = { unit_speed: 'mph' };
      await device.applyUnitSettings();
      const state = fullTessieState({ vehicle_state: { speed_limit_mode: { active: true, current_limit_mph: 70 } } });
      await device.updateCapabilities(state);
      assert.equal(device._capabilities['speed_limit_speed'], 70);
    });

    it('target_temperature converts C->F when unit_temperature is F', async () => {
      const device = createDevice();
      device._settings = { unit_temperature: 'F' };
      await device.applyUnitSettings();
      const state = fullTessieState({ climate_state: { driver_temp_setting: 21.0 } });
      await device.updateCapabilities(state);
      // 21°C = 69.8°F -> Math.round(69.8 * 10) / 10 = 69.8
      assert.equal(device._capabilities['target_temperature'], 69.8);
    });

    it('target_temperature stays in C when unit_temperature is C', async () => {
      const device = createDevice();
      device._settings = { unit_temperature: 'C' };
      await device.applyUnitSettings();
      const state = fullTessieState({ climate_state: { driver_temp_setting: 21.0 } });
      await device.updateCapabilities(state);
      assert.equal(device._capabilities['target_temperature'], 21.0);
    });

    it('target_temperature listener converts F->C before sending to API', async () => {
      const device = createDevice();
      device._settings = { unit_temperature: 'F' };
      await device.onInit();
      const client = createTrackedClient({
        getStatusResult: { status: 'awake' },
        getVehicleResult: fullTessieState(),
      });
      device.client = client;
      device._capabilities['vehicle_state_status'] = 'Awake';
      device.homey.setTimeout = (fn: Function, _ms: number) => {
        fn();
        return device._nextTimerId++;
      };

      await device._capabilityListeners['target_temperature'](69.8);
      // (69.8 - 32) * 5/9 = 21.0
      const sentTemp = client.calls.command[0].args[2].temperature;
      assert.ok(Math.abs(sentTemp - 21.0) < 0.1);
    });

    it('speed_limit_speed listener converts km/h->mph before sending to API', async () => {
      const device = createDevice();
      device._settings = { unit_speed: 'kmh' };
      await device.onInit();
      const client = createTrackedClient({
        getStatusResult: { status: 'awake' },
        getVehicleResult: fullTessieState(),
      });
      device.client = client;
      device._capabilities['vehicle_state_status'] = 'Awake';
      device.homey.setTimeout = (fn: Function, _ms: number) => {
        fn();
        return device._nextTimerId++;
      };

      await device._capabilityListeners['speed_limit_speed'](113);
      // 113 * 0.621371 = ~70.2 -> rounds to 70
      assert.equal(client.calls.command[0].args[2].mph, 70);
    });

    it('charging history sets cost as number', async () => {
      const device = createDevice();
      device._settings = { currency: 'EUR' };
      const client = createTrackedClient({
        getChargesResult: [{ charge_energy_added: 35.2, location: 'Home', total_cost: 12.50 }],
      });
      device.client = client;

      await device.updateChargingHistory();
      assert.equal(device._capabilities['last_charge_cost'], 12.50);
    });
  });

});
