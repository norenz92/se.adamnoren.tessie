import Homey from 'homey';
import TessieClient = require('../../lib/tessie-client');
import TessieStreamer = require('../../lib/tessie-streamer');
import mapStreamData = require('../../lib/stream-mapper');
import distanceMeters = require('../../lib/geo');

const AWAKE_INTERVAL_MS = 60 * 1000;
const CHARGING_INTERVAL_MS = 2 * 60 * 1000;
const ASLEEP_INTERVAL_MS = 30 * 60 * 1000;
const BATTERY_HEALTH_INTERVAL_MS = 60 * 60 * 1000;
const STREAMING_FALLBACK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
// Only relax polling while the stream is actually delivering data, not merely connected
const STREAM_FRESHNESS_MS = 5 * 60 * 1000;
const MAX_CONSECUTIVE_FAILURES = 3;
const MILES_TO_KM = 1.60934;
const BAR_TO_PSI = 14.5038;
const KMH_TO_MPH = 0.621371;
const DEFAULT_HOME_RADIUS_M = 100;

// Tessie API limits
const TEMP_MIN_C = 15;
const TEMP_MAX_C = 28;
const SPEED_LIMIT_MIN_MPH = 50;
const SPEED_LIMIT_MAX_MPH = 90;

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', SEK: 'kr', NOK: 'kr', DKK: 'kr', CHF: 'CHF',
};

const ALL_CAPABILITIES = [
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
  'shift_state', 'charger_power', 'charge_time_remaining',
];

// Renamed/retired capabilities to remove from already-paired devices.
// measure_battery_health was renamed: its measure_battery prefix made Homey present it like the battery level.
const LEGACY_CAPABILITIES = ['measure_battery_health'];

// Seat heater capability -> logical seat (driver/passenger resolved against RHD at runtime)
const SEAT_CAPABILITY_TO_SEAT: Record<string, string> = {
  seat_heater_driver: 'driver',
  seat_heater_passenger: 'passenger',
  seat_heater_rear_left: 'rear_left',
  seat_heater_rear_center: 'rear_center',
  seat_heater_rear_right: 'rear_right',
};

const SEAT_IDS = new Set([
  'driver', 'passenger', 'rear_left', 'rear_center', 'rear_right', 'third_row_left', 'third_row_right',
]);

const CLIMATE_KEEPER_TO_API: Record<string, number> = { 'Off': 0, 'Keep': 1, 'Dog': 2, 'Camp': 3 };
const CLIMATE_KEEPER_FROM_STATE: Record<string, string> = { 'off': 'Off', 'keep': 'Keep', 'dog': 'Dog', 'camp': 'Camp' };

const COP_TO_API: Record<string, { on: boolean; fan_only: boolean }> = {
  'Off': { on: false, fan_only: false },
  'FanOnly': { on: true, fan_only: true },
  'AC': { on: true, fan_only: false },
};
const COP_FROM_STATE: Record<string, string> = { 'Off': 'Off', 'FanOnly': 'FanOnly', 'On': 'AC' };

// 'waiting_for_sleep' means the car is still awake (idle, about to sleep)
const STATUS_MAP: Record<string, string> = {
  'awake': 'Awake',
  'asleep': 'Asleep',
  'waiting_for_sleep': 'Awake',
};

const DRIVING_SHIFT_STATES = new Set(['D', 'R', 'N']);

const REFRESH_DELAY_MS = 1500;
// A state change within this window after a matching Homey command is attributed to that command
const COMMAND_SOURCE_WINDOW_MS = 5 * 60 * 1000;
// Tessie needs a moment after parking before the drive shows up in its history
const DRIVE_LOOKUP_DELAY_MS = 2 * 60 * 1000;
const DRIVE_LOOKUP_ATTEMPTS = 3;

const SOURCE_FLOW = 'Homey Flow';
const SOURCE_HOMEY = 'Homey';
const SOURCE_OUTSIDE = 'Outside Homey';
const SOURCE_PHRASE: Record<string, string> = {
  [SOURCE_FLOW]: 'by a Homey Flow',
  [SOURCE_HOMEY]: 'from Homey',
  [SOURCE_OUTSIDE]: 'outside Homey',
};
const TOKEN_ERROR = 'Invalid or expired API token';

class VehicleDevice extends Homey.Device {

  client!: TessieClient;
  streamer: TessieStreamer | null = null;
  pollTimer: ReturnType<typeof setTimeout> | null = null;
  batteryHealthTimer: ReturnType<typeof setInterval> | null = null;
  consecutiveFailures: number = 0;
  isMetric: boolean = true;
  usesPsi: boolean = false;
  tempUnit: 'C' | 'F' = 'C';
  speedUnit: 'kmh' | 'mph' = 'kmh';
  rhd: boolean = false;
  isHome: boolean | null = null;
  chargingAmpsMax: number | null = null;
  destroyed: boolean = false;
  lastStreamDataAt: number = 0;
  // Last command Homey sent per capability, used to tell Homey-initiated changes from outside ones
  recentCommands: Record<string, { value: any; source: string; at: number }> = {};
  driveTimer: ReturnType<typeof setTimeout> | null = null;
  // Monotonic counter so a slow /state response can't overwrite a newer one
  stateRequestSeq: number = 0;
  stateAppliedSeq: number = 0;

