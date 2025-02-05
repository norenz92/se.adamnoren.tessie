// Create an event emitter for data events

import { EventEmitter } from "events";
import Tessie, { GetVehiclesResponse200 } from "../.api/apis/tessie";
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
    this.startPolling();
  }

  private async getData() {
    try {
      Tessie.auth(this.accessToken);
      const { data, status } = await Tessie.getVehicles().catch((error) => {
        throw new Error(`Cound not get vehicles: ${error}`);
      });

      if (status !== 200) {
        throw new Error(`Failed to get data: ${status}`);
      }

      data.results?.forEach((vehicle) => {
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

  private emitData(
    vin: string,
    data: ArrayElement<GetVehiclesResponse200["results"]>
  ) {
    this.apiEventEmitter.emit(vin, data);
  }

  onData(
    vin: string,
    callback: (data: ArrayElement<GetVehiclesResponse200["results"]>) => void
  ) {
    this.apiEventEmitter.on(vin, callback);
  }
}

export type ArrayElement<A> = A extends readonly (infer T)[] ? T : never;
