interface StreamDataPoint {
  key: string;
  value?: {
    stringValue?: string;
    locationValue?: { latitude: number; longitude: number };
    [typed: string]: any;
  } | null;
}

interface CapabilityUpdate {
  id: string;
  value: any;
}

const MILES_TO_KM = 1.60934;

const CHARGING_STATUSES = new Set(['Disconnected', 'Starting', 'Charging', 'Stopped', 'Complete', 'NoPower']);
const SHIFT_STATES = new Set(['P', 'D', 'R', 'N']);

/**
 * Fleet Telemetry values arrive either as stringValue or, for newer fields, as a typed member
 * (e.g. { hvacPowerValue: 'HvacPowerStateOn' }). Return the raw value as a string.
 */
function readValue(point: StreamDataPoint): string | null {
  const v = point.value;
  if (v == null || typeof v !== 'object') return null;
  if (v.stringValue != null) return String(v.stringValue);
  for (const [key, raw] of Object.entries(v)) {
    if (key === 'locationValue' || key === 'invalid') continue;
    if (raw != null && typeof raw !== 'object') return String(raw);
  }
  return null;
}

/** Strip Fleet Telemetry enum prefixes, e.g. 'HvacPowerStateOn' -> 'On'. */
function stripPrefix(value: string, prefix: string): string {
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

function toNumber(value: string | null): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapStreamData(
  dataPoints: StreamDataPoint[],
  isMetric: boolean,
  _usesPsi: boolean
): CapabilityUpdate[] {
  const updates: CapabilityUpdate[] = [];
  if (!Array.isArray(dataPoints)) return updates;

  // Prefer the fields that match the REST values (displayed level, rated range) when both arrive
  const keys = new Set(dataPoints.map((p) => p?.key));
  const toDistance = (miles: number) => (isMetric ? Math.round(miles * MILES_TO_KM) : Math.round(miles));

  const pushChargeState = (state: string) => {
    if (!CHARGING_STATUSES.has(state)) return;
    updates.push({ id: 'charging_status', value: state });
    updates.push({ id: 'charging_control', value: state === 'Charging' });
    if (state !== 'Charging') {
      updates.push({ id: 'charger_power', value: 0 });
      updates.push({ id: 'charge_time_remaining', value: 0 });
    }
  };

  for (const point of dataPoints) {
    if (!point || typeof point.key !== 'string') continue;
    const sv = readValue(point);

    switch (point.key) {
      case 'BatteryLevel':
      case 'Soc': {
        if (point.key === 'Soc' && keys.has('BatteryLevel')) break;
        const n = toNumber(sv);
        if (n == null) break;
        updates.push({ id: 'measure_battery', value: Math.round(n) });
        break;
      }

      case 'RatedRange':
      case 'IdealBatteryRange': {
        if (point.key === 'IdealBatteryRange' && keys.has('RatedRange')) break;
        const n = toNumber(sv);
        if (n == null) break;
        updates.push({ id: 'measure_range', value: toDistance(n) });
        break;
      }

      case 'InsideTemp': {
        const n = toNumber(sv);
        if (n == null) break;
        updates.push({ id: 'measure_temperature.inside', value: n });
        break;
      }

      case 'OutsideTemp': {
        const n = toNumber(sv);
        if (n == null) break;
        updates.push({ id: 'measure_temperature.outside', value: n });
        break;
      }

      case 'Location': {
        const loc = point.value?.locationValue;
        if (loc == null || loc.latitude == null || loc.longitude == null) break;
        updates.push({ id: 'measure_latitude', value: loc.latitude });
        updates.push({ id: 'measure_longitude', value: loc.longitude });
        break;
      }

      case 'Locked': {
        if (sv == null) break;
        updates.push({ id: 'locked', value: sv === 'true' });
        break;
      }

      case 'SentryMode': {
        if (sv == null) break;
        updates.push({ id: 'sentry_mode', value: stripPrefix(sv, 'SentryModeState') !== 'Off' });
        break;
      }

      case 'ChargeLimitSoc': {
        const n = toNumber(sv);
        if (n == null) break;
        updates.push({ id: 'charge_limit', value: n / 100 });
        break;
      }

      case 'DetailedChargeState': {
        if (sv == null) break;
        pushChargeState(stripPrefix(sv, 'DetailedChargeState'));
        break;
      }

      case 'ChargeState': {
        // Deprecated in favour of DetailedChargeState
        if (sv == null || keys.has('DetailedChargeState')) break;
        pushChargeState(sv);
        break;
      }

      case 'HvacPower': {
        if (sv == null) break;
        updates.push({ id: 'climate_onoff', value: stripPrefix(sv, 'HvacPowerState') !== 'Off' });
        break;
      }

      // The requested current (setpoint), same as REST charge_current_request.
      // ChargeAmps is the actual current and must not overwrite the setpoint.
      case 'ChargeCurrentRequest': {
        const n = toNumber(sv);
        if (n == null || n < 1) break;
        updates.push({ id: 'charging_amps', value: n });
        break;
      }

      case 'Gear': {
        if (sv == null) break;
        const gear = stripPrefix(sv, 'ShiftState');
        if (SHIFT_STATES.has(gear)) {
          updates.push({ id: 'shift_state', value: gear });
        }
        break;
      }

      case 'Odometer': {
        const n = toNumber(sv);
        if (n == null) break;
        updates.push({ id: 'measure_odometer', value: toDistance(n) });
        break;
      }

      default:
        // Unknown key, skip
        break;
    }
  }

  return updates;
}

export = mapStreamData;
