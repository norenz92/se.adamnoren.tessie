import Homey from 'homey';
import TessieClient = require('../../lib/tessie-client');
import TessieStreamer = require('../../lib/tessie-streamer');
import mapStreamData = require('../../lib/stream-mapper');

const AWAKE_INTERVAL_MS = 60 * 1000;
const CHARGING_INTERVAL_MS = 2 * 60 * 1000;
const ASLEEP_INTERVAL_MS = 30 * 60 * 1000;
const BATTERY_HEALTH_INTERVAL_MS = 60 * 60 * 1000;
const STREAMING_FALLBACK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_CONSECUTIVE_FAILURES = 3;
const MILES_TO_KM = 1.60934;
const BAR_TO_PSI = 14.5038;

const ALL_CAPABILITIES = [
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
  'seat_heater_driver', 'seat_heater_passenger',
  'seat_heater_rear_left', 'seat_heater_rear_center', 'seat_heater_rear_right',
  'climate_keeper_mode', 'cabin_overheat_protection',
  'defrost_mode', 'steering_wheel_heater',
  'windows', 'valet_mode', 'speed_limit_mode', 'speed_limit_speed',
  'last_charge_energy', 'last_charge_location', 'last_charge_cost',
];

const SEAT_MAP: Record<string, number> = {
  seat_heater_driver: 0,
  seat_heater_passenger: 1,
  seat_heater_rear_left: 2,
  seat_heater_rear_center: 4,
  seat_heater_rear_right: 5,
};

const SEAT_STATE_MAP: Array<[string, string]> = [
  ['seat_heater_left', 'seat_heater_driver'],
  ['seat_heater_right', 'seat_heater_passenger'],
  ['seat_heater_rear_left', 'seat_heater_rear_left'],
  ['seat_heater_rear_center', 'seat_heater_rear_center'],
  ['seat_heater_rear_right', 'seat_heater_rear_right'],
];

const CLIMATE_KEEPER_TO_API: Record<string, number> = { 'Off': 0, 'Keep': 1, 'Dog': 2, 'Camp': 3 };
const CLIMATE_KEEPER_FROM_STATE: Record<string, string> = { 'off': 'Off', 'keep': 'Keep', 'dog': 'Dog', 'camp': 'Camp' };

const COP_TO_API: Record<string, { on: boolean; fan_only: boolean }> = {
  'Off': { on: false, fan_only: false },
  'FanOnly': { on: true, fan_only: true },
  'AC': { on: true, fan_only: false },
};
const COP_FROM_STATE: Record<string, string> = { 'Off': 'Off', 'FanOnly': 'FanOnly', 'On': 'AC' };

const WAKE_POLL_INTERVAL_MS = 2000;
const WAKE_TIMEOUT_MS = 30000;
const REFRESH_DELAY_MS = 1500;

class VehicleDevice extends Homey.Device {

  client!: TessieClient;
  streamer: TessieStreamer | null = null;
  pollTimer: ReturnType<typeof setTimeout> | null = null;
  batteryHealthTimer: ReturnType<typeof setInterval> | null = null;
  consecutiveFailures: number = 0;
  isMetric: boolean = true;
  usesPsi: boolean = false;

