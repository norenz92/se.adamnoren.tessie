'use strict';

const Homey = require('homey');
const TessieClient = require('../../lib/tessie-client');

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes for Phase 1

class VehicleDevice extends Homey.Device {

  async onInit() {
    const vin = this.getData().id;
    const token = this.getStoreValue('token');
    this.client = new TessieClient(token);

    this.registerCapabilityListener('locked', async (value) => {
      // Phase 1: read-only display. Lock/unlock implemented in Phase 3.
      throw new Error('Control not yet available');
    });

    // Initial data fetch
    await this.refreshState();

    // Set up periodic polling
    this.pollInterval = this.homey.setInterval(
      () => this.refreshState(),
      POLL_INTERVAL_MS,
    );

    this.log('Vehicle device initialized:', vin);
  }

  async refreshState() {
    try {
      const state = await this.client.getVehicle(this.getData().id);

      if (state.charge_state?.battery_level != null) {
        await this.setCapabilityValue('measure_battery', state.charge_state.battery_level);
      }
      if (state.vehicle_state?.locked != null) {
        await this.setCapabilityValue('locked', state.vehicle_state.locked);
      }

      await this.setAvailable();
    } catch (err) {
      this.error('Failed to refresh vehicle state:', err.message);
      await this.setUnavailable('Unable to reach Tessie API');
    }
  }

  async onDeleted() {
    if (this.pollInterval) {
      this.homey.clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.log('Vehicle device deleted:', this.getData().id);
  }

}

module.exports = VehicleDevice;
