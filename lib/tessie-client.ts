import https from 'node:https';
import type { IncomingMessage } from 'node:http';

class TessieClient {

  token: string;
  baseUrl: string;

  constructor(token: string) {
    this.token = token;
    this.baseUrl = 'api.tessie.com';
  }

  async request(path: string, method: string = 'GET'): Promise<any> {
    return new Promise((resolve, reject) => {
      const options: https.RequestOptions = {
        hostname: this.baseUrl,
        path,
        method,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Accept': 'application/json',
        },
      };

      const req = https.request(options, (res: IncomingMessage) => {
        let data = '';
        res.on('data', (chunk: string) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode === 401) {
            reject(new Error('Invalid or expired API token'));
            return;
          }
          if (res.statusCode! >= 400) {
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

  async getVehicles(): Promise<any[]> {
    const response = await this.request('/vehicles?only_active=true');
    return response.results;
  }

  async getVehicle(vin: string): Promise<any> {
    return this.request(`/${vin}/state`);
  }

  async getStatus(vin: string): Promise<any> {
    return this.request(`/${vin}/status`);
  }

  async command(vin: string, command: string, params?: Record<string, string | number | boolean>): Promise<boolean> {
    const searchParams = new URLSearchParams({ wait_for_completion: 'true' });
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        searchParams.set(key, String(value));
      }
    }
    const path = `/${vin}/command/${command}?${searchParams.toString()}`;
    const response = await this.request(path, 'POST');
    return response.result === true;
  }

  async wake(vin: string): Promise<boolean> {
    const response = await this.request(`/${vin}/wake`, 'POST');
    return response.result === true;
  }

  async getBatteryHealth(vin: string): Promise<any> {
    const response = await this.request('/battery_health');
    const results = response.results;
    if (!Array.isArray(results)) {
      return null;
    }
    const entry = results.find((r: any) => r.vin === vin);
    return entry || null;
  }

}

export = TessieClient;
