import Homey from "homey";
import getTessieSDK from "../../tessie/sdk/index";
import { GetStateResponse } from "../../tessie/sdk/types";
import { Driver } from "homey";
import { ProcessedTelemetryData } from "../../tessie/telemetry-processor";

// Constants
const POLL_INTERVAL = 30 * 1000; // 30 seconds
const MILES_TO_KM_FACTOR = 1.60934;
const DISPLAY_SETTINGS_DELAY = 1000; // 1 second
const TESLA_API_DISTANCE_UNIT = "mi" as const; // Tesla API always returns distances in miles

// Types
type DistanceUnit = "km" | "mi";
type SettingsEvent = {
  oldSettings: Record<string, any>;
  newSettings: Record<string, any>;
  changedKeys: string[];
};

// Distance-related capabilities that need unit conversion
const DISTANCE_CAPABILITIES = [
  "meter_car_odo",
  "measure_soc_range_estimated",
  "measure_soc_range_ideal",
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
  static convert(
    value: number,
    fromUnit: DistanceUnit,
    toUnit: DistanceUnit
  ): number {
    if (fromUnit === toUnit) return value;

    if (fromUnit === "mi" && toUnit === "km") {
      return this.milesToKm(value);
    }

    if (fromUnit === "km" && toUnit === "mi") {
      return this.kmToMiles(value);
    }

    return value;
  }

  /**
   * Convert Tesla API value (always in miles) to user's preferred unit
   */
  static fromMiles(miles: number, targetUnit: DistanceUnit): number {
    return targetUnit === "km" ? this.milesToKm(miles) : miles;
  }
}

