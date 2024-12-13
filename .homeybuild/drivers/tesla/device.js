"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const homey_1 = __importDefault(require("homey"));
const tessie_1 = __importDefault(require("../../.api/apis/tessie"));
const capabilitiesMap_1 = require("../../capabilitiesMap");
const realtime_1 = require("../../realtime");
module.exports = class Tesla extends homey_1.default.Device {
    constructor() {
        super(...arguments);
        this.poller = null;
        this.realtimeClient = null;
    }
    /**
     * onInit is called when the device is initialized.
     */
    async onInit() {
        this.getState();
        this.log("Tesla has been initialized");
        this.poller = this.pollState();
        Object.keys(capabilitiesMap_1.capabilitiesMap).forEach((key) => {
            const capability = capabilitiesMap_1.capabilitiesMap[key];
            if (capability.set) {
                const vin = this.getData().id;
                this.registerCapabilityListener(capability.capability_id, async (value) => {
                    if (capability.set) {
                        const access_token = this.homey.settings.get("accessToken");
                        await capability.set(access_token, vin, value);
                    }
                });
            }
        });
    }
    /**
     * onAdded is called when the user adds the device, called just after pairing.
     */
    async onAdded() {
        this.log("Tesla has been added");
        this.getState();
    }
    /**
     * onSettings is called when the user updates the device's settings.
     * @param {object} event the onSettings event data
     * @param {object} event.oldSettings The old settings object
     * @param {object} event.newSettings The new settings object
     * @param {string[]} event.changedKeys An array of keys changed since the previous version
     * @returns {Promise<string|void>} return a custom message that will be displayed
     */
    async onSettings({ oldSettings, newSettings, changedKeys, }) {
        this.log("Tesla settings where changed");
        if (changedKeys.includes("telemetryEnabled")) {
            if (newSettings.telemetryEnabled) {
                if (!this.realtimeClient) {
                    this.realtimeClient = new realtime_1.RealtimeClient(this.getData().id, this.homey.settings.get("accessToken"));
                    this.realtimeClient.on("connect", (connection) => {
                        this.log("Realtime connected");
                        connection.on("message", (data) => {
                            if (data.type === "utf8") {
                                const message = JSON.parse(data.utf8Data);
                                this.log("Realtime data", JSON.stringify(message));
                            }
                        });
                        connection.on("close", () => {
                            this.log("Realtime closed");
                        });
                        connection.on("error", (error) => {
                            this.error("Realtime connection error:", error);
                        });
                        connection.on("ping", () => {
                            this.log("Realtime ping");
                        });
                    });
                }
            }
            else {
                if (this.realtimeClient) {
                    this.realtimeClient = null;
                }
            }
        }
    }
    /**
     * onRenamed is called when the user updates the device's name.
     * This method can be used this to synchronise the name to the device.
     * @param {string} name The new name
     */
    async onRenamed(name) {
        this.log("Tesla was renamed");
    }
    async onUninit() {
        if (this.poller) {
            clearInterval(this.poller);
        }
        if (this.realtimeClient) {
            this.realtimeClient.removeAllListeners();
            this.realtimeClient = null;
        }
    }
    /**
     * onDeleted is called when the user deleted the device.
     */
    async onDeleted() {
        this.log("Tesla has been deleted");
        if (this.poller) {
            clearInterval(this.poller);
        }
        if (this.realtimeClient) {
            this.realtimeClient.removeAllListeners();
            this.realtimeClient = null;
        }
    }
    pollState() {
        // Poll the state every 30 seconds
        return setInterval(async () => {
            await this.getState();
        }, 30000);
    }
    handleRealtimeData(data) {
        if (Array.isArray(data.data)) {
            data.data.forEach((message) => {
                if ("key" in message) {
                    const capability = Object.values(capabilitiesMap_1.capabilitiesMap).find((capability) => capability.telemetryKey === message.key);
                    const invalid = "value" in message && "invalid" in message.value;
                    if (capability?.capability &&
                        capability.telemetryConvert &&
                        !invalid) {
                        const value = capability.telemetryConvert(message);
                        this.log("Setting capability from telemetry", capability.capability_id, value);
                        this.setCapabilityValue(capability.capability_id, value).catch((error) => {
                            this.error(error);
                        });
                    }
                }
            });
        }
    }
    async getState() {
        console.log("Realtime listners", this.realtimeClient?.listenerCount("connect"));
        const accessToken = this.homey.settings.get("accessToken");
        if (!accessToken) {
            this.error("No access token");
            return;
        }
        const vehicleId = this.getData().id;
        if (!vehicleId) {
            this.error("No vehicle id");
            return;
        }
        tessie_1.default.auth(accessToken);
        const { data } = await tessie_1.default
            .getState({
            use_cache: true,
            vin: vehicleId,
        })
            .catch((error) => {
            this.error(error);
            throw new Error(`Cound not get vehicle: ${error}`);
        });
        if (data.error) {
            this.error(data.error);
        }
        const { telemetryEnabled } = this.getSettings();
        if (telemetryEnabled) {
            if (!this.realtimeClient) {
                this.realtimeClient = new realtime_1.RealtimeClient(vehicleId, accessToken);
                this.realtimeClient.on("connect", (connection) => {
                    this.log("Realtime connected");
                    connection.on("message", (data) => {
                        if (data.type === "utf8") {
                            const message = JSON.parse(data.utf8Data);
                            this.log("Realtime data", JSON.stringify(message, null, 2));
                            this.handleRealtimeData(message);
                        }
                    });
                });
            }
        }
        else {
            // Stop realtime client if telemetry is disabled or if it's already running
            if (this.realtimeClient) {
                this.realtimeClient = null;
            }
        }
        const flattenedData = flattenObject(data);
        Object.keys(flattenedData).forEach((key) => {
            if (!capabilitiesMap_1.capabilitiesMap[key]) {
                return;
            }
            const capability = capabilitiesMap_1.capabilitiesMap[key];
            const value = capability.convert?.(flattenedData[key]) ?? flattenedData[key];
            if (!this.hasCapability(capability.capability_id)) {
                this.log("Adding capability", capability.capability_id);
                this.addCapability(capability.capability_id).catch((error) => {
                    this.error(error);
                });
            }
            this.setCapabilityValue(capability.capability_id, value).catch((error) => {
                this.error(error);
                if (error instanceof Error) {
                    if (error.message.includes("Invalid Capability")) {
                        // Ignore unmapped capabilities
                    }
                    else {
                        this.error(error);
                    }
                }
                else {
                    this.error(error);
                }
            });
        }, this);
        return data;
    }
};
const flattenObject = (obj) => {
    let resultObj = {};
    for (const i in obj) {
        if (typeof obj[i] === "object" && !Array.isArray(obj[i])) {
            // Recursively invoking the funtion
            // until the object gets flatten
            const tempObj = flattenObject(obj[i]);
            for (const j in tempObj) {
                resultObj[i + "_" + j] = tempObj[j];
            }
        }
        else {
            resultObj[i] = obj[i];
        }
    }
    return resultObj;
};
