import { EventEmitter } from 'node:events';

export interface TriggeredFlow {
  id: string;
  tokens: Record<string, any>;
  state: Record<string, any>;
}

// Minimal stand-in for this.homey.flow that records triggers and run listeners.
export function createMockFlow() {
  const triggered: TriggeredFlow[] = [];
  const runListeners: Record<string, Function> = {};
  const card = (id: string) => ({
    registerRunListener(fn: Function) {
      runListeners[id] = fn;
      return this;
    },
    async trigger(_device: any, tokens: Record<string, any> = {}, state: Record<string, any> = {}) {
      triggered.push({ id, tokens, state });
    },
  });
  return {
    triggered,
    runListeners,
    getActionCard: card,
    getConditionCard: card,
    getDeviceTriggerCard: card,
  };
}

// Homey's location in tests (Stockholm), matching the default fixture coordinates.
export function createMockGeolocation(latitude = 59.3293, longitude = 18.0686) {
  return {
    getLatitude: () => latitude,
    getLongitude: () => longitude,
  };
}

// Inert streamer so device tests never open a real WebSocket (which kept the test process alive).
export class StubTessieStreamer extends EventEmitter {
  isConnected = false;
  constructor(public vin: string, public token: string) {
    super();
  }
  connect(): void {}
  destroy(): void {}
}

// Generic Homey.Device stand-in with in-memory capabilities, settings and store.
export class MockHomeyDevice {
  _data: Record<string, any> = {};
  _store: Record<string, any> = {};
  _settings: Record<string, any> = {};
  _capabilities: Record<string, any> = {};
  _capabilityListeners: Record<string, Function> = {};
  _capabilityOptions: Record<string, any> = {};
  _available = true;
  homey: any = {
    // Run short delays (post-command refresh) inline; park longer timers (polls, drive lookups) for tests to fire
    setTimeout: (fn: Function, ms: number) => { if (ms <= 5000) { fn(); return 0; } this._timers.push({ fn, ms }); return this._timers.length; },
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    flow: createMockFlow(),
    geolocation: createMockGeolocation(),
    notifications: { createNotification: async ({ excerpt }: { excerpt: string }) => { this._notifications.push(excerpt); } },
  };
  _timers: Array<{ fn: Function; ms: number }> = [];
  _notifications: string[] = [];

  getName() { return 'Test Car'; }
  getData() { return this._data; }
  getStoreValue(key: string) { return this._store[key]; }
  async setStoreValue(key: string, value: any) { this._store[key] = value; }
  getSetting(key: string) { return this._settings[key]; }
  getSettings() { return { ...this._settings }; }
  async setSettings(settings: Record<string, any>) { Object.assign(this._settings, settings); }
  getCapabilityValue(id: string) { return this._capabilities[id]; }
  async setCapabilityValue(id: string, value: any) { this._capabilities[id] = value; }
  _removedCapabilities: string[] = [];
  hasCapability(id: string) { return !this._removedCapabilities.includes(id); }
  async addCapability(id: string) { this._removedCapabilities = this._removedCapabilities.filter((c) => c !== id); }
  async removeCapability(id: string) { this._removedCapabilities.push(id); }
  async setCapabilityOptions(id: string, opts: any) { this._capabilityOptions[id] = opts; }
  registerCapabilityListener(id: string, fn: Function) { this._capabilityListeners[id] = fn; }
  async triggerCapabilityListener(id: string, value: any, opts: Record<string, any> = {}) {
    await this._capabilityListeners[id](value, opts);
    this._capabilities[id] = value;
  }
  async setAvailable() { this._available = true; }
  async setUnavailable() { this._available = false; }
  log(..._args: any[]) {}
  error(..._args: any[]) {}
}
