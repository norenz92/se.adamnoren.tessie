import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import { MockHomeyDevice, StubTessieStreamer, createMockGeolocation } from './helpers/homey-stubs';
import distanceMeters from '../lib/geo';

// ---- Module mocking setup ----
const originalResolve = (Module as any)._resolveFilename;

(Module as any)._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
  if (request === 'homey') return '__mock_homey_triggers__';
  if (parent && parent.filename && parent.filename.includes('drivers/vehicle/device')) {
    if (request === '../../lib/tessie-streamer') return '__mock_tessie_streamer_triggers__';
    if (request === '../../lib/tessie-client') return '__mock_tessie_client_triggers__';
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

// Offline client: tests must never reach api.tessie.com
class OfflineTessieClient {
  constructor(public token: string) {}
  async getStatus() { return { status: 'awake' }; }
  async getVehicle() { return {}; }
  async getBatteryHealth() { return null; }
  async getCharges() { return []; }
  async wake() { return true; }
  async command() { return true; }
}

for (const [name, moduleExports] of [
  ['__mock_homey_triggers__', { Device: MockHomeyDevice }],
  ['__mock_tessie_streamer_triggers__', StubTessieStreamer],
  ['__mock_tessie_client_triggers__', OfflineTessieClient],
] as Array<[string, any]>) {
  const mod = new Module(name);
  (mod as any).exports = moduleExports;
  (mod as any).loaded = true;
  (require as any).cache[name] = mod;
}

const VehicleDevice = require('../drivers/vehicle/device');

// ---- Helpers ----

function createDevice(capabilities: Record<string, any> = {}) {
  const device = new VehicleDevice();
  device._data = { id: 'VIN_TRIGGERS' };
  device._capabilities = { ...capabilities };
  return device;
}

function triggeredIds(device: any): string[] {
  return device.homey.flow.triggered.map((t: any) => t.id);
}

function createClient(overrides: Record<string, any> = {}) {
  const commands: any[][] = [];
  return {
    commands,
    getStatus: async () => ({ status: 'awake' }),
    getVehicle: async () => ({}),
    getBatteryHealth: async () => null,
    getCharges: async () => [],
    wake: async () => true,
    command: async (...args: any[]) => { commands.push(args); return true; },
    ...overrides,
  };
}

// ---- Tests ----

describe('VehicleDevice flow triggers', () => {
  it('does not trigger when a capability is first populated', async () => {
    const device = createDevice();
    await device.updateCapabilities({ vehicle_state: { locked: true }, charge_state: { charging_state: 'Charging' } });
    assert.deepEqual(triggeredIds(device), []);
  });

  it('fires lock/sentry/climate triggers on transitions only', async () => {
    const device = createDevice({ locked: true, sentry_mode: false, climate_onoff: false });
    await device.updateCapabilities({ vehicle_state: { locked: true, sentry_mode: false } });
    assert.deepEqual(triggeredIds(device), []);

    await device.updateCapabilities({
      vehicle_state: { locked: false, sentry_mode: true },
      climate_state: { is_climate_on: true },
    });
    assert.deepEqual(triggeredIds(device).sort(), ['climate_started', 'sentry_enabled', 'vehicle_unlocked']);
  });

  it('fires plug-in, charging and completion triggers from charging_status', async () => {
    const device = createDevice({ charging_status: 'Disconnected', measure_battery: 50 });
    await device.updateCapabilities({ charge_state: { charging_state: 'Charging', battery_level: 50 } });
    assert.deepEqual(triggeredIds(device), ['charging_status_changed', 'charging_started', 'plugged_in']);
    assert.deepEqual(device.homey.flow.triggered[0].tokens, { status: 'Charging' });
    assert.deepEqual(device.homey.flow.triggered[1].tokens, { battery: 50, source: 'Outside Homey' });

    device.homey.flow.triggered.length = 0;
    await device.updateCapabilities({ charge_state: { charging_state: 'Complete', battery_level: 80 } });
    assert.deepEqual(triggeredIds(device), ['battery_below', 'charging_status_changed', 'charging_stopped', 'charging_complete']);

    device.homey.flow.triggered.length = 0;
    await device.updateCapabilities({ charge_state: { charging_state: 'Disconnected' } });
    assert.deepEqual(triggeredIds(device), ['charging_status_changed', 'unplugged']);
  });

  it('passes previous/current battery level as trigger state for battery_below', async () => {
    const device = createDevice({ measure_battery: 21 });
    await device.updateCapabilities({ charge_state: { battery_level: 19 } });
    const trigger = device.homey.flow.triggered.find((t: any) => t.id === 'battery_below');
    assert.deepEqual(trigger.state, { previous: 21, current: 19 });
    assert.deepEqual(trigger.tokens, { battery: 19 });
  });

  it('fires wake/sleep triggers from vehicle_state_status', async () => {
    const device = createDevice({ vehicle_state_status: 'Asleep' });
    device.client = createClient();
    await device.pollCycle();
    assert.ok(triggeredIds(device).includes('vehicle_woke_up'));

    device.homey.flow.triggered.length = 0;
    device.client = createClient({ getStatus: async () => ({ status: 'asleep' }) });
    await device.pollCycle();
    assert.ok(triggeredIds(device).includes('vehicle_fell_asleep'));
  });

  it('fires started_driving / parked from shift_state (null = parked)', async () => {
    const device = createDevice({ shift_state: 'P' });
    await device.updateCapabilities({ drive_state: { shift_state: 'D' } });
    await device.updateCapabilities({ drive_state: { shift_state: 'R' } });
    await device.updateCapabilities({ drive_state: { shift_state: null } });
    assert.deepEqual(triggeredIds(device), ['started_driving', 'parked']);
    assert.equal(device._capabilities.shift_state, 'P');
  });

  it('announces each software update version once', async () => {
    const device = createDevice({ software_update: 'Up to date' });
    const su = { vehicle_state: { software_update: { status: 'available', version: '2026.20.1' } } };
    await device.updateCapabilities(su);
    await device.updateCapabilities(su);
    const updates = device.homey.flow.triggered.filter((t: any) => t.id === 'software_update_available');
    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0].tokens, { version: '2026.20.1' });
    assert.equal(device._capabilities.software_update, 'Available: 2026.20.1');
  });

  it('fires triggers for values arriving over the stream', async () => {
    const device = createDevice({ locked: false });
    device.client = createClient();
    device._store = { token: 't' };
    await device.onInit();
    device.homey.flow.triggered.length = 0;
    await device.streamer.listeners('data')[0]([{ key: 'Locked', value: { stringValue: 'true' } }]);
    assert.ok(triggeredIds(device).includes('vehicle_locked'));
  });

  it('keeps applying later fields when one capability value is rejected', async () => {
    const device = createDevice();
    const original = device.setCapabilityValue.bind(device);
    device.setCapabilityValue = async (id: string, value: any) => {
      if (id === 'charging_status') throw new Error('invalid enum value');
      return original(id, value);
    };
    await device.updateCapabilities({ charge_state: { charging_state: 'Bogus', battery_level: 42 }, vehicle_state: { locked: true } });
    assert.equal(device._capabilities.measure_battery, 42);
    assert.equal(device._capabilities.locked, true);
  });
});

