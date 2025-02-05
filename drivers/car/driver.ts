"use strict";

import Homey from "homey";
import { PairSession } from "homey/lib/Driver";
import tessie from "../../.api/apis/tessie";

module.exports = class CarDriver extends Homey.Driver {
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
    let accessToken: string | undefined;

    session.setHandler("accessToken", async (data) => {
      console.log(data);
      accessToken = data.accessToken;

      if (!accessToken) {
        throw new Error("No API key provided");
      }

      // Validate key
      tessie.auth(accessToken);
      const { data: vehicles } = await tessie.getVehicles().catch((error) => {
        this.error(error);
        throw new Error(`Could not get vehicles: ${error}`);
      });

      if (vehicles) {
        return true;
      } else {
        return false;
      }

      // return true to continue adding the device if the login succeeded
      // return false to indicate to the user the login attempt failed
      // thrown errors will also be shown to the user
    });

    session.setHandler("list_devices", async () => {
      if (!accessToken) {
        throw new Error(
          "No access token found. Please set the access token in the app settings."
        );
      }

      tessie.auth(accessToken);
      const { data } = await tessie.getVehicles().catch((error) => {
        this.error(error);
        throw new Error(`Cound not get vehicles: ${error}`);
      });

      const devices = data.results?.map((vehicle) => {
        return {
          name: vehicle.last_state?.display_name ?? vehicle.vin,
          data: {
            id: vehicle.vin,
            accessToken,
          },
        };
      });

      return devices;
    });
  }
};
