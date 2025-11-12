/**
 * Tessie SDK Client
 * Fully typed client for Tessie API with comprehensive endpoint coverage
 */

import {
  ApiResponse,
  BatteryStatus,
  ChargesResponse,
  ChargeState,
  CommandResponse,
  Drive,
  DrivesResponse,
  GetChargesParams,
  GetDrivesParams,
  GetStateResponse,
  GetVehicleStateParams,
  GetVehiclesResponse,
  Location,
  SetChargingAmpsParams,
  SetChargeLimit,
  SetTemperatures,
  VehicleData,
  VehicleStatus,
  WaitForCompletion,
} from './types';

export class TessieSDK {
  private baseUrl = 'https://api.tessie.com';
  private accessToken: string | null = null;

  /**
   * Initialize SDK with access token
   */
  setAccessToken(token: string): void {
    this.accessToken = token;
  }

  /**
   * Internal method to make HTTP requests
   */
  private async request<T>(
    method: string,
    endpoint: string,
    params?: Record<string, any>,
    body?: Record<string, any>
  ): Promise<T> {
    if (!this.accessToken) {
      throw new Error('Access token not set. Call setAccessToken() first.');
    }

    const url = new URL(`${this.baseUrl}${endpoint}`);

    // Add query parameters
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const options: RequestInit = {
      method,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url.toString(), options);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API Error ${response.status}: ${error}`);
    }

    return (await response.json()) as T;
  }

  // ==================== Vehicle Data Endpoints ====================

  /**
   * Get all vehicles
   * Returns complete vehicle state for all vehicles in the account
   */
  async getVehicles(): Promise<GetVehiclesResponse> {
    return this.request<GetVehiclesResponse>('GET', '/vehicles');
  }

  /**
   * Get vehicle state
   * Returns complete state of a specific vehicle
   */
  async getState(params: GetVehicleStateParams): Promise<GetStateResponse> {
    const queryParams: Record<string, any> = {};
    if (params.use_cache !== undefined) {
      queryParams.use_cache = params.use_cache;
    }

    return this.request<GetStateResponse>(
      'GET',
      `/${params.vin}/state`,
      queryParams
    );
  }

  /**
   * Get vehicle status
   * Check if vehicle is asleep, waiting to sleep, or awake
   */
  async getStatus(vin: string): Promise<VehicleStatus> {
    return this.request<VehicleStatus>('GET', `/${vin}/status`);
  }

  /**
   * Get battery status
   * Retrieve detailed battery information and metrics
   */
  async getBattery(vin: string): Promise<BatteryStatus> {
    return this.request<BatteryStatus>('GET', `/${vin}/battery`);
  }

  /**
   * Get vehicle location
   * Get current GPS coordinates and reverse-geocoded address
   */
  async getLocation(vin: string): Promise<Location> {
    return this.request<Location>('GET', `/${vin}/location`);
  }

  // ==================== History Endpoints ====================

  /**
   * Get driving history
   * Retrieve trip history with optional filtering
   */
  async getDrives(params: GetDrivesParams): Promise<DrivesResponse> {
    const queryParams: Record<string, any> = {};

    if (params.from !== undefined) queryParams.from = params.from;
    if (params.to !== undefined) queryParams.to = params.to;
    if (params.limit !== undefined) queryParams.limit = params.limit;
    if (params.destination_latitude !== undefined) {
      queryParams.destination_latitude = params.destination_latitude;
    }
    if (params.destination_longitude !== undefined) {
      queryParams.destination_longitude = params.destination_longitude;
    }
    if (params.destination_radius !== undefined) {
      queryParams.destination_radius = params.destination_radius;
    }
    if (params.distance_format !== undefined) {
      queryParams.distance_format = params.distance_format;
    }
    if (params.temperature_format !== undefined) {
      queryParams.temperature_format = params.temperature_format;
    }
    if (params.format !== undefined) queryParams.format = params.format;

    return this.request<DrivesResponse>(
      'GET',
      `/${params.vin}/drives`,
      queryParams
    );
  }

  /**
   * Get charging history
   * Retrieve charging session history with optional filtering
   */
  async getCharges(params: GetChargesParams): Promise<ChargesResponse> {
    const queryParams: Record<string, any> = {};

    if (params.superchargers_only !== undefined) {
      queryParams.superchargers_only = params.superchargers_only;
    }
    if (params.origin_latitude !== undefined) {
      queryParams.origin_latitude = params.origin_latitude;
    }
    if (params.origin_longitude !== undefined) {
      queryParams.origin_longitude = params.origin_longitude;
    }
    if (params.origin_radius !== undefined) {
      queryParams.origin_radius = params.origin_radius;
    }
    if (params.minimum_energy_added !== undefined) {
      queryParams.minimum_energy_added = params.minimum_energy_added;
    }
    if (params.limit !== undefined) queryParams.limit = params.limit;
    if (params.format !== undefined) queryParams.format = params.format;

    return this.request<ChargesResponse>(
      'GET',
      `/${params.vin}/charges`,
      queryParams
    );
  }

  // ==================== Vehicle Control Endpoints ====================

  /**
   * Wake vehicle
   * Wake a sleeping vehicle and wait up to 90 seconds for confirmation
   */
  async wake(vin: string): Promise<CommandResponse> {
    return this.request<CommandResponse>('POST', `/${vin}/wake`);
  }

  /**
   * Lock vehicle
   * Lock all vehicle doors
   */
  async lock(vin: string, options?: WaitForCompletion): Promise<CommandResponse> {
    const params = options?.wait_for_completion !== undefined
      ? { wait_for_completion: options.wait_for_completion }
      : undefined;

    return this.request<CommandResponse>('POST', `/${vin}/command/lock`, params);
  }

  /**
   * Unlock vehicle
   * Unlock all vehicle doors
   */
  async unlock(vin: string, options?: WaitForCompletion): Promise<CommandResponse> {
    const params = options?.wait_for_completion !== undefined
      ? { wait_for_completion: options.wait_for_completion }
      : undefined;

    return this.request<CommandResponse>('POST', `/${vin}/command/unlock`, params);
  }

  /**
   * Honk horn
   * Sound the vehicle horn
   */
  async honk(vin: string): Promise<CommandResponse> {
    return this.request<CommandResponse>('POST', `/${vin}/command/honk`);
  }

  /**
   * Flash lights
   * Flash exterior lights
   */
  async flash(vin: string): Promise<CommandResponse> {
    return this.request<CommandResponse>('POST', `/${vin}/command/flash`);
  }

  // ==================== Climate Control ====================

  /**
   * Start climate control
   * Start HVAC and battery preconditioning
   */
  async startClimate(params: { vin: string } & WaitForCompletion): Promise<CommandResponse> {
    const queryParams: Record<string, any> = {};

    if (params.wait_for_completion !== undefined) {
      queryParams.wait_for_completion = params.wait_for_completion;
    }

    return this.request<CommandResponse>('POST', `/${params.vin}/command/start_climate`, queryParams);
  }

  /**
   * Stop climate control
   * Stop HVAC system
   */
  async stopClimate(params: { vin: string } & WaitForCompletion): Promise<CommandResponse> {
    const queryParams: Record<string, any> = {};

    if (params.wait_for_completion !== undefined) {
      queryParams.wait_for_completion = params.wait_for_completion;
    }

    return this.request<CommandResponse>('POST', `/${params.vin}/command/stop_climate`, queryParams);
  }

  /**
   * Set temperatures
   * Set cabin temperature in Celsius (15-28°C range)
   */
  async setTemperatures(params: SetTemperatures & WaitForCompletion): Promise<CommandResponse> {
    const queryParams: Record<string, any> = {
      temperature: params.temperature,
    };

    if (params.wait_for_completion !== undefined) {
      queryParams.wait_for_completion = params.wait_for_completion;
    }

    return this.request<CommandResponse>(
      'POST',
      `/${params.vin}/command/set_temperatures`,
      queryParams
    );
  }

  // ==================== Charging Control ====================

  /**
   * Open charge port
   * Open charge port door or unlock charge cable
   */
  async openChargePort(vin: string): Promise<CommandResponse> {
    return this.request<CommandResponse>('POST', `/${vin}/command/open_charge_port`);
  }

  /**
   * Close charge port
   * Close charge port (only works when unplugged)
   */
  async closeChargePort(vin: string): Promise<CommandResponse> {
    return this.request<CommandResponse>('POST', `/${vin}/command/close_charge_port`);
  }

  /**
   * Start charging
   * Start charging session
   */
  async startCharging(params: { vin: string } & WaitForCompletion): Promise<CommandResponse> {
    const queryParams: Record<string, any> = {};

    if (params.wait_for_completion !== undefined) {
      queryParams.wait_for_completion = params.wait_for_completion;
    }

    return this.request<CommandResponse>('POST', `/${params.vin}/command/start_charging`, queryParams);
  }

  /**
   * Stop charging
   * Stop charging session
   */
  async stopCharging(params: { vin: string } & WaitForCompletion): Promise<CommandResponse> {
    const queryParams: Record<string, any> = {};

    if (params.wait_for_completion !== undefined) {
      queryParams.wait_for_completion = params.wait_for_completion;
    }

    return this.request<CommandResponse>('POST', `/${params.vin}/command/stop_charging`, queryParams);
  }

  /**
   * Set charge limit
   * Set maximum state of charge (50-100%)
   */
  async setChargeLimit(params: SetChargeLimit & WaitForCompletion): Promise<CommandResponse> {
    const queryParams: Record<string, any> = {
      percent: params.percent,
    };

    if (params.wait_for_completion !== undefined) {
      queryParams.wait_for_completion = params.wait_for_completion;
    }

    return this.request<CommandResponse>(
      'POST',
      `/${params.vin}/command/set_charge_limit`,
      queryParams
    );
  }

  /**
   * Set charging amps
   * Set charging current in amps
   */
  async setChargingAmps(params: SetChargingAmpsParams): Promise<CommandResponse> {
    const queryParams: Record<string, any> = {
      amps: params.amps,
    };

    if (params.wait_for_completion !== undefined) {
      queryParams.wait_for_completion = params.wait_for_completion;
    }

    return this.request<CommandResponse>(
      'POST',
      `/${params.vin}/command/set_charging_amps`,
      queryParams
    );
  }
}

// Singleton instance
let tessieSDKInstance: TessieSDK | null = null;

/**
 * Get or create singleton instance of TessieSDK
 */
function getTessieSDK(): TessieSDK {
  if (!tessieSDKInstance) {
    tessieSDKInstance = new TessieSDK();
  }
  return tessieSDKInstance;
}

export default getTessieSDK;
