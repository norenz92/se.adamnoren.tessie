/**
 * Device Initializer
 * Handles device initialization, capability updates, and migrations
 */

import Homey from "homey";
import getTessieSDK from "../../../tessie/sdk/index";
import { Driver } from "homey";

/**
 * Handler for device initialization and setup
 */
export class DeviceInitializer {
  private device: Homey.Device;
  private logger: any;

  constructor(device: Homey.Device, logger: any) {
    this.device = device;
    this.logger = logger;
  }

  /**
   * Migrate device class from 'other' to 'car' if needed
   */
  async migrateDeviceClass(): Promise<void> {
    if (this.device.getClass() !== "car") {
      this.logger(
        `Migrating device class from '${this.device.getClass()}' to 'car'`
      );
      try {
        await this.device.setClass("car").catch(this.device.error);
      } catch (error) {
        this.device.error("Failed to migrate device class:", error);
      }
    }
  }

  /**
   * Update device capabilities based on manifest
   */
  async updateCapabilities(): Promise<void> {
    let capabilities = [];
    try {
      const driver = this.device.driver;
      const manifest = this.device.homey.app.manifest;

      capabilities = manifest.drivers.filter((e: Driver) => {
        return e.id == driver.id;
      })[0].capabilities;

      // Remove capabilities no longer in manifest
      let deviceCapabilities = this.device.getCapabilities();
      for (let i = 0; i < deviceCapabilities.length; i++) {
        let filter = capabilities.filter((e: string) => {
          return e == deviceCapabilities[i];
        });
        if (filter.length == 0) {
          try {
            await this.device.removeCapability(deviceCapabilities[i]);
          } catch (error) {
            // Ignore error
          }
        }
      }

      // Add missing capabilities
      for (let i = 0; i < capabilities.length; i++) {
        if (!this.device.hasCapability(capabilities[i])) {
          try {
            await this.device.addCapability(capabilities[i]);
          } catch (error) {
            // Ignore error
          }
        }
      }
    } catch (error) {
      this.device.error(error);
    }
  }
}