module.exports = class CarDevice extends Homey.Device {
  private timeout: NodeJS.Timeout | null = null;
  private telemetryHandler: ((data: ProcessedTelemetryData) => void) | null = null;

  async onInit() {
    // TODO
    this.log("TessieDevice has been initialized");

    // Migrate device class from 'other' to 'car' if needed
    if (this.getClass() !== "car") {
      this.log(`Migrating device class from '${this.getClass()}' to 'car'`);
      try {
        await this.setClass("car").catch(this.error);
      } catch (error) {
        this.error("Failed to migrate device class:", error);
      }
    }

    await this._migrateDeviceClass();
    await this._updateCapabilities();
    await this._initDistanceUnits(); // Initialize distance units
    await this._updateDisplaySettings();
    await this._initActions();
    await this._initConditions();
    await this._initFleetTelemetry(); // Initialize Fleet Telemetry
    this.startPolling();
  }

  async onUninit(): Promise<void> {
    this.log("TessieDevice has been uninitialized");
    await this.stopPolling();
    await this._stopTelemetry();
  }

  /**
   * Handle settings changes
   */
  async onSettings(event: SettingsEvent): Promise<void> {
    this.log("Settings changed:", event.changedKeys);

    if (event.changedKeys.includes("odometer_unit")) {
      const oldUnit = event.oldSettings.odometer_unit as DistanceUnit;
      const newUnit = event.newSettings.odometer_unit as DistanceUnit;
      this.log(`Distance unit changed: ${oldUnit} → ${newUnit}`);

      // Defer updates to avoid settings conflicts
      setImmediate(() => {
        this._updateDistanceUnits(oldUnit, newUnit);

        // Update display settings after unit change
        setTimeout(() => {
          this._updateDisplaySettings().catch((error) => {
            this.error("Failed to update display settings:", error);
          });
        }, DISPLAY_SETTINGS_DELAY);
      });
    }

    if (event.changedKeys.includes("fleet_telemetry_enabled")) {
      const enabled = event.newSettings.fleet_telemetry_enabled as boolean;
      this.log(`Fleet Telemetry ${enabled ? "enabled" : "disabled"}`);

      // Defer Fleet Telemetry setup to avoid settings conflicts
      setImmediate(() => {
        this._configureFleetTelemetry(enabled).catch((error: any) => {
          this.error("Failed to configure Fleet Telemetry:", error);
        });
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

  async _migrateDeviceClass() {
    // Migrate device class from 'other' to 'car' if needed
    if (this.getClass() !== "car") {
      this.log(`Migrating device class from '${this.getClass()}' to 'car'`);
      try {
        await this.setClass("car").catch(this.error);
      } catch (error) {
        this.error("Failed to migrate device class:", error);
      }
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
   * Initialize Fleet Telemetry configuration on device init
   */
  private async _initFleetTelemetry(): Promise<void> {
    try {
      const isEnabled = this.getSetting("fleet_telemetry_enabled") as boolean;
      if (isEnabled !== false) {
        // Default to true if not set
        await this._configureFleetTelemetry(true);
      }
    } catch (error: any) {
      this.error("Failed to initialize Fleet Telemetry:", error);
    }
  }

  /**
   * Configure Fleet Telemetry by setting or removing the configuration
   */
  private async _configureFleetTelemetry(enabled: boolean): Promise<void> {
    try {
      this._auth();
      const vin = this.getData().id;

      if (enabled) {
        this.log("Configuring Fleet Telemetry with default fields...");

        // Set recommended Fleet Telemetry configuration with common fields
        const defaultFields = {
          ACChargingPower: { interval_seconds: 60 },
          BatteryLevel: { interval_seconds: 60 },
          ChargeState: { interval_seconds: 60 },
          DCChargingPower: { interval_seconds: 60 },
          EnergyRemaining: { interval_seconds: 60 },
          Gear: { interval_seconds: 60 },
          IdealBatteryRange: { interval_seconds: 60 },
          Location: { interval_seconds: 60 },
          Odometer: { interval_seconds: 60 },
          RatedRange: { interval_seconds: 60 },
        };

        await getTessieSDK().setFleetTelemetryConfig({
          vin,
          fields: defaultFields,
        });

        this.log("Fleet Telemetry configured successfully");

        // Start telemetry stream after configuration
        await this._startTelemetry();
      } else {
        this.log("Disabling Fleet Telemetry...");
        await this._stopTelemetry();
        await getTessieSDK().deleteFleetTelemetryConfig(vin);
        this.log("Fleet Telemetry disabled successfully");
      }
    } catch (error: any) {
      this.error("Error configuring Fleet Telemetry:", error);
      throw error;
    }
  }

  /**
   * Start telemetry stream and attach data handler
   */
  private async _startTelemetry(): Promise<void> {
    try {
      const vin = this.getData().id;
      const app = this.homey.app as any;

      if (!app?.tessieApi) {
        this.log("TessieApi not available, skipping telemetry");
        return;
      }

      this.log("Starting telemetry stream...");

      // Create telemetry handler if not already created
      if (!this.telemetryHandler) {
        this.telemetryHandler = (data: ProcessedTelemetryData) => {
          this._updateDeviceFromTelemetry(data);
        };
      }

      // Register handler
      app.tessieApi.onTelemetry(vin, this.telemetryHandler);

      // Start the actual telemetry stream
      app.tessieApi.startTelemetry(vin);

      this.log("Telemetry stream started successfully");
    } catch (error: any) {
      this.error("Failed to start telemetry stream:", error);
    }
  }

  /**
   * Stop telemetry stream
   */
  private async _stopTelemetry(): Promise<void> {
    try {
      const vin = this.getData().id;
      const app = this.homey.app as any;

      if (!app?.tessieApi) {
        return;
      }

      if (this.telemetryHandler) {
        app.tessieApi.offTelemetry(vin, this.telemetryHandler);
      }

      app.tessieApi.stopTelemetry(vin);
      this.log("Telemetry stream stopped");
    } catch (error: any) {
      this.error("Failed to stop telemetry stream:", error);
    }
  }

  /**
   * Update device capabilities from real-time telemetry data
   */
  private async _updateDeviceFromTelemetry(
    telemetry: ProcessedTelemetryData
  ): Promise<void> {
    try {
      // Battery & Charging
      if (telemetry.soc !== undefined && this.hasCapability("measure_soc_level")) {
        await this.setCapabilityValue("measure_soc_level", telemetry.soc);
      }

      if (
        telemetry.batteryLevel !== undefined &&
        this.hasCapability("measure_battery")
      ) {
        await this.setCapabilityValue("measure_battery", telemetry.batteryLevel);
      }

      if (
        telemetry.idealBatteryRange !== undefined &&
        this.hasCapability("measure_soc_range_ideal")
      ) {
        const targetUnit = this._getDistanceUnit();
        const convertedRange = DistanceConverter.convert(
          telemetry.idealBatteryRange,
          TESLA_API_DISTANCE_UNIT,
          targetUnit
        );
        await this.setCapabilityOptions("measure_soc_range_ideal", {
          units: targetUnit,
        });
        await this.setCapabilityValue("measure_soc_range_ideal", convertedRange);
      }

      if (
        telemetry.estimatedBatteryRange !== undefined &&
        this.hasCapability("measure_soc_range_estimated")
      ) {
        const targetUnit = this._getDistanceUnit();
        const convertedRange = DistanceConverter.convert(
          telemetry.estimatedBatteryRange,
          TESLA_API_DISTANCE_UNIT,
          targetUnit
        );
        await this.setCapabilityOptions("measure_soc_range_estimated", {
          units: targetUnit,
        });
        await this.setCapabilityValue(
          "measure_soc_range_estimated",
          convertedRange
        );
      }

      if (
        telemetry.ratedRange !== undefined &&
        this.hasCapability("measure_soc_range_ideal")
      ) {
        // Use rated range to update ideal range as well
        const targetUnit = this._getDistanceUnit();
        const convertedRange = DistanceConverter.convert(
          telemetry.ratedRange,
          TESLA_API_DISTANCE_UNIT,
          targetUnit
        );
        await this.setCapabilityOptions("measure_soc_range_ideal", {
          units: targetUnit,
        });
        await this.setCapabilityValue("measure_soc_range_ideal", convertedRange);
      }

      if (
        telemetry.energyRemaining !== undefined &&
        this.hasCapability("measure_energy_remaining")
      ) {
        await this.setCapabilityValue(
          "measure_energy_remaining",
          telemetry.energyRemaining
        );
      }

      // Charging Status
      if (
        telemetry.chargeState !== undefined &&
        this.hasCapability("charging_on")
      ) {
        await this.setCapabilityValue(
          "charging_on",
          telemetry.chargeState === "Charging"
        );
      }

      if (
        telemetry.acChargingPower !== undefined &&
        this.hasCapability("measure_charge_power")
      ) {
        await this.setCapabilityValue("measure_charge_power", telemetry.acChargingPower);
      }

      if (
        telemetry.dcChargingPower !== undefined &&
        this.hasCapability("measure_charge_power")
      ) {
        // Use DC charging power if AC is not available
        await this.setCapabilityValue("measure_charge_power", telemetry.dcChargingPower);
      }

      if (
        telemetry.chargeAmps !== undefined &&
        this.hasCapability("measure_charge_current_max")
      ) {
        await this.setCapabilityValue(
          "measure_charge_current_max",
          telemetry.chargeAmps
        );
      }

      // Location
      if (
        telemetry.latitude !== undefined &&
        this.hasCapability("measure_location_latitude")
      ) {
        await this.setCapabilityValue(
          "measure_location_latitude",
          telemetry.latitude
        );
      }

      if (
        telemetry.longitude !== undefined &&
        this.hasCapability("measure_location_longitude")
      ) {
        await this.setCapabilityValue(
          "measure_location_longitude",
          telemetry.longitude
        );
      }

      // Vehicle State
      if (
        telemetry.odometer !== undefined &&
        this.hasCapability("meter_car_odo")
      ) {
        const targetUnit = this._getDistanceUnit();
        const convertedOdometer = DistanceConverter.convert(
          telemetry.odometer,
          TESLA_API_DISTANCE_UNIT,
          targetUnit
        );
        await this.setCapabilityOptions("meter_car_odo", {
          units: targetUnit,
        });
        await this.setCapabilityValue("meter_car_odo", convertedOdometer);
      }

      if (
        telemetry.gpsHeading !== undefined &&
        this.hasCapability("measure_location_heading")
      ) {
        await this.setCapabilityValue(
          "measure_location_heading",
          telemetry.gpsHeading
        );
      }

      // Battery Health
      if (
        telemetry.packVoltage !== undefined &&
        this.hasCapability("measure_battery_voltage")
      ) {
        await this.setCapabilityValue(
          "measure_battery_voltage",
          telemetry.packVoltage
        );
      }

      if (
        telemetry.packCurrent !== undefined &&
        this.hasCapability("measure_battery_current")
      ) {
        await this.setCapabilityValue(
          "measure_battery_current",
          telemetry.packCurrent
        );
      }

      if (
        telemetry.moduleTempMin !== undefined &&
        this.hasCapability("measure_battery_temp_min")
      ) {
        await this.setCapabilityValue(
          "measure_battery_temp_min",
          telemetry.moduleTempMin
        );
      }

      if (
        telemetry.moduleTempMax !== undefined &&
        this.hasCapability("measure_battery_temp_max")
      ) {
        await this.setCapabilityValue(
          "measure_battery_temp_max",
          telemetry.moduleTempMax
        );
      }

      // Log connectivity if available
      if (telemetry.connectivity) {
        this.log(
          `Telemetry connectivity: ${telemetry.connectivity.status}`,
          telemetry.connectivity
        );
      }

      // Log alerts if present
      if (telemetry.alerts && telemetry.alerts.length > 0) {
        this.log(
          `Vehicle alerts: ${telemetry.alerts.map((a) => a.name).join(", ")}`
        );
      }
    } catch (error: any) {
      this.error("Error updating device from telemetry:", error);
    }
  }

  /**
   * Get the user's preferred distance unit
   */
  private _getDistanceUnit(): DistanceUnit {
    return (this.getSetting("odometer_unit") as DistanceUnit) || "km";
  }

  /**
   * Convert Tesla API distance value (always in miles) to user's preferred unit
   */
  private _convertDistance(valueInMiles: number): number {
    return DistanceConverter.fromMiles(valueInMiles, this._getDistanceUnit());
  }

  /**
   * Update distance capability units and convert existing values
   */
  private async _updateDistanceUnits(
    oldUnit?: DistanceUnit,
    newUnit?: DistanceUnit
  ): Promise<void> {
    const targetUnit = newUnit || this._getDistanceUnit();

    this.log(
      `Updating distance units to: ${targetUnit} (was: ${oldUnit || "unknown"})`
    );

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
    const currentOptions = this.getCapabilityOptions(capabilityId);
    const currentUnitInHomey =
      (currentOptions?.units as DistanceUnit) || TESLA_API_DISTANCE_UNIT;

    // Convert existing value if units changed and we have a valid value
    let convertedValue = currentValue;
    if (
      currentValue !== null &&
      currentValue !== undefined &&
      oldUnit &&
      oldUnit !== newUnit
    ) {
      convertedValue = DistanceConverter.convert(
        currentValue,
        oldUnit,
        newUnit
      );
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

    const distanceFormatText = unit === "mi" ? "Miles (mi)" : "Kilometers (km)";
    const temperatureFormatText = "Celsius (°C)"; // Tesla always uses Celsius internally

    try {
      await this.setSettings({
        distance_format_display: distanceFormatText,
        temperature_format_display: temperatureFormatText,
      });
    } catch (error) {
      this.error("Failed to update display settings:", error);
    }
  }

  async updateDevice(data: GetStateResponse) {
    console.log(JSON.stringify(data, null, 2));

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
      const targetUnit = this._getDistanceUnit();
      const convertedOdometer = DistanceConverter.convert(
        data.vehicle_state.odometer,
        TESLA_API_DISTANCE_UNIT,
        targetUnit
      );
      await this.setCapabilityOptions("meter_car_odo", {
        units: targetUnit,
      });
      await this.setCapabilityValue("meter_car_odo", convertedOdometer);
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
      const targetUnit = this._getDistanceUnit();
      const convertedRange = DistanceConverter.convert(
        data.charge_state.est_battery_range,
        TESLA_API_DISTANCE_UNIT,
        targetUnit
      );

      await this.setCapabilityOptions("measure_soc_range_estimated", {
        units: targetUnit,
      });
      await this.setCapabilityValue(
        "measure_soc_range_estimated",
        convertedRange
      );
    }

    if (
      this.hasCapability("measure_soc_range_ideal") &&
      data.charge_state?.ideal_battery_range
    ) {
      const targetUnit = this._getDistanceUnit();
      const convertedRange = DistanceConverter.convert(
        data.charge_state.ideal_battery_range,
        TESLA_API_DISTANCE_UNIT,
        targetUnit
      );

      await this.setCapabilityOptions("measure_soc_range_ideal", {
        units: targetUnit,
      });
      await this.setCapabilityValue("measure_soc_range_ideal", convertedRange);
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