  async onInit(): Promise<void> {
    const vin = this.getData().id;
    const token = this.getStoreValue('token') as string;
    this.client = new TessieClient(token);

    // Register capability listeners for vehicle controls
    this.registerCapabilityListener('locked', async (value: boolean) => {
      await this.executeCommand(value ? 'lock' : 'unlock');
    });
    this.registerCapabilityListener('sentry_mode', async (value: boolean) => {
      await this.executeCommand(value ? 'enable_sentry' : 'disable_sentry');
    });
    this.registerCapabilityListener('climate_onoff', async (value: boolean) => {
      await this.executeCommand(value ? 'start_climate' : 'stop_climate');
    });
    this.registerCapabilityListener('target_temperature', async (value: number) => {
      await this.executeCommand('set_temperatures', { temperature: value });
    });
    this.registerCapabilityListener('charge_limit', async (value: number) => {
      await this.executeCommand('set_charge_limit', { percent: Math.round(value * 100) });
    });
    this.registerCapabilityListener('charging_amps', async (value: number) => {
      await this.executeCommand('set_charging_amps', { amps: value });
    });
    this.registerCapabilityListener('charge_port', async (value: boolean) => {
      await this.executeCommand(value ? 'open_charge_port' : 'close_charge_port');
    });
    this.registerCapabilityListener('charging_control', async (value: boolean) => {
      await this.executeCommand(value ? 'start_charging' : 'stop_charging');
    });
    this.registerCapabilityListener('trunk', async (_value: boolean) => {
      await this.executeCommand('activate_rear_trunk');
    });
    this.registerCapabilityListener('frunk', async (_value: boolean) => {
      await this.executeCommand('activate_front_trunk');
    });

    // Seat heater listeners
    for (const [capId, seatNum] of Object.entries(SEAT_MAP)) {
      this.registerCapabilityListener(capId, async (value: string) => {
        await this.executeCommand('set_seat_heating', { seat: seatNum, level: Number(value) });
      });
    }

    // Steering wheel heater
    this.registerCapabilityListener('steering_wheel_heater', async (value: boolean) => {
      await this.executeCommand(value ? 'start_steering_wheel_heater' : 'stop_steering_wheel_heater');
    });

    // Defrost mode
    this.registerCapabilityListener('defrost_mode', async (value: boolean) => {
      await this.executeCommand(value ? 'start_max_defrost' : 'stop_max_defrost');
    });

    // Climate keeper mode
    this.registerCapabilityListener('climate_keeper_mode', async (value: string) => {
      await this.executeCommand('set_climate_keeper_mode', { mode: CLIMATE_KEEPER_TO_API[value] });
    });

    // Cabin overheat protection
    this.registerCapabilityListener('cabin_overheat_protection', async (value: string) => {
      await this.executeCommand('set_cabin_overheat_protection', COP_TO_API[value]);
    });

    // Windows (true=closed, false=vented)
    this.registerCapabilityListener('windows', async (value: boolean) => {
      await this.executeCommand(value ? 'close_windows' : 'vent_windows');
    });

    // Valet mode
    this.registerCapabilityListener('valet_mode', async (value: boolean) => {
      await this.executeCommand(value ? 'enable_valet' : 'disable_valet');
    });

    // Speed limit mode (requires PIN)
    this.registerCapabilityListener('speed_limit_mode', async (value: boolean) => {
      const pin = this.getSetting('speed_limit_pin');
      if (!pin) {
        throw new Error('Speed limit PIN not configured. Set it in device settings.');
      }
      await this.executeCommand(value ? 'enable_speed_limit' : 'disable_speed_limit', { pin });
    });

    // Speed limit speed
    this.registerCapabilityListener('speed_limit_speed', async (value: number) => {
      await this.executeCommand('set_speed_limit', { limit_mph: value });
    });

    // Migrate capabilities for already-paired devices
    for (const cap of ALL_CAPABILITIES) {
      if (!this.hasCapability(cap)) {
        await this.addCapability(cap);
      }
    }

    // Initial data fetch
    try {
      const [statusResponse, state, healthData] = await Promise.all([
        this.client.getStatus(vin),
        this.client.getVehicle(vin),
        this.client.getBatteryHealth(vin),
      ]);

      // Read gui_settings and configure units
      if (state.gui_settings) {
        const gs = state.gui_settings;
        this.isMetric = gs.gui_distance_units === 'km/hr';
        this.usesPsi = gs.gui_tirepressure_units === 'Psi';

        // Set capability options only when units differ from defaults
        if (!this.isMetric) {
          await this.setCapabilityOptions('measure_range', { units: 'mi' });
          await this.setCapabilityOptions('measure_odometer', { units: 'mi' });
        }
        if (this.usesPsi) {
          for (const pos of ['fl', 'fr', 'rl', 'rr']) {
            await this.setCapabilityOptions(`measure_tire_pressure_${pos}`, { units: 'psi' });
          }
        }
      }

      // Map vehicle status
      if (statusResponse?.status) {
        const statusMap: Record<string, string> = {
          'awake': 'Awake',
          'asleep': 'Asleep',
          'waiting_for_sleep': 'Asleep',
        };
        const mappedStatus = statusMap[statusResponse.status] || 'Awake';
        await this.setCapabilityValue('vehicle_state_status', mappedStatus);
      }

      // Map all capabilities from initial state
      await this.updateCapabilities(state);

      // Update battery health
      await this.updateBatteryHealth(healthData);

      // Fetch charging history
      await this.updateChargingHistory();
    } catch (err: any) {
      this.error('Failed initial data fetch:', err.message);
    }

    // Schedule first poll cycle
    this.scheduleNextPoll(AWAKE_INTERVAL_MS);

    // Initialize WebSocket streaming
    this.streamer = new TessieStreamer(vin, token);

    this.streamer.on('data', async (dataPoints: any[]) => {
      const updates = mapStreamData(dataPoints, this.isMetric, this.usesPsi);
      for (const update of updates) {
        await this.setCapabilityValue(update.id, update.value).catch((err: any) => {
          this.error('Stream capability update failed:', update.id, err.message);
        });
      }
    });

    this.streamer.on('connected', async () => {
      this.log('Stream connected');
      this.consecutiveFailures = 0;
      await this.setAvailable();
      // Full REST poll on reconnect to sync any missed state
      try {
        await this.refreshState();
      } catch (err: any) {
        this.error('Stream reconnect state sync failed:', err.message);
      }
    });

    this.streamer.on('disconnected', () => {
      this.log('Stream disconnected');
      // Do NOT mark unavailable -- vehicle may just be sleeping
      // Normal polling will resume at adaptive rate on next poll cycle
    });

    this.streamer.connect();

    // Schedule battery health refresh on fixed cadence
    this.batteryHealthTimer = this.homey.setInterval(async () => {
      try {
        const healthData = await this.client.getBatteryHealth(vin);
        await this.updateBatteryHealth(healthData);
      } catch (err: any) {
        this.error('Failed to fetch battery health:', err.message);
      }
      await this.updateChargingHistory();
    }, BATTERY_HEALTH_INTERVAL_MS);

    this.log('Vehicle device initialized:', vin);
  }