describe('VehicleDevice home presence', () => {
  it('fires arrived_home / left_home when crossing the home radius', async () => {
    const device = createDevice({ measure_latitude: 59.40, measure_longitude: 18.20 });
    device._settings = { home_radius: 200 };
    await device.updateCapabilities({ drive_state: { latitude: 59.40, longitude: 18.20 } }); // far away: establishes baseline
    await device.updateCapabilities({ drive_state: { latitude: 59.3294, longitude: 18.0687 } }); // ~13 m from Homey
    await device.updateCapabilities({ drive_state: { latitude: 59.3400, longitude: 18.0686 } }); // ~1.2 km away
    assert.deepEqual(triggeredIds(device).filter((id) => id.endsWith('home')), ['arrived_home', 'left_home']);
  });

  it('isAtHome respects the configured radius and is false without a location', async () => {
    const device = createDevice({ measure_latitude: 59.3300, measure_longitude: 18.0686 }); // ~78 m from Homey
    device._settings = { home_radius: 100 };
    assert.equal(device.isAtHome(), true);
    device._settings = { home_radius: 50 };
    assert.equal(device.isAtHome(), false);
    device.homey.geolocation = { getLatitude: () => { throw new Error('no permission'); }, getLongitude: () => 0 };
    assert.equal(device.isAtHome(), false);
    device.homey.geolocation = createMockGeolocation();
    assert.equal(createDevice().isAtHome(), false);
  });

  it('distanceMeters computes great-circle distance', () => {
    assert.equal(Math.round(distanceMeters(59.3293, 18.0686, 59.3293, 18.0686)), 0);
    // Stockholm -> Gothenburg is ~398 km
    const d = distanceMeters(59.3293, 18.0686, 57.7089, 11.9746);
    assert.ok(d > 390000 && d < 405000, `got ${d}`);
  });
});

