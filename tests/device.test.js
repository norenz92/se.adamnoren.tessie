'use strict';

const { describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

// ---- Module mocking setup ----
// We need to mock 'homey' (not available outside Homey runtime)
// and '../../lib/tessie-client' (to control API responses in tests).

// Store original _resolveFilename
const originalResolve = Module._resolveFilename;

// Resolve the absolute path for tessie-client so we can intercept it
const tessieClientAbsPath = path.resolve(__dirname, '..', 'lib', 'tessie-client.js');

// Mock TessieClient constructor - captures args and returns mock instances
let lastConstructedToken = null;
function MockTessieClient(token) {
  lastConstructedToken = token;
  // Return an instance with mock methods (overridden per test via device.client = ...)
  this.getVehicles = async () => [];
  this.getVehicle = async () => ({});
  this.getStatus = async () => ({});
}

Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'homey') return '__mock_homey__';
  if (parent && parent.filename && parent.filename.includes('drivers/vehicle/device.js')) {
    if (request === '../../lib/tessie-client') return '__mock_tessie_client__';
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

// Mock Homey module
const mockHomeyModule = new Module('__mock_homey__');
mockHomeyModule.exports = {
  Device: class MockDevice {
    constructor() {
      this._data = {};
      this._store = {};
      this._capabilities = {};
      this._capabilityListeners = {};
      this._available = true;
      this._unavailableMessage = null;
      this.homey = {
        setInterval: (fn, ms) => {
          // Don't actually set interval in tests to avoid hanging
          return 99999;
        },
        clearInterval: () => {},
      };
    }

    getData() { return this._data; }
    getStoreValue(key) { return this._store[key]; }
    async setStoreValue(key, value) { this._store[key] = value; }
    async setCapabilityValue(name, value) { this._capabilities[name] = value; }
    getCapabilityValue(name) { return this._capabilities[name]; }
    registerCapabilityListener(name, fn) { this._capabilityListeners[name] = fn; }
    async setAvailable() { this._available = true; this._unavailableMessage = null; }
    async setUnavailable(msg) { this._available = false; this._unavailableMessage = msg; }
    log() {}
    error() {}
  },
};
mockHomeyModule.loaded = true;
require.cache['__mock_homey__'] = mockHomeyModule;

// Mock TessieClient module
const mockTessieModule = new Module('__mock_tessie_client__');
mockTessieModule.exports = MockTessieClient;
mockTessieModule.loaded = true;
require.cache['__mock_tessie_client__'] = mockTessieModule;

// Now require the device module - it will get our mocks
const VehicleDevice = require('../drivers/vehicle/device');

// Helper to create a device instance with controlled state
function createDevice({ vin = '5YJXCAE43LF123456', token = 'test-token-abc' } = {}) {
  const device = new VehicleDevice();
  device._data = { id: vin };
  device._store = { token };
  return device;
}

// Mock TessieClient factory for per-test control
function createMockClient({ getVehicleResult, getVehicleError } = {}) {
  return {
    getVehicles: mock.fn(async () => []),
    getVehicle: mock.fn(async () => {
      if (getVehicleError) throw getVehicleError;
      return getVehicleResult || {};
    }),
    getStatus: mock.fn(async () => ({})),
  };
}

describe('VehicleDevice', () => {

  describe('onInit', () => {
    it('reads VIN from data.id and token from store', async () => {
      const device = createDevice({ vin: '5YJ3E1EA1LF000111', token: 'my-token-xyz' });

      assert.equal(device.getData().id, '5YJ3E1EA1LF000111');
      assert.equal(device.getStoreValue('token'), 'my-token-xyz');
    });

    it('creates TessieClient with stored token during onInit', async () => {
      lastConstructedToken = null;
      const device = createDevice({ token: 'specific-token-123' });

      // Call onInit -- it will use the MockTessieClient constructor
      await device.onInit();

      assert.equal(lastConstructedToken, 'specific-token-123');
      assert.ok(device.client, 'client should be created');
    });
  });

  describe('refreshState', () => {
    it('sets measure_battery capability from charge_state.battery_level', async () => {
      const device = createDevice();
      device.client = createMockClient({
        getVehicleResult: {
          charge_state: { battery_level: 89 },
          vehicle_state: { locked: true },
        },
      });

      await device.refreshState();

      assert.equal(device._capabilities['measure_battery'], 89);
    });

    it('sets locked capability from vehicle_state.locked', async () => {
      const device = createDevice();
      device.client = createMockClient({
        getVehicleResult: {
          charge_state: { battery_level: 75 },
          vehicle_state: { locked: false },
        },
      });

      await device.refreshState();

      assert.equal(device._capabilities['locked'], false);
    });

    it('sets device unavailable on API error', async () => {
      const device = createDevice();
      device.client = createMockClient({
        getVehicleError: new Error('Tessie API error: 500'),
      });

      await device.refreshState();

      assert.equal(device._available, false);
      assert.equal(device._unavailableMessage, 'Unable to reach Tessie API');
    });

    it('sets device available on successful fetch', async () => {
      const device = createDevice();
      device._available = false;
      device._unavailableMessage = 'Previously unavailable';
      device.client = createMockClient({
        getVehicleResult: {
          charge_state: { battery_level: 60 },
          vehicle_state: { locked: true },
        },
      });

      await device.refreshState();

      assert.equal(device._available, true);
      assert.equal(device._unavailableMessage, null);
    });

    it('handles missing charge_state gracefully (no crash)', async () => {
      const device = createDevice();
      device.client = createMockClient({
        getVehicleResult: {
          vehicle_state: { locked: true },
        },
      });

      await device.refreshState();

      assert.equal(device._capabilities['measure_battery'], undefined);
      assert.equal(device._capabilities['locked'], true);
    });

    it('handles missing vehicle_state gracefully (no crash)', async () => {
      const device = createDevice();
      device.client = createMockClient({
        getVehicleResult: {
          charge_state: { battery_level: 42 },
        },
      });

      await device.refreshState();

      assert.equal(device._capabilities['measure_battery'], 42);
      assert.equal(device._capabilities['locked'], undefined);
    });

    it('handles null battery_level gracefully', async () => {
      const device = createDevice();
      device.client = createMockClient({
        getVehicleResult: {
          charge_state: { battery_level: null },
          vehicle_state: { locked: null },
        },
      });

      await device.refreshState();

      assert.equal(device._capabilities['measure_battery'], undefined);
      assert.equal(device._capabilities['locked'], undefined);
    });

    it('handles completely empty state object', async () => {
      const device = createDevice();
      device.client = createMockClient({
        getVehicleResult: {},
      });

      await device.refreshState();
      assert.equal(device._available, true);
    });
  });

  describe('onDeleted', () => {
    it('clears the poll interval', async () => {
      const device = createDevice();
      let cleared = false;
      const fakeIntervalId = 12345;
      device.pollInterval = fakeIntervalId;
      device.homey = {
        setInterval: () => fakeIntervalId,
        clearInterval: (id) => {
          assert.equal(id, fakeIntervalId);
          cleared = true;
        },
      };

      await device.onDeleted();

      assert.equal(cleared, true);
      assert.equal(device.pollInterval, null);
    });

    it('handles missing poll interval gracefully', async () => {
      const device = createDevice();
      device.pollInterval = null;
      device.homey = {
        setInterval: () => {},
        clearInterval: () => { throw new Error('Should not be called'); },
      };

      // Should not throw
      await device.onDeleted();
    });
  });

  describe('locked capability listener', () => {
    it('throws "Control not yet available" (Phase 1 read-only)', async () => {
      const device = createDevice();
      let listenerFn = null;
      device.registerCapabilityListener = (name, fn) => {
        if (name === 'locked') listenerFn = fn;
      };

      // onInit registers the capability listener and calls refreshState
      await VehicleDevice.prototype.onInit.call(device);

      assert.ok(listenerFn, 'locked capability listener should be registered');

      await assert.rejects(
        async () => listenerFn(true),
        { message: 'Control not yet available' }
      );
    });
  });

  describe('repair flow integration', () => {
    it('token can be updated in store (repair flow support)', async () => {
      const device = createDevice({ token: 'old-token' });

      assert.equal(device.getStoreValue('token'), 'old-token');

      await device.setStoreValue('token', 'new-token-after-repair');

      assert.equal(device.getStoreValue('token'), 'new-token-after-repair');
    });
  });
});
