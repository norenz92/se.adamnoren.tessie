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
 * Field type configuration for telemetry processing
 * SINGLE SOURCE OF TRUTH - Edit ONLY this object to add/remove/modify fields
 */
type FieldType = "numeric" | "string" | "boolean" | "location";

interface FieldConfig {
  processedKey: string;
  type: FieldType;
}

/**
 * Telemetry field configuration - EDIT ONLY THIS OBJECT
 * Add/remove fields here - ProcessedTelemetryData is auto-generated from this
 */
const TELEMETRY_FIELDS = {
  // Battery & Charging
  Soc: { processedKey: "soc", type: "numeric" as const },
  BatteryLevel: { processedKey: "batteryLevel", type: "numeric" as const },
  IdealBatteryRange: {
    processedKey: "idealBatteryRange",
    type: "numeric" as const,
  },
  EstBatteryRange: {
    processedKey: "estimatedBatteryRange",
    type: "numeric" as const,
  },
  RatedRange: { processedKey: "ratedRange", type: "numeric" as const },
  EnergyRemaining: {
    processedKey: "energyRemaining",
    type: "numeric" as const,
  },
  ChargeLimitSoc: { processedKey: "chargeLimitSoc", type: "numeric" as const },
  TimeToFullCharge: {
    processedKey: "timeToFullCharge",
    type: "numeric" as const,
  },
  ChargeCurrentRequest: {
    processedKey: "chargeCurrentRequest",
    type: "numeric" as const,
  },
  ChargeCurrentRequestMax: {
    processedKey: "chargeCurrentRequestMax",
    type: "numeric" as const,
  },
  ChargerPhases: { processedKey: "chargerPhases", type: "numeric" as const },
  FastChargerPresent: {
    processedKey: "fastChargerPresent",
    type: "boolean" as const,
  },

  // Charging Status
  ChargeState: { processedKey: "chargeState", type: "string" as const },
  DetailedChargeState: {
    processedKey: "detailedChargeState",
    type: "string" as const,
  },
  ACChargingPower: {
    processedKey: "acChargingPower",
    type: "numeric" as const,
  },
  DCChargingPower: {
    processedKey: "dcChargingPower",
    type: "numeric" as const,
  },
  ChargeAmps: { processedKey: "chargeAmps", type: "numeric" as const },

  // Location
  Location: { processedKey: "location", type: "location" as const },
  GpsHeading: { processedKey: "gpsHeading", type: "numeric" as const },

  // Vehicle State
  Odometer: { processedKey: "odometer", type: "numeric" as const },
  Gear: { processedKey: "gear", type: "string" as const },
  VehicleSpeed: { processedKey: "vehicleSpeed", type: "numeric" as const },
  Locked: { processedKey: "locked", type: "boolean" as const },
  DoorState: { processedKey: "doorState", type: "string" as const },
  FdWindow: { processedKey: "fdWindow", type: "string" as const },
  FpWindow: { processedKey: "fpWindow", type: "string" as const },
  RdWindow: { processedKey: "rdWindow", type: "string" as const },
  RpWindow: { processedKey: "rpWindow", type: "string" as const },
  SentryMode: { processedKey: "sentryMode", type: "string" as const },

  // Climate
  InsideTemp: { processedKey: "insideTemp", type: "numeric" as const },
  OutsideTemp: { processedKey: "outsideTemp", type: "numeric" as const },
  HvacPower: { processedKey: "hvacPower", type: "string" as const },
  HvacACEnabled: { processedKey: "hvacACEnabled", type: "boolean" as const },
  HvacAutoMode: { processedKey: "hvacAutoMode", type: "string" as const },
  HvacFanSpeed: { processedKey: "hvacFanSpeed", type: "numeric" as const },
  HvacLeftTemperatureRequest: {
    processedKey: "hvacLeftTemperatureRequest",
    type: "numeric" as const,
  },
  HvacRightTemperatureRequest: {
    processedKey: "hvacRightTemperatureRequest",
    type: "numeric" as const,
  },
  HvacSteeringWheelHeatLevel: {
    processedKey: "hvacSteeringWheelHeatLevel",
    type: "numeric" as const,
  },

  // Tire Pressure
  TpmsPressureFl: { processedKey: "tpmsPressureFl", type: "numeric" as const },
  TpmsPressureFr: { processedKey: "tpmsPressureFr", type: "numeric" as const },
  TpmsPressureRl: { processedKey: "tpmsPressureRl", type: "numeric" as const },
  TpmsPressureRr: { processedKey: "tpmsPressureRr", type: "numeric" as const },

  // Battery Health
  PackVoltage: { processedKey: "packVoltage", type: "numeric" as const },
  PackCurrent: { processedKey: "packCurrent", type: "numeric" as const },
  ModuleTempMin: { processedKey: "moduleTempMin", type: "numeric" as const },
  ModuleTempMax: { processedKey: "moduleTempMax", type: "numeric" as const },
  BMSState: { processedKey: "bmsState", type: "string" as const },

  // Vehicle Information
  CarType: { processedKey: "carType", type: "string" as const },
  Version: { processedKey: "version", type: "string" as const },

  // Seat Belts & Occupancy
  DriverSeatBelt: {
    processedKey: "driverSeatBelt",
    type: "boolean" as const,
  },
  PassengerSeatBelt: {
    processedKey: "passengerSeatBelt",
    type: "boolean" as const,
  },
  DriverSeatOccupied: {
    processedKey: "driverSeatOccupied",
    type: "boolean" as const,
  },

  // Energy Metrics
  LifetimeEnergyUsed: {
    processedKey: "lifeTimeEnergyUsed",
    type: "numeric" as const,
  },
  LifetimeEnergyGainedRegen: {
    processedKey: "lifeTimeEnergyGainedRegen",
    type: "numeric" as const,
  },

  // Acceleration
  LateralAcceleration: {
    processedKey: "lateralAcceleration",
    type: "numeric" as const,
  },
  LongitudinalAcceleration: {
    processedKey: "longitudinalAcceleration",
    type: "numeric" as const,
  },
} as const;

