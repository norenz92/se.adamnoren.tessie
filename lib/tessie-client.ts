import https from 'node:https';
import type { IncomingMessage } from 'node:http';

// Commands with wait_for_completion and /wake can take up to ~90s on Tessie's side.
const DEFAULT_TIMEOUT_MS = 30 * 1000;
const COMMAND_TIMEOUT_MS = 120 * 1000;
const CHARGE_HISTORY_DAYS = 90;

class TessieClient {

  token: string;
  baseUrl: string;

  constructor(token: string) {
    this.token = token;
    this.baseUrl = 'api.tessie.com';
  }

  async request(path: string, method: string = 'GET', timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<any> {
    return new Promise((resolveRaw, rejectRaw) => {
      // Settle exactly once, whichever of end/error/close/deadline happens first
      let settled = false;
      let deadline: ReturnType<typeof setTimeout> | null = null;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        if (deadline != null) clearTimeout(deadline);
        fn();
      };
      const resolve = (value: any) => settle(() => resolveRaw(value));
      const reject = (err: Error) => settle(() => rejectRaw(err));

      const options: https.RequestOptions = {
        hostname: this.baseUrl,
        path,
        method,
        timeout: timeoutMs,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Accept': 'application/json',
        },
      };

      const req = https.request(options, (res: IncomingMessage) => {
        res.setEncoding?.('utf8');
        let data = '';
        res.on('data', (chunk: string) => {
          data += chunk;
        });
        res.on('error', reject);
        // A connection dropped mid-body emits 'close' without 'end'
        res.on('close', () => {
          if (res.complete === false) reject(new Error('Tessie API connection closed before response completed'));
        });
        res.on('end', () => {
          if (res.statusCode === 401) {
            reject(new Error('Invalid or expired API token'));
            return;
          }
          if (res.statusCode! >= 400) {
            let detail = '';
            try {
              const body = JSON.parse(data);
              detail = body?.error || body?.message || body?.reason || '';
            } catch (_e) {
              // Non-JSON error body
            }
            reject(new Error(`Tessie API error: ${res.statusCode}${detail ? ` (${detail})` : ''}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('Invalid response from Tessie API'));
          }
        });
      });

      req.on('timeout', () => {
        req.destroy?.(new Error('Tessie API request timed out'));
      });
      req.on('error', reject);
      // Hard overall deadline: the socket idle timeout alone doesn't bound a trickling response
      deadline = setTimeout(() => {
        reject(new Error('Tessie API request timed out'));
        req.destroy?.();
      }, timeoutMs + 5000);
      req.end();
    });
  }

  async getVehicles(): Promise<any[]> {
    const response = await this.request('/vehicles?only_active=true');
    return Array.isArray(response?.results) ? response.results : [];
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
        if (value === undefined || value === null) continue;
        searchParams.set(key, String(value));
      }
    }
    const path = `/${vin}/command/${command}?${searchParams.toString()}`;
    const response = await this.request(path, 'POST', COMMAND_TIMEOUT_MS);
    return response.result === true;
  }

  // Blocks until the vehicle is awake (true) or Tessie gives up after ~90s (false).
  async wake(vin: string): Promise<boolean> {
    const response = await this.request(`/${vin}/wake`, 'POST', COMMAND_TIMEOUT_MS);
    return response.result === true;
  }

  // Recent charging sessions only, to keep the payload bounded for long-time owners.
  async getCharges(vin: string): Promise<any[]> {
    const from = Math.floor(Date.now() / 1000) - CHARGE_HISTORY_DAYS * 24 * 60 * 60;
    const response = await this.request(`/${vin}/charges?from=${from}`);
    return Array.isArray(response?.results) ? response.results : [];
  }

  async getBatteryHealth(vin: string): Promise<any> {
    const response = await this.request('/battery_health');
    const results = response?.results;
    if (!Array.isArray(results)) {
      return null;
    }
    const entry = results.find((r: any) => r.vin === vin);
    return entry || null;
  }

}

export = TessieClient;