  async onInit(): Promise<void> {
    const vin = this.getData().id;
    const token = this.getStoreValue('token') as string;
    this.client = new TessieClient(token);

    // Migrate capabilities for already-paired devices (must precede listener registration)
    for (const cap of LEGACY_CAPABILITIES) {
      if (this.hasCapability(cap)) {
        await this.removeCapability(cap).catch((err: any) => this.error(`Failed to remove ${cap}:`, err.message));
      }
    }
    for (const cap of ALL_CAPABILITIES) {
      if (!this.hasCapability(cap)) {
        await this.addCapability(cap);
      }
    }

    this.registerCapabilityListeners();

    // Unit settings are seeded from the car's gui_settings at pairing (see driver.ts)
    await this.applyUnitSettings();

    // Initial data fetch
    try {
      const [statusResponse, state] = await Promise.all([
        this.client.getStatus(vin),
        this.client.getVehicle(vin),
      ]);

      if (statusResponse?.status) {
        await this.setCap('vehicle_state_status', STATUS_MAP[statusResponse.status] || 'Awake');
      }

      await this.updateCapabilities(state);
    } catch (err: any) {
      this.error('Failed initial data fetch:', err.message);
    }

    await this.refreshBatteryHealth();
    await this.updateChargingHistory();

    // The device may have been deleted while the initial fetches were in flight
    if (this.destroyed) return;

    this.scheduleNextPoll(AWAKE_INTERVAL_MS);
    this.startStreamer(token);

    // Battery health and charging history change slowly; refresh on a fixed cadence
    this.batteryHealthTimer = this.homey.setInterval(async () => {
      await this.refreshBatteryHealth();
      await this.updateChargingHistory();
    }, BATTERY_HEALTH_INTERVAL_MS);

    this.log('Vehicle device initialized:', vin);
  }

  private registerCapabilityListeners(): void {
    // Wraps each listener so the command's origin is remembered for trigger tokens and the Timeline
    const listen = (capId: string, fn: (value: any) => Promise<void>) => {
      this.registerCapabilityListener(capId, async (value: any, opts: any) => {
        this.recentCommands[capId] = { value, source: opts?.source === 'flow' ? SOURCE_FLOW : SOURCE_HOMEY, at: Date.now() };
        try {
          await fn(value);
        } catch (err) {
          delete this.recentCommands[capId];
          throw err;
        }
      });
    };
    listen('locked', async (value: boolean) => {
      await this.executeCommand(value ? 'lock' : 'unlock');
    });
    listen('sentry_mode', async (value: boolean) => {
      await this.executeCommand(value ? 'enable_sentry' : 'disable_sentry');
    });
    listen('climate_onoff', async (value: boolean) => {
      await this.executeCommand(value ? 'start_climate' : 'stop_climate');
    });
    listen('target_temperature', async (value: number) => {
      await this.setTargetTemperature(value, this.tempUnit);
    });
    listen('charge_limit', async (value: number) => {
      await this.executeCommand('set_charge_limit', { percent: Math.round(value * 100) });
    });
    listen('charging_amps', async (value: number) => {
      await this.executeCommand('set_charging_amps', { amps: value });
    });
    listen('charge_port', async (value: boolean) => {
      await this.executeCommand(value ? 'open_charge_port' : 'close_charge_port');
    });
    listen('charging_control', async (value: boolean) => {
      await this.executeCommand(value ? 'start_charging' : 'stop_charging');
    });
    listen('trunk', async (_value: boolean) => {
      await this.executeCommand('activate_rear_trunk');
    });
    listen('frunk', async (_value: boolean) => {
      await this.executeCommand('activate_front_trunk');
    });

    for (const [capId, seat] of Object.entries(SEAT_CAPABILITY_TO_SEAT)) {
      listen(capId, async (value: string) => {
        await this.setSeatHeater(seat, Number(value));
      });
    }

    listen('steering_wheel_heater', async (value: boolean) => {
      await this.executeCommand(value ? 'start_steering_wheel_heater' : 'stop_steering_wheel_heater');
    });
    listen('defrost_mode', async (value: boolean) => {
      await this.executeCommand(value ? 'start_max_defrost' : 'stop_max_defrost');
    });
    listen('climate_keeper_mode', async (value: string) => {
      const mode = CLIMATE_KEEPER_TO_API[value];
      if (mode == null) throw new Error(`Unknown climate keeper mode: ${value}`);
      await this.executeCommand('set_climate_keeper_mode', { mode });
    });
    listen('cabin_overheat_protection', async (value: string) => {
      const params = COP_TO_API[value];
      if (!params) throw new Error(`Unknown cabin overheat protection mode: ${value}`);
      await this.executeCommand('set_cabin_overheat_protection', params);
    });

    // Windows (true=closed, false=vented)
    listen('windows', async (value: boolean) => {
      await this.executeCommand(value ? 'close_windows' : 'vent_windows');
    });
    listen('valet_mode', async (value: boolean) => {
      await this.executeCommand(value ? 'enable_valet' : 'disable_valet');
    });
    listen('speed_limit_mode', async (value: boolean) => {
      await this.executeCommand(value ? 'enable_speed_limit' : 'disable_speed_limit', { pin: this.getSpeedLimitPin() });
    });
    listen('speed_limit_speed', async (value: number) => {
      await this.setSpeedLimit(value, this.speedUnit);
    });
  }