describe('VehicleDevice commands', () => {
  async function setup(state: Record<string, any> = {}) {
    const device = createDevice({ vehicle_state_status: 'Awake' });
    const client = createClient({ getVehicle: async () => state });
    device.client = client;
    return { device, client };
  }

  it('maps driver/passenger seats to front_left/front_right on LHD cars', async () => {
    const { device, client } = await setup();
    await device.setSeatHeater('driver', 3);
    await device.setSeatCooling('passenger', 1);
    assert.deepEqual(client.commands.map((c) => [c[1], c[2]]), [
      ['set_seat_heat', { seat: 'front_left', level: 3 }],
      ['set_seat_cool', { seat: 'front_right', level: 1 }],
    ]);
  });

  it('swaps driver/passenger seats on RHD cars (state and commands)', async () => {
    const { device, client } = await setup();
    await device.updateCapabilities({ vehicle_config: { rhd: true }, climate_state: { seat_heater_left: 1, seat_heater_right: 3 } });
    assert.equal(device._capabilities.seat_heater_driver, '3');
    assert.equal(device._capabilities.seat_heater_passenger, '1');
    await device.setSeatHeater('driver', 2);
    assert.deepEqual(client.commands[0][2], { seat: 'front_right', level: 2 });
  });

  it('rejects unknown seats', async () => {
    const { device } = await setup();
    await assert.rejects(async () => device.setSeatHeater('roof', 1), /Unknown seat/);
  });

  it('setTargetTemperature converts °F, rounds to 0.5 °C and enforces 15-28 °C', async () => {
    const { device, client } = await setup();
    await device.setTargetTemperature(70, 'F');
    assert.deepEqual(client.commands[0][2], { temperature: 21 });
    await assert.rejects(async () => device.setTargetTemperature(30, 'C'));
    await assert.rejects(async () => device.setTargetTemperature(50, 'F'));
    assert.equal(client.commands.length, 1);
  });

  it('wakes a sleeping car once via Tessie /wake before sending a command', async () => {
    const { device, client } = await setup();
    device._capabilities.vehicle_state_status = 'Asleep';
    let wakes = 0;
    client.wake = async () => { wakes++; return true; };
    await device.executeCommand('honk');
    assert.equal(wakes, 1);
    assert.equal(device._capabilities.vehicle_state_status, 'Awake');
  });

  it('updateToken swaps client and restarts the stream', async () => {
    const device = createDevice();
    device.client = createClient();
    device._store = { token: 'old' };
    await device.onInit();
    const oldStreamer = device.streamer;
    await device.updateToken('new');
    assert.equal(device._store.token, 'new');
    assert.equal(device.client.token, 'new');
    assert.notEqual(device.streamer, oldStreamer);
    assert.equal(device.streamer.token, 'new');
  });
});

