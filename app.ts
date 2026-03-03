import * as Homey from 'homey';

class TessieApp extends Homey.App {

  async onInit(): Promise<void> {
    this.log('Tessie app initialized');
  }

}

export = TessieApp;