  async ensureAwake(): Promise<void> {
    const status = this.getCapabilityValue('vehicle_state_status');
    if (status !== 'Asleep') return;

    const vin = this.getData().id;
    await this.client.wake(vin);

    const startTime = Date.now();
    while (Date.now() - startTime < WAKE_TIMEOUT_MS) {
      // Wait before polling
      await new Promise<void>((resolve) => {
        this.homey.setTimeout(() => resolve(), WAKE_POLL_INTERVAL_MS);
      });
      const statusResponse = await this.client.getStatus(vin);
      if (statusResponse?.status === 'awake') {
        await this.setCapabilityValue('vehicle_state_status', 'Awake');
        return;
      }
    }

    throw new Error('Vehicle did not wake up in time');
  }

  async executeCommand(command: string, params?: Record<string, string | number | boolean>): Promise<void> {
    await this.ensureAwake();
    const vin = this.getData().id;
    const success = await this.client.command(vin, command, params);
    if (!success) {
      throw new Error(`Command ${command} failed`);
    }
    await this.refreshState();
  }

  async refreshState(): Promise<void> {
    const vin = this.getData().id;
    // Small delay before fetching - vehicle state may not reflect change immediately
    await new Promise<void>((resolve) => {
      this.homey.setTimeout(() => resolve(), REFRESH_DELAY_MS);
    });
    const state = await this.client.getVehicle(vin);
    await this.updateCapabilities(state);
  }

  async pollCycle(): Promise<void> {
    const vin = this.getData().id;
    let nextInterval = AWAKE_INTERVAL_MS;

    try {
      // Get status (lightweight, does not wake vehicle)
      const statusResponse = await this.client.getStatus(vin);
      const status = statusResponse?.status || 'awake';

      // Map status to vehicle_state_status capability
      const isAsleep = status === 'asleep' || status === 'waiting_for_sleep';
      await this.setCapabilityValue('vehicle_state_status', isAsleep ? 'Asleep' : 'Awake');

      // Get full vehicle state (uses cache, safe for sleeping vehicles)
      const state = await this.client.getVehicle(vin);
      await this.updateCapabilities(state);

      // Reset failure tracking
      this.consecutiveFailures = 0;
      await this.setAvailable();

      // Determine next interval based on vehicle state and streaming
      if (this.streamer?.isConnected) {
        nextInterval = STREAMING_FALLBACK_INTERVAL_MS;
      } else if (isAsleep) {
        nextInterval = ASLEEP_INTERVAL_MS;
      } else if (state.charge_state?.charging_state === 'Charging') {
        nextInterval = CHARGING_INTERVAL_MS;
      } else {
        nextInterval = AWAKE_INTERVAL_MS;
      }
    } catch (err: any) {
      this.consecutiveFailures++;
      this.error(`Poll failed (${this.consecutiveFailures} consecutive):`, err.message);

      if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        await this.setCapabilityValue('vehicle_state_status', 'Offline');
        await this.setUnavailable('Unable to reach Tessie API');
      }
    }

