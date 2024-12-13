"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealtimeClient = void 0;
const websocket_1 = require("websocket");
class RealtimeClient extends websocket_1.client {
    constructor(vin, access_token) {
        super();
        this.connected = false;
        this.host = "wss://streaming.tessie.com";
        this.vin = vin;
        this.access_token = access_token;
        this.url = `${this.host}/${this.vin}?access_token=${this.access_token}`;
        this.connect(this.url);
    }
}
exports.RealtimeClient = RealtimeClient;
