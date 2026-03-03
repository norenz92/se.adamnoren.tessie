'use strict';

const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const https = require('node:https');
const { EventEmitter } = require('node:events');

// Helper: create a mock HTTP response
function createMockResponse(statusCode, body) {
  const res = new EventEmitter();
  res.statusCode = statusCode;
  process.nextTick(() => {
    if (typeof body === 'string') {
      res.emit('data', body);
    } else {
      res.emit('data', JSON.stringify(body));
    }
    res.emit('end');
  });
  return res;
}

// Helper: create a mock request object
function createMockRequest() {
  const req = new EventEmitter();
  req.end = () => {};
  return req;
}

describe('TessieClient', () => {
  let TessieClient;
  let originalRequest;

  beforeEach(() => {
    // Store original and mock https.request
    originalRequest = https.request;
    // Clear require cache for fresh import
    delete require.cache[require.resolve('../lib/tessie-client')];
    TessieClient = require('../lib/tessie-client');
  });

  afterEach(() => {
    // Restore original https.request
    https.request = originalRequest;
  });

  describe('constructor', () => {
    it('should accept a token string', () => {
      const client = new TessieClient('test-token-123');
      assert.ok(client, 'Client should be created');
    });
  });

  describe('getVehicles()', () => {
    it('should call GET /vehicles?only_active=true with correct Authorization header', async () => {
      let capturedOptions = null;

      https.request = (options, callback) => {
        capturedOptions = options;
        const res = createMockResponse(200, { results: [] });
        callback(res);
        return createMockRequest();
      };

      const client = new TessieClient('my-token');
      await client.getVehicles();

      assert.strictEqual(capturedOptions.path, '/vehicles?only_active=true');
      assert.strictEqual(capturedOptions.method, 'GET');
      assert.strictEqual(capturedOptions.headers['Authorization'], 'Bearer my-token');
    });

    it('should return parsed results array from response', async () => {
      const vehicleData = {
        results: [
          { vin: 'VIN123', last_state: { display_name: 'Test Car' } },
          { vin: 'VIN456', last_state: { display_name: 'Another Car' } },
        ],
      };

      https.request = (options, callback) => {
        const res = createMockResponse(200, vehicleData);
        callback(res);
        return createMockRequest();
      };

      const client = new TessieClient('valid-token');
      const results = await client.getVehicles();

      assert.ok(Array.isArray(results), 'Should return an array');
      assert.strictEqual(results.length, 2);
      assert.strictEqual(results[0].vin, 'VIN123');
      assert.strictEqual(results[1].vin, 'VIN456');
    });

    it('should throw on 401 response (invalid token)', async () => {
      https.request = (options, callback) => {
        const res = createMockResponse(401, { error: 'unauthorized' });
        callback(res);
        return createMockRequest();
      };

      const client = new TessieClient('bad-token');
      await assert.rejects(
        () => client.getVehicles(),
        (err) => {
          assert.ok(err.message.includes('Invalid or expired API token'), `Expected token error, got: ${err.message}`);
          return true;
        }
      );
    });

    it('should throw on non-JSON response', async () => {
      https.request = (options, callback) => {
        const res = createMockResponse(200, '<html>not json</html>');
        // Override to send raw string
        callback(res);
        return createMockRequest();
      };

      const client = new TessieClient('valid-token');
      await assert.rejects(
        () => client.getVehicles(),
        (err) => {
          assert.ok(err.message.includes('Invalid response from Tessie API'), `Expected parse error, got: ${err.message}`);
          return true;
        }
      );
    });
  });

  describe('getVehicle(vin)', () => {
    it('should call GET /{vin}/state with authorization', async () => {
      let capturedOptions = null;

      https.request = (options, callback) => {
        capturedOptions = options;
        const res = createMockResponse(200, { vin: 'ABC123', state: 'online' });
        callback(res);
        return createMockRequest();
      };

      const client = new TessieClient('my-token');
      await client.getVehicle('ABC123');

      assert.strictEqual(capturedOptions.path, '/ABC123/state');
      assert.strictEqual(capturedOptions.headers['Authorization'], 'Bearer my-token');
    });

    it('should return parsed vehicle state', async () => {
      const vehicleState = {
        vin: 'ABC123',
        state: 'online',
        charge_state: { battery_level: 85 },
        vehicle_state: { locked: true },
      };

      https.request = (options, callback) => {
        const res = createMockResponse(200, vehicleState);
        callback(res);
        return createMockRequest();
      };

      const client = new TessieClient('my-token');
      const result = await client.getVehicle('ABC123');

      assert.strictEqual(result.vin, 'ABC123');
      assert.strictEqual(result.charge_state.battery_level, 85);
      assert.strictEqual(result.vehicle_state.locked, true);
    });
  });

  describe('getStatus(vin)', () => {
    it('should call GET /{vin}/status with authorization', async () => {
      let capturedOptions = null;

      https.request = (options, callback) => {
        capturedOptions = options;
        const res = createMockResponse(200, { status: 'asleep' });
        callback(res);
        return createMockRequest();
      };

      const client = new TessieClient('my-token');
      await client.getStatus('XYZ789');

      assert.strictEqual(capturedOptions.path, '/XYZ789/status');
      assert.strictEqual(capturedOptions.headers['Authorization'], 'Bearer my-token');
    });
  });

  describe('request method', () => {
    it('should include Authorization Bearer header', async () => {
      let capturedOptions = null;

      https.request = (options, callback) => {
        capturedOptions = options;
        const res = createMockResponse(200, { ok: true });
        callback(res);
        return createMockRequest();
      };

      const client = new TessieClient('secret-token-xyz');
      await client.getVehicles();

      assert.ok(capturedOptions.headers['Authorization'].startsWith('Bearer '), 'Should use Bearer auth');
      assert.strictEqual(capturedOptions.headers['Authorization'], 'Bearer secret-token-xyz');
      assert.strictEqual(capturedOptions.headers['Accept'], 'application/json');
    });

    it('should reject on HTTP 4xx/5xx with descriptive error', async () => {
      https.request = (options, callback) => {
        const res = createMockResponse(500, { error: 'internal server error' });
        callback(res);
        return createMockRequest();
      };

      const client = new TessieClient('valid-token');
      await assert.rejects(
        () => client.getVehicles(),
        (err) => {
          assert.ok(err.message.includes('Tessie API error'), `Expected API error, got: ${err.message}`);
          assert.ok(err.message.includes('500'), `Should include status code, got: ${err.message}`);
          return true;
        }
      );

      // Also test 403
      https.request = (options, callback) => {
        const res = createMockResponse(403, { error: 'forbidden' });
        callback(res);
        return createMockRequest();
      };

      await assert.rejects(
        () => client.getVehicles(),
        (err) => {
          assert.ok(err.message.includes('Tessie API error'), `Expected API error for 403, got: ${err.message}`);
          assert.ok(err.message.includes('403'), `Should include 403 status code, got: ${err.message}`);
          return true;
        }
      );
    });
  });
});
