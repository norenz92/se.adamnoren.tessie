/**
 * Tessie SDK Types
 * Fully typed interfaces for all Tessie API endpoints based on official API documentation
 */

// Vehicle State Types
export interface DriveState {
  latitude: number;
  longitude: number;
  heading: number;
  speed: number | null;
  shift_state: string | null;
  power: number;
}

export interface ChargeState {
  battery_level: number;
  battery_range: number;
  ideal_battery_range: number;
  charging_state: string;
  charge_limit_soc: number;
  charger_power: number;
  charge_rate: number;
  minutes_to_full_charge: number;
  energy_remaining: number;
  phantom_drain_percent: number;
  // Extended charging properties
  charge_amps?: number;
  charger_actual_current?: number;
  charge_energy_added?: number;
  charger_phases?: number;
  charger_voltage?: number;
  est_battery_range?: number;
  usable_battery_level?: number;
}

export interface ClimateState {
  inside_temp: number;
  outside_temp: number;
  is_climate_on: boolean;
  driver_temp_setting: number;
  passenger_temp_setting: number;
}

export interface VehicleState {
  locked: boolean;
  sentry_mode: boolean;
  odometer: number;
  car_version: string;
  windows_open?: boolean;
  doors_open?: boolean;
}

export interface VehicleData {
  id: number;
  vin: string;
  id_s: string;
  color: string;
  state: string;
  user_id: number;
  in_service: boolean;
  vehicle_id: number;
  access_type: string;
  api_version: number;
  drive_state: DriveState;
  charge_state: ChargeState;
  climate_state: ClimateState;
  vehicle_state: VehicleState;
  display_name?: string;
  last_state?: VehicleData;
}

export interface GetVehiclesResponse {
  results: VehicleData[];
}

export interface GetStateResponse {
  id: number;
  vin: string;
  id_s: string;
  color: string;
  state: string;
  user_id: number;
  in_service: boolean;
  vehicle_id: number;
  access_type: string;
  api_version: number;
  drive_state: DriveState;
  charge_state: ChargeState;
  climate_state: ClimateState;
  vehicle_state: VehicleState;
  display_name?: string;
}

export type GetStateResponse200 = GetStateResponse;

// Vehicle Status
export interface VehicleStatus {
  status: "asleep" | "waiting_for_sleep" | "awake";
}

// Battery Status
export interface BatteryStatus {
  timestamp: number;
  battery_level: number;
  battery_range: number;
  ideal_battery_range: number;
  phantom_drain_percent: number;
  energy_remaining: number;
  lifetime_energy_used: number;
  pack_current: number;
  pack_voltage: number;
  module_temp_min: number;
  module_temp_max: number;
}

// Location
export interface Location {
  latitude: number;
  longitude: number;
  address: string;
  saved_location?: string;
}

// Drive History
export interface Drive {
  id: number;
  started_at: number;
  ended_at: number;
  starting_location: string;
  starting_latitude: number;
  starting_longitude: number;
  ending_location: string;
  ending_latitude: number;
  ending_longitude: number;
  starting_battery: number;
  ending_battery: number;
  average_inside_temperature: number;
  average_outside_temperature: number;
  average_speed: number;
  max_speed: number;
  rated_range_used: number;
  odometer_distance: number;
  energy_used: number;
  tag?: string;
}

export interface DrivesResponse {
  results: Drive[];
}

// Charging History
export interface Charge {
  id: number;
  started_at: number;
  ended_at: number;
  location: string;
  latitude: number;
  longitude: number;
  is_supercharger: boolean;
  odometer: number;
  energy_added: number;
  energy_used: number;
  miles_added: number;
  miles_added_ideal: number;
  starting_battery: number;
  ending_battery: number;
  cost: number;
}

export interface ChargesResponse {
  results: Charge[];
}

// Command Response
export interface CommandResponse {
  result: boolean;
}

// API Request/Response Types
export interface ApiResponse<T> {
  data: T;
  status: number;
}

export interface ApiErrorResponse {
  error: string;
  status: number;
}

// Query Parameters
export interface GetVehicleStateParams {
  vin: string;
  use_cache?: boolean;
}

export interface GetDrivesParams {
  vin: string;
  from?: number;
  to?: number;
  limit?: number;
  destination_latitude?: number;
  destination_longitude?: number;
  destination_radius?: number;
  distance_format?: "mi" | "km";
  temperature_format?: "f" | "c";
  format?: "json" | "csv";
}

export interface GetChargesParams {
  vin: string;
  superchargers_only?: boolean;
  origin_latitude?: number;
  origin_longitude?: number;
  origin_radius?: number;
  minimum_energy_added?: number;
  limit?: number;
  format?: "json" | "csv";
}

export interface SetChargingAmpsParams {
  vin: string;
  amps: number;
  wait_for_completion?: boolean;
}

export interface SetChargeLimit {
  vin: string;
  percent: number;
}

export interface SetTemperatures {
  vin: string;
  temperature: number;
}

export interface WaitForCompletion {
  wait_for_completion?: boolean;
}

// Fleet Telemetry Configuration
export interface FleetTelemetryField {
  interval_seconds: number;
}

export interface FleetTelemetryConfig {
  fields: {
    [key: string]: FleetTelemetryField;
  };
}

export interface FleetTelemetryConfigResponse {
  synced: boolean;
  config: {
    hostname: string;
    ca: string;
    exp: number;
    port: number;
    fields: {
      [key: string]: FleetTelemetryField;
    };
    alert_types: string[];
  };
  update_available: boolean;
}

export interface SetFleetTelemetryConfigParams {
  vin: string;
  fields?: {
    [key: string]: FleetTelemetryField;
  };
}
