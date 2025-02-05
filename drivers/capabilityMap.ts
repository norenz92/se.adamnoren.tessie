import { RealtimeData } from "../tessie/realtime";
import { Action, Capability, Condition, Trigger } from "./types";
import tessie from "@api/tessie";

type CapabilityMap = {
  capability: Capability;
  capability_id: string;
  api_key?: string;
  realtime_key?: string;
  transformData?: (value: any) => any;
  transformRealtimeData?: (value: RealtimeData) => any;
  setter?: (value: any, access_token: string, vin: string) => Promise<any>;
  triggers?: Trigger[];
  actions?: Action[];
  conditions?: Condition[];
  type?: "distance" | "temperature" | "chargerate" | "pressure" | "speed";
};

export const capabilites: CapabilityMap[] = [
  {
    capability_id: "measure_battery",
    api_key: "last_state.charge_state.usable_battery_level",
    capability: {
      type: "number",
      uiComponent: "battery",
      title: "Battery Level",
      insights: true,
      getable: true,
      setable: false,
      icon: "/assets/icon.svg",
    },
    realtime_key: "BatteryLevel",
    transformRealtimeData: (value) =>
      "stringValue" in value.value
        ? Number(value.value.stringValue)
        : value.value,
  },
  {
    capability_id: "measure_minutes_to_full_charge",
    api_key: "last_state.charge_state.minutes_to_full_charge",
    capability: {
      type: "number",
      uiComponent: "sensor",
      title: "Minutes to Full Charge",
      insights: true,
      getable: true,
      setable: false,
      icon: "/drivers/car/assets/hourglass-split.svg",
      units: "minutes",
    },
    realtime_key: "TimeToFullCharge",
    transformRealtimeData: (value) =>
      "stringValue" in value.value
        ? Number(value.value.stringValue) * 60
        : value.value,
  },
  {
    capability_id: "measure_charging",
    api_key: "last_state.charge_state.charging_state",
    capability: {
      type: "boolean",
      uiComponent: "button",
      setable: true,
      getable: true,
      title: "Charging",
      icon: "/drivers/car/assets/battery-charging.svg",
    },
    realtime_key: "DetailedChargeState",
    transformRealtimeData: (value) => {
      if ("detailedChargeStateValue" in value.value) {
        switch (value.value.detailedChargeStateValue) {
          case "DetailedChargeStateCharging":
          case "DetailedChargeStateStarting":
            return true;
          default:
            return false;
        }
      }
    },
    setter: async (value, access_token, vin) => {
      tessie.auth(access_token);
      if (value) {
        await tessie.startCharging({
          vin,
          wait_for_completion: true,
        });
      } else {
        await tessie.stopCharging({
          vin,
          wait_for_completion: true,
        });
      }
    },
    transformData(value) {
      switch (value) {
        case "Charging":
        case "Starting":
          return true;
        default:
          return false;
      }
    },
    actions: [
      {
        id: "start_charging",
        title: "Start Charging",
        hint: "Start charging the vehicle",
        action: async (args, state, vin, access_token) => {
          tessie.auth(access_token);
          return await tessie.startCharging({
            vin,
            wait_for_completion: true,
          });
        },
      },
      {
        id: "stop_charging",
        title: "Stop Charging",
        hint: "Stop charging the vehicle",
        action: async (args, state, vin, access_token) => {
          tessie.auth(access_token);
          return await tessie.stopCharging({
            vin,
            wait_for_completion: true,
          });
        },
      },
    ],
  },
  {
    capability_id: "measure_charge_current_request",
    api_key: "last_state.charge_state.charge_current_request",
    capability: {
      type: "number",
      uiComponent: "sensor",
      title: "Current Charging Amps",
      insights: true,
      getable: true,
      setable: true,
      icon: "/drivers/car/assets/battery-charging.svg",
      units: "A",
    },
    realtime_key: "ChargeCurrentRequest",
    transformRealtimeData: (value) =>
      "intValue" in value.value ? Number(value.value.intValue) : value.value,
    setter: async (value, access_token, vin) => {
      tessie.auth(access_token);
      await tessie.setChargingAmps({
        vin,
        wait_for_completion: true,
        amps: value,
      });
    },
    actions: [
      {
        id: "set_charge_current_request",
        title: "Set Charging Current",
        hint: "Set the charging current in Amperes",
        action: async (args, state, vin, access_token) => {
          tessie.auth(access_token);
          return await tessie.setChargingAmps({
            vin,
            wait_for_completion: true,
            amps: args.amps,
          });
        },
        args: [
          {
            name: "amps",
            type: "number",
            min: 0,
            max: 16,
            step: 1,
            title: "Charging Current (A)",
            titleFormatted: "Set Charging Current to [[amps]]A",
            placeholder: "0A-16A",
          },
        ],
      },
    ],
  },

  // Range
  {
    capability_id: "measure_battery_range",
    api_key: "last_state.charge_state.battery_range",
    capability: {
      type: "number",
      uiComponent: "sensor",
      title: "Estimated Range",
      insights: true,
      getable: true,
      setable: false,
      icon: "/drivers/car/assets/geo-fill.svg",
    },
    type: "distance",
    realtime_key: "RatedRange",
    transformRealtimeData: (value) =>
      "stringValue" in value.value
        ? roundedToFixed(Number(value.value.stringValue), 1)
        : value.value,
  },
  {
    capability_id: "measure_est_battery_range",
    api_key: "last_state.charge_state.est_battery_range",
    capability: {
      type: "number",
      uiComponent: "sensor",
      title: "Estimated Range",
      insights: true,
      getable: true,
      setable: false,
      icon: "/drivers/car/assets/geo-fill.svg",
    },
    type: "distance",
    realtime_key: "RatedRange",
    transformRealtimeData: (value) =>
      "doubleValue" in value.value
        ? roundedToFixed(Number(value.value.doubleValue), 1)
        : value.value,
  },

  // Climate
  {
    capability_id: "measure_temperature_inside",
    api_key: "last_state.climate_state.inside_temp",
    capability: {
      type: "number",
      uiComponent: "sensor",
      title: "Inside Temperature",
      insights: true,
      getable: true,
      setable: false,
      icon: "/drivers/car/assets/thermometer-half.svg",
    },
    type: "temperature",
    realtime_key: "InsideTemp",
    transformRealtimeData: (value) =>
      "doubleValue" in value.value
        ? roundedToFixed(Number(value.value.doubleValue), 1)
        : value.value,
  },
  {
    capability_id: "measure_temperature_outside",
    api_key: "last_state.climate_state.outside_temp",
    capability: {
      type: "number",
      uiComponent: "sensor",
      title: "Outside Temperature",
      insights: true,
      getable: true,
      setable: false,
      icon: "/drivers/car/assets/thermometer-half.svg",
    },
    type: "temperature",
    realtime_key: "OutsideTemp",
    transformRealtimeData: (value) =>
      "doubleValue" in value.value
        ? roundedToFixed(Number(value.value.doubleValue), 1)
        : value.value,
  },
  {
    capability_id: "climate_control",
    api_key: "last_state.climate_state.is_climate_on",
    capability: {
      type: "boolean",
      uiComponent: "toggle",
      setable: true,
      getable: true,
      title: "Climate Control",
      icon: "/drivers/car/assets/thermometer-half.svg",
    },
    realtime_key: "HvacPower",
    transformRealtimeData: (value) =>
      "hvacPowerValue" in value.value
        ? value.value.hvacPowerValue === "HvacPowerStateOn"
        : value.value,
    setter: async (value, access_token, vin) => {
      tessie.auth(access_token);
      if (value) {
        await tessie.startClimate({
          vin,
          wait_for_completion: true,
        });
      } else {
        await tessie.stopClimate({
          vin,
          wait_for_completion: true,
        });
      }
    },
    actions: [
      {
        id: "start_climate",
        title: "Start Climate",
        hint: "Start climate control",
        action: async (args, state, vin, access_token) => {
          tessie.auth(access_token);

          if (args.climate_temperature) {
            await tessie.setTemperatures({
              vin,
              wait_for_completion: true,
              temperature: args.climate_temperature,
            });
          }

          return await tessie.startClimate({
            vin,
            wait_for_completion: true,
          });
        },
        args: [
          {
            name: "climate_temperature",
            type: "number",
            min: 15,
            max: 28,
            step: 1,
            title: "Temperature",
            titleFormatted: "Start Climate at [[climate_temperature]]°C",
            placeholder: "15°C-28°C",
            required: false,
          },
        ],
      },
      {
        id: "stop_climate",
        title: "Stop Climate",
        hint: "Stop climate control",
        action: async (args, state, vin, access_token) => {
          tessie.auth(access_token);
          return await tessie.stopClimate({
            vin,
            wait_for_completion: true,
          });
        },
      },
    ],
  },

  // Location/speed
  /* {
    capability_id: "measure_speed",
    api_key: "last_state.drive_state.speed",
    capability: {
      type: "number",
      uiComponent: "sensor",
      title: "Speed",
      insights: true,
      getable: true,
      setable: false,
      icon: "/drivers/car/assets/speedometer2.svg",
    },
    type: "speed",
    transformData: (value: number | null) => value ?? 0,
    realtime_key: "VehicleSpeed",
    transformRealtimeData: (value) =>
      "stringValue" in value.value
        ? roundedToFixed(Number(value.value.stringValue), 1)
        : value.value,
  }, */
];

function roundedToFixed(input: number, digits: number) {
  var rounder = Math.pow(10, digits);
  return Number((Math.round(input * rounder) / rounder).toFixed(digits));
}
