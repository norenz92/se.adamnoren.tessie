/**
 * Polling Handler
 * Manages device state polling interval
 */

import getTessieSDK from "../../../tessie/sdk/index";
import { GetStateResponse } from "../../../tessie/sdk/types";
import Homey from "homey";

const POLL_INTERVAL = 30 * 1000; // 30 seconds

/**
 * Handler for device state polling
 */
export class PollingHandler {
  private device: Homey.Device;
  private logger: any;
  private timeout: NodeJS.Timeout | null = null;
  private onStateUpdate: ((state: GetStateResponse) => Promise<void>) | null =
    null;

  constructor(device: Homey.Device, logger: any) {
    this.device = device;
    this.logger = logger;
  }

  /**
   * Set callback for when state is updated
   */
  setStateUpdateCallback(
    callback: (state: GetStateResponse) => Promise<void>
  ): void {
    this.onStateUpdate = callback;
  }

  /**
   * Authenticate with access token
   */
  private _auth(): void {
    const accessToken = this.device.getData().accessToken;

    if (!accessToken) {
      throw new Error("Access token is missing");
    }

    getTessieSDK().setAccessToken(accessToken);
  }

  /**
   * Get vehicle state via API
   */
  private async getState(): Promise<void> {
    try {
      this._auth();
      const state = await getTessieSDK().getState({
        vin: this.device.getData().id,
      });

      if (this.onStateUpdate) {
        await this.onStateUpdate(state);
      }
    } catch (error) {
      this.logger(`Failed to get state: ${error}`);
    }
  }

  /**
   * Start polling for state updates
   */
  async start(): Promise<void> {
    this.logger("Starting polling...");
    await this.getState();
    this.timeout = setInterval(() => {
      this.getState();
    }, POLL_INTERVAL);
  }

  /**
   * Stop polling for state updates
   */
  async stop(): Promise<void> {
    this.logger("Stopping polling...");
    if (this.timeout) {
      clearInterval(this.timeout);
      this.timeout = null;
    }
  }
}
