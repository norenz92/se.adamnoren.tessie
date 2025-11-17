import Homey from "homey";
import { GetStateResponse } from "../../tessie/sdk/types";
import { ProcessedTelemetryData } from "../../tessie/telemetry-processor";

// Import handlers
import { DistanceHandler, DistanceUnit } from "./handlers/distance-handler";
import { TelemetryHandler } from "./handlers/telemetry-handler";
import { CapabilityUpdater } from "./handlers/capability-updater";
import { DeviceInitializer } from "./handlers/device-initializer";
import { DeviceFlowsHandler } from "./handlers/device-flows";
import { PollingHandler } from "./handlers/polling-handler";

/**
 * Settings change event type
 */
type SettingsEvent = {
  oldSettings: Record<string, any>;
  newSettings: Record<string, any>;
  changedKeys: string[];
};

/**
 * Tessie Car Device
 * Main device class for Tesla vehicle integration with Homey
 */
module.exports = class CarDevice extends Homey.Device {
  // Handlers
  private distanceHandler!: DistanceHandler;
  private telemetryHandler!: TelemetryHandler;
  private capabilityUpdater!: CapabilityUpdater;
  private deviceInitializer!: DeviceInitializer;
  private flowsHandler!: DeviceFlowsHandler;
  private pollingHandler!: PollingHandler;

  /**
   * Device initialization
   */
  async onInit(): Promise<void> {
    this.log("CarDevice has been initialized");

    // Initialize all handlers
    this.deviceInitializer = new DeviceInitializer(this, this.log.bind(this));
    this.distanceHandler = new DistanceHandler(this, this.log.bind(this));
    this.telemetryHandler = new TelemetryHandler(this, this.log.bind(this));
    this.capabilityUpdater = new CapabilityUpdater(
      this,
      this.log.bind(this),
      this.distanceHandler
    );
    this.flowsHandler = new DeviceFlowsHandler(this, this.log.bind(this));
    this.pollingHandler = new PollingHandler(this, this.log.bind(this));

    // Set up polling callback
    this.pollingHandler.setStateUpdateCallback((state: GetStateResponse) =>
      this.capabilityUpdater.updateFromState(state)
    );

    // Set up telemetry callback
    this.on("telemetry:data", (data: ProcessedTelemetryData) => {
      this.capabilityUpdater.updateFromTelemetry(data);
    });

    // Run initialization sequence
    try {
      if (this.getClass() !== "car") {
        this.log(`Migrating device class from '${this.getClass()}' to 'car'`);
        await this.setClass("car").catch(this.error);
      }

      await this.deviceInitializer.migrateDeviceClass();
      await this.deviceInitializer.updateCapabilities();
      await this.distanceHandler.initializeDistanceUnits();
      await this.distanceHandler.updateDisplaySettings();
      await this.flowsHandler.initializeActions();
      await this.flowsHandler.initializeConditions();
      await this.telemetryHandler.initializeFleetTelemetry();
      await this.pollingHandler.start();

      this.log("Device initialization completed successfully");
    } catch (error) {
      this.error("Device initialization failed:", error);
    }
  }

  /**
   * Device uninitialization
   */
  async onUninit(): Promise<void> {
    this.log("CarDevice has been uninitialized");
    try {
      await this.pollingHandler.stop();
      await this.telemetryHandler.stopTelemetryStream();
    } catch (error) {
      this.error("Error during uninitialization:", error);
    }
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
      setImmediate(async () => {
        await this.distanceHandler.updateDistanceUnits(oldUnit, newUnit);

        // Update display settings after unit change
        setTimeout(async () => {
          try {
            await this.distanceHandler.updateDisplaySettings();
          } catch (error) {
            this.error("Failed to update display settings:", error);
          }
        }, 1000);
      });
    }

    if (event.changedKeys.includes("fleet_telemetry_enabled")) {
      const enabled = event.newSettings.fleet_telemetry_enabled as boolean;
      this.log(`Fleet Telemetry ${enabled ? "enabled" : "disabled"}`);

      // Defer Fleet Telemetry setup to avoid settings conflicts
      setImmediate(async () => {
        try {
          await this.telemetryHandler.configureFleetTelemetry(enabled);
        } catch (error: any) {
          this.error("Failed to configure Fleet Telemetry:", error);
        }
      });
    }
  }
};