  private startStreamer(token: string): void {
    this.streamer = new TessieStreamer(this.getData().id, token);

    this.streamer.on('data', async (dataPoints: any[]) => {
      // EventEmitter doesn't handle rejections from async listeners; never let one escape
      try {
        this.lastStreamDataAt = Date.now();
        // Telemetry only flows while the car is awake
        await this.setCap('vehicle_state_status', 'Awake');
        const updates = mapStreamData(dataPoints, this.isMetric, this.usesPsi);
        for (const update of updates) {
          await this.setCap(update.id, update.value);
        }
        if (updates.some((u) => u.id === 'measure_latitude' || u.id === 'measure_longitude')) {
          this.checkHomePresence();
        }
      } catch (err: any) {
        this.error('Failed to apply stream data:', err.message);
      }
    });

    this.streamer.on('connected', async () => {
      this.log('Stream connected');
      this.consecutiveFailures = 0;
      await this.setAvailable().catch(this.error);
      // Full REST poll on reconnect to sync any missed state
      try {
        await this.refreshState();
      } catch (err: any) {
        this.error('Stream reconnect state sync failed:', err.message);
      }
    });

    this.streamer.on('disconnected', () => {
      // Do NOT mark unavailable -- vehicle may just be sleeping; polling continues
      this.log('Stream disconnected');
    });

    this.streamer.connect();
  }

  // Called from the repair flow when the user supplies a new API token.
  async updateToken(token: string): Promise<void> {
    await this.setStoreValue('token', token);
    this.client = new TessieClient(token);
    this.streamer?.destroy();
    this.startStreamer(token);
    this.consecutiveFailures = 0;
    await this.setAvailable();
    await this.refreshState();
    this.scheduleNextPoll(AWAKE_INTERVAL_MS);
  }

  // --- Commands ---

  async ensureAwake(): Promise<void> {
    if (this.getCapabilityValue('vehicle_state_status') !== 'Asleep') return;

    // Tessie's /wake blocks until the vehicle is awake, or returns false after ~90s
    const awake = await this.client.wake(this.getData().id);
    if (!awake) {
      throw new Error('Vehicle did not wake up in time');
    }
    await this.setCap('vehicle_state_status', 'Awake');
  }

  async executeCommand(command: string, params?: Record<string, string | number | boolean>): Promise<void> {
    await this.ensureAwake();
    const success = await this.client.command(this.getData().id, command, params);
    if (!success) {
      throw new Error(`Command ${command} failed`);
    }
    // The command succeeded; a failed follow-up refresh must not report it as failed
    try {
      await this.refreshState();
    } catch (err: any) {
      this.error(`State refresh after ${command} failed:`, err.message);
    }
  }

  async wake(): Promise<void> {
    const awake = await this.client.wake(this.getData().id);
    if (!awake) {
      throw new Error('Vehicle did not wake up in time');
    }
    await this.setCap('vehicle_state_status', 'Awake');
  }

  resolveSeat(seat: string): string {
    if (!SEAT_IDS.has(seat)) throw new Error(`Unknown seat: ${seat}`);
    if (seat === 'driver') return this.rhd ? 'front_right' : 'front_left';
    if (seat === 'passenger') return this.rhd ? 'front_left' : 'front_right';
    return seat;
  }

  async setSeatHeater(seat: string, level: number): Promise<void> {
    await this.executeCommand('set_seat_heat', { seat: this.resolveSeat(seat), level });
  }

  async setSeatCooling(seat: string, level: number): Promise<void> {
    await this.executeCommand('set_seat_cool', { seat: this.resolveSeat(seat), level });
  }

  async setTargetTemperature(value: number, unit: 'C' | 'F'): Promise<void> {
    const celsius = unit === 'F' ? (value - 32) * 5 / 9 : value;
    // Tesla accepts 0.5 °C steps
    const rounded = Math.round(celsius * 2) / 2;
    if (rounded < TEMP_MIN_C || rounded > TEMP_MAX_C) {
      throw new Error(`Temperature must be between ${TEMP_MIN_C} and ${TEMP_MAX_C} °C (59–82 °F)`);
    }
    await this.executeCommand('set_temperatures', { temperature: rounded });
  }

