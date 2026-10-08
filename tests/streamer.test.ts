import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// Mock WebSocket class
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  private handlers: Record<string, Function[]> = {};
  readyState: number = 0;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  addEventListener(event: string, handler: Function) {
    if (!this.handlers[event]) this.handlers[event] = [];
    this.handlers[event].push(handler);
  }

  close() {
    this.readyState = 3;
    this.simulateEvent('close', {});
  }

  // Test helpers
  simulateEvent(event: string, data: any) {
    const handlers = this.handlers[event] || [];
    for (const h of handlers) h(data);
  }

  simulateOpen() {
    this.readyState = 1;
    this.simulateEvent('open', {});
  }

  simulateMessage(data: any) {
    this.simulateEvent('message', { data: JSON.stringify(data) });
  }

  simulateClose() {
    this.readyState = 3;
    this.simulateEvent('close', {});
  }

  static reset() {
    MockWebSocket.instances = [];
  }
}

// Save/restore globals
let originalWebSocket: any;
let originalSetTimeout: typeof globalThis.setTimeout;
let originalClearTimeout: typeof globalThis.clearTimeout;

describe('TessieStreamer', () => {
  let TessieStreamer: any;
  let capturedTimeouts: { fn: Function; delay: number }[];

  beforeEach(async () => {
    MockWebSocket.reset();
    capturedTimeouts = [];

    // Install mock WebSocket globally
    originalWebSocket = (globalThis as any).WebSocket;
    (globalThis as any).WebSocket = MockWebSocket;

    // Install mock setTimeout to capture reconnect scheduling
    originalSetTimeout = globalThis.setTimeout;
    originalClearTimeout = globalThis.clearTimeout;

    (globalThis as any).setTimeout = (fn: Function, delay: number) => {
      const entry = { fn, delay };
      capturedTimeouts.push(entry);
      return capturedTimeouts.length; // return a fake timer ID
    };
    (globalThis as any).clearTimeout = (_id: any) => {};

    // Dynamically import to pick up mocked globals
    // Clear module cache first
    const path = require.resolve('../lib/tessie-streamer');
    delete require.cache[path];
    TessieStreamer = require('../lib/tessie-streamer');
  });

  afterEach(() => {
    (globalThis as any).WebSocket = originalWebSocket;
    (globalThis as any).setTimeout = originalSetTimeout;
    (globalThis as any).clearTimeout = originalClearTimeout;

    // Clear module cache
    const path = require.resolve('../lib/tessie-streamer');
    delete require.cache[path];
  });

  it('stores vin and token from constructor', () => {
    const streamer = new TessieStreamer('VIN123', 'TOKEN456');
    assert.equal(streamer.isConnected, false);
  });

  it('connects to correct WebSocket URL', () => {
    const streamer = new TessieStreamer('VIN123', 'TOKEN456');
    streamer.connect();
    assert.equal(MockWebSocket.instances.length, 1);
    assert.equal(
      MockWebSocket.instances[0].url,
      'wss://streaming.tessie.com/VIN123?access_token=TOKEN456'
    );
  });

  it('emits connected on WebSocket open', () => {
    const streamer = new TessieStreamer('VIN123', 'TOKEN456');
    let connected = false;
    streamer.on('connected', () => { connected = true; });
    streamer.connect();
    MockWebSocket.instances[0].simulateOpen();
    assert.equal(connected, true);
    assert.equal(streamer.isConnected, true);
  });

  it('emits data with parsed data array on data message', () => {
    const streamer = new TessieStreamer('VIN123', 'TOKEN456');
    let receivedData: any = null;
    let receivedCreatedAt: any = null;
    streamer.on('data', (data: any, createdAt: any) => {
      receivedData = data;
      receivedCreatedAt = createdAt;
    });
    streamer.connect();
    MockWebSocket.instances[0].simulateOpen();
    MockWebSocket.instances[0].simulateMessage({
      data: [{ key: 'Soc', value: { stringValue: '85' } }],
      createdAt: '2024-08-01T00:00:00Z',
      vin: 'VIN123',
    });
    assert.deepStrictEqual(receivedData, [{ key: 'Soc', value: { stringValue: '85' } }]);
    assert.equal(receivedCreatedAt, '2024-08-01T00:00:00Z');
  });

  it('emits connectivity with status on connectivity message', () => {
    const streamer = new TessieStreamer('VIN123', 'TOKEN456');
    let receivedStatus: any = null;
    streamer.on('connectivity', (status: any) => { receivedStatus = status; });
    streamer.connect();
    MockWebSocket.instances[0].simulateOpen();
    MockWebSocket.instances[0].simulateMessage({
      status: 'DISCONNECTED',
      vin: 'VIN123',
      connectionId: 'abc',
      createdAt: '2024-08-01T00:00:00Z',
    });
    assert.equal(receivedStatus, 'DISCONNECTED');
  });

  it('emits disconnected on WebSocket close', () => {
    const streamer = new TessieStreamer('VIN123', 'TOKEN456');
    let disconnected = false;
    streamer.on('disconnected', () => { disconnected = true; });
    streamer.connect();
    MockWebSocket.instances[0].simulateOpen();
    MockWebSocket.instances[0].simulateClose();
    assert.equal(disconnected, true);
    assert.equal(streamer.isConnected, false);
  });

  it('schedules reconnect on close with exponential backoff', () => {
    const streamer = new TessieStreamer('VIN123', 'TOKEN456');
    streamer.connect();
    MockWebSocket.instances[0].simulateClose();

    // First reconnect: base delay 1000ms + up to 30% jitter
    assert.equal(capturedTimeouts.length, 1);
    assert.ok(capturedTimeouts[0].delay >= 1000, `Delay ${capturedTimeouts[0].delay} should be >= 1000`);
    assert.ok(capturedTimeouts[0].delay <= 1300, `Delay ${capturedTimeouts[0].delay} should be <= 1300`);

    // Execute reconnect callback, then close again to see doubled delay
    capturedTimeouts[0].fn();
    MockWebSocket.instances[MockWebSocket.instances.length - 1].simulateClose();

    assert.equal(capturedTimeouts.length, 2);
    assert.ok(capturedTimeouts[1].delay >= 2000, `Delay ${capturedTimeouts[1].delay} should be >= 2000`);
    assert.ok(capturedTimeouts[1].delay <= 2600, `Delay ${capturedTimeouts[1].delay} should be <= 2600`);
  });

  it('caps backoff at 60000ms', () => {
    const streamer = new TessieStreamer('VIN123', 'TOKEN456');
    streamer.connect();

    // Close and reconnect many times to hit the cap
    for (let i = 0; i < 10; i++) {
      MockWebSocket.instances[MockWebSocket.instances.length - 1].simulateClose();
      capturedTimeouts[capturedTimeouts.length - 1].fn();
    }

    const lastDelay = capturedTimeouts[capturedTimeouts.length - 1].delay;
    // Should be capped: delay <= 60000 * 1.3 (with jitter)
    assert.ok(lastDelay <= 78000, `Delay ${lastDelay} should be <= 78000 (60000 + 30% jitter)`);
    assert.ok(lastDelay >= 60000, `Delay ${lastDelay} should be >= 60000`);
  });

  it('does not reset backoff on open alone (server may accept then close)', () => {
    const streamer = new TessieStreamer('VIN123', 'TOKEN456');
    streamer.connect();
    MockWebSocket.instances[0].simulateClose();
    capturedTimeouts[capturedTimeouts.length - 1].fn();
    MockWebSocket.instances[MockWebSocket.instances.length - 1].simulateOpen();
    MockWebSocket.instances[MockWebSocket.instances.length - 1].simulateClose();

    const lastTimeout = capturedTimeouts[capturedTimeouts.length - 1];
    assert.ok(lastTimeout.delay >= 2000, `Delay ${lastTimeout.delay} should keep backing off`);
  });

  it('resets backoff once the connection delivers a message', () => {
    const streamer = new TessieStreamer('VIN123', 'TOKEN456');
    streamer.connect();

    // Close once to increase backoff
    MockWebSocket.instances[0].simulateClose();
    capturedTimeouts[0].fn(); // reconnects

    // Successful open plus traffic on the new connection
    MockWebSocket.instances[MockWebSocket.instances.length - 1].simulateOpen();
    MockWebSocket.instances[MockWebSocket.instances.length - 1].simulateMessage({ data: [] });

    // Now close again - delay should be reset to base (1000)
    MockWebSocket.instances[MockWebSocket.instances.length - 1].simulateClose();

    const lastTimeout = capturedTimeouts[capturedTimeouts.length - 1];
    assert.ok(lastTimeout.delay >= 1000, `Delay ${lastTimeout.delay} should be >= 1000 (reset)`);
    assert.ok(lastTimeout.delay <= 1300, `Delay ${lastTimeout.delay} should be <= 1300 (reset + jitter)`);
  });

  it('destroy() prevents reconnection', () => {
    const streamer = new TessieStreamer('VIN123', 'TOKEN456');
    streamer.connect();
    MockWebSocket.instances[0].simulateOpen();
    const timeoutsBefore = capturedTimeouts.length;
    streamer.destroy();
    assert.equal(streamer.isConnected, false);
    // No new timeouts should be scheduled
    assert.equal(capturedTimeouts.length, timeoutsBefore);
  });

  it('reconnects when an open connection goes silent (watchdog)', () => {
    const streamer = new TessieStreamer('VIN123', 'TOKEN456');
    let disconnected = 0;
    streamer.on('disconnected', () => { disconnected++; });
    streamer.connect();
    MockWebSocket.instances[0].simulateOpen();
    const watchdog = capturedTimeouts.find((t) => t.delay === 15 * 60 * 1000);
    assert.ok(watchdog, 'watchdog should be armed on open');
    watchdog!.fn();
    assert.equal(disconnected, 1);
    assert.equal(streamer.isConnected, false);
    // Closing the stale socket must not trigger a second disconnect
    assert.equal(disconnected, 1);
    const reconnect = capturedTimeouts[capturedTimeouts.length - 1];
    reconnect.fn();
    assert.equal(MockWebSocket.instances.length, 2);
  });

  it('url-encodes vin and token', () => {
    const streamer = new TessieStreamer('VIN 1', 'a&b=c');
    streamer.connect();
    assert.equal(MockWebSocket.instances[0].url, 'wss://streaming.tessie.com/VIN%201?access_token=a%26b%3Dc');
  });

  it('ignores JSON parse errors on malformed messages', () => {
    const streamer = new TessieStreamer('VIN123', 'TOKEN456');
    let dataCalled = false;
    streamer.on('data', () => { dataCalled = true; });
    streamer.connect();
    MockWebSocket.instances[0].simulateOpen();
    // Send malformed message directly via event handler
    MockWebSocket.instances[0].simulateEvent('message', { data: 'not valid json{{{' });
    assert.equal(dataCalled, false); // No error thrown, no data emitted
  });
});
