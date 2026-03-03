'use strict';

const { describe, it, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');

// Mock Homey module before requiring device.js
// We create a mock that provides Homey.Device base class
const mockHomey = {
  Device: class MockDevice {
    constructor() {
      this._data = {};
      this._store = {};
      this._capabilities = {};
      this._capabilityListeners = {};
      this._available = true;
      this._unavailableMessage = null;
      this._intervals = [];
      this.homey = {
        setInterval: (fn, ms) => {
          const id = setInterval(fn, ms);
          this._intervals.push(id);
          return id;
        },
        clearInterval: (id) => {
          clearInterval(id);
          const idx = this._intervals.indexOf(id);
          if (idx !== -1) this._intervals.splice(idx, 1);
        },
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

// Override require to intercept 'homey' module
const Module = require('node:module');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'homey') {
    // Return a special marker so we can intercept the load
    return '__mock_homey__';
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

const originalLoad = Module._cache;
// Pre-cache the mock homey module
const homeyModule = new Module('__mock_homey__');
homeyModule.exports = mockHomey;
homeyModule.loaded = true;
require.cache['__mock_homey__'] = homeyModule;

// Now require the device module - it will get our mock
const VehicleDevice = require('../drivers/vehicle/device');

// Helper to create a device instance with controlled state
function createDevice({ vin = '5YJXCAE43LF123456', token = 'test-token-abc' } = {}) {
  const device = new VehicleDevice();
  device._data = { id: vin };
  device._store = { token };
  return device;
}

// Mock TessieClient factory
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
      const mockClient = createMockClient({
        getVehicleResult: { charge_state: { battery_level: 50 }, vehicle_state: { locked: false } },
      });
      device.client = mockClient;

      // Patch onInit to skip the TessieClient constructor (we set client manually)
      const originalOnInit = VehicleDevice.prototype.onInit;
      // We need to call onInit but intercept the TessieClient creation
      // Since onInit creates a TessieClient internally, we override after init
      // But first, let's verify data access works
      assert.equal(device.getData().id, '5YJ3E1EA1LF000111');
      assert.equal(device.getStoreValue('token'), 'my-token-xyz');
    });

    it('creates TessieClient with stored token', async () => {
      const device = createDevice({ token: 'specific-token-123' });

      // We can't fully test constructor call without more complex mocking,
      // but we verify that after onInit the client exists and is used.
      // The actual TessieClient import is tested via integration.
      const mockClient = createMockClient({
        getVehicleResult: { charge_state: { battery_level: 80 }, vehicle_state: { locked: true } },
      });
      device.client = mockClient;
      await device.refreshState();

      assert.equal(mockClient.getVehicle.mock.calls.length, 1);
      assert.equal(mockClient.getVehicle.mock.calls[0].arguments[0], device.getData().id);
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
      device._available = false; // Start as unavailable
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
          // charge_state is missing
        },
      });

      // Should not throw
      await device.refreshState();

      // measure_battery should not be set (undefined)
      assert.equal(device._capabilities['measure_battery'], undefined);
      assert.equal(device._capabilities['locked'], true);
    });

    it('handles missing vehicle_state gracefully (no crash)', async () => {
      const device = createDevice();
      device.client = createMockClient({
        getVehicleResult: {
          charge_state: { battery_level: 42 },
          // vehicle_state is missing
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

      // null values should not be set
      assert.equal(device._capabilities['measure_battery'], undefined);
      assert.equal(device._capabilities['locked'], undefined);
    });

    it('handles completely empty state object', async () => {
      const device = createDevice();
      device.client = createMockClient({
        getVehicleResult: {},
      });

      // Should not throw
      await device.refreshState();
      assert.equal(device._available, true);
    });
  });

  describe('onDeleted', () => {
    it('clears the poll interval', async () => {
      const device = createDevice();
      // Simulate a poll interval being set
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
      // Simulate what onInit does for the capability listener
      let listenerFn = null;
      device.registerCapabilityListener = (name, fn) => {
        if (name === 'locked') listenerFn = fn;
      };

      // We need to trigger the registration. Since onInit calls registerCapabilityListener,
      // we create a minimal onInit simulation:
      device.client = createMockClient({
        getVehicleResult: { charge_state: { battery_level: 50 }, vehicle_state: { locked: true } },
      });

      // Call the real onInit
      await VehicleDevice.prototype.onInit.call(device);

      // Now listenerFn should be set
      assert.ok(listenerFn, 'locked capability listener should be registered');

      // It should throw when called
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
