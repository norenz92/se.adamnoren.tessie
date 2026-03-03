'use strict';

const Homey = require('homey');

class TessieApp extends Homey.App {

  async onInit() {
    this.log('Tessie app initialized');
  }

}

module.exports = TessieApp;