describe('VehicleDevice resilience', () => {
  it('a failed refresh after a successful command does not fail the command', async () => {
    const device = createDevice({ vehicle_state_status: 'Awake' });
    device.client = createClient({ getVehicle: async () => { throw new Error('Tessie API error: 503'); } });
    await device.executeCommand('honk');
    assert.equal(device.client.commands.length, 1);
  });

  it('treats waiting_for_sleep as awake', async () => {
    const device = createDevice({ vehicle_state_status: 'Awake' });
    device.client = createClient({ getStatus: async () => ({ status: 'waiting_for_sleep' }) });
    await device.pollCycle();
    assert.equal(device._capabilities.vehicle_state_status, 'Awake');
    assert.ok(!triggeredIds(device).includes('vehicle_fell_asleep'));
  });

  it('marks the device unavailable with a repair hint on an invalid token', async () => {
    const device = createDevice();
    device.client = createClient({ getStatus: async () => { throw new Error('Invalid or expired API token'); } });
    await device.pollCycle();
    assert.equal(device._available, false);
  });

  it('does not reschedule polling after the device is deleted', async () => {
    const device = createDevice();
    device.client = createClient();
    let scheduled = 0;
    device.homey.setTimeout = () => { scheduled++; return 0; };
    await device.onDeleted();
    await device.pollCycle();
    assert.equal(scheduled, 0);
  });

  it('ignores a /state response that arrives after a newer one', async () => {
    const device = createDevice({ locked: true });
    let releaseSlow: (v: any) => void = () => {};
    const responses = [
      new Promise((resolve) => { releaseSlow = resolve; }), // slow, older request
      Promise.resolve({ vehicle_state: { locked: false } }), // fast, newer request
    ];
    let call = 0;
    device.client = createClient({ getVehicle: () => responses[call++] });
    const slow = device.refreshState();
    await device.refreshState();
    releaseSlow({ vehicle_state: { locked: true } });
    await slow;
    assert.equal(device._capabilities.locked, false);
  });

  it('treats a blank update version as up to date', async () => {
    const device = createDevice({ software_update: 'Up to date' });
    await device.updateCapabilities({ vehicle_state: { software_update: { status: '', version: ' ' } } });
    assert.equal(device._capabilities.software_update, 'Up to date');
    assert.deepEqual(triggeredIds(device), []);
  });

  it('marks the car awake when stream data arrives', async () => {
    const device = createDevice({ vehicle_state_status: 'Asleep' });
    device._store = { token: 't' };
    await device.onInit();
    device._capabilities.vehicle_state_status = 'Asleep';
    await device.streamer.listeners('data')[0]([{ key: 'Soc', value: { stringValue: '55' } }]);
    assert.equal(device._capabilities.vehicle_state_status, 'Awake');
    assert.equal(device._capabilities.measure_battery, 55);
  });
});

describe('VehicleDevice capability migration', () => {
  it('removes the renamed measure_battery_health capability on init', async () => {
    const device = createDevice();
    device._store = { token: 't' };
    await device.onInit();
    assert.ok(device._removedCapabilities.includes('measure_battery_health'));
    assert.equal(device.hasCapability('measure_soh'), true);
  });
});

describe('VehicleDevice action source attribution', () => {
  async function setup(lockedAfter: boolean) {
    const device = createDevice({ locked: !lockedAfter, vehicle_state_status: 'Awake' });
    device._store = { token: 't' };
    await device.onInit();
    device._capabilities.locked = !lockedAfter;
    device.client = createClient({ getVehicle: async () => ({ vehicle_state: { locked: lockedAfter } }) });
    device.homey.flow.triggered.length = 0;
    return device;
  }
  const lockTrigger = (device: any) => device.homey.flow.triggered.find((t: any) => t.id.startsWith('vehicle_'));

  it('attributes a lock sent by a Flow card to "Homey Flow"', async () => {
    const device = await setup(true);
    await device.triggerCapabilityListener('locked', true, { source: 'flow' });
    assert.deepEqual(lockTrigger(device), { id: 'vehicle_locked', tokens: { source: 'Homey Flow' }, state: {} });
  });

  it('attributes a lock from the Homey device screen to "Homey"', async () => {
    const device = await setup(false);
    await device._capabilityListeners.locked(false, {});
    assert.deepEqual(lockTrigger(device).tokens, { source: 'Homey' });
  });

  it('attributes changes without a matching Homey command to "Outside Homey"', async () => {
    const device = createDevice({ locked: true });
    device.recentCommands.locked = { value: true, source: 'Homey', at: Date.now() }; // opposite value
    await device.updateCapabilities({ vehicle_state: { locked: false } });
    assert.deepEqual(lockTrigger(device).tokens, { source: 'Outside Homey' });
  });

  it('ignores Homey commands older than the attribution window', async () => {
    const device = createDevice({ locked: false });
    device.recentCommands.locked = { value: true, source: 'Homey Flow', at: Date.now() - 6 * 60 * 1000 };
    await device.updateCapabilities({ vehicle_state: { locked: true } });
    assert.deepEqual(lockTrigger(device).tokens, { source: 'Outside Homey' });
  });

  it('forgets the command when it fails, so a later outside change is not misattributed', async () => {
    const device = await setup(true);
    device.client.command = async () => false;
    await assert.rejects(async () => device._capabilityListeners.locked(true, { source: 'flow' }));
    assert.equal(device.recentCommands.locked, undefined);
  });

  it('adds the source to charging started/stopped', async () => {
    const device = createDevice({ charging_status: 'Stopped' });
    device.recentCommands.charging_control = { value: true, source: 'Homey Flow', at: Date.now() };
    await device.updateCapabilities({ charge_state: { charging_state: 'Charging' } });
    const started = device.homey.flow.triggered.find((t: any) => t.id === 'charging_started');
    assert.equal(started.tokens.source, 'Homey Flow');
  });

  it('posts lock changes to the Timeline only when enabled', async () => {
    const device = createDevice({ locked: true });
    await device.updateCapabilities({ vehicle_state: { locked: false } });
    assert.deepEqual(device._notifications, []);
    device._settings = { timeline_security: true };
    await device.updateCapabilities({ vehicle_state: { locked: true } });
    assert.deepEqual(device._notifications, ['**Test Car** was locked outside Homey']);
  });
});

