import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import Module from 'node:module';
import { EventEmitter } from 'node:events';

// ---- Module mocking setup ----
const originalResolve = (Module as any)._resolveFilename;

// Track TessieStreamer mock instances
let lastStreamerInstance: any = null;

class MockTessieStreamer extends EventEmitter {
  vin: string;
  token: string;
  _connected: boolean = false;
  _destroyed: boolean = false;
  _connectCalled: boolean = false;

  constructor(vin: string, token: string) {
    super();
    this.vin = vin;
    this.token = token;
    lastStreamerInstance = this;
  }

  get isConnected(): boolean {
    return this._connected;
  }

  connect(): void {
    this._connectCalled = true;
  }

  destroy(): void {
    this._destroyed = true;
    this._connected = false;
  }
}

// Track mapStreamData calls
let mapStreamDataCalls: Array<{ dataPoints: any[]; isMetric: boolean; usesPsi: boolean }> = [];
let mapStreamDataResult: any[] = [];

function mockMapStreamData(dataPoints: any[], isMetric: boolean, usesPsi: boolean): any[] {
  mapStreamDataCalls.push({ dataPoints, isMetric, usesPsi });
  return mapStreamDataResult;
}

// Mock TessieClient
function MockTessieClient(this: any, _token: string) {
  this.getVehicles = async () => [];
  this.getVehicle = async () => ({});
  this.getStatus = async () => ({ status: 'awake' });
  this.getBatteryHealth = async () => null;
  this.command = async () => true;
  this.wake = async () => true;
}