/**
 * Generate field type map from TELEMETRY_FIELDS
 */
type FieldTypeMap = {
  numeric: number | undefined;
  string: string | undefined;
  boolean: boolean | undefined;
  location: string | undefined;
};

/**
 * Auto-generate ProcessedTelemetryData from TELEMETRY_FIELDS
 */
type GeneratedTelemetryData = {
  [K in keyof typeof TELEMETRY_FIELDS as (typeof TELEMETRY_FIELDS)[K]["processedKey"]]: FieldTypeMap[(typeof TELEMETRY_FIELDS)[K]["type"]];
};

/**
 * Processed telemetry data ready for device capability updates
 * Auto-generated from TELEMETRY_FIELDS - do not edit manually
 */
export interface ProcessedTelemetryData extends GeneratedTelemetryData {
  // Location fields (special handling)
  latitude?: number;
  longitude?: number;

  // Metadata
  timestamp: Date;
  vin: string;

  // Alert & Connectivity info
  alerts?: RealtimeAlert[];
  connectivity?: RealtimeConnectivity;
  errors?: RealtimeError[];
}

/**
 * Build TELEMETRY_FIELD_MAP from TELEMETRY_FIELDS configuration
 * Maps both string field names (InsideTemp) and numeric IDs (85) to processed keys
 */
const TELEMETRY_FIELD_MAP = Object.fromEntries(
  Object.entries(TELEMETRY_FIELDS).map(([key, config]) => [
    key,
    config.processedKey,
  ])
) as Record<string, string>;

/**
 * Map for numeric field IDs from Tesla's proto (e.g., 85 = InsideTemp)
 */
const FIELD_ID_MAP: Record<number, string> = {
  // Battery & Charging
  37: "ACChargingPower",
  42: "BatteryLevel",
  2: "ChargeState",
  179: "DetailedChargeState",
  35: "DCChargingPower",
  158: "EnergyRemaining",
  40: "EstBatteryRange",
  41: "IdealBatteryRange",
  32: "RatedRange",
  38: "ChargeLimitSoc",
  43: "TimeToFullCharge",
  49: "ChargeAmps",
  53: "ChargeCurrentRequest",
  54: "ChargeCurrentRequestMax",
  51: "ChargerPhases",
  39: "FastChargerPresent",

  // Vehicle State & Location
  10: "Gear",
  21: "Location",
  23: "GpsHeading",
  5: "Odometer",
  4: "VehicleSpeed",

  // Climate
  85: "InsideTemp",
  86: "OutsideTemp",
  201: "HvacPower",
  196: "HvacACEnabled",
  197: "HvacAutoMode",
  198: "HvacFanSpeed",
  200: "HvacLeftTemperatureRequest",
  202: "HvacRightTemperatureRequest",
  204: "HvacSteeringWheelHeatLevel",

  // Door/Window/Security
  59: "Locked",
  58: "DoorState",
  60: "FdWindow",
  61: "FpWindow",
  62: "RdWindow",
  63: "RpWindow",
  65: "SentryMode",

  // Tire Pressure
  69: "TpmsPressureFl",
  70: "TpmsPressureFr",
  71: "TpmsPressureRl",
  72: "TpmsPressureRr",

  // Battery Health
  6: "PackVoltage",
  7: "PackCurrent",
  29: "ModuleTempMax",
  31: "ModuleTempMin",
  160: "BMSState",

  // Vehicle Information
  113: "CarType",
  220: "Version",

  // Seat Belts & Occupancy
  94: "DriverSeatBelt",
  95: "PassengerSeatBelt",
  96: "DriverSeatOccupied",

  // Energy Metrics
  102: "LifetimeEnergyUsed",
  134: "LifetimeEnergyGainedRegen",

  // Acceleration
  99: "LongitudinalAcceleration",
  98: "LateralAcceleration",
};

