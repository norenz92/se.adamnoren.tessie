'use strict';

module.exports = {
  async getBatteryStatus({ homey, query }) {
    try {
      const deviceInstanceId = query.deviceId;

      const driver = await homey.drivers.getDriver('car');
      const devices = driver.getDevices();
      const selectedDeviceId = devices.find(device => device.getId() === deviceInstanceId)

      const deviceData = selectedDeviceId.getData();
      
      if (!deviceData) {
        return {
          success: false,
          error: 'Device ID not provided'
        };
      }

      // Access the app instance from global scope
      const app = global.__tessieApp;
      
      if (!app || !app.getWidgetBatteryStatus) {
        console.log('App not available, __tessieApp:', !!app);
        return {
          success: false,
          error: 'App not available'
        };
      }

      const result = await homey.app.getWidgetBatteryStatus(deviceData);
      return result;
    } catch (error) {
      console.log('Error getting battery status:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
};