(Module as any)._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
  if (request === 'homey') return '__mock_homey_stream__';
  if (parent && parent.filename && parent.filename.includes('drivers/vehicle/device')) {
    if (request === '../../lib/tessie-client') return '__mock_tessie_client_stream__';
    if (request === '../../lib/tessie-streamer') return '__mock_tessie_streamer__';
    if (request === '../../lib/stream-mapper') return '__mock_stream_mapper__';
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

// Mock Homey module
const mockHomeyModule = new Module('__mock_homey_stream__');
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
(require as any).cache['__mock_homey_stream__'] = mockHomeyModule;

// Mock TessieClient module
const mockTessieModule = new Module('__mock_tessie_client_stream__');
(mockTessieModule as any).exports = MockTessieClient;
(mockTessieModule as any).loaded = true;
(require as any).cache['__mock_tessie_client_stream__'] = mockTessieModule;

// Mock TessieStreamer module
const mockStreamerModule = new Module('__mock_tessie_streamer__');
(mockStreamerModule as any).exports = MockTessieStreamer;
(mockStreamerModule as any).loaded = true;
(require as any).cache['__mock_tessie_streamer__'] = mockStreamerModule;

// Mock stream-mapper module
const mockMapperModule = new Module('__mock_stream_mapper__');
(mockMapperModule as any).exports = mockMapStreamData;
(mockMapperModule as any).loaded = true;
(require as any).cache['__mock_stream_mapper__'] = mockMapperModule;

// Now require the device module
const VehicleDevice = require('../drivers/vehicle/device');

// ---- Test fixtures ----

function fullTessieState(overrides: any = {}): any {
  return {
    charge_state: {
      battery_level: 78,
      battery_range: 200,
      charging_state: 'Disconnected',
      ...overrides.charge_state,
    },
    climate_state: {
      inside_temp: 22.5,
      outside_temp: 15.3,
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
      software_update: { status: 'available', version: '2024.26.3' },
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

function createDevice({ vin = '5YJXCAE43LF123456', token = 'test-token-abc' } = {}) {
  const device = new VehicleDevice();
  device._data = { id: vin };
  device._store = { token };
  return device;
}

function createMockClient(overrides: {
  getVehicleResult?: any;
  getVehicleError?: Error;
  getStatusResult?: any;
  getStatusError?: Error;
  getBatteryHealthResult?: any;
  getBatteryHealthError?: Error;
} = {}) {
  return {
    getVehicles: mock.fn(async () => []),
    getVehicle: mock.fn(async () => {
      if (overrides.getVehicleError) throw overrides.getVehicleError;
      return overrides.getVehicleResult || {};
    }),
    getStatus: mock.fn(async () => {
      if (overrides.getStatusError) throw overrides.getStatusError;
      return overrides.getStatusResult || { status: 'awake' };
    }),
    getBatteryHealth: mock.fn(async () => {
      if (overrides.getBatteryHealthError) throw overrides.getBatteryHealthError;
      return overrides.getBatteryHealthResult || null;
    }),
    command: mock.fn(async () => true),
    wake: mock.fn(async () => true),
  };
}

describe('VehicleDevice Streaming Integration', () => {

  beforeEach(() => {
    lastStreamerInstance = null;
    mapStreamDataCalls = [];
    mapStreamDataResult = [];
  });

  describe('onInit streamer setup', () => {
    it('creates TessieStreamer with correct vin and token', async () => {
      const device = createDevice({ vin: 'TEST_VIN_123', token: 'my-secret-token' });
      await device.onInit();

      assert.ok(lastStreamerInstance, 'streamer should be created');
      assert.equal(lastStreamerInstance.vin, 'TEST_VIN_123');
      assert.equal(lastStreamerInstance.token, 'my-secret-token');
    });

    it('calls streamer.connect() during onInit', async () => {
      const device = createDevice();
      await device.onInit();

      assert.ok(lastStreamerInstance, 'streamer should be created');
      assert.equal(lastStreamerInstance._connectCalled, true);
    });
  });

  describe('streamer data event', () => {
    it('calls mapStreamData and setCapabilityValue for each update', async () => {
      const device = createDevice();
      await device.onInit();

      const streamer = lastStreamerInstance;
      assert.ok(streamer, 'streamer should exist');

      // Set up mapStreamData to return some updates
      mapStreamDataResult = [
        { id: 'measure_battery', value: 85 },
        { id: 'locked', value: true },
      ];

      const dataPoints = [
        { key: 'Soc', value: { stringValue: '85' } },
        { key: 'Locked', value: { stringValue: 'true' } },
      ];

      streamer.emit('data', dataPoints);
      // Allow async handler to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      assert.equal(mapStreamDataCalls.length, 1);
      assert.deepEqual(mapStreamDataCalls[0].dataPoints, dataPoints);
      assert.equal(device._capabilities['measure_battery'], 85);
      assert.equal(device._capabilities['locked'], true);
    });
  });

  describe('streamer connected event', () => {
    it('resets consecutiveFailures and calls setAvailable', async () => {
      const device = createDevice();
      await device.onInit();
      device.consecutiveFailures = 5;
      device._available = false;

      const streamer = lastStreamerInstance;
      assert.ok(streamer, 'streamer should exist');

      // Mock client for refreshState call
      device.client = createMockClient({
        getVehicleResult: fullTessieState(),
      });

      streamer.emit('connected');
      await new Promise(resolve => setTimeout(resolve, 10));

      assert.equal(device.consecutiveFailures, 0);
      assert.equal(device._available, true);
    });

    it('triggers refreshState for state sync', async () => {
      const device = createDevice();
      await device.onInit();

      const client = createMockClient({
        getVehicleResult: fullTessieState(),
      });
      device.client = client;

      const streamer = lastStreamerInstance;
      assert.ok(streamer, 'streamer should exist');

      streamer.emit('connected');
      await new Promise(resolve => setTimeout(resolve, 10));

      // refreshState calls getVehicle (after a delay via homey.setTimeout)
      // Since our mock homey.setTimeout doesn't actually execute, we check
      // that it was scheduled. refreshState uses homey.setTimeout for delay.
      // Actually, let's check the timeout calls for the refresh delay.
      const refreshTimeouts = device._timeoutCalls.filter((t: any) => t.ms === 1500);
      assert.ok(refreshTimeouts.length > 0, 'refreshState delay should be scheduled');
    });
  });

  describe('streamer disconnected event', () => {
    it('does NOT call setUnavailable', async () => {
      const device = createDevice();
      await device.onInit();
      device._available = true;

      const streamer = lastStreamerInstance;
      assert.ok(streamer, 'streamer should exist');

      streamer.emit('disconnected');
      await new Promise(resolve => setTimeout(resolve, 10));

      // Device should remain available
      assert.equal(device._available, true);
    });
  });

  describe('pollCycle with streaming', () => {
    it('uses STREAMING_FALLBACK_INTERVAL_MS (600000) when streamer.isConnected is true', async () => {
      const device = createDevice();
      device.isMetric = true;
      device.usesPsi = false;

      // Create a mock streamer that reports connected
      await device.onInit();
      const streamer = lastStreamerInstance;
      assert.ok(streamer, 'streamer should exist');
      streamer._connected = true;

      device.client = createMockClient({
        getStatusResult: { status: 'awake' },
        getVehicleResult: fullTessieState({ charge_state: { charging_state: 'Disconnected' } }),
      });

      await device.pollCycle();

      const lastTimeout = device._timeoutCalls[device._timeoutCalls.length - 1];
      assert.ok(lastTimeout, 'should schedule a timeout');
      assert.equal(lastTimeout.ms, 600000, 'should use 10-minute streaming fallback interval');
    });

    it('uses normal AWAKE_INTERVAL_MS (60000) when streamer.isConnected is false', async () => {
      const device = createDevice();
      device.isMetric = true;
      device.usesPsi = false;

      await device.onInit();
      const streamer = lastStreamerInstance;
      assert.ok(streamer, 'streamer should exist');
      streamer._connected = false;

      device.client = createMockClient({
        getStatusResult: { status: 'awake' },
        getVehicleResult: fullTessieState({ charge_state: { charging_state: 'Disconnected' } }),
      });

      await device.pollCycle();

      const lastTimeout = device._timeoutCalls[device._timeoutCalls.length - 1];
      assert.ok(lastTimeout, 'should schedule a timeout');
      assert.equal(lastTimeout.ms, 60000, 'should use normal awake interval');
    });

    it('uses streaming fallback even when vehicle is charging', async () => {
      const device = createDevice();
      device.isMetric = true;
      device.usesPsi = false;

      await device.onInit();
      const streamer = lastStreamerInstance;
      assert.ok(streamer, 'streamer should exist');
      streamer._connected = true;

      device.client = createMockClient({
        getStatusResult: { status: 'awake' },
        getVehicleResult: fullTessieState({ charge_state: { charging_state: 'Charging' } }),
      });

      await device.pollCycle();

      const lastTimeout = device._timeoutCalls[device._timeoutCalls.length - 1];
      assert.equal(lastTimeout.ms, 600000, 'streaming fallback takes priority over charging interval');
    });

    it('uses streaming fallback even when vehicle is asleep', async () => {
      const device = createDevice();
      device.isMetric = true;
      device.usesPsi = false;

      await device.onInit();
      const streamer = lastStreamerInstance;
      assert.ok(streamer, 'streamer should exist');
      streamer._connected = true;

      device.client = createMockClient({
        getStatusResult: { status: 'asleep' },
        getVehicleResult: fullTessieState(),
      });

      await device.pollCycle();

      const lastTimeout = device._timeoutCalls[device._timeoutCalls.length - 1];
      assert.equal(lastTimeout.ms, 600000, 'streaming fallback takes priority over asleep interval');
    });
  });

  describe('onDeleted', () => {
    it('calls streamer.destroy()', async () => {
      const device = createDevice();
      await device.onInit();

      const streamer = lastStreamerInstance;
      assert.ok(streamer, 'streamer should exist');
      assert.equal(streamer._destroyed, false);

      await device.onDeleted();

      assert.equal(streamer._destroyed, true);
    });

    it('sets streamer to null after destroy', async () => {
      const device = createDevice();
      await device.onInit();
      assert.ok(device.streamer, 'streamer should exist before delete');

      await device.onDeleted();

      assert.equal(device.streamer, null);
    });
  });
});
