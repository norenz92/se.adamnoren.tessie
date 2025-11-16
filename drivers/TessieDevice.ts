import Homey from "homey";
import {
  Realtime,
  RealtimeClient,
  RealtimeDataResponse,
} from "../tessie/realtime";
import TessieApp from "../TessieApp";
import { GetStateResponse } from "../tessie/sdk/types";
import { capabilites } from "./capabilityMap";
import { ArrayElement } from "../tessie/api";

export default class TessieDevice extends Homey.Device {
  realtimeClient: RealtimeClient | undefined;
  isInitialized: boolean = false;

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log(`TessieDevice has been initialized`);
    const vin = this.getData().id;
    (this.homey.app as TessieApp).tessieApi?.onData(vin, (data: any) => {
      this.handleCapabilities(data);
      this.handleUnits(data);
      //this.handleLocation(data);
    });
    this.realtimeClient = (
      this.homey.app as TessieApp
    ).tessieApi?.realtime?.getClient(vin);

    this.realtimeClient?.onData((data: RealtimeDataResponse) => {
      this.handleRealtimeData(data);
    });
  }

  async handleUnits(data: GetStateResponse) {
    const guiSettings = (data as any).gui_settings;
    if (guiSettings) {
      if (guiSettings.gui_distance_units) {
        this.setSettings({
          distance_format:
            guiSettings.gui_distance_units === "km/hr" ? "km" : "mi",
        });
      }
      if (guiSettings.gui_temperature_units) {
        this.setSettings({
          temperature_format: guiSettings.gui_temperature_units.toLowerCase(),
        });
      }
    }
  }

  async handleLocation(data: any) {
    try {
      const state = data.last_state?.drive_state;
      if (state) {
        this.setStoreValue("latitude", state.latitude);
        this.setStoreValue("longitude", state.longitude);
        this.setStoreValue("speed", state.speed ?? 0);
        this.setStoreValue("heading", state.heading);
        this.setStoreValue("timestamp", state.timestamp); // Unix timestamp

        //this.homey.emit(`location-${data.vin}`, state);
      }
    } catch (error) {
      this.error(`Failed to handle location: ${error}`);
    }
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log(`TessieDevice has been added`);
  }

  async handleCapabilities(data: any) {
    const access_token = (this.homey.app as TessieApp).accessToken;
    const vin = this.getData().id;
    if (!access_token) {
      throw new Error("Access token is not set");
    }

    const paths = getDataPaths(data);
    for (const path of paths) {
      const key = Object.keys(path)[0];

      const value = Object.values(path)[0];
      const capability = capabilites.find((c) => c.api_key === key);

      if (capability) {
        if (!this.hasCapability(capability.capability_id)) {
          await this.addCapability(capability.capability_id);

          if (capability?.type) {
            switch (capability.type) {
              case "distance":
                this.setCapabilityOptions(capability.capability_id, {
                  units: {
                    en:
                      data.last_state?.gui_settings?.gui_distance_units ===
                      "km/hr"
                        ? "km"
                        : "mi",
                  },
                });
                break;
              case "temperature":
                this.setCapabilityOptions(capability.capability_id, {
                  units: {
                    en:
                      data.last_state?.gui_settings?.gui_temperature_units ===
                      "C"
                        ? "°C"
                        : "°F",
                  },
                });
                break;
              case "chargerate":
                this.setCapabilityOptions(capability.capability_id, {
                  units: {
                    en: data.last_state?.gui_settings?.gui_charge_rate_units,
                  },
                });
                break;
              case "pressure":
                this.setCapabilityOptions(capability.capability_id, {
                  units: {
                    en: data.last_state?.gui_settings?.gui_tirepressure_units,
                  },
                });
                break;
              case "speed":
                this.setCapabilityOptions(capability.capability_id, {
                  units: {
                    en:
                      data.last_state?.gui_settings?.gui_distance_units ===
                      "km/hr"
                        ? "km/h"
                        : "mph",
                  },
                });
                break;
            }
          }
        }

        if (!this.isInitialized) {
          this.log(`TessieDevice is initializing...`);
          if (capability?.setter) {
            this.log(
              `Registering capability listener for: ${capability.capability_id}`
            );
            this.registerCapabilityListener(
              capability.capability_id,
              async (value) => {
                await capability.setter!(value, access_token, vin).catch(
                  (error) => {
                    this.error(error);
                  }
                );
              }
            );
            this.log(
              `Registered capability listener for: ${capability.capability_id}`
            );
          }

          if (capability?.actions) {
            this.log(`Registering actions for: ${capability.capability_id}`);
            capability.actions.forEach((action) => {
              this.log(`Registering action: ${action.id}`);
              this.homey.flow
                .getActionCard(action.id)
                .registerRunListener(async (args, state) => {
                  return action.action(args, state, vin, access_token);
                });
              this.log(`Registered action: ${action.id}`);
            });
            this.log(`Registered actions for: ${capability.capability_id}`);
          }

          this.isInitialized = true;
          this.log(`TessieDevice has been initialized`);
        }

        const transformedValue = capability.transformData
          ? capability.transformData(value, this)
          : value;
        this.setCapabilityValue(
          capability.capability_id,
          transformedValue
        ).catch((error) => {
          this.error(`Failed to set capability value: ${error}`);
        });
      }
    }
  }

  async handleRealtimeData(realtimeData: RealtimeDataResponse) {
    const { data } = realtimeData;

    if (Array.isArray(data)) {
      data.forEach((realtimeData) => {
        console.log("Realtime data item: ", realtimeData);
        if ("key" in realtimeData) {
          if ("stringValue" in realtimeData.value) {
            const capability = capabilites.find(
              (c) => c.realtime_key === realtimeData.key
            );
            const value = realtimeData.value.stringValue;

            if (capability && this.hasCapability(capability.capability_id)) {
              const transformedValue = capability.transformRealtimeData
                ? capability.transformRealtimeData(realtimeData, this)
                : value;

              this.setCapabilityValue(
                capability.capability_id,
                transformedValue
              ).catch((error) => {
                this.error(`Failed to set capability value: ${error}`);
              });

              console.log(
                "Updated capability with realtime data",
                capability.capability_id,
                transformedValue
              );
            }
          }
        }
      });
    }
  }

  /**
   * onSettings is called when the user updates the device's settings.
   * @param {object} event the onSettings event data
   * @param {object} event.oldSettings The old settings object
   * @param {object} event.newSettings The new settings object
   * @param {string[]} event.changedKeys An array of keys changed since the previous version
   * @returns {Promise<string|void>} return a custom message that will be displayed
   */
  async onSettings({
    oldSettings,
    newSettings,
    changedKeys,
  }: {
    oldSettings: {
      [key: string]: boolean | string | number | undefined | null;
    };
    newSettings: {
      [key: string]: boolean | string | number | undefined | null;
    };
    changedKeys: string[];
  }): Promise<string | void> {
    this.log(`Settings updated: `, newSettings);
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name: string) {
    this.log(`TessieDevice has been renamed to ${name}`);
  }

  async onUninit(): Promise<void> {
    this.log(`TessieDevice has been uninitialized`);
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log(`TessieDevice has been deleted`);
  }
}

// Go through JSON data and return all paths as a string, for example: { foo: { bar: 1 }, dee: 1, test: { hello: {data: 2}} }  would return [{"foo.bar": 1}, {"dee": 1}, {"test.hello.data": 2}]
function getDataPaths(data: any): { [key: string]: any }[] {
  const paths: { [key: string]: any }[] = [];

  function recurse(current: any, path: string) {
    for (const key in current) {
      const value = current[key];
      const newPath = path ? `${path}.${key}` : key;
      if (value && typeof value === "object") {
        recurse(value, newPath);
      } else {
        paths.push({ [newPath]: value });
      }
    }
  }

  recurse(data, "");

  return paths;
}
