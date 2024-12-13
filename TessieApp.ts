"use strict";

import Homey from "homey";
import { TessieApi } from "./tessie/api";

export default class TessieApp extends Homey.App {
  /**
   * onInit is called when the app is initialized.
   */

  accessToken: string | null = null;
  tessieApi: TessieApi | null = null;

  async onInit() {
    this.log("TessieApp has been initialized");
    this.initSettingsHandler();
  }

  async initSettingsHandler() {
    const accessToken = this.homey.settings.get("accessToken");
    if (accessToken) {
      this.accessToken = accessToken;
      this.tessieApi?.stop();
      this.tessieApi = new TessieApi(accessToken);
    }

    this.homey.settings.on("set", async (key) => {
      this.log(`Settings changed: ${key}`);
      if (key === "accessToken") {
        const updatedAccessToken = this.homey.settings.get("accessToken");
        if (updatedAccessToken) {
          this.accessToken = updatedAccessToken;
          this.tessieApi?.stop();
          this.tessieApi = new TessieApi(updatedAccessToken);
        }
      }
    });
    this.homey.settings.on("unset", async (key) => {
      this.log(`Settings unset: ${key}`);
    });
  }
}
