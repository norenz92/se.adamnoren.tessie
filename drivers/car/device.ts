import Homey from "homey";
import getTessieSDK from "../../tessie/sdk/index";
import { GetStateResponse } from "../../tessie/sdk/types";
import { Driver } from "homey";

// Constants
const POLL_INTERVAL = 30 * 1000; // 30 seconds
const MILES_TO_KM_FACTOR = 1.60934;
const DISPLAY_SETTINGS_DELAY = 1000; // 1 second

// Types
type DistanceUnit = 'km' | 'mi';
type SettingsEvent = {
  oldSettings: Record<string, any>;
  newSettings: Record<string, any>;
  changedKeys: string[];
};

// Distance-related capabilities that need unit conversion
const DISTANCE_CAPABILITIES = [
  'meter_car_odo',
  'measure_soc_range_estimated',
  'measure_soc_range_ideal'
] as const;

/**
 * Utility class for distance unit conversions
 */
class DistanceConverter {
  /**
   * Convert miles to kilometers
   */
  static milesToKm(miles: number): number {
    return miles * MILES_TO_KM_FACTOR;
  }

  /**
   * Convert kilometers to miles
   */
  static kmToMiles(km: number): number {
    return km / MILES_TO_KM_FACTOR;
  }

  /**
   * Convert distance from one unit to another
   */
  static convert(value: number, fromUnit: DistanceUnit, toUnit: DistanceUnit): number {
    if (fromUnit === toUnit) return value;
    
    if (fromUnit === 'mi' && toUnit === 'km') {
      return this.milesToKm(value);
    }
    
    if (fromUnit === 'km' && toUnit === 'mi') {
      return this.kmToMiles(value);
    }
    
    return value;
  }

  /**
   * Convert Tesla API value (always in miles) to user's preferred unit
   */
  static fromMiles(miles: number, targetUnit: DistanceUnit): number {
    return targetUnit === 'km' ? this.milesToKm(miles) : miles;
  }
}