    // Always schedule next poll (keep trying to recover)
    this.scheduleNextPoll(nextInterval);
  }

  private scheduleNextPoll(ms: number): void {
    if (this.pollTimer != null) {
      this.homey.clearTimeout(this.pollTimer);
    }
    this.pollTimer = this.homey.setTimeout(() => this.pollCycle(), ms);
  }

  async updateCapabilities(state: any): Promise<void> {
    if (!state) return;

    // Battery level
    if (state.charge_state?.battery_level != null) {
      await this.setCapabilityValue('measure_battery', state.charge_state.battery_level);
    }

    // Battery range (miles -> km if metric)
    if (state.charge_state?.battery_range != null) {
      const rangeMiles = state.charge_state.battery_range;
      const range = this.isMetric
        ? Math.round(rangeMiles * MILES_TO_KM)
        : Math.round(rangeMiles);
      await this.setCapabilityValue('measure_range', range);
    }

    // Charging status
    if (state.charge_state?.charging_state != null) {
      await this.setCapabilityValue('charging_status', state.charge_state.charging_state);
    }

    // Temperatures (always Celsius, Homey handles display conversion)
    if (state.climate_state?.inside_temp != null) {
      await this.setCapabilityValue('measure_temperature.inside', state.climate_state.inside_temp);
    }
    if (state.climate_state?.outside_temp != null) {
      await this.setCapabilityValue('measure_temperature.outside', state.climate_state.outside_temp);
    }

    // GPS coordinates
    if (state.drive_state?.latitude != null) {
      await this.setCapabilityValue('measure_latitude', state.drive_state.latitude);
    }
    if (state.drive_state?.longitude != null) {
      await this.setCapabilityValue('measure_longitude', state.drive_state.longitude);
    }

    // Tire pressures (skip null/0, convert bar->psi if needed)
    const tirePressures: Array<[string, string]> = [
      ['tpms_pressure_fl', 'measure_tire_pressure_fl'],
      ['tpms_pressure_fr', 'measure_tire_pressure_fr'],
      ['tpms_pressure_rl', 'measure_tire_pressure_rl'],
      ['tpms_pressure_rr', 'measure_tire_pressure_rr'],
    ];
    for (const [apiField, capId] of tirePressures) {
      const value = state.vehicle_state?.[apiField];
      if (value != null && value !== 0) {
        const pressure = this.usesPsi
          ? Math.round(value * BAR_TO_PSI * 10) / 10
          : value;
        await this.setCapabilityValue(capId, pressure);
      }
    }

    // Odometer (miles -> km if metric)
    if (state.vehicle_state?.odometer != null) {
      const odometerMiles = state.vehicle_state.odometer;
      const odometer = this.isMetric
        ? Math.round(odometerMiles * MILES_TO_KM)
        : Math.round(odometerMiles);
      await this.setCapabilityValue('measure_odometer', odometer);
    }

    // Software update
    if (state.vehicle_state?.software_update != null) {
      const su = state.vehicle_state.software_update;
      if (su.version && su.version.length > 0) {
        const status = su.status
          ? su.status.charAt(0).toUpperCase() + su.status.slice(1)
          : 'Available';
        await this.setCapabilityValue('software_update', `${status}: ${su.version}`);
      } else {
        await this.setCapabilityValue('software_update', 'Up to date');
      }
    }

    // Locked state
    if (state.vehicle_state?.locked != null) {
      await this.setCapabilityValue('locked', state.vehicle_state.locked);
    }

    // Charge limit
    if (state.charge_state?.charge_limit_soc != null) {
      await this.setCapabilityValue('charge_limit', state.charge_state.charge_limit_soc / 100);
    }

    // Charging amps
    if (state.charge_state?.charge_current_request != null) {
      await this.setCapabilityValue('charging_amps', state.charge_state.charge_current_request);
    }

    // Dynamic charging amps max
    if (state.charge_state?.charge_current_request_max != null) {
      await this.setCapabilityOptions('charging_amps', { max: state.charge_state.charge_current_request_max });
    }

    // Charge port
    if (state.charge_state?.charge_port_door_open != null) {
      await this.setCapabilityValue('charge_port', state.charge_state.charge_port_door_open);
    }

    // Charging control (Charging = true, else false)
    if (state.charge_state?.charging_state != null) {
      await this.setCapabilityValue('charging_control', state.charge_state.charging_state === 'Charging');
    }

    // Climate on/off
    if (state.climate_state?.is_climate_on != null) {
      await this.setCapabilityValue('climate_onoff', state.climate_state.is_climate_on);
    }

    // Target temperature
    if (state.climate_state?.driver_temp_setting != null) {
      await this.setCapabilityValue('target_temperature', state.climate_state.driver_temp_setting);
    }

    // Sentry mode
    if (state.vehicle_state?.sentry_mode != null) {
      await this.setCapabilityValue('sentry_mode', state.vehicle_state.sentry_mode);
    }

    // Trunk (rt: 0=closed, non-zero=open)
    if (state.vehicle_state?.rt != null) {
      await this.setCapabilityValue('trunk', state.vehicle_state.rt !== 0);
    }

    // Seat heaters (integer level -> string enum id)
    for (const [stateField, capId] of SEAT_STATE_MAP) {
      const val = state.climate_state?.[stateField];
      if (val != null) {
        await this.setCapabilityValue(capId, String(val));
      }
    }

    // Steering wheel heater
    if (state.climate_state?.steering_wheel_heater != null) {
      await this.setCapabilityValue('steering_wheel_heater', state.climate_state.steering_wheel_heater);
    }

    // Defrost mode (integer: 0=off, non-zero=on)
    if (state.climate_state?.defrost_mode != null) {
      await this.setCapabilityValue('defrost_mode', state.climate_state.defrost_mode !== 0);
    }

    // Climate keeper mode (lowercase state string -> capitalized enum id)
    if (state.climate_state?.climate_keeper_mode != null) {
      const mapped = CLIMATE_KEEPER_FROM_STATE[state.climate_state.climate_keeper_mode] || 'Off';
      await this.setCapabilityValue('climate_keeper_mode', mapped);
    }

    // Cabin overheat protection (state string -> enum id)
    if (state.climate_state?.cabin_overheat_protection != null) {
      const mapped = COP_FROM_STATE[state.climate_state.cabin_overheat_protection] || 'Off';
      await this.setCapabilityValue('cabin_overheat_protection', mapped);
    }

    // Windows (aggregate 4 window fields: all 0 = closed/true, any non-zero = vented/false)
    const vs = state.vehicle_state;
    if (vs) {
      const windowFields = [vs.fd_window, vs.fp_window, vs.rd_window, vs.rp_window];
      if (windowFields.some((w: any) => w != null)) {
        const allClosed = windowFields.every((w: any) => w === 0);
        await this.setCapabilityValue('windows', allClosed);
      }

      // Valet mode
      if (vs.valet_mode != null) {
        await this.setCapabilityValue('valet_mode', vs.valet_mode);
      }

      // Speed limit mode
      if (vs.speed_limit_mode?.active != null) {
        await this.setCapabilityValue('speed_limit_mode', vs.speed_limit_mode.active);
      }

      // Speed limit speed
      if (vs.speed_limit_mode?.current_limit_mph != null) {
        await this.setCapabilityValue('speed_limit_speed', vs.speed_limit_mode.current_limit_mph);
      }
    }
  }

  async updateBatteryHealth(healthData: any): Promise<void> {
    if (healthData?.health_percent != null) {
      await this.setCapabilityValue('measure_battery_health', healthData.health_percent);
    }
  }

  async updateChargingHistory(): Promise<void> {
    const vin = this.getData().id;
    try {
      const charges = await this.client.getCharges(vin);
      if (charges.length > 0) {
        const last = charges[0];
        const energy = last.charge_energy_added ?? last.energy_added ?? last.energy_used;
        if (energy != null) {
          await this.setCapabilityValue('last_charge_energy', Math.round(energy * 10) / 10);
        }
        if (last.location) {
          await this.setCapabilityValue('last_charge_location', String(last.location));
        }
        const cost = last.total_cost ?? last.cost;
        if (cost != null) {
          const currency = last.currency || '$';
          await this.setCapabilityValue('last_charge_cost', `${currency}${Number(cost).toFixed(2)}`);
        }
      }
    } catch (err: any) {
      this.error('Failed to fetch charging history:', err.message);
    }
  }

  async onDeleted(): Promise<void> {
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
    this.log('Vehicle device deleted:', this.getData().id);
  }

}

export = VehicleDevice;
