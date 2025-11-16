/**
 * Telemetry Data Processor
 * Converts raw Fleet Telemetry data into structured vehicle state updates
 */

import {
  RealtimeData,
  RealtimeAlert,
  RealtimeError,
  RealtimeConnectivity,
  RealtimeDataResponse,
  StringValue,
  LocationValue,
} from "./realtime";

/**
 * Processed telemetry data ready for device capability updates
 */
export interface ProcessedTelemetryData {
  // Battery & Charging
  soc?: number; // State of Charge (%)
  batteryLevel?: number;
  idealBatteryRange?: number;
  estimatedBatteryRange?: number;
  ratedRange?: number;
  energyRemaining?: number;

  // Charging Status
  chargeState?: string;
  acChargingPower?: number;
  dcChargingPower?: number;
  chargeAmps?: number;

  // Location
  latitude?: number;
  longitude?: number;

  // Vehicle State
  odometer?: number;
  gear?: string;
  gpsHeading?: number;

  // Battery Health
  packVoltage?: number;
  packCurrent?: number;
  moduleTempMin?: number;
  moduleTempMax?: number;

  // Energy Metrics
  lifeTimeEnergyUsed?: number;

  // Metadata
  timestamp: Date;
  vin: string;

  // Alert & Connectivity info
  alerts?: RealtimeAlert[];
  connectivity?: RealtimeConnectivity;
  errors?: RealtimeError[];
}

/**
 * Maps telemetry field names to ProcessedTelemetryData properties
 */
const TELEMETRY_FIELD_MAP: Record<string, string> = {
  Soc: "soc",
  BatteryLevel: "batteryLevel",
  IdealBatteryRange: "idealBatteryRange",
  EstBatteryRange: "estimatedBatteryRange",
  RatedRange: "ratedRange",
  EnergyRemaining: "energyRemaining",
  ChargeState: "chargeState",
  ACChargingPower: "acChargingPower",
  DCChargingPower: "dcChargingPower",
  ChargeAmps: "chargeAmps",
  Location: "location", // Special handling
  Odometer: "odometer",
  Gear: "gear",
  GpsHeading: "gpsHeading",
  PackVoltage: "packVoltage",
  PackCurrent: "packCurrent",
  ModuleTempMin: "moduleTempMin",
  ModuleTempMax: "moduleTempMax",
  LifetimeEnergyUsed: "lifeTimeEnergyUsed",
};

/**
 * Convert numeric string to number, handling various formats
 */
function parseNumericValue(value: string): number {
  const parsed = parseFloat(value);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Extract string value from telemetry value object
 */
function extractStringValue(
  value: StringValue | LocationValue | any
): string | null {
  if ("stringValue" in value) {
    return (value as StringValue).stringValue;
  }
  return null;
}

/**
 * Extract location value from telemetry value object
 */
function extractLocationValue(
  value: StringValue | LocationValue | any
): { latitude: number; longitude: number } | null {
  if ("locationValue" in value) {
    return (value as LocationValue).locationValue;
  }
  return null;
}

/**
 * Process raw telemetry data response into structured format
 */
export function processTelemetryData(
  response: RealtimeDataResponse
): ProcessedTelemetryData {
  const processed: ProcessedTelemetryData = {
    timestamp: new Date(response.createdAt),
    vin: response.vin,
  };

  // Handle array of data/alerts/errors
  if (Array.isArray(response.data)) {
    const items = response.data as Array<
      RealtimeData | RealtimeAlert | RealtimeError
    >;

    items.forEach((item) => {
      // Check if it's a RealtimeData (has 'key' and 'value')
      if ("key" in item && "value" in item) {
        const dataItem = item as RealtimeData;
        const key = dataItem.key;
        const mappedKey = TELEMETRY_FIELD_MAP[key];

        if (!mappedKey) {
          // Unknown field, skip
          return;
        }

        // Special handling for Location
        if (key === "Location") {
          const location = extractLocationValue(dataItem.value);
          if (location) {
            processed.latitude = location.latitude;
            processed.longitude = location.longitude;
          }
          return;
        }

        // Handle string values (convert to appropriate types)
        const stringValue = extractStringValue(dataItem.value);
        if (stringValue !== null) {
          if (
            [
              "Soc",
              "BatteryLevel",
              "IdealBatteryRange",
              "EstBatteryRange",
              "RatedRange",
              "EnergyRemaining",
              "ACChargingPower",
              "DCChargingPower",
              "ChargeAmps",
              "Odometer",
              "GpsHeading",
              "PackVoltage",
              "PackCurrent",
              "ModuleTempMin",
              "ModuleTempMax",
              "LifetimeEnergyUsed",
            ].includes(key)
          ) {
            // Numeric fields
            (processed as any)[mappedKey] = parseNumericValue(stringValue);
          } else if (["ChargeState", "Gear"].includes(key)) {
            // String fields
            (processed as any)[mappedKey] = stringValue;
          }
        }
      }
      // Check if it's an alert
      else if ("name" in item && "audiences" in item) {
        if (!processed.alerts) {
          processed.alerts = [];
        }
        processed.alerts.push(item as RealtimeAlert);
      }
      // Check if it's an error
      else if ("name" in item && "tags" in item) {
        if (!processed.errors) {
          processed.errors = [];
        }
        processed.errors.push(item as RealtimeError);
      }
    });
  }
  // Handle single connectivity message
  else if (response.data && "connectionId" in response.data) {
    processed.connectivity = response.data as RealtimeConnectivity;
  }

  return processed;
}

/**
 * Check if connectivity is established
 */
export function isConnected(connectivity?: RealtimeConnectivity): boolean {
  if (!connectivity) return false;
  return connectivity.status === "CONNECTED";
}

/**
 * Check if there are any unresolved alerts
 */
export function hasActiveAlerts(alerts?: RealtimeAlert[]): boolean {
  if (!alerts || alerts.length === 0) return false;
  return alerts.some(
    (alert) =>
      alert.startedAt &&
      (!alert.endedAt || new Date(alert.endedAt) > new Date())
  );
}

/**
 * Get alert summary for logging/display
 */
export function getAlertSummary(alerts?: RealtimeAlert[]): string {
  if (!alerts || alerts.length === 0) return "No alerts";

  const activeAlerts = alerts.filter(
    (alert) =>
      alert.startedAt &&
      (!alert.endedAt || new Date(alert.endedAt) > new Date())
  );

  if (activeAlerts.length === 0) return "No active alerts";

  return `${activeAlerts.length} active alert(s): ${activeAlerts
    .map((a) => a.name)
    .join(", ")}`;
}

/**
 * Get error summary for logging
 */
export function getErrorSummary(errors?: RealtimeError[]): string {
  if (!errors || errors.length === 0) return "No errors";

  return `${errors.length} error(s): ${errors.map((e) => e.name).join(", ")}`;
}