describe('VehicleDevice completed drives', () => {
  const drive = (over: Record<string, any> = {}) => ({
    id: 42, started_at: Math.floor(Date.now() / 1000) - 20 * 60, ended_at: Math.floor(Date.now() / 1000) - 60,
    odometer_distance: 12.44, energy_used: 2.13, starting_location: 'Main Street 1, Town', ending_location: 'Falsterbovägen 65, Höllviken, Sweden',
    driver_profile: 'Adam', ...over,
  });

  async function parkWith(drives: any[], settings: Record<string, any> = {}) {
    const device = createDevice({ shift_state: 'D' });
    device._settings = settings;
    const calls: any[] = [];
    device.client = createClient({ getDrives: async (...args: any[]) => { calls.push(args); return drives; } });
    await device.updateCapabilities({ drive_state: { shift_state: 'P' } });
    return { device, calls };
  }

  it('looks up the drive after parking and fires drive_completed with the driver profile', async () => {
    const { device, calls } = await parkWith([drive()], { timeline_drives: true });
    assert.ok(triggeredIds(device).includes('parked'));
    assert.equal(device._timers.length, 1);
    await device._timers[0].fn();
    await new Promise((r) => setImmediate(r));
    assert.equal(calls[0][1].distanceFormat, 'km');
    const done = device.homey.flow.triggered.find((t: any) => t.id === 'drive_completed');
    assert.deepEqual(done.tokens, { driver: 'Adam', distance: 12.4, duration: 19, energy: 2.1, from: 'Main Street 1, Town', to: 'Falsterbovägen 65, Höllviken, Sweden' });
    assert.deepEqual(device._notifications, ['**Test Car** · Adam drove 12.4 km to Falsterbovägen 65 (19 min)']);
  });

  it('uses "Unknown" when the drive has no driver profile', async () => {
    const { device } = await parkWith([drive({ driver_profile: null })]);
    await device._timers[0].fn();
    await new Promise((r) => setImmediate(r));
    assert.equal(device.homey.flow.triggered.find((t: any) => t.id === 'drive_completed').tokens.driver, 'Unknown');
  });

  it('retries when Tessie has not recorded the drive yet, and reports each drive once', async () => {
    const drives: any[] = [];
    const { device } = await parkWith(drives);
    await device._timers[0].fn();
    await new Promise((r) => setImmediate(r));
    assert.equal(device._timers.length, 2, 'should schedule a retry');
    drives.push(drive());
    await device._timers[1].fn();
    await new Promise((r) => setImmediate(r));
    await device.lookupCompletedDrive(Date.now(), 1);
    assert.equal(device.homey.flow.triggered.filter((t: any) => t.id === 'drive_completed').length, 1);
  });

  it('ignores drives that ended long before parking', async () => {
    const old = drive({ ended_at: Math.floor(Date.now() / 1000) - 3 * 60 * 60 });
    const { device } = await parkWith([old]);
    await device._timers[0].fn();
    await new Promise((r) => setImmediate(r));
    assert.ok(!triggeredIds(device).includes('drive_completed'));
  });
});

