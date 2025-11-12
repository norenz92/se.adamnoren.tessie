import Homey from "homey";
import getTessieSDK from "../../tessie/sdk/index";
import { GetStateResponse } from "../../tessie/sdk/types";
import { Driver } from "homey";

const POLL_INTERVAL = 30 * 1000; // 30 seconds

module.exports = class CarDevice extends Homey.Device {
  private timeout: NodeJS.Timeout | null = null;

  async onInit() {
    // TODO
    this.log("TessieDevice has been initialized");
    await this._updateCapabilities();
    await this._initActions();
    await this._initConditions();
    this.startPolling();
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
      await this.setCapabilityValue(
        "meter_car_odo",
        data.vehicle_state.odometer
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
      await this.setCapabilityValue(
        "measure_soc_range_estimated",
        data.charge_state.est_battery_range
      );
    }

    if (
      this.hasCapability("measure_soc_range_ideal") &&
      data.charge_state?.ideal_battery_range
    ) {
      await this.setCapabilityValue(
        "measure_soc_range_ideal",
        data.charge_state.ideal_battery_range
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
