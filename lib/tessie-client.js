'use strict';

const https = require('node:https');

class TessieClient {

  constructor(token) {
    this.token = token;
    this.baseUrl = 'api.tessie.com';
  }

  async request(path, method = 'GET') {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.baseUrl,
        path,
        method,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Accept': 'application/json',
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode === 401) {
            reject(new Error('Invalid or expired API token'));
            return;
          }
          if (res.statusCode >= 400) {
            reject(new Error(`Tessie API error: ${res.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('Invalid response from Tessie API'));
          }
        });
      });

      req.on('error', reject);
      req.end();
    });
  }

  async getVehicles() {
    const response = await this.request('/vehicles?only_active=true');
    return response.results;
  }

  async getVehicle(vin) {
    return this.request(`/${vin}/state`);
  }

  async getStatus(vin) {
    return this.request(`/${vin}/status`);
  }

}

module.exports = TessieClient;
