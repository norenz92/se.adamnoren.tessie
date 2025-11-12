"use strict";

import Homey from "homey";
import { PairSession } from "homey/lib/Driver";
import getTessieSDK from "../tessie/sdk/index";

export default class TessieDriver extends Homey.Driver {
  async onInit() {
    this.log("TessieDriver has been initialized");
  }

  async onUninit(): Promise<void> {
    this.log("TessieDriver has been uninitialized");
  }

  async onUnpair(session: PairSession, device: Homey.Device): Promise<void> {
    this.log("TessieDriver has been unpaired");
  }

  async onPair(session: PairSession) {
    session.setHandler("list_devices", async () => {
      const accessToken = this.homey.settings.get("accessToken");

      if (!accessToken) {
        throw new Error(
          "No access token found. Please set the access token in the app settings."
        );
      }

      const sdk = getTessieSDK();
      sdk.setAccessToken(accessToken);
      const vehicles = await sdk.getVehicles().catch((error) => {
        this.error(error);
        throw new Error(`Could not get vehicles: ${error}`);
      });

      const devices = vehicles.results?.map((vehicle) => {
        return {
          name: vehicle.last_state?.display_name ?? vehicle.vin,
          data: {
            id: vehicle.vin,
          },
        };
      });

      return devices;
    });
  }
}