/**
 * Convert numeric string to number, handling various formats
 * Rounds to 1 decimal place for float values
 */
function parseNumericValue(value: string): number {
  const parsed = parseFloat(value);
  if (isNaN(parsed)) return 0;
  // Round to 1 decimal place
  return Math.round(parsed * 10) / 10;
}

/**
 * Extract string value from telemetry value object
 * Handles multiple value formats that Tesla's proto might send
 * Proto Value can be: stringValue, doubleValue, floatValue, intValue, etc.
 */
function extractStringValue(
  value: StringValue | LocationValue | any
): string | null {
  // Standard stringValue format (legacy or explicit)
  if ("stringValue" in value) {
    return (value as StringValue).stringValue;
  }

  // Proto Value message types - both camelCase and snake_case variants
  if ("string_value" in value) {
    return (value as any).string_value;
  }

  if ("int_value" in value) {
    return String((value as any).int_value);
  }
  if ("intValue" in value) {
    return String((value as any).intValue);
  }

  if ("long_value" in value) {
    return String((value as any).long_value);
  }
  if ("longValue" in value) {
    return String((value as any).longValue);
  }

  if ("float_value" in value) {
    return String((value as any).float_value);
  }
  if ("floatValue" in value) {
    return String((value as any).floatValue);
  }

  if ("double_value" in value) {
    return String((value as any).double_value);
  }
  if ("doubleValue" in value) {
    return String((value as any).doubleValue);
  }

  if ("boolean_value" in value) {
    return String((value as any).boolean_value);
  }
  if ("booleanValue" in value) {
    return String((value as any).booleanValue);
  }

  // Some fields might come as numeric directly
  if (typeof value === "number") {
    return String(value);
  }

  // Handle object with numeric value
  if (typeof value === "object" && value !== null) {
    // Check for various numeric field names Tesla might use
    if ("numericValue" in value) {
      return String(value.numericValue);
    }
    if ("numeric_value" in value) {
      return String((value as any).numeric_value);
    }
    if ("value" in value && typeof value.value === "number") {
      return String(value.value);
    }
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
  const processed = {
    timestamp: new Date(response.createdAt),
    vin: response.vin,
  } as ProcessedTelemetryData;

  // Handle array of data/alerts/errors
  if (Array.isArray(response.data)) {
    const items = response.data as Array<
      RealtimeData | RealtimeAlert | RealtimeError
    >;

    items.forEach((item) => {
      // Check if it's a RealtimeData (has 'key' and 'value')
      if ("key" in item && "value" in item) {
        const dataItem = item as RealtimeData;
        let key = dataItem.key;

        // Try to parse as numeric field ID first
        const numericKey = parseInt(key, 10);
        if (!isNaN(numericKey) && FIELD_ID_MAP[numericKey]) {
          // Numeric field ID - map to field name
          key = FIELD_ID_MAP[numericKey];
        }

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

        // Handle string values (convert to appropriate types based on field config)
        const stringValue = extractStringValue(dataItem.value);
        if (stringValue !== null) {
          const fieldConfig =
            TELEMETRY_FIELDS[key as keyof typeof TELEMETRY_FIELDS];

          if (!fieldConfig) {
            // Field not configured, skip
            return;
          }

          switch (fieldConfig.type) {
            case "numeric":
              const numericVal = parseNumericValue(stringValue);
              (processed as any)[fieldConfig.processedKey] = numericVal;
              break;
            case "string":
              (processed as any)[fieldConfig.processedKey] = stringValue;
              break;
            case "boolean":
              (processed as any)[fieldConfig.processedKey] =
                stringValue.toLowerCase() === "true";
              break;
            case "location":
              // Location is handled separately above
              break;
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
