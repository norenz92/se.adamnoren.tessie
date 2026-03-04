interface StreamDataPoint {
  key: string;
  value: {
    stringValue?: string;
    locationValue?: { latitude: number; longitude: number };
  };
}

interface CapabilityUpdate {
  id: string;
  value: any;
}

const MILES_TO_KM = 1.60934;

function mapStreamData(
  dataPoints: StreamDataPoint[],
  isMetric: boolean,
  _usesPsi: boolean
): CapabilityUpdate[] {
  const updates: CapabilityUpdate[] = [];

  for (const point of dataPoints) {
    const sv = point.value.stringValue;

    switch (point.key) {
      case 'Soc': {
        if (sv == null) break;
        updates.push({ id: 'measure_battery', value: Number(sv) });
        break;
      }

      case 'IdealBatteryRange': {
        if (sv == null) break;
        const miles = Number(sv);
        const range = isMetric ? Math.round(miles * MILES_TO_KM) : Math.round(miles);
        updates.push({ id: 'measure_range', value: range });
        break;
      }

      case 'InsideTemp': {
        if (sv == null) break;
        updates.push({ id: 'measure_temperature.inside', value: Number(sv) });
        break;
      }

      case 'OutsideTemp': {
        if (sv == null) break;
        updates.push({ id: 'measure_temperature.outside', value: Number(sv) });
        break;
      }

      case 'Location': {
        const loc = point.value.locationValue;
        if (loc == null) break;
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
        updates.push({ id: 'sentry_mode', value: sv !== 'Off' });
        break;
      }

      case 'ChargeLimitSoc': {
        if (sv == null) break;
        updates.push({ id: 'charge_limit', value: Number(sv) / 100 });
        break;
      }

      case 'ChargeState': {
        if (sv == null) break;
        updates.push({ id: 'charging_status', value: sv });
        updates.push({ id: 'charging_control', value: sv === 'Charging' });
        break;
      }

      case 'HvacPower': {
        if (sv == null) break;
        updates.push({ id: 'climate_onoff', value: sv !== 'Off' });
        break;
      }

      case 'ChargeAmps':
      case 'ChargeCurrentRequest': {
        if (sv == null) break;
        updates.push({ id: 'charging_amps', value: Number(sv) });
        break;
      }

      case 'Odometer': {
        if (sv == null) break;
        const miles = Number(sv);
        const odo = isMetric ? Math.round(miles * MILES_TO_KM) : Math.round(miles);
        updates.push({ id: 'measure_odometer', value: odo });
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
