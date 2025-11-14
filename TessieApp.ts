"use strict";

import Homey from "homey";
import { TessieApi } from "./tessie/api";
import getTessieSDK from "./tessie/sdk/index";

export default class TessieApp extends Homey.App {
  /**
   * onInit is called when the app is initialized.
   */

  accessToken: string | null = null;
  tessieApi: TessieApi | null = null;

  async onInit() {
    this.log("TessieApp has been initialized");
    this.initSettingsHandler();
    // Make app instance available globally for widget APIs
    (global as any).__tessieApp = this;
  }

  // Widget API method - get battery status
  async getWidgetBatteryStatus(deviceData: { [key: string]: any }) {
    try {
      const driver = this.homey.drivers.getDriver("car");
      const device = driver.getDevice(deviceData);
      if (!device) {
        return { success: false, error: "Device not found" };
      }

      const rangeUnit = device.getSetting("odometer_unit") || "mi";

      const capabilities = device.getCapabilities();
      capabilities.forEach((capability) => {
        console.log(
          `Capability: ${capability}`,
          device.getCapabilityValue(capability)
        );
      });

      // Return an object mapping capability IDs to their values
      return {
        success: true,
        range_unit: rangeUnit,
        measure_battery: device.getCapabilityValue("measure_battery") || 0,
        measure_charge_limit_soc: device.getCapabilityValue(
          "measure_charge_limit_soc"
        ),
        measure_soc_range_estimated: device.getCapabilityValue(
          "measure_soc_range_estimated"
        ),
        measure_charge_power:
          device.getCapabilityValue("measure_charge_power") || 0,
        charging_on: device.getCapabilityValue("charging_on"),
        measure_charge_minutes_to_full_charge:
          device.getCapabilityValue("measure_charge_minutes_to_full_charge") ||
          0,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // Widget API method - get climate status
  async getWidgetClimateStatus(deviceData: { [key: string]: any }) {
    try {
      const driver = this.homey.drivers.getDriver("car");
      const device = driver.getDevice(deviceData);
      if (!device) {
        return { success: false, error: "Device not found" };
      }

      return {
        success: true,
        insideTemp: device.getCapabilityValue("measure_climate_temperature_in"),
        outsideTemp: device.getCapabilityValue(
          "measure_climate_temperature_out"
        ),
        isClimateOn: device.getCapabilityValue("climate_on") || false,
        driverTempSetting:
          device.getCapabilityValue("climate_driver_temperature_setpoint") ||
          20,
        minAvailTemp: 16,
        maxAvailTemp: 32,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // Widget API method - start climate
  async startClimate(deviceData: { [key: string]: any }) {
    const vin = deviceData.vin;
    const driver = this.homey.drivers.getDriver("car");
    const device = driver.getDevice(deviceData);
    
    if (!device) {
      return { success: false, error: "Device not found" };
    }

    const access_token = device.getStoreValue("access_token");
    if (!access_token) {
      return { success: false, error: "Access token not found" };
    }

    // Update tessieApi with new access token if needed
    if (!this.tessieApi) {
      this.tessieApi = new TessieApi(access_token);
    }

    return await this.tessieApi.startClimate(vin);
  }

  // Widget API method - stop climate
  async stopClimate(deviceData: { [key: string]: any }) {
    const vin = deviceData.vin;
    const driver = this.homey.drivers.getDriver("car");
    const device = driver.getDevice(deviceData);
    
    if (!device) {
      return { success: false, error: "Device not found" };
    }

    const access_token = device.getStoreValue("access_token");
    if (!access_token) {
      return { success: false, error: "Access token not found" };
    }

    // Update tessieApi with new access token if needed
    if (!this.tessieApi) {
      this.tessieApi = new TessieApi(access_token);
    }

    return await this.tessieApi.stopClimate(vin);
  }

  // Widget API method - set climate temperature
  async setClimateTemperature(deviceData: { [key: string]: any }, temperature: number) {
    const vin = deviceData.vin;
    const driver = this.homey.drivers.getDriver("car");
    const device = driver.getDevice(deviceData);
    
    if (!device) {
      return { success: false, error: "Device not found" };
    }

    const access_token = device.getStoreValue("access_token");
    if (!access_token) {
      return { success: false, error: "Access token not found" };
    }

    // Update tessieApi with new access token if needed
    if (!this.tessieApi) {
      this.tessieApi = new TessieApi(access_token);
    }

    return await this.tessieApi.setClimateTemperature(vin, temperature);
  }

  // Widget API method - get location
  async getWidgetLocation(deviceData: { [key: string]: any }) {
    try {
      const driver = this.homey.drivers.getDriver("car");
      const device = driver.getDevice(deviceData);
      if (!device) {
        return { success: false, error: "Device not found" };
      }

      const latitude =
        device.getCapabilityValue("measure_location_latitude") || 0;
      const longitude =
        device.getCapabilityValue("measure_location_longitude") || 0;
      const heading =
        device.getCapabilityValue("measure_location_heading") ||
        device.getStoreValue("heading") ||
        0;
      const speed = device.getStoreValue("speed") || 0;

      return {
        success: true,
        latitude,
        longitude,
        heading,
        speed,
        location: `${latitude?.toFixed(4) || "N/A"}, ${
          longitude?.toFixed(4) || "N/A"
        }`,
        mapUrl: `https://maps.apple.com/?q=${latitude || 0},${longitude || 0}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // Widget API method - get actions
  async getWidgetActions(deviceId: string) {
    try {
      const driver = this.homey.drivers.getDriver("car");
      const devices = driver.getDevices();
      const device = devices.find((d: any) => d.id === deviceId);

      if (!device) {
        return { success: false, error: "Device not found" };
      }

      return {
        success: true,
        locked: device.getCapabilityValue("locked") || false,
        sentryMode: device.getStoreValue("sentryMode") || false,
        chargeState: device.getStoreValue("chargeState") || "disconnected",
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // Widget API method - get trip
  async getWidgetTrip(deviceData: { [key: string]: any }) {
    try {
      const driver = this.homey.drivers.getDriver("car");
      const device = driver.getDevice(deviceData);
      if (!device) {
        return { success: false, error: "Device not found" };
      }

      // Get the VIN from device data
      const vin = deviceData.id;

      try {
        // Try to fetch the latest drive from the Tessie API
        const response = await getTessieSDK().getDrives({
          vin: vin,
          limit: 1,
        });

        if (response?.results && response.results.length > 0) {
          const drive = response.results[0];
          const rangeUnit = device.getSetting("odometer_unit") || "mi";

          // Convert distance values based on user's preference
          const distanceConverter = (miles: number) => {
            return rangeUnit === "km" ? miles * 1.60934 : miles;
          };

          return {
            success: true,
            started_at: drive.started_at,
            ended_at: drive.ended_at,
            starting_location: drive.starting_location || "Unknown",
            ending_location: drive.ending_location || "Unknown",
            starting_battery: drive.starting_battery,
            ending_battery: drive.ending_battery,
            average_speed: drive.average_speed,
            max_speed: drive.max_speed,
            distance: distanceConverter(drive.odometer_distance),
            distance_unit: rangeUnit,
            energy_used: drive.energy_used,
            rated_range_used: distanceConverter(drive.rated_range_used),
            average_inside_temp: drive.average_inside_temperature,
            average_outside_temp: drive.average_outside_temperature,
          };
        }
      } catch (apiError) {
        console.error("Error fetching drives from API:", apiError);
        // Continue with fallback below
      }

      // Fallback: return minimal data or indicate no trips
      return {
        success: true,
        started_at: null,
        ended_at: null,
        starting_location: "N/A",
        ending_location: "N/A",
        starting_battery: 0,
        ending_battery: 0,
        average_speed: 0,
        max_speed: 0,
        distance: 0,
        distance_unit: "km",
        energy_used: 0,
        rated_range_used: 0,
        average_inside_temp: 0,
        average_outside_temp: 0,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async initSettingsHandler() {
    const accessToken = this.homey.settings.get("accessToken");
    if (accessToken) {
      this.accessToken = accessToken;
      this.tessieApi?.stop();
      this.tessieApi = new TessieApi(accessToken);
    }

    this.homey.settings.on("set", async (key) => {
      this.log(`Settings changed: ${key}`);
      if (key === "accessToken") {
        const updatedAccessToken = this.homey.settings.get("accessToken");
        if (updatedAccessToken) {
          this.accessToken = updatedAccessToken;
          this.tessieApi?.stop();
          this.tessieApi = new TessieApi(updatedAccessToken);
        }
      }
    });
    this.homey.settings.on("unset", async (key) => {
      this.log(`Settings unset: ${key}`);
    });
  }
}