  async setSpeedLimit(value: number, unit: 'kmh' | 'mph'): Promise<void> {
    const mph = Math.round(unit === 'kmh' ? value * KMH_TO_MPH : value);
    if (mph < SPEED_LIMIT_MIN_MPH || mph > SPEED_LIMIT_MAX_MPH) {
      throw new Error(`Speed limit must be between ${SPEED_LIMIT_MIN_MPH} and ${SPEED_LIMIT_MAX_MPH} mph (80–145 km/h)`);
    }
    await this.executeCommand('set_speed_limit', { mph });
  }

  getSpeedLimitPin(): string {
    const pin = this.getSetting('speed_limit_pin');
    if (!pin) {
      throw new Error('Speed limit PIN not configured. Set it in device settings.');
    }
    return String(pin);
  }

  // --- State ---

  async refreshState(): Promise<void> {
    // Small delay before fetching - vehicle state may not reflect change immediately
    await new Promise<void>((resolve) => {
      this.homey.setTimeout(() => resolve(), REFRESH_DELAY_MS);
    });
    await this.fetchState();
  }

  // Fetch /state (Tessie cache; never wakes the car) and apply it unless a newer response already was.
  private async fetchState(): Promise<any> {
    const seq = ++this.stateRequestSeq;
    const state = await this.client.getVehicle(this.getData().id);
    if (seq < this.stateAppliedSeq || this.destroyed) return state;
    this.stateAppliedSeq = seq;
    await this.updateCapabilities(state);
    return state;
  }

  async pollCycle(): Promise<void> {
    if (this.destroyed) return;
    const vin = this.getData().id;
    let nextInterval = AWAKE_INTERVAL_MS;

    try {
      // Get status (lightweight, does not wake vehicle)
      const statusResponse = await this.client.getStatus(vin);
      const status = statusResponse?.status || 'awake';
      const isAsleep = status === 'asleep';
      await this.setCap('vehicle_state_status', STATUS_MAP[status] || 'Awake');

      const state = await this.fetchState();

      this.consecutiveFailures = 0;
      await this.setAvailable();

      if (this.streamer?.isConnected && Date.now() - this.lastStreamDataAt < STREAM_FRESHNESS_MS) {
        nextInterval = STREAMING_FALLBACK_INTERVAL_MS;
      } else if (isAsleep) {
        nextInterval = ASLEEP_INTERVAL_MS;
      } else if (state?.charge_state?.charging_state === 'Charging') {
        nextInterval = CHARGING_INTERVAL_MS;
      }
    } catch (err: any) {
      this.consecutiveFailures++;
      this.error(`Poll failed (${this.consecutiveFailures} consecutive):`, err.message);

      if (err.message === TOKEN_ERROR) {
        // Retrying won't help until the user repairs the device with a new token
        await this.setUnavailable('Tessie API token is invalid or expired. Repair the device to enter a new token.')
          .catch(this.error);
        nextInterval = ASLEEP_INTERVAL_MS;
      } else if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        await this.setCap('vehicle_state_status', 'Offline');
        await this.setUnavailable('Unable to reach Tessie API').catch(this.error);
      }
    }

