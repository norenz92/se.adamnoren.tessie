import TessieApp from "../../TessieApp";
import TessieDevice from "../TessieDevice";
import tessie from "../../.api/apis/tessie";

module.exports = class CarDevice extends TessieDevice {
  async onInit() {
    await super.onInit();

    // this.registerChargeListener();
    // this.registerSetChargeCostAction();
    // this.registerBatteryHealthTrigger();
  }

  async registerChargeListener() {
    const vin = this.getData().id;
    (this.homey.app as TessieApp).tessieApi?.onData(vin, (data) => async () => {
      const lastChargeCreatedAt = this.getStoreValue("lastChargeCreatedAt");

      if (lastChargeCreatedAt !== data.last_charge_created_at) {
        // Get the latest charge

        const createdAt = data.last_charge_created_at;
        const distance_format =
          data.last_state?.gui_settings?.gui_distance_units === "km/hr"
            ? "km"
            : "mi";

        const charges = await tessie.getCharges({
          vin,
          distance_format,
        });

        const lastCharge = charges.data.results?.[0];
        const newChargeTrigger =
          this.homey.flow.getDeviceTriggerCard("new_charge");

        if (lastCharge && lastCharge.createdAt === createdAt) {
          // Update the store
          this.setStoreValue("lastChargeCreatedAt", createdAt);

          // Trigger flow
          newChargeTrigger.trigger(this, {
            id: lastCharge.id,
            started_at: lastCharge.started_at,
            ended_at: lastCharge.ended_at,
            created_at: lastCharge.created_at,
            location: lastCharge.location,
            saved_location: lastCharge.saved_location,
            latitude: lastCharge.latitude,
            longitude: lastCharge.longitude,
            is_supercharger: lastCharge.is_supercharger,
            is_fast_charger: lastCharge.is_fast_charger,
            odometer: lastCharge.odometer,
            energy_added: lastCharge.energy_added,
            energy_used: lastCharge.energy_used,
            miles_added: lastCharge.miles_added,
            miles_added_ideal: lastCharge.miles_added_ideal,
            starting_battery: lastCharge.starting_battery,
            ending_battery: lastCharge.ending_battery,
            cost: lastCharge.cost,
          });
        }
      }
    });
  }

  async registerSetChargeCostAction() {
    const action = this.homey.flow.getActionCard("set_charge_cost");
    action.registerRunListener(async (args, state) => {
      const vin = this.getData().id;
      const { id, cost } = args;

      const accessToken = (this.homey.app as TessieApp).accessToken;

      if (!accessToken) {
        throw new Error("Access token is missing");
      }

      tessie.auth(accessToken);
      await tessie.setChargeCost({
        vin,
        id,
        cost,
      });
    });
  }

  async registerBatteryHealthTrigger() {
    const action = this.homey.flow.getActionCard("get_battery_health");
    action.registerRunListener(async (args, state) => {
      const vin = this.getData().id;
      const accessToken = (this.homey.app as TessieApp).accessToken;

      if (!accessToken) {
        throw new Error("Access token is missing");
      }

      tessie.auth(accessToken);

      const distance_format = this.getSettings().distance_format;

      const { data } = await tessie.getBatteryHealth({
        distance_format,
      });

      // Get the latest battery health that has vin matching the device
      const batteryHealth = data.results?.find((result) => result.vin === vin);

      // Replace any null values with empty strings
      if (batteryHealth) {
        Object.keys(batteryHealth).forEach((key) => {
          if (batteryHealth[key] === null) {
            batteryHealth[key] = "";
          }
        });
      }

      if (batteryHealth) {
        return batteryHealth;
      } else {
        throw new Error("Battery health not found");
      }
    });
  }
};
