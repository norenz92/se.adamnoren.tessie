"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.capabilitiesMap = void 0;
const tessie_1 = __importDefault(require("./.api/apis/tessie"));
exports.capabilitiesMap = {
    climate_state_inside_temp: {
        capability_id: "measure_temperature",
        capability: {
            title: "Inside Temperature",
            getable: true,
            setable: false,
            units: "°C",
            uiComponent: "sensor",
            icon: "/assets/icon.svg",
            insights: true,
            type: "number",
            decimals: 1,
        },
        telemetryKey: "InsideTemp",
        telemetryConvert: (value) => "stringValue" in value.value
            ? Number(value.value.stringValue)
            : undefined,
    },
    climate_state_outside_temp: {
        capability_id: "measure_temperature_outside",
        capability: {
            title: "Outside Temperature",
            getable: true,
            setable: false,
            units: "°C",
            uiComponent: "sensor",
            icon: "/assets/icon.svg",
            insights: true,
            type: "number",
            decimals: 1,
        },
        telemetryKey: "OutsideTemp",
        telemetryConvert: (value) => "stringValue" in value.value
            ? Number(value.value.stringValue)
            : undefined,
    },
    climate_state_driver_temp_setting: {
        capability_id: "target_temperature",
        capability: {
            title: "Target Temperature",
            getable: true,
            setable: true,
            units: "°C",
            uiComponent: "thermostat",
            icon: "/assets/icon.svg",
            type: "number",
            min: 16,
            max: 32,
            step: 0.5,
        },
        set: (async (access_token, vin, temperature) => {
            tessie_1.default.auth(access_token);
            const { data, status } = await tessie_1.default.setTemperatures({
                temperature,
                vin,
                wait_for_completion: true,
            });
            if (status !== 200) {
                throw new Error(data?.error
                    ? data.error
                    : `Could not set temperature: ${status}`);
            }
            return true;
        }),
    },
    climate_state_climate_keeper_mode: {
        capability_id: "climate_keeper_mode",
        capability: {
            title: "Climate Keeper Mode",
            getable: true,
            setable: true,
            uiComponent: "picker",
            icon: "/assets/icon.svg",
            type: "enum",
            values: [
                { id: "off", title: "Off" },
                { id: "on", title: "On" },
                { id: "keep", title: "Keep" },
                { id: "dog", title: "Dog" },
                { id: "camp", title: "Camp" },
            ],
        },
        set: (async (access_token, vin, value) => {
            tessie_1.default.auth(access_token);
            const selectedMode = value;
            if (selectedMode === "off") {
                const { data } = await tessie_1.default.stopClimate({
                    vin,
                    wait_for_completion: true,
                });
                if (data.error) {
                    throw new Error(data.error);
                }
                return true;
            }
            const climateModes = {
                off: 0,
                keep: 1,
                dog: 2,
                camp: 3,
            };
            if (selectedMode in climateModes) {
                const mode = climateModes[selectedMode];
                const { data } = await tessie_1.default.setClimateKeeperMode({
                    mode,
                    vin,
                    wait_for_completion: true,
                });
                const { data: startClimateData } = await tessie_1.default.startClimate({
                    vin,
                    wait_for_completion: true,
                });
                if (data.error || startClimateData.error) {
                    const error = data.error || startClimateData.error;
                    throw new Error(error ? error : `Could not set climate keeper mode`);
                }
            }
            return true;
        }),
    },
    climate_state_defrost_mode: {
        capability_id: "defrost",
        capability: {
            title: "Defrost",
            getable: true,
            setable: true,
            uiComponent: "toggle",
            icon: "/assets/icon.svg",
            type: "boolean",
        },
        convert(value) {
            return value === 1;
        },
        set: (async (access_token, vin, defrost) => {
            tessie_1.default.auth(access_token);
            const { data } = defrost
                ? await tessie_1.default.startMaxDefrost({ vin, wait_for_completion: true })
                : await tessie_1.default.stopMaxDefrost({ vin, wait_for_completion: true });
            if (data.error) {
                throw new Error(data.error);
            }
            return true;
        }),
    },
    climate_state_is_climate_on: {
        capability_id: "climate_on",
        capability: {
            title: "Climate",
            getable: true,
            setable: true,
            uiComponent: "toggle",
            icon: "/assets/icon.svg",
            type: "boolean",
        },
        set: (async (access_token, vin, climate) => {
            tessie_1.default.auth(access_token);
            const { data } = climate
                ? await tessie_1.default.startClimate({ vin, wait_for_completion: true })
                : await tessie_1.default.stopClimate({ vin, wait_for_completion: true });
            if (data.error) {
                throw new Error(data.error);
            }
            return true;
        }),
    },
    climate_state_battery_heater: {
        capability_id: "battery_heater",
        capability: {
            title: "Battery Heater",
            getable: true,
            setable: false,
            uiComponent: "sensor",
            icon: "/assets/icon.svg",
            type: "boolean",
        },
        telemetryKey: "BatteryHeaterOn",
        telemetryConvert: (value) => "stringValue" in value.value
            ? value.value.stringValue === "true"
                ? true
                : false
            : undefined,
    },
    climate_state_bioweapon_mode: {
        capability_id: "bioweapon",
        capability: {
            title: "Bioweapon Mode",
            getable: true,
            setable: true,
            uiComponent: "toggle",
            icon: "/assets/icon.svg",
            type: "boolean",
        },
        set: (async (access_token, vin, value) => {
            tessie_1.default.auth(access_token);
            const { data } = await tessie_1.default.setBioweaponMode({
                vin,
                on: value,
                wait_for_completion: true,
            });
            if (data.error) {
                throw new Error(data.error);
            }
            return true;
        }),
    },
    climate_state_is_preconditioning: {
        capability_id: "preconditioning",
        capability: {
            title: "Preconditioning",
            getable: true,
            setable: false,
            uiComponent: "toggle",
            icon: "/assets/icon.svg",
            type: "boolean",
        },
    },
    // Charge state
    charge_state_battery_level: {
        capability_id: "measure_battery_level",
        capability: {
            title: "Battery Level",
            getable: true,
            setable: false,
            units: "%",
            uiComponent: "battery",
            icon: "/assets/icon.svg",
            type: "number",
        },
        telemetryKey: "Soc",
        telemetryConvert: (value) => "stringValue" in value.value
            ? Number(value.value.stringValue)
            : undefined,
    },
    charge_state_charging_state: {
        capability_id: "measure_charging_state",
        capability: {
            title: "Charging State",
            getable: true,
            setable: false,
            uiComponent: "picker",
            icon: "/assets/icon.svg",
            type: "enum",
            values: [
                { id: "Disconnected", title: "Disconnected" },
                { id: "Charging", title: "Charging" },
                { id: "Complete", title: "Complete" },
            ],
        },
    },
    charge_state_battery_range: {
        capability_id: "measure_battery_range",
        capability: {
            title: "Battery Range",
            getable: true,
            setable: false,
            units: "km",
            uiComponent: "sensor",
            icon: "/assets/icon.svg",
            type: "number",
        },
    },
    // Wake up
    wake_up: {
        capability_id: "wake_up",
        capability: {
            title: "Wake Up",
            getable: false,
            setable: true,
            uiComponent: "button",
            icon: "/assets/icon.svg",
            type: "boolean",
        },
        set: (async (access_token, vin, value) => {
            tessie_1.default.auth(access_token);
            const { data } = await tessie_1.default.wake({ vin });
            if (data.result !== true) {
                throw new Error(data.error ? data.error : "Could not wake up");
            }
            return true;
        }),
    },
    // Lock state
    vehicle_state_locked: {
        capability_id: "locked",
        capability: {
            title: "Locked",
            getable: true,
            setable: true,
            uiComponent: "toggle",
            icon: "/assets/icon.svg",
            type: "boolean",
        },
        telemetryKey: "Locked",
        telemetryConvert: (value) => "stringValue" in value.value
            ? value.value.stringValue === "true"
                ? true
                : false
            : undefined,
        set: (async (access_token, vin, value) => {
            tessie_1.default.auth(access_token);
            const { data } = value
                ? await tessie_1.default.lock({ vin, wait_for_completion: true })
                : await tessie_1.default.unlock({ vin, wait_for_completion: true });
            if (data.error) {
                throw new Error(data.error);
            }
            return true;
        }),
    },
    // Front trunk
    vehicle_state_ft: {
        capability_id: "front_trunk",
        capability: {
            title: "Front Trunk",
            getable: true,
            setable: true,
            uiComponent: "button",
            icon: "/assets/icon.svg",
            type: "boolean",
        },
        convert(value) {
            return value === 1;
        },
        set: (async (access_token, vin, value) => {
            tessie_1.default.auth(access_token);
            if (value) {
                const { data } = await tessie_1.default.activateFrontTrunk({
                    vin,
                    wait_for_completion: true,
                });
                if (data.result !== true) {
                    throw new Error(data.error ? data.error : "Could not open front trunk");
                }
                return true;
            }
            return false;
        }),
    },
    // Rear trunk
    vehicle_state_rt: {
        capability_id: "rear_trunk",
        capability: {
            title: "Rear Trunk",
            getable: true,
            setable: true,
            uiComponent: "toggle",
            icon: "/assets/icon.svg",
            type: "boolean",
        },
        convert(value) {
            return value === 1;
        },
        set: (async (access_token, vin, value) => {
            tessie_1.default.auth(access_token);
            if (value) {
                const { data } = await tessie_1.default.activateRearTrunk({
                    vin,
                    wait_for_completion: true,
                });
                if (data.result !== true) {
                    throw new Error(data.error ? data.error : "Could not open rear trunk");
                }
                return true;
            }
        }),
    },
    // Vent windows
    // TODO
    // Front left seat heater
    climate_state_seat_heater_left: {
        capability_id: "seat_heater_left",
        capability: {
            title: "Front Left Seat Heater",
            getable: true,
            setable: true,
            uiComponent: "picker",
            icon: "/assets/icon.svg",
            type: "enum",
            values: [
                { id: "0", title: "Off" },
                { id: "1", title: "Low" },
                { id: "2", title: "Medium" },
                { id: "3", title: "High" },
            ],
        },
        telemetryKey: "SeatHeaterLeft",
        telemetryConvert: (value) => "stringValue" in value.value ? value.value.stringValue : undefined,
        convert(value) {
            return `${value}`;
        },
        set: (async (access_token, vin, value) => {
            tessie_1.default.auth(access_token);
            const { data } = await tessie_1.default.setSeatHeating({
                vin,
                seat: "front_left",
                level: Number(value),
                wait_for_completion: true,
            });
            if (data.result !== true) {
                throw new Error(data.error ? data.error : "Could not set seat heater");
            }
            return true;
        }),
    },
    // Front right seat heater
    climate_state_seat_heater_right: {
        capability_id: "seat_heater_right",
        capability: {
            title: "Front Right Seat Heater",
            getable: true,
            setable: true,
            uiComponent: "picker",
            icon: "/assets/icon.svg",
            type: "enum",
            values: [
                { id: "0", title: "Off" },
                { id: "1", title: "Low" },
                { id: "2", title: "Medium" },
                { id: "3", title: "High" },
            ],
        },
        telemetryKey: "SeatHeaterRight",
        telemetryConvert: (value) => "stringValue" in value.value ? value.value.stringValue : undefined,
        convert(value) {
            return `${value}`;
        },
        set: (async (access_token, vin, value) => {
            tessie_1.default.auth(access_token);
            const { data } = await tessie_1.default.setSeatHeating({
                vin,
                seat: "front_right",
                level: Number(value),
                wait_for_completion: true,
            });
            if (data.result !== true) {
                throw new Error(data.error ? data.error : "Could not set seat heater");
            }
            return true;
        }),
    },
    // Rear left seat heater
    climate_state_seat_heater_rear_left: {
        capability_id: "seat_heater_rear_left",
        capability: {
            title: "Rear Left Seat Heater",
            getable: true,
            setable: true,
            uiComponent: "picker",
            icon: "/assets/icon.svg",
            type: "enum",
            values: [
                { id: "0", title: "Off" },
                { id: "1", title: "Low" },
                { id: "2", title: "Medium" },
                { id: "3", title: "High" },
            ],
        },
        telemetryKey: "SeatHeaterRearLeft",
        telemetryConvert: (value) => "stringValue" in value.value ? value.value.stringValue : undefined,
        convert(value) {
            return `${value}`;
        },
        set: (async (access_token, vin, value) => {
            tessie_1.default.auth(access_token);
            const { data } = await tessie_1.default.setSeatHeating({
                vin,
                seat: "rear_lefta",
                level: Number(value),
                wait_for_completion: true,
            });
            if (data.result !== true) {
                throw new Error(data.error ? data.error : "Could not set seat heater");
            }
            return true;
        }),
    },
    // Rear right seat heater
    climate_state_seat_heater_rear_right: {
        capability_id: "seat_heater_rear_right",
        capability: {
            title: "Rear Right Seat Heater",
            getable: true,
            setable: true,
            uiComponent: "picker",
            icon: "/assets/icon.svg",
            type: "enum",
            values: [
                { id: "0", title: "Off" },
                { id: "1", title: "Low" },
                { id: "2", title: "Medium" },
                { id: "3", title: "High" },
            ],
        },
        telemetryKey: "SeatHeaterRearRight",
        telemetryConvert: (value) => "stringValue" in value.value ? value.value.stringValue : undefined,
        convert(value) {
            return `${value}`;
        },
        set: (async (access_token, vin, value) => {
            tessie_1.default.auth(access_token);
            const { data } = await tessie_1.default.setSeatHeating({
                vin,
                seat: "rear_right",
                level: Number(value),
                wait_for_completion: true,
            });
            if (data.result !== true) {
                throw new Error(data.error ? data.error : "Could not set seat heater");
            }
            return true;
        }),
    },
    // Rear middle seat heater
    climate_state_seat_heater_rear_center: {
        capability_id: "seat_heater_rear_center",
        capability: {
            title: "Rear Middle Seat Heater",
            getable: true,
            setable: true,
            uiComponent: "picker",
            icon: "/assets/icon.svg",
            type: "enum",
            values: [
                { id: "0", title: "Off" },
                { id: "1", title: "Low" },
                { id: "2", title: "Medium" },
                { id: "3", title: "High" },
            ],
        },
        telemetryKey: "SeatHeaterRearCenter",
        telemetryConvert: (value) => "stringValue" in value.value ? value.value.stringValue : undefined,
        convert(value) {
            return `${value}`;
        },
        set: (async (access_token, vin, value) => {
            tessie_1.default.auth(access_token);
            const { data } = await tessie_1.default.setSeatHeating({
                vin,
                seat: "rear_center",
                level: Number(value),
                wait_for_completion: true,
            });
            if (data.result !== true) {
                throw new Error(data.error ? data.error : "Could not set seat heater");
            }
            return true;
        }),
    },
    // Third row left seat heater
    climate_state_seat_heater_third_row_left: {
        capability_id: "seat_heater_third_row_left",
        capability: {
            title: "Third Row Left Seat Heater",
            getable: true,
            setable: true,
            uiComponent: "picker",
            icon: "/assets/icon.svg",
            type: "enum",
            values: [
                { id: "0", title: "Off" },
                { id: "1", title: "Low" },
                { id: "2", title: "Medium" },
                { id: "3", title: "High" },
            ],
        },
        convert(value) {
            return `${value}`;
        },
        set: (async (access_token, vin, value) => {
            tessie_1.default.auth(access_token);
            const { data } = await tessie_1.default.setSeatHeating({
                vin,
                seat: "third_row_left",
                level: Number(value),
                wait_for_completion: true,
            });
            if (data.result !== true) {
                throw new Error(data.error ? data.error : "Could not set seat heater");
            }
            return true;
        }),
    },
    // Third row right seat heater
    climate_state_seat_heater_third_row_right: {
        capability_id: "seat_heater_third_row_right",
        capability: {
            title: "Third Row Right Seat Heater",
            getable: true,
            setable: true,
            uiComponent: "picker",
            icon: "/assets/icon.svg",
            type: "enum",
            values: [
                { id: "0", title: "Off" },
                { id: "1", title: "Low" },
                { id: "2", title: "Medium" },
                { id: "3", title: "High" },
            ],
        },
        convert(value) {
            return `${value}`;
        },
        set: (async (access_token, vin, value) => {
            tessie_1.default.auth(access_token);
            const { data } = await tessie_1.default.setSeatHeating({
                vin,
                seat: "third_row_right",
                level: Number(value),
                wait_for_completion: true,
            });
            if (data.result !== true) {
                throw new Error(data.error ? data.error : "Could not set seat heater");
            }
            return true;
        }),
    },
    // Steering wheel heater
    climate_state_steering_wheel_heater: {
        capability_id: "steering_wheel_heater",
        capability: {
            title: "Steering Wheel Heater",
            getable: true,
            setable: true,
            uiComponent: "toggle",
            icon: "/assets/icon.svg",
            type: "boolean",
        },
        set: (async (access_token, vin, value) => {
            tessie_1.default.auth(access_token);
            const { data } = value
                ? await tessie_1.default.startSteeringWheelHeater({
                    vin,
                    wait_for_completion: true,
                })
                : await tessie_1.default.stopSteeringWheelHeater({
                    vin,
                    wait_for_completion: true,
                });
            if (data.error) {
                throw new Error(data.error);
            }
            return true;
        }),
    },
    // Start/stop charging
    start_stop_charging: {
        capability_id: "start_stop_charging",
        capability: {
            title: "Start/Stop Charging",
            getable: false,
            setable: true,
            uiComponent: "button",
            icon: "/assets/icon.svg",
            type: "boolean",
        },
        set: (async (access_token, vin, value) => {
            tessie_1.default.auth(access_token);
            const { data } = value
                ? await tessie_1.default.startCharging({ vin, wait_for_completion: true })
                : await tessie_1.default.stopCharging({ vin, wait_for_completion: true });
            if (data.error) {
                throw new Error(data.error);
            }
            return true;
        }),
    },
    // Charge limit
    charge_state_charge_limit_soc: {
        capability_id: "charge_limit_soc",
        capability: {
            title: "Charge Limit",
            getable: true,
            setable: true,
            uiComponent: "slider",
            icon: "/assets/icon.svg",
            type: "number",
            min: 50,
            max: 100,
            step: 1,
        },
        set: (async (access_token, vin, value) => {
            tessie_1.default.auth(access_token);
            const { data } = await tessie_1.default.setChargeLimit({
                vin,
                percent: value,
                wait_for_completion: true,
            });
            if (!data.result) {
                throw new Error(data.error ? data.error : "Could not set charge limit");
            }
            return true;
        }),
    },
    // Set charging amps
    charge_state_charge_current_request: {
        capability_id: "charge_current_request",
        capability: {
            title: "Charging Amps",
            getable: true,
            setable: true,
            uiComponent: "slider",
            icon: "/assets/icon.svg",
            type: "number",
            min: 1,
            max: 16,
            step: 1,
        },
        set: (async (access_token, vin, value) => {
            tessie_1.default.auth(access_token);
            const { data } = await tessie_1.default.setChargingAmps({
                vin,
                amps: value,
                wait_for_completion: true,
            });
            if (!data.result) {
                throw new Error(data.error ? data.error : "Could not set charge current");
            }
            return true;
        }),
    },
    // Open/close charge port
    charge_state_charge_port_door_open: {
        capability_id: "charge_port_door_open",
        capability: {
            title: "Charge Port Door",
            getable: true,
            setable: true,
            uiComponent: "toggle",
            icon: "/assets/icon.svg",
            type: "boolean",
        },
        set: (async (access_token, vin, value) => {
            tessie_1.default.auth(access_token);
            const { data } = value
                ? await tessie_1.default.openChargePort({ vin, wait_for_completion: true })
                : await tessie_1.default.closeChargePort({ vin, wait_for_completion: true });
            if (!data.result) {
                throw new Error(data.error
                    ? data.error
                    : "Could not open/close charge port");
            }
            return true;
        }),
    },
};