module.exports = class CarDevice extends Homey.Device {
  private timeout: NodeJS.Timeout | null = null;

  async onInit() {
    // TODO
    this.log("TessieDevice has been initialized");
    await this._updateCapabilities();
    await this._initDistanceUnits(); // Initialize distance units
    await this._updateDisplaySettings();
    await this._initActions();
    await this._initConditions();
    this.startPolling();
  }

  /**
   * Handle settings changes
   */
  async onSettings(event: SettingsEvent): Promise<void> {
    this.log('Settings changed:', event.changedKeys);
    
    if (event.changedKeys.includes('odometer_unit')) {
      const oldUnit = event.oldSettings.odometer_unit as DistanceUnit;
      const newUnit = event.newSettings.odometer_unit as DistanceUnit;
      this.log(`Distance unit changed: ${oldUnit} → ${newUnit}`);
      
      // Defer updates to avoid settings conflicts
      setImmediate(() => {
        this._updateDistanceUnits(oldUnit, newUnit);
        
        // Update display settings after unit change
        setTimeout(() => {
          this._updateDisplaySettings().catch(error => {
            this.error('Failed to update display settings:', error);
          });
        }, DISPLAY_SETTINGS_DELAY);
      });
    }
  }

  _auth() {
    const accessToken = this.getData().accessToken;

    if (!accessToken) {
      throw new Error("Access token is missing");
    }

    getTessieSDK().setAccessToken(accessToken);
  }

  async getState() {
    try {
      await this._auth();
      const state = await getTessieSDK().getState({
        vin: this.getData().id,
      });
      this.updateDevice(state);
      return state;
    } catch (error) {
      this.error(`Failed to get state: ${error}`);
    }
  }

  async startPolling() {
    await this.getState();
    this.timeout = setInterval(() => {
      this.getState();
    }, POLL_INTERVAL);
  }

  // Stop polling for data.
  async stopPolling() {
    if (this.timeout) {
      clearInterval(this.timeout);
    }
  }

  async _updateCapabilities() {
    let capabilities = [];
    try {
      capabilities = this.homey.app.manifest.drivers.filter((e: Driver) => {
        return e.id == this.driver.id;
      })[0].capabilities;
      // remove capabilities
      let deviceCapabilities = this.getCapabilities();
      for (let i = 0; i < deviceCapabilities.length; i++) {
        let filter = capabilities.filter((e: string) => {
          return e == deviceCapabilities[i];
        });
        if (filter.length == 0) {
          try {
            await this.removeCapability(deviceCapabilities[i]);
          } catch (error) {}
        }
      }
      // add missing capabilities
      for (let i = 0; i < capabilities.length; i++) {
        if (!this.hasCapability(capabilities[i])) {
          try {
            await this.addCapability(capabilities[i]);
          } catch (error) {}
        }
      }
    } catch (error) {
      this.error(error);
    }
  }

  async sendCommand(command: () => Promise<void>) {
    this._auth();
    return await command();
  }

  async _initActions() {
    this.homey.flow
      .getActionCard("charge_current")
      .registerRunListener(async (args, state) => {
        this.sendCommand(async () => {
          await getTessieSDK().setChargingAmps({
            amps: args.current,
            vin: this.getData().id,
            wait_for_completion: true,
          });
          await this.setCapabilityValue(
            "measure_charge_current_max",
            args.current
          );
        });
      });

    this.homey.flow
      .getActionCard("charging_on")
      .registerRunListener(async (args, state) => {
        this.sendCommand(async () => {
          if (args.action === "start") {
            this.log("Starting charging");
            await getTessieSDK().startCharging({
              vin: this.getData().id,
              wait_for_completion: true,
            });
          } else {
            this.log("Stopping charging");
            await getTessieSDK().stopCharging({
              vin: this.getData().id,
              wait_for_completion: true,
            });
          }
          await this.setCapabilityValue("charging_on", args.action === "start");
        });
      });

    this.homey.flow
      .getActionCard("charge_limit")
      .registerRunListener(async (args, state) => {
        this.sendCommand(async () => {
          this.log("Setting charge limit: ", args.limit);
          await getTessieSDK().setChargeLimit({
            percent: args.limit,
            vin: this.getData().id,
            wait_for_completion: true,
          });
          await this.setCapabilityValue("measure_charge_limit_soc", args.limit);
        });
      });
  }

  async _initConditions() {
    this.homey.flow
      .getConditionCard("charging_state")
      .registerRunListener(async (args, state) => {
        if (args.state == "Connected") {
          return (
            args.device.getCapabilityValue("charging_state") != "Disconnected"
          );
        } else {
          return args.device.getCapabilityValue("charging_state") == args.state;
        }
      });
  }

  /**
   * Get the user's preferred distance unit
   */
  private _getDistanceUnit(): DistanceUnit {
    return (this.getSetting('odometer_unit') as DistanceUnit) || 'km';
  }

  /**
   * Convert Tesla API distance value (miles) to user's preferred unit
   */
  private _convertDistance(valueInMiles: number): number {
    return DistanceConverter.fromMiles(valueInMiles, this._getDistanceUnit());
  }

  /**
   * Update distance capability units and convert existing values
   */
  private async _updateDistanceUnits(oldUnit?: DistanceUnit, newUnit?: DistanceUnit): Promise<void> {
    const targetUnit = newUnit || this._getDistanceUnit();
    
    this.log(`Updating distance units to: ${targetUnit} (was: ${oldUnit || 'unknown'})`);

    for (const capabilityId of DISTANCE_CAPABILITIES) {
      if (!this.hasCapability(capabilityId)) continue;

      try {
        await this._updateCapabilityUnit(capabilityId, oldUnit, targetUnit);
      } catch (error) {
        this.error(`Failed to update ${capabilityId} unit:`, error);
      }
    }
  }

  /**
   * Update a single capability's unit and convert its value if needed
   */
  private async _updateCapabilityUnit(
    capabilityId: string, 
    oldUnit?: DistanceUnit, 
    newUnit: DistanceUnit = this._getDistanceUnit()
  ): Promise<void> {
    const currentValue = this.getCapabilityValue(capabilityId);
    
    // Convert existing value if units changed and we have a valid value
    let convertedValue = currentValue;
    if (
      currentValue !== null && 
      currentValue !== undefined && 
      oldUnit && 
      oldUnit !== newUnit
    ) {
      convertedValue = DistanceConverter.convert(currentValue, oldUnit, newUnit);
      this.log(
        `Converting ${capabilityId}: ${currentValue} ${oldUnit} → ${convertedValue} ${newUnit}`
      );
    }

    // Update capability options with new unit
    await this.setCapabilityOptions(capabilityId, { units: newUnit });

    // Set the converted value
    if (convertedValue !== null && convertedValue !== undefined) {
      await this.setCapabilityValue(capabilityId, convertedValue);
      this.log(`Updated ${capabilityId}: ${convertedValue} ${newUnit}`);
    }
  }

  /**
   * Initialize distance capability units (called during onInit)
   */
  private async _initDistanceUnits(): Promise<void> {
    await this._updateDistanceUnits();
  }

  /**
   * Update display settings to reflect current unit preferences
   */
  private async _updateDisplaySettings(): Promise<void> {
    const unit = this._getDistanceUnit();
    
    const distanceFormatText = unit === 'mi' ? 'Miles (mi)' : 'Kilometers (km)';
    const temperatureFormatText = 'Celsius (°C)'; // Tesla always uses Celsius internally
    
    try {
      await this.setSettings({
        distance_format_display: distanceFormatText,
        temperature_format_display: temperatureFormatText,
      });
    } catch (error) {
      this.error('Failed to update display settings:', error);
    }
  }

  async updateDevice(data: GetStateResponse) {
    if (
      this.hasCapability("measure_battery") &&
      data.charge_state?.battery_level
    ) {
      await this.setCapabilityValue(
        "measure_battery",
        data.charge_state.battery_level
      );
    }

    if (this.hasCapability("meter_car_odo") && data.vehicle_state?.odometer) {
      const convertedOdometer = this._convertDistance(
        data.vehicle_state.odometer
      );
      await this.setCapabilityValue(
        "meter_car_odo",
        convertedOdometer
      );
    }

    if (
      this.hasCapability("charging_on") &&
      data.charge_state?.charging_state
    ) {
      await this.setCapabilityValue(
        "charging_on",
        data.charge_state.charging_state === "Charging"
      );
    }

    if (
      this.hasCapability("measure_charge_current_max") &&
      data.charge_state?.charge_amps
    ) {
      await this.setCapabilityValue(
        "measure_charge_current_max",
        data.charge_state.charge_amps
      );
    }

    if (
      this.hasCapability("measure_charge_current") &&
      data.charge_state?.charger_actual_current
    ) {
      await this.setCapabilityValue(
        "measure_charge_current",
        data.charge_state.charger_actual_current
      );
    }

    if (
      this.hasCapability("measure_charge_energy_added") &&
      data.charge_state?.charge_energy_added
    ) {
      await this.setCapabilityValue(
        "measure_charge_energy_added",
        data.charge_state.charge_energy_added
      );
    }

    if (
      this.hasCapability("measure_charge_limit_soc") &&
      data.charge_state?.charge_limit_soc
    ) {
      await this.setCapabilityValue(
        "measure_charge_limit_soc",
        data.charge_state.charge_limit_soc
      );
    }

    if (
      this.hasCapability("measure_charge_minutes_to_full_charge") &&
      data.charge_state?.minutes_to_full_charge
    ) {
      await this.setCapabilityValue(
        "measure_charge_minutes_to_full_charge",
        data.charge_state.minutes_to_full_charge
      );
    }

    if (
      this.hasCapability("measure_charge_phases") &&
      data.charge_state?.charger_phases
    ) {
      await this.setCapabilityValue(
        "measure_charge_phases",
        data.charge_state.charger_phases
      );
    }

    if (
      this.hasCapability("measure_charge_power") &&
      data.charge_state?.charger_power
    ) {
      await this.setCapabilityValue(
        "measure_charge_power",
        data.charge_state.charger_power
      );
    }

    if (
      this.hasCapability("measure_charge_voltage") &&
      data.charge_state?.charger_voltage
    ) {
      await this.setCapabilityValue(
        "measure_charge_voltage",
        data.charge_state.charger_voltage
      );
    }

    if (
      this.hasCapability("measure_climate_temperature_in") &&
      data.climate_state?.inside_temp
    ) {
      await this.setCapabilityValue(
        "measure_climate_temperature_in",
        data.climate_state.inside_temp
      );
    }

    if (
      this.hasCapability("measure_climate_temperature_out") &&
      data.climate_state?.outside_temp
    ) {
      await this.setCapabilityValue(
        "measure_climate_temperature_out",
        data.climate_state.outside_temp
      );
    }

    if (
      this.hasCapability("measure_io_battery_power") &&
      data.drive_state?.power
    ) {
      await this.setCapabilityValue(
        "measure_io_battery_power",
        data.drive_state.power
      );
    }

    if (
      this.hasCapability("measure_location_heading") &&
      data.drive_state?.heading
    ) {
      await this.setCapabilityValue(
        "measure_location_heading",
        data.drive_state.heading
      );
    }

    if (
      this.hasCapability("measure_location_latitude") &&
      data.drive_state?.latitude
    ) {
      await this.setCapabilityValue(
        "measure_location_latitude",
        data.drive_state.latitude
      );
    }

    if (
      this.hasCapability("measure_location_longitude") &&
      data.drive_state?.longitude
    ) {
      await this.setCapabilityValue(
        "measure_location_longitude",
        data.drive_state.longitude
      );
    }

    if (
      this.hasCapability("measure_soc_level") &&
      data.charge_state?.battery_level
    ) {
      await this.setCapabilityValue(
        "measure_soc_level",
        data.charge_state.battery_level
      );
    }

    if (
      this.hasCapability("measure_soc_range_estimated") &&
      data.charge_state?.est_battery_range
    ) {
      const convertedRange = this._convertDistance(
        data.charge_state.est_battery_range
      );
      await this.setCapabilityValue(
        "measure_soc_range_estimated",
        convertedRange
      );
    }

    if (
      this.hasCapability("measure_soc_range_ideal") &&
      data.charge_state?.ideal_battery_range
    ) {
      const convertedRange = this._convertDistance(
        data.charge_state.ideal_battery_range
      );
      await this.setCapabilityValue(
        "measure_soc_range_ideal",
        convertedRange
      );
    }

    if (
      this.hasCapability("measure_soc_usable") &&
      data.charge_state?.usable_battery_level
    ) {
      await this.setCapabilityValue(
        "measure_soc_usable",
        data.charge_state.usable_battery_level
      );
    }

    if (
      this.hasCapability("measure_battery") &&
      data.charge_state?.battery_level
    ) {
      await this.setCapabilityValue(
        "measure_battery",
        data.charge_state.battery_level
      );
    }
  }
};
