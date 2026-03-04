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
];

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

    // Register locked capability listener (Phase 3 will implement control)
    this.registerCapabilityListener('locked', async (_value: boolean) => {
      throw new Error('Control not yet available');
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
