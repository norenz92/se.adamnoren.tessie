/**
 * Telemetry Handler
 * Manages Fleet Telemetry configuration and real-time data streaming
 */

import Homey from "homey";
import getTessieSDK from "../../../tessie/sdk/index";
import { ProcessedTelemetryData } from "../../../tessie/telemetry-processor";

/**
 * Handler for Fleet Telemetry initialization, configuration, and streaming
 */
export class TelemetryHandler {
  private device: Homey.Device;
  private logger: any;
  private app: any;
  private telemetryHandler: ((data: ProcessedTelemetryData) => void) | null =
    null;

  constructor(device: Homey.Device, logger: any) {
    this.device = device;
    this.logger = logger;
    this.app = device.homey.app;
  }

  /**
   * Initialize Fleet Telemetry on device startup
   */
  async initializeFleetTelemetry(): Promise<void> {
    try {
      const isEnabled = this.device.getSetting(
        "fleet_telemetry_enabled"
      ) as boolean;
      if (isEnabled !== false) {
        // Default to true if not set
        await this.configureFleetTelemetry(true);
      }
    } catch (error: any) {
      this.logger.error("Failed to initialize Fleet Telemetry:", error);
    }
  }

  /**
   * Configure Fleet Telemetry by setting or removing the configuration
   */
  async configureFleetTelemetry(enabled: boolean): Promise<void> {
    try {
      this._auth();
      const vin = this.device.getData().id;

      if (enabled) {
        this.logger("Configuring Fleet Telemetry with default fields...");

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

        this.logger("Fleet Telemetry configured successfully");

        // Start telemetry stream after configuration
        await this.startTelemetryStream();
      } else {
        this.logger("Disabling Fleet Telemetry...");
        await this.stopTelemetryStream();
        await getTessieSDK().deleteFleetTelemetryConfig(vin);
        this.logger("Fleet Telemetry disabled successfully");
      }
    } catch (error: any) {
      this.logger.error("Error configuring Fleet Telemetry:", error);
      throw error;
    }
  }

  /**
   * Start telemetry stream and attach data handler
   */
  async startTelemetryStream(): Promise<void> {
    try {
      const vin = this.device.getData().id;

      if (!this.app?.tessieApi) {
        this.logger("TessieApi not available, skipping telemetry");
        return;
      }

      this.logger("Starting telemetry stream...");

      // Create telemetry handler if not already created
      if (!this.telemetryHandler) {
        this.telemetryHandler = (data: ProcessedTelemetryData) => {
          this._updateDeviceFromTelemetry(data);
        };
      }

      // Register handler
      this.app.tessieApi.onTelemetry(vin, this.telemetryHandler);

      // Start the actual telemetry stream
      this.app.tessieApi.startTelemetry(vin);

      this.logger("Telemetry stream started successfully");
    } catch (error: any) {
      this.logger.error("Failed to start telemetry stream:", error);
    }
  }

  /**
   * Stop telemetry stream
   */
  async stopTelemetryStream(): Promise<void> {
    try {
      const vin = this.device.getData().id;

      if (!this.app?.tessieApi) {
        return;
      }

      if (this.telemetryHandler) {
        this.app.tessieApi.offTelemetry(vin, this.telemetryHandler);
      }

      this.app.tessieApi.stopTelemetry(vin);
      this.logger("Telemetry stream stopped");
    } catch (error: any) {
      this.logger.error("Failed to stop telemetry stream:", error);
    }
  }

  /**
   * Update device capabilities from real-time telemetry data
   * This is called by the telemetry listener on each update
   */
  private _updateDeviceFromTelemetry(telemetry: ProcessedTelemetryData): void {
    // Delegate to capability updater
    // Note: This will be integrated with the CapabilityUpdater
    this.device.emit("telemetry:data", telemetry);
  }

  /**
   * Authenticate with access token
   */
  private _auth(): void {
    const accessToken = this.device.getData().accessToken;

    if (!accessToken) {
      throw new Error("Access token is missing");
    }

    getTessieSDK().setAccessToken(accessToken);
  }
}
