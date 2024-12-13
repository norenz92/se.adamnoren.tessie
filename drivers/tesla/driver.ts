"use strict";

import Homey from "homey";
import { PairSession } from "homey/lib/Driver";
import tessie from "../../.api/apis/tessie";

module.exports = class MyDriver extends Homey.Driver {
  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log("MyDriver has been initialized");
  }

  /**
   * onPairListDevices is called when a user is adding a device and the 'list_devices' view is called.
   * This should return an array with the data of devices that are available for pairing.
   */
  /* async onPairListDevices() {
    return [
      // Example device data, note that `store` is optional
      // {
      //   name: 'My Device',
      //   data: {
      //     id: 'my-device',
      //   },
      //   store: {
      //     address: '127.0.0.1',
      //   },
      // },
    ];
  } */

  async onPair(session: PairSession) {
    session.setHandler("list_devices", async () => {
      const accessToken = this.homey.settings.get("accessToken");
      tessie.auth(accessToken);
      const { data } = await tessie.getVehicles().catch((error) => {
        this.error(error);
        throw new Error(`Cound not get vehicles: ${error}`);
      });

      // you can emit when devices are still being searched
      // session.emit("list_devices", devices);

      // return devices when searching is done
      const devices = data.results?.map((vehicle) => {
        return {
          name: vehicle.last_state?.display_name ?? vehicle.vin,
          data: {
            id: vehicle.vin,
          },
        };
      });

      return devices;

      // when no devices are found, return an empty array
      // return [];

      // or throw an Error to show that instead
      // throw new Error('Something bad has occured!');
    });
  }
};
