'use strict';

module.exports = {
  async getLocation({ homey, query }) {
    try {
      const deviceInstanceId = query.deviceId;

      if (!deviceInstanceId) {
        return {
          success: false,
          error: 'Device ID not provided'
        };
      }

      const driver = await homey.drivers.getDriver('car');
      const devices = driver.getDevices();
      const selectedDevice = devices.find(device => device.getId() === deviceInstanceId);

      if (!selectedDevice) {
        console.error('Device not found:', deviceInstanceId);
        return {
          success: false,
          error: 'Device not found'
        };
      }

      const deviceData = selectedDevice.getData();
      
      if (!deviceData) {
        console.error('Device data not available');
        return {
          success: false,
          error: 'Device data not available'
        };
      }

      const app = global.__tessieApp;
      
      if (!app) {
        console.error('App not available in global');
        return {
          success: false,
          error: 'App not available'
        };
      }

      if (!app.getWidgetLocation) {
        console.error('getWidgetLocation method not found');
        return {
          success: false,
          error: 'Location method not available'
        };
      }

      const result = await app.getWidgetLocation(deviceData);
      return result;
    } catch (error) {
      console.error('Error in getLocation:', error);
      return {
        success: false,
        error: error.message || 'Unknown error'
      };
    }
  }
};
