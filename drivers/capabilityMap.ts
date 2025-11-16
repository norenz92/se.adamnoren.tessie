import { RealtimeData } from "../tessie/realtime";
import { Action, Capability, Condition, Trigger } from "./types";
import getTessieSDK from "../tessie/sdk/index";

const MILES_TO_KM_FACTOR = 1.60934;

type CapabilityMap = {
  capability: Capability;
  capability_id: string;
  api_key?: string;
  realtime_key?: string;
  transformData?: (value: any, device?: any) => any;
  transformRealtimeData?: (value: RealtimeData, device?: any) => any;
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
      const sdk = getTessieSDK();
      sdk.setAccessToken(access_token);
      if (value) {
        await sdk.startCharging({
          vin,
          wait_for_completion: true,
        });
      } else {
        await sdk.stopCharging({
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
          const sdk = getTessieSDK();
          sdk.setAccessToken(access_token);
          return await sdk.startCharging({
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
          const sdk = getTessieSDK();
          sdk.setAccessToken(access_token);
          return await sdk.stopCharging({
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
      const sdk = getTessieSDK();
      sdk.setAccessToken(access_token);
      await sdk.setChargingAmps({
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
          const sdk = getTessieSDK();
          sdk.setAccessToken(access_token);
          return await sdk.setChargingAmps({
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
      const sdk = getTessieSDK();
      sdk.setAccessToken(access_token);
      if (value) {
        await sdk.startClimate({
          vin,
          wait_for_completion: true,
        });
      } else {
        await sdk.stopClimate({
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
          const sdk = getTessieSDK();
          sdk.setAccessToken(access_token);

          if (args.climate_temperature) {
            await sdk.setTemperatures({
              vin,
              wait_for_completion: true,
              temperature: args.climate_temperature,
            });
          }

          return await sdk.startClimate({
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
          const sdk = getTessieSDK();
          sdk.setAccessToken(access_token);
          return await sdk.stopClimate({
            vin,
            wait_for_completion: true,
          });
        },
      },
    ],
  },

  // Location/speed
  {
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
    transformData: (value: number | null, device?: any) => {
      if (value === null || value === undefined) return 0;
      // Convert from mph to kmh if user's distance unit is km
      const distanceUnit = device?.getSetting?.("odometer_unit") || "km";
      if (distanceUnit === "km") {
        return roundedToFixed(value * MILES_TO_KM_FACTOR, 1);
      }
      return roundedToFixed(value, 1);
    },
    realtime_key: "VehicleSpeed",
    transformRealtimeData: (value, device?: any) => {
      const numValue =
        "stringValue" in value.value ? Number(value.value.stringValue) : 0;
      // Convert from mph to kmh if user's distance unit is km
      const distanceUnit = device?.getSetting?.("odometer_unit") || "km";
      if (distanceUnit === "km") {
        return roundedToFixed(numValue * MILES_TO_KM_FACTOR, 1);
      }
      return roundedToFixed(numValue, 1);
    },
  },

  // Doors & Security
  {
    capability_id: "car_doors_locked",
    api_key: "last_state.vehicle_state.locked",
    capability: {
      type: "boolean",
      uiComponent: "toggle",
      setable: true,
      getable: true,
      title: "Doors Locked",
    },
    realtime_key: "Locked",
    transformRealtimeData: (value) =>
      "boolValue" in value.value ? value.value.boolValue : value.value,
    setter: async (value, access_token, vin) => {
      const sdk = getTessieSDK();
      sdk.setAccessToken(access_token);
      if (value) {
        await sdk.lock(vin, {
          wait_for_completion: true,
        });
      } else {
        await sdk.unlock(vin, {
          wait_for_completion: true,
        });
      }
    },
    actions: [
      {
        id: "lock_doors",
        title: "Lock Doors",
        hint: "Lock all doors",
        action: async (args, state, vin, access_token) => {
          const sdk = getTessieSDK();
          sdk.setAccessToken(access_token);
          return await sdk.lock(vin, {
            wait_for_completion: true,
          });
        },
      },
      {
        id: "unlock_doors",
        title: "Unlock Doors",
        hint: "Unlock all doors",
        action: async (args, state, vin, access_token) => {
          const sdk = getTessieSDK();
          sdk.setAccessToken(access_token);
          return await sdk.unlock(vin, {
            wait_for_completion: true,
          });
        },
      },
    ],
  },

  // Odometer
  {
    capability_id: "meter_car_odo",
    api_key: "last_state.vehicle_state.odometer",
    capability: {
      type: "number",
      uiComponent: "sensor",
      title: "Odometer",
      insights: true,
      getable: true,
      setable: false,
    },
    type: "distance",
    realtime_key: "Odometer",
    transformRealtimeData: (value) =>
      "doubleValue" in value.value
        ? roundedToFixed(Number(value.value.doubleValue), 1)
        : value.value,
  },

  // Charging Status
  {
    capability_id: "charging_on",
    api_key: "last_state.charge_state.charging_state",
    capability: {
      type: "boolean",
      uiComponent: "sensor",
      setable: false,
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
    transformData(value) {
      switch (value) {
        case "Charging":
        case "Starting":
          return true;
        default:
          return false;
      }
    },
  },

  // Charge Metrics
  {
    capability_id: "measure_charge_current_max",
    api_key: "last_state.charge_state.charge_current_request_max",
    capability: {
      type: "number",
      uiComponent: "sensor",
      title: "Max Charging Current",
      insights: true,
      getable: true,
      setable: false,
      icon: "/drivers/car/assets/battery-charging.svg",
      units: "A",
    },
    realtime_key: "ChargeCurrentRequestMax",
    transformRealtimeData: (value) =>
      "intValue" in value.value ? Number(value.value.intValue) : value.value,
  },

  {
    capability_id: "measure_charge_current",
    api_key: "last_state.charge_state.charger_actual_current",
    capability: {
      type: "number",
      uiComponent: "sensor",
      title: "Charging Current",
      insights: true,
      getable: true,
      setable: false,
      icon: "/drivers/car/assets/battery-charging.svg",
      units: "A",
    },
    realtime_key: "ChargerActualCurrent",
    transformRealtimeData: (value) =>
      "intValue" in value.value ? Number(value.value.intValue) : value.value,
  },

  {
    capability_id: "measure_charge_energy_added",
    api_key: "last_state.charge_state.charge_energy_added",
    capability: {
      type: "number",
      uiComponent: "sensor",
      title: "Energy Added",
      insights: true,
      getable: true,
      setable: false,
      icon: "/drivers/car/assets/battery-charging.svg",
      units: "kWh",
    },
    realtime_key: "ChargeEnergyAdded",
    transformRealtimeData: (value) =>
      "doubleValue" in value.value
        ? roundedToFixed(Number(value.value.doubleValue), 2)
        : value.value,
  },

  {
    capability_id: "measure_charge_limit_soc",
    api_key: "last_state.charge_state.charge_limit_soc",
    capability: {
      type: "number",
      uiComponent: "sensor",
      title: "Charge Limit",
      insights: false,
      getable: true,
      setable: false,
      icon: "/drivers/car/assets/battery-charging.svg",
      units: "%",
      min: 0,
      max: 100,
    },
    realtime_key: "ChargeLimitSoc",
    transformRealtimeData: (value) =>
      "intValue" in value.value ? Number(value.value.intValue) : value.value,
  },

  {
    capability_id: "measure_charge_minutes_to_full_charge",
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
    capability_id: "measure_charge_phases",
    api_key: "last_state.charge_state.charge_phase",
    capability: {
      type: "number",
      uiComponent: "sensor",
      title: "Charge Phases",
      insights: false,
      getable: true,
      setable: false,
      icon: "/drivers/car/assets/battery-charging.svg",
    },
    realtime_key: "ChargePhase",
    transformRealtimeData: (value) =>
      "intValue" in value.value ? Number(value.value.intValue) : value.value,
  },

  {
    capability_id: "measure_charge_power",
    api_key: "last_state.charge_state.charger_power",
    capability: {
      type: "number",
      uiComponent: "sensor",
      title: "Charging Power",
      insights: true,
      getable: true,
      setable: false,
      icon: "/drivers/car/assets/battery-charging.svg",
      units: "kW",
    },
    realtime_key: "ChargerPower",
    transformRealtimeData: (value) =>
      "doubleValue" in value.value
        ? roundedToFixed(Number(value.value.doubleValue), 1)
        : value.value,
  },

  {
    capability_id: "measure_charge_voltage",
    api_key: "last_state.charge_state.charger_voltage",
    capability: {
      type: "number",
      uiComponent: "sensor",
      title: "Charging Voltage",
      insights: true,
      getable: true,
      setable: false,
      icon: "/drivers/car/assets/battery-charging.svg",
      units: "V",
    },
    realtime_key: "ChargerVoltage",
    transformRealtimeData: (value) =>
      "intValue" in value.value ? Number(value.value.intValue) : value.value,
  },

  // Climate Sensors
  {
    capability_id: "measure_climate_temperature_in",
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
    capability_id: "measure_climate_temperature_out",
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

  // Battery & Power
  {
    capability_id: "measure_io_battery_power",
    api_key: "last_state.charge_state.battery_current",
    capability: {
      type: "number",
      uiComponent: "sensor",
      title: "Battery Current",
      insights: true,
      getable: true,
      setable: false,
      icon: "/assets/icon.svg",
      units: "A",
    },
    realtime_key: "BatteryCurrent",
    transformRealtimeData: (value) =>
      "intValue" in value.value ? Number(value.value.intValue) : value.value,
  },

  // Location
  {
    capability_id: "measure_location_heading",
    api_key: "last_state.drive_state.heading",
    capability: {
      type: "number",
      uiComponent: "sensor",
      title: "Heading",
      insights: false,
      getable: true,
      setable: false,
      units: "°",
      min: 0,
      max: 360,
    },
    realtime_key: "Heading",
    transformRealtimeData: (value) =>
      "intValue" in value.value ? Number(value.value.intValue) : value.value,
  },

  {
    capability_id: "measure_location_latitude",
    api_key: "last_state.drive_state.latitude",
    capability: {
      type: "number",
      uiComponent: "sensor",
      title: "Latitude",
      insights: false,
      getable: true,
      setable: false,
      icon: "/drivers/car/assets/geo-fill.svg",
    },
    realtime_key: "Latitude",
    transformRealtimeData: (value) =>
      "doubleValue" in value.value
        ? roundedToFixed(Number(value.value.doubleValue), 6)
        : value.value,
  },

  {
    capability_id: "measure_location_longitude",
    api_key: "last_state.drive_state.longitude",
    capability: {
      type: "number",
      uiComponent: "sensor",
      title: "Longitude",
      insights: false,
      getable: true,
      setable: false,
      icon: "/drivers/car/assets/geo-fill.svg",
    },
    realtime_key: "Longitude",
    transformRealtimeData: (value) =>
      "doubleValue" in value.value
        ? roundedToFixed(Number(value.value.doubleValue), 6)
        : value.value,
  },

  // State of Charge
  {
    capability_id: "measure_soc_level",
    api_key: "last_state.charge_state.battery_level",
    capability: {
      type: "number",
      uiComponent: "battery",
      title: "Battery Level",
      insights: true,
      getable: true,
      setable: false,
      icon: "/assets/icon.svg",
      units: "%",
      min: 0,
      max: 100,
    },
    realtime_key: "BatteryLevel",
    transformRealtimeData: (value) =>
      "stringValue" in value.value
        ? Number(value.value.stringValue)
        : value.value,
  },

  {
    capability_id: "measure_soc_range_estimated",
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

  {
    capability_id: "measure_soc_range_ideal",
    api_key: "last_state.charge_state.ideal_battery_range",
    capability: {
      type: "number",
      uiComponent: "sensor",
      title: "Ideal Range",
      insights: true,
      getable: true,
      setable: false,
      icon: "/drivers/car/assets/geo-fill.svg",
    },
    type: "distance",
    realtime_key: "IdealRange",
    transformRealtimeData: (value) =>
      "doubleValue" in value.value
        ? roundedToFixed(Number(value.value.doubleValue), 1)
        : value.value,
  },

  {
    capability_id: "measure_soc_usable",
    api_key: "last_state.charge_state.usable_battery_level",
    capability: {
      type: "number",
      uiComponent: "sensor",
      title: "Usable Battery Level",
      insights: true,
      getable: true,
      setable: false,
      icon: "/assets/icon.svg",
      units: "%",
      min: 0,
      max: 100,
    },
    realtime_key: "BatteryLevel",
    transformRealtimeData: (value) =>
      "stringValue" in value.value
        ? Number(value.value.stringValue)
        : value.value,
  },
];

function roundedToFixed(input: number, digits: number) {
  var rounder = Math.pow(10, digits);
  return Number((Math.round(input * rounder) / rounder).toFixed(digits));
}
