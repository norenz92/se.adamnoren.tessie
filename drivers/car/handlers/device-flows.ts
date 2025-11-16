/**
 * Device Flows Handler
 * Manages device actions and conditions for Homey Flows
 */

import getTessieSDK from "../../../tessie/sdk/index";
import Homey from "homey";

/**
 * Handler for device actions and conditions
 */
export class DeviceFlowsHandler {
  private device: Homey.Device;
  private logger: any;

  constructor(device: Homey.Device, logger: any) {
    this.device = device;
    this.logger = logger;
  }

  /**
   * Initialize device actions
   */
  async initializeActions(): Promise<void> {
    this.device.homey.flow
      .getActionCard("charge_current")
      .registerRunListener(async (args, state) => {
        this.sendCommand(async () => {
          await getTessieSDK().setChargingAmps({
            amps: args.current,
            vin: this.device.getData().id,
            wait_for_completion: true,
          });
          await this.device.setCapabilityValue(
            "measure_charge_current_max",
            args.current
          );
        });
      });

    this.device.homey.flow
      .getActionCard("charging_on")
      .registerRunListener(async (args, state) => {
        this.sendCommand(async () => {
          if (args.action === "start") {
            this.logger("Starting charging");
            await getTessieSDK().startCharging({
              vin: this.device.getData().id,
              wait_for_completion: true,
            });
          } else {
            this.logger("Stopping charging");
            await getTessieSDK().stopCharging({
              vin: this.device.getData().id,
              wait_for_completion: true,
            });
          }
          await this.device.setCapabilityValue(
            "charging_on",
            args.action === "start"
          );
        });
      });

    this.device.homey.flow
      .getActionCard("charge_limit")
      .registerRunListener(async (args, state) => {
        this.sendCommand(async () => {
          this.logger("Setting charge limit: ", args.limit);
          await getTessieSDK().setChargeLimit({
            percent: args.limit,
            vin: this.device.getData().id,
            wait_for_completion: true,
          });
          await this.device.setCapabilityValue(
            "measure_charge_limit_soc",
            args.limit
          );
        });
      });
  }

  /**
   * Initialize device conditions
   */
  async initializeConditions(): Promise<void> {
    this.device.homey.flow
      .getConditionCard("charging_state")
      .registerRunListener(async (args, state) => {
        if (args.state == "Connected") {
          return (
            args.device.getCapabilityValue("charging_state") != "Disconnected"
          );
        } else {
          return args.device.getCapabilityValue("charging_state") == args.state;
        }
      });
  }

  /**
   * Send a command with authentication
   */
  private async sendCommand(command: () => Promise<void>): Promise<void> {
    this._auth();
    return await command();
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
}
