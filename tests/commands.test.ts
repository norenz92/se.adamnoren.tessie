import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import TessieClient from '../lib/tessie-client';

// Helper: create a mock HTTP response
function createMockResponse(statusCode: number, body: string | object): EventEmitter & { statusCode: number } {
  const res = new EventEmitter() as EventEmitter & { statusCode: number };
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
function createMockRequest(): EventEmitter & { end: () => void } {
  const req = new EventEmitter() as EventEmitter & { end: () => void };
  req.end = () => {};
  return req;
}

describe('TessieClient command methods', () => {
  let originalRequest: typeof https.request;

  beforeEach(() => {
    originalRequest = https.request;
  });

  afterEach(() => {
    (https as any).request = originalRequest;
  });

  describe('command()', () => {
    it('should send POST to /{vin}/command/{command} with wait_for_completion=true', async () => {
      let capturedOptions: https.RequestOptions | null = null;

      (https as any).request = (options: https.RequestOptions, callback: (res: any) => void) => {
        capturedOptions = options;
        const res = createMockResponse(200, { result: true });
        callback(res);
        return createMockRequest();
      };

      const client = new TessieClient('test-token');
      await client.command('VIN123', 'flash');

      assert.strictEqual(capturedOptions!.method, 'POST');
      assert.ok(
        capturedOptions!.path!.startsWith('/VIN123/command/flash'),
        `Path should start with /VIN123/command/flash, got: ${capturedOptions!.path}`
      );
      assert.ok(
        capturedOptions!.path!.includes('wait_for_completion=true'),
        `Path should include wait_for_completion=true, got: ${capturedOptions!.path}`
      );
    });

    it('should append extra params as query string', async () => {
      let capturedOptions: https.RequestOptions | null = null;

      (https as any).request = (options: https.RequestOptions, callback: (res: any) => void) => {
        capturedOptions = options;
        const res = createMockResponse(200, { result: true });
        callback(res);
        return createMockRequest();
      };

      const client = new TessieClient('test-token');
      await client.command('VIN123', 'set_charge_limit', { percent: 80 });

      assert.ok(
        capturedOptions!.path!.includes('percent=80'),
        `Path should include percent=80, got: ${capturedOptions!.path}`
      );
      assert.ok(
        capturedOptions!.path!.includes('wait_for_completion=true'),
        `Path should include wait_for_completion=true, got: ${capturedOptions!.path}`
      );
    });

    it('should return true when response is { result: true }', async () => {
      (https as any).request = (options: https.RequestOptions, callback: (res: any) => void) => {
        const res = createMockResponse(200, { result: true });
        callback(res);
        return createMockRequest();
      };

      const client = new TessieClient('test-token');
      const result = await client.command('VIN123', 'flash');

      assert.strictEqual(result, true);
    });

    it('should return false when response is { result: false }', async () => {
      (https as any).request = (options: https.RequestOptions, callback: (res: any) => void) => {
        const res = createMockResponse(200, { result: false });
        callback(res);
        return createMockRequest();
      };

      const client = new TessieClient('test-token');
      const result = await client.command('VIN123', 'flash');

      assert.strictEqual(result, false);
    });

    it('should propagate HTTP 401 error', async () => {
      (https as any).request = (options: https.RequestOptions, callback: (res: any) => void) => {
        const res = createMockResponse(401, { error: 'unauthorized' });
        callback(res);
        return createMockRequest();
      };

      const client = new TessieClient('bad-token');
      await assert.rejects(
        () => client.command('VIN123', 'flash_lights'),
        (err: any) => {
          assert.ok(err.message.includes('Invalid or expired API token'), `Expected token error, got: ${err.message}`);
          return true;
        }
      );
    });

    it('should propagate HTTP 500 error', async () => {
      (https as any).request = (options: https.RequestOptions, callback: (res: any) => void) => {
        const res = createMockResponse(500, { error: 'internal' });
        callback(res);
        return createMockRequest();
      };

      const client = new TessieClient('test-token');
      await assert.rejects(
        () => client.command('VIN123', 'flash_lights'),
        (err: any) => {
          assert.ok(err.message.includes('500'), `Expected 500 error, got: ${err.message}`);
          return true;
        }
      );
    });
  });

  describe('wake()', () => {
    it('should send POST to /{vin}/wake', async () => {
      let capturedOptions: https.RequestOptions | null = null;

      (https as any).request = (options: https.RequestOptions, callback: (res: any) => void) => {
        capturedOptions = options;
        const res = createMockResponse(200, { result: true });
        callback(res);
        return createMockRequest();
      };

      const client = new TessieClient('test-token');
      await client.wake('VIN123');

      assert.strictEqual(capturedOptions!.method, 'POST');
      assert.strictEqual(capturedOptions!.path, '/VIN123/wake');
    });

    it('should return true when vehicle wakes successfully', async () => {
      (https as any).request = (options: https.RequestOptions, callback: (res: any) => void) => {
        const res = createMockResponse(200, { result: true });
        callback(res);
        return createMockRequest();
      };

      const client = new TessieClient('test-token');
      const result = await client.wake('VIN123');

      assert.strictEqual(result, true);
    });

    it('should return false when wake fails', async () => {
      (https as any).request = (options: https.RequestOptions, callback: (res: any) => void) => {
        const res = createMockResponse(200, { result: false });
        callback(res);
        return createMockRequest();
      };

      const client = new TessieClient('test-token');
      const result = await client.wake('VIN123');

      assert.strictEqual(result, false);
    });
  });
});
