import Homey from 'homey';
import TessieClient = require('../../lib/tessie-client');

const AWAKE_INTERVAL_MS = 60 * 1000;
const CHARGING_INTERVAL_MS = 2 * 60 * 1000;
const ASLEEP_INTERVAL_MS = 30 * 60 * 1000;
const BATTERY_HEALTH_INTERVAL_MS = 60 * 60 * 1000;
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
];

const WAKE_POLL_INTERVAL_MS = 2000;
const WAKE_TIMEOUT_MS = 30000;
const REFRESH_DELAY_MS = 1500;

class VehicleDevice extends Homey.Device {

  client!: TessieClient;
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
      await this.executeCommand('set_charge_limit', { percent: value });
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
    } catch (err: any) {
      this.error('Failed initial data fetch:', err.message);
    }

    // Schedule first poll cycle
    this.scheduleNextPoll(AWAKE_INTERVAL_MS);

    // Schedule battery health refresh on fixed cadence
    this.batteryHealthTimer = this.homey.setInterval(async () => {
      try {
        const healthData = await this.client.getBatteryHealth(vin);
        await this.updateBatteryHealth(healthData);
      } catch (err: any) {
        this.error('Failed to fetch battery health:', err.message);
      }
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

      // Determine next interval based on vehicle state
      if (isAsleep) {
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
      await this.setCapabilityValue('charge_limit', state.charge_state.charge_limit_soc);
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
  }

  async updateBatteryHealth(healthData: any): Promise<void> {
    if (healthData?.health_percent != null) {
      await this.setCapabilityValue('measure_battery_health', healthData.health_percent);
    }
  }

  async onDeleted(): Promise<void> {
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
