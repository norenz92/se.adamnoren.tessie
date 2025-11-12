// Create an event emitter for data events

import { EventEmitter } from "events";
import getTessieSDK from "./sdk/index";
import { VehicleData } from "./sdk/types";
import { Realtime } from "./realtime";

const apiEventEmitter = new EventEmitter();

const POLL_INTERVAL = 30 * 1000; // 30 seconds

export class TessieApi {
  private apiEventEmitter: EventEmitter;
  private accessToken: string;
  private timeout: NodeJS.Timeout | null = null;
  public realtime: Realtime | null = null;

  constructor(access_token: string) {
    console.log("TessieApi initialized");
    this.apiEventEmitter = apiEventEmitter;
    this.accessToken = access_token;
    this.realtime = new Realtime(access_token);
    getTessieSDK().setAccessToken(access_token);
    this.startPolling();
  }

  private async getData() {
    try {
      const sdk = getTessieSDK();
      const vehicles = await sdk.getVehicles().catch((error: any) => {
        throw new Error(`Could not get vehicles: ${error}`);
      });

      vehicles.results?.forEach((vehicle: VehicleData) => {
        if (!vehicle.vin) {
          throw new Error("Vehicle VIN is missing");
        }
        this.emitData(vehicle.vin, vehicle);
      });
    } catch (error) {
      console.error(error);
    }
  }

  // Start polling for data every 30 seconds.
  private async startPolling() {
    await this.getData();
    this.timeout = setInterval(() => {
      this.getData();
    }, POLL_INTERVAL);
  }

  // Stop polling for data.
  private async stopPolling() {
    if (this.timeout) {
      clearInterval(this.timeout);
    }
  }

  stop() {
    this.stopPolling();
  }

  private emitData(vin: string, data: VehicleData) {
    this.apiEventEmitter.emit(vin, data);
  }

  onData(vin: string, callback: (data: VehicleData) => void) {
    this.apiEventEmitter.on(vin, callback);
  }
}

export type ArrayElement<A> = A extends readonly (infer T)[] ? T : never;
