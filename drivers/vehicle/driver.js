'use strict';

const Homey = require('homey');
const TessieClient = require('../../lib/tessie-client');

// Map car_type to human-readable model name for the pairing list description.
const CAR_TYPE_TO_MODEL = {
  'models': 'Model S',
  'modelx': 'Model X',
  'model3': 'Model 3',
  'modely': 'Model Y',
  'cybertruck': 'Cybertruck',
};

// Map car_type to icon path. Unknown types fall back to default.
const ICON_MAP = {
  'models': '/drivers/vehicle/assets/icons/model_s.svg',
  'modelx': '/drivers/vehicle/assets/icons/model_x.svg',
  'model3': '/drivers/vehicle/assets/icons/model_3.svg',
  'modely': '/drivers/vehicle/assets/icons/model_y.svg',
  'cybertruck': '/drivers/vehicle/assets/icons/cybertruck.svg',
};

class VehicleDriver extends Homey.Driver {

  async onPair(session) {
    let token = null;
    let vehicles = [];

    session.setHandler('validate_token', async (inputToken) => {
      const client = new TessieClient(inputToken);
      vehicles = await client.getVehicles(); // throws on invalid token
      token = inputToken;
      return true;
    });

    session.setHandler('list_devices', async () => {
      // Duplicate VIN detection: filter out already-paired vehicles
      const pairedVins = new Set(this.getDevices().map(d => d.getData().id));

      return vehicles
        .filter(v => !pairedVins.has(v.vin))
        .map(v => {
          const carType = v.last_state?.vehicle_config?.car_type;
          const displayName = v.last_state?.display_name || `Tesla ${v.vin.slice(-4)}`;
          const modelName = CAR_TYPE_TO_MODEL[carType] || 'Tesla';
          const lastFourVin = v.vin.slice(-4);
          return {
            name: displayName,
            // Per locked decision: list shows display name, model, and last 4 of VIN.
            // The name field is used as the Homey device name (user can rename later).
            // The description field is shown below the name in the Homey list_devices
            // pairing template, providing model and VIN context at a glance.
            description: `${modelName} \u00b7 ${lastFourVin}`,
            data: { id: v.vin },
            store: { token },
            icon: ICON_MAP[carType] || undefined, // undefined = use default driver icon
          };
        });
    });
  }

  async onRepair(session, device) {
    session.setHandler('validate_token', async (inputToken) => {
      const client = new TessieClient(inputToken);
      const vehicles = await client.getVehicles();
      const found = vehicles.find(v => v.vin === device.getData().id);
      if (!found) {
        throw new Error('Vehicle not found with this token. Make sure you are using a token from the correct Tessie account.');
      }
      await device.setStoreValue('token', inputToken);
      // Reinitialize the device client with new token
      device.client = new TessieClient(inputToken);
      await device.refreshState();
      return true;
    });
  }

}

module.exports = VehicleDriver;