    // Always schedule next poll (keep trying to recover)
    this.scheduleNextPoll(nextInterval);
  }

  private scheduleNextPoll(ms: number): void {
    if (this.destroyed) return;
    if (this.pollTimer != null) {
      this.homey.clearTimeout(this.pollTimer);
    }
    this.pollTimer = this.homey.setTimeout(() => this.pollCycle(), ms);
  }

  /**
   * Set a capability value, skipping unchanged values and firing Flow triggers on transitions.
   * Never throws: a single bad value must not abort a full state update.
   */
  async setCap(id: string, value: any): Promise<void> {
    const prev = this.getCapabilityValue(id);
    if (prev === value) return;
    try {
      await this.setCapabilityValue(id, value);
    } catch (err: any) {
      this.error(`Failed to set ${id} to ${value}:`, err.message);
      return;
    }
    // No previous value (fresh capability): nothing to transition from
    if (prev == null) return;
    this.onCapabilityChanged(id, prev, value);
  }

  private onCapabilityChanged(id: string, prev: any, value: any): void {
    switch (id) {
      case 'locked': {
        const source = this.commandSource('locked', value);
        this.triggerFlow(value ? 'vehicle_locked' : 'vehicle_unlocked', { source });
        this.postTimeline('timeline_security', `was ${value ? 'locked' : 'unlocked'} ${SOURCE_PHRASE[source]}`);
        break;
      }
      case 'sentry_mode': {
        const source = this.commandSource('sentry_mode', value);
        this.triggerFlow(value ? 'sentry_enabled' : 'sentry_disabled', { source });
        this.postTimeline('timeline_security', `· Sentry Mode turned ${value ? 'on' : 'off'} ${SOURCE_PHRASE[source]}`);
        break;
      }
      case 'climate_onoff':
        this.triggerFlow(value ? 'climate_started' : 'climate_stopped', { source: this.commandSource('climate_onoff', value) });
        break;
      case 'charging_status': {
        const battery = this.getCapabilityValue('measure_battery') ?? 0;
        this.triggerFlow('charging_status_changed', { status: String(value) });
        if (value === 'Charging') this.triggerFlow('charging_started', { battery, source: this.commandSource('charging_control', true) });
        if (prev === 'Charging') this.triggerFlow('charging_stopped', { battery, source: this.commandSource('charging_control', false) });
        if (value === 'Complete') this.triggerFlow('charging_complete', { battery });
        if (prev === 'Disconnected') this.triggerFlow('plugged_in');
        if (value === 'Disconnected') this.triggerFlow('unplugged');
        break;
      }
      case 'vehicle_state_status':
        if (prev === 'Asleep' && value === 'Awake') this.triggerFlow('vehicle_woke_up');
        if (prev === 'Awake' && value === 'Asleep') this.triggerFlow('vehicle_fell_asleep');
        break;
      case 'measure_battery':
        this.triggerFlow('battery_below', { battery: value }, { previous: prev, current: value });
        break;
      case 'shift_state': {
        const wasDriving = DRIVING_SHIFT_STATES.has(prev);
        const isDriving = DRIVING_SHIFT_STATES.has(value);
        if (!wasDriving && isDriving) this.triggerFlow('started_driving');
        if (wasDriving && !isDriving) {
          this.triggerFlow('parked');
          this.scheduleDriveLookup(Date.now(), 1);
        }
        break;
      }
      default:
        break;
    }
  }

  /** Who caused a state change: the matching recent Homey command, or something outside Homey. */
  private commandSource(capId: string, value: any): string {
    const cmd = this.recentCommands[capId];
    if (cmd && cmd.value === value && Date.now() - cmd.at < COMMAND_SOURCE_WINDOW_MS) {
      delete this.recentCommands[capId];
      return cmd.source;
    }
    return SOURCE_OUTSIDE;
  }

  /** Post to the Homey Timeline when the user enabled the given timeline setting. */
  private postTimeline(settingKey: string, text: string): void {
    if (!this.getSetting(settingKey)) return;
    try {
      this.homey.notifications.createNotification({ excerpt: `**${this.getName()}** ${text}` })
        .catch((err: any) => this.error('Timeline notification failed:', err.message));
    } catch (err: any) {
      this.error('Timeline notification failed:', err.message);
    }
  }

  // --- Drives ---

  private scheduleDriveLookup(parkedAt: number, attempt: number): void {
    if (this.destroyed) return;
    if (this.driveTimer != null) this.homey.clearTimeout(this.driveTimer);
    this.driveTimer = this.homey.setTimeout(() => {
      this.driveTimer = null;
      this.lookupCompletedDrive(parkedAt, attempt).catch((err: any) => this.error('Drive lookup failed:', err.message));
    }, DRIVE_LOOKUP_DELAY_MS);
  }

  /** Fetch the drive that just ended from Tessie and announce it, including the car's driver profile. */
  async lookupCompletedDrive(parkedAt: number, attempt: number): Promise<void> {
    if (this.destroyed) return;
    const parkedSec = Math.floor(parkedAt / 1000);
    const drives = await this.client.getDrives(this.getData().id, {
      from: parkedSec - 12 * 60 * 60,
      distanceFormat: this.isMetric ? 'km' : 'mi',
    });
    const drive = drives
      .filter((d: any) => typeof d.ended_at === 'number' && d.ended_at >= parkedSec - 15 * 60)
      .reduce((a: any, b: any) => (!a || b.ended_at > a.ended_at ? b : a), null);
    if (!drive) {
      if (attempt < DRIVE_LOOKUP_ATTEMPTS) this.scheduleDriveLookup(parkedAt, attempt + 1);
      return;
    }
    if (drive.id != null && this.getStoreValue('last_reported_drive') === drive.id) return;
    if (drive.id != null) await this.setStoreValue('last_reported_drive', drive.id).catch(this.error);

    const driver = String(drive.driver_profile ?? drive.driver_profile_name ?? drive.driver ?? '').trim() || 'Unknown';
    const distance = Math.round(Number(drive.odometer_distance ?? 0) * 10) / 10;
    const duration = Math.max(0, Math.round(((drive.ended_at ?? 0) - (drive.started_at ?? 0)) / 60));
    const energy = Math.round(Number(drive.energy_used ?? 0) * 10) / 10;
    const from = String(drive.starting_location ?? '');
    const to = String(drive.ending_location ?? '');
    this.triggerFlow('drive_completed', { driver, distance, duration, energy, from, to });

    const unit = this.isMetric ? 'km' : 'mi';
    const place = to.split(',')[0].trim();
    const who = driver === 'Unknown' ? 'drove' : `· ${driver} drove`;
    this.postTimeline('timeline_drives', `${who} ${distance} ${unit}${place ? ` to ${place}` : ''} (${duration} min)`);
  }

  private triggerFlow(cardId: string, tokens: Record<string, any> = {}, state: Record<string, any> = {}): void {
    try {
      this.homey.flow.getDeviceTriggerCard(cardId)
        .trigger(this, tokens, state)
        .catch((err: any) => this.error(`Trigger ${cardId} failed:`, err.message));
    } catch (err: any) {
      this.error(`Trigger ${cardId} failed:`, err.message);
    }
  }

  async updateCapabilities(state: any): Promise<void> {
    if (!state) return;

    const cs = state.charge_state;
    const cl = state.climate_state;
    const ds = state.drive_state;
    const vs = state.vehicle_state;

    if (state.vehicle_config?.rhd != null) {
      this.rhd = state.vehicle_config.rhd === true;
    }

    // --- Charge state ---
    if (cs?.battery_level != null) {
      await this.setCap('measure_battery', cs.battery_level);
    }
    if (cs?.battery_range != null) {
      await this.setCap('measure_range', this.toDistance(cs.battery_range));
    }
    if (cs?.charging_state != null) {
      await this.setCap('charging_status', cs.charging_state);
      await this.setCap('charging_control', cs.charging_state === 'Charging');
    }
    if (cs?.charge_limit_soc != null) {
      await this.setCap('charge_limit', cs.charge_limit_soc / 100);
    }
    // setCapabilityOptions is expensive; only update when the charger's max actually changes
    const ampsMax = Number(cs?.charge_current_request_max);
    if (Number.isFinite(ampsMax) && ampsMax >= 1 && ampsMax !== this.chargingAmpsMax) {
      this.chargingAmpsMax = ampsMax;
      await this.setCapabilityOptions('charging_amps', { min: 1, max: ampsMax, step: 1 })
        .catch((err: any) => this.error('Failed to set charging_amps options:', err.message));
    }
    if (cs?.charge_current_request != null) {
      await this.setCap('charging_amps', cs.charge_current_request);
    }
    if (cs?.charge_port_door_open != null) {
      await this.setCap('charge_port', cs.charge_port_door_open);
    }
    if (cs?.charger_power != null) {
      await this.setCap('charger_power', Number(cs.charger_power));
    }
    if (cs?.charging_state != null) {
      const minutes = cs.charging_state === 'Charging'
        ? (cs.minutes_to_full_charge ?? Math.round((cs.time_to_full_charge ?? 0) * 60))
        : 0;
      await this.setCap('charge_time_remaining', minutes);
    }

    // --- Climate state (temperatures always °C; Homey handles display conversion) ---
    if (cl?.inside_temp != null) {
      await this.setCap('measure_temperature.inside', cl.inside_temp);
    }
    if (cl?.outside_temp != null) {
      await this.setCap('measure_temperature.outside', cl.outside_temp);
    }
    if (cl?.is_climate_on != null) {
      await this.setCap('climate_onoff', cl.is_climate_on);
    }
    if (cl?.driver_temp_setting != null) {
      const tempC = cl.driver_temp_setting;
      const temp = this.tempUnit === 'F'
        ? Math.round((tempC * 9 / 5 + 32) * 10) / 10
        : tempC;
      await this.setCap('target_temperature', temp);
    }
    // Seat heaters: state fields are physical left/right; map to driver/passenger by RHD
    if (cl) {
      const seatFields: Array<[string, string]> = [
        ['seat_heater_left', this.rhd ? 'seat_heater_passenger' : 'seat_heater_driver'],
        ['seat_heater_right', this.rhd ? 'seat_heater_driver' : 'seat_heater_passenger'],
        ['seat_heater_rear_left', 'seat_heater_rear_left'],
        ['seat_heater_rear_center', 'seat_heater_rear_center'],
        ['seat_heater_rear_right', 'seat_heater_rear_right'],
      ];
      for (const [stateField, capId] of seatFields) {
        if (cl[stateField] != null) {
          await this.setCap(capId, String(cl[stateField]));
        }
      }
    }
    if (cl?.steering_wheel_heater != null) {
      await this.setCap('steering_wheel_heater', cl.steering_wheel_heater);
    }
    if (cl?.defrost_mode != null) {
      await this.setCap('defrost_mode', cl.defrost_mode !== 0);
    }
    if (cl?.climate_keeper_mode != null) {
      await this.setCap('climate_keeper_mode', CLIMATE_KEEPER_FROM_STATE[cl.climate_keeper_mode] || 'Off');
    }
    if (cl?.cabin_overheat_protection != null) {
      await this.setCap('cabin_overheat_protection', COP_FROM_STATE[cl.cabin_overheat_protection] || 'Off');
    }

    // --- Drive state ---
    if (ds?.latitude != null) {
      await this.setCap('measure_latitude', ds.latitude);
    }
    if (ds?.longitude != null) {
      await this.setCap('measure_longitude', ds.longitude);
    }
    if (ds) {
      // shift_state is null while parked/asleep
      await this.setCap('shift_state', ds.shift_state || 'P');
    }

    // --- Vehicle state ---
    if (vs) {
      // Tire pressures (skip null/0, convert bar->psi if needed)
      const tirePressures: Array<[string, string]> = [
        ['tpms_pressure_fl', 'measure_tire_pressure_fl'],
        ['tpms_pressure_fr', 'measure_tire_pressure_fr'],
        ['tpms_pressure_rl', 'measure_tire_pressure_rl'],
        ['tpms_pressure_rr', 'measure_tire_pressure_rr'],
      ];
      for (const [apiField, capId] of tirePressures) {
        const value = Number(vs[apiField]);
        if (vs[apiField] != null && Number.isFinite(value) && value !== 0) {
          await this.setCap(capId, this.usesPsi ? Math.round(value * BAR_TO_PSI * 10) / 10 : value);
        }
      }

      if (vs.odometer != null) {
        await this.setCap('measure_odometer', this.toDistance(vs.odometer));
      }

      if (vs.software_update != null) {
        await this.updateSoftwareUpdate(vs.software_update);
      }

      if (vs.locked != null) {
        await this.setCap('locked', vs.locked);
      }
      if (vs.sentry_mode != null) {
        await this.setCap('sentry_mode', vs.sentry_mode);
      }
      // Trunk (rt: 0=closed, non-zero=open)
      if (vs.rt != null) {
        await this.setCap('trunk', vs.rt !== 0);
      }

      // Windows (all 0 = closed/true, any non-zero = vented/false)
      const windowFields = [vs.fd_window, vs.fp_window, vs.rd_window, vs.rp_window];
      if (windowFields.some((w: any) => w != null)) {
        await this.setCap('windows', windowFields.every((w: any) => w == null || w === 0));
      }

      if (vs.valet_mode != null) {
        await this.setCap('valet_mode', vs.valet_mode);
      }
      if (vs.speed_limit_mode?.active != null) {
        await this.setCap('speed_limit_mode', vs.speed_limit_mode.active);
      }
      // Speed limit (API returns mph; convert to km/h if needed)
      if (vs.speed_limit_mode?.current_limit_mph != null) {
        const mph = vs.speed_limit_mode.current_limit_mph;
        const speed = this.speedUnit === 'kmh'
          ? Math.round(mph / KMH_TO_MPH)
          : mph;
        await this.setCap('speed_limit_speed', speed);
      }
    }

    if (ds?.latitude != null && ds?.longitude != null) {
      this.checkHomePresence();
    }
  }

  private async updateSoftwareUpdate(su: any): Promise<void> {
    // Tesla reports "no update" as an empty or blank version string
    const version = String(su.version ?? '').trim();
    if (!version) {
      await this.setCap('software_update', 'Up to date');
      return;
    }
    su = { ...su, version };
    const status = su.status
      ? su.status.charAt(0).toUpperCase() + su.status.slice(1)
      : 'Available';
    await this.setCap('software_update', `${status}: ${su.version}`);

    // Announce each new version once (persisted so restarts don't re-trigger)
    if (this.getStoreValue('notified_update_version') !== su.version) {
      await this.setStoreValue('notified_update_version', su.version).catch(this.error);
      this.triggerFlow('software_update_available', { version: String(su.version) });
    }
  }

  private toDistance(miles: number): number {
    return this.isMetric ? Math.round(miles * MILES_TO_KM) : Math.round(miles);
  }

  // --- Location ---

  /** Distance in meters from the vehicle to Homey's location, or null if unknown. */
  distanceFromHome(): number | null {
    const lat = this.getCapabilityValue('measure_latitude');
    const lon = this.getCapabilityValue('measure_longitude');
    if (lat == null || lon == null) return null;
    let homeLat: number | undefined;
    let homeLon: number | undefined;
    try {
      homeLat = this.homey.geolocation.getLatitude();
      homeLon = this.homey.geolocation.getLongitude();
    } catch (_err) {
      return null;
    }
    if (homeLat == null || homeLon == null) return null;
    return distanceMeters(lat, lon, homeLat, homeLon);
  }

  isAtHome(): boolean {
    const distance = this.distanceFromHome();
    if (distance == null) return false;
    const radius = Number(this.getSetting('home_radius')) || DEFAULT_HOME_RADIUS_M;
    return distance <= radius;
  }

  private checkHomePresence(): void {
    if (this.distanceFromHome() == null) return;
    const atHome = this.isAtHome();
    const wasHome = this.isHome;
    this.isHome = atHome;
    if (wasHome == null || wasHome === atHome) return;
    this.triggerFlow(atHome ? 'arrived_home' : 'left_home');
  }

  // --- Battery health & charging history ---

  async refreshBatteryHealth(): Promise<void> {
    try {
      await this.updateBatteryHealth(await this.client.getBatteryHealth(this.getData().id));
    } catch (err: any) {
      this.error('Failed to fetch battery health:', err.message);
    }
  }

  async updateBatteryHealth(healthData: any): Promise<void> {
    if (healthData?.health_percent != null) {
      await this.setCap('measure_soh', healthData.health_percent);
    }
  }

  async updateChargingHistory(): Promise<void> {
    try {
      const charges = await this.client.getCharges(this.getData().id);
      if (charges.length === 0) return;
      // Don't rely on API ordering; pick the most recent session
      const last = charges.reduce((a: any, b: any) =>
        ((b.started_at ?? 0) > (a.started_at ?? 0) ? b : a));
      const energy = last.charge_energy_added ?? last.energy_added ?? last.energy_used;
      if (energy != null) {
        await this.setCap('last_charge_energy', Math.round(energy * 10) / 10);
      }
      if (last.location) {
        await this.setCap('last_charge_location', String(last.location));
      }
      const cost = last.total_cost ?? last.cost;
      if (cost != null && Number.isFinite(Number(cost))) {
        await this.setCap('last_charge_cost', Math.round(Number(cost) * 100) / 100);
      }
    } catch (err: any) {
      this.error('Failed to fetch charging history:', err.message);
    }
  }

  // --- Settings ---

  // Accepts explicit settings because inside onSettings getSetting() still returns the old values.
  async applyUnitSettings(settings: Record<string, any> = this.getSettings()): Promise<void> {
    const distUnit = settings.unit_distance || 'km';
    const pressUnit = settings.unit_pressure || 'bar';
    const tempUnit = settings.unit_temperature || 'C';
    const speedUnit = settings.unit_speed || 'kmh';
    const currencyCode = settings.currency || 'USD';

    this.isMetric = distUnit === 'km';
    this.usesPsi = pressUnit === 'psi';
    this.tempUnit = tempUnit === 'F' ? 'F' : 'C';
    this.speedUnit = speedUnit === 'mph' ? 'mph' : 'kmh';

    await this.setCapabilityOptions('measure_range', { units: distUnit });
    await this.setCapabilityOptions('measure_odometer', { units: distUnit });

    const pressureRange = pressUnit === 'psi' ? { min: 0, max: 80 } : { min: 0, max: 5 };
    for (const pos of ['fl', 'fr', 'rl', 'rr']) {
      await this.setCapabilityOptions(`measure_tire_pressure_${pos}`, { units: pressUnit, ...pressureRange, step: 0.1 });
    }

    if (tempUnit === 'F') {
      await this.setCapabilityOptions('target_temperature', { units: '°F', min: 59, max: 82, step: 1 });
    } else {
      await this.setCapabilityOptions('target_temperature', { units: '°C', min: TEMP_MIN_C, max: TEMP_MAX_C, step: 0.5 });
    }

    if (speedUnit === 'kmh') {
      await this.setCapabilityOptions('speed_limit_speed', { units: 'km/h', min: 80, max: 145 });
    } else {
      await this.setCapabilityOptions('speed_limit_speed', { units: 'mph', min: SPEED_LIMIT_MIN_MPH, max: SPEED_LIMIT_MAX_MPH });
    }

    const symbol = CURRENCY_SYMBOLS[currencyCode] || currencyCode;
    await this.setCapabilityOptions('last_charge_cost', { units: symbol });
    await this.setCapabilityOptions('last_charge_energy', { units: 'kWh' });
  }

  async onSettings({ newSettings, changedKeys }: {
    oldSettings: Record<string, any>;
    newSettings: Record<string, any>;
    changedKeys: string[];
  }): Promise<string | void> {
    // onSettings runs before the new values are persisted; validate against newSettings
    if (changedKeys.includes('speed_limit_pin')) {
      const pin = String(newSettings.speed_limit_pin ?? '');
      if (pin !== '' && !/^\d{4}$/.test(pin)) {
        throw new Error('Speed limit PIN must be exactly 4 digits.');
      }
    }

    const unitKeys = ['unit_distance', 'unit_pressure', 'unit_speed', 'unit_temperature', 'currency'];
    if (!changedKeys.some((k) => unitKeys.includes(k))) return;

    await this.applyUnitSettings(newSettings);
    // Re-fetch in the background so converted values are rewritten without blocking the save
    this.refreshState()
      .then(() => this.updateChargingHistory())
      .catch((err: any) => this.error('Failed to refresh after settings change:', err.message));
  }

  // --- Lifecycle ---

  private cleanup(): void {
    this.destroyed = true;
    if (this.streamer) {
      this.streamer.destroy();
      this.streamer = null;
    }
    if (this.pollTimer != null) {
      this.homey.clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.batteryHealthTimer != null) {
      this.homey.clearInterval(this.batteryHealthTimer);
      this.batteryHealthTimer = null;
    }
    if (this.driveTimer != null) {
      this.homey.clearTimeout(this.driveTimer);
      this.driveTimer = null;
    }
  }

  async onUninit(): Promise<void> {
    this.cleanup();
  }

  async onDeleted(): Promise<void> {
    this.cleanup();
    this.log('Vehicle device deleted:', this.getData().id);
  }

}

export = VehicleDevice;
