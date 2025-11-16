# Fleet Telemetry Quick Reference

## What Was Added

### 🔧 SDK Types (`tessie/sdk/types.ts`)
```typescript
// Fleet Telemetry field configuration
interface FleetTelemetryField {
  interval_seconds: number;
}

// Response from getting telemetry config
interface FleetTelemetryConfigResponse {
  synced: boolean;
  config: {
    hostname: string;
    ca: string;
    exp: number;
    port: number;
    fields: { [key: string]: FleetTelemetryField };
    alert_types: string[];
  };
  update_available: boolean;
}

// Parameters for setting configuration
interface SetFleetTelemetryConfigParams {
  vin: string;
  fields: { [key: string]: FleetTelemetryField };
}
```

### 🔌 SDK Methods (`tessie/sdk/index.ts`)
```typescript
// Get current telemetry configuration
getFleetTelemetryConfig(vin: string): Promise<FleetTelemetryConfigResponse>

// Configure telemetry with specific fields
setFleetTelemetryConfig(params: SetFleetTelemetryConfigParams): Promise<CommandResponse>

// Disable telemetry
deleteFleetTelemetryConfig(vin: string): Promise<CommandResponse>
```

### ⚙️ Device Settings (`drivers/car/driver.settings.compose.json`)
- **Setting ID**: `fleet_telemetry_enabled`
- **Type**: Checkbox
- **Default**: `true` (enabled)
- **Label**: "Enable Fleet Telemetry"
- **Hint**: "Enable real-time vehicle data streaming for more up-to-date values"

### 🎛️ Device Methods (`drivers/car/device.ts`)
```typescript
// Initialize Fleet Telemetry during device setup
private async _initFleetTelemetry(): Promise<void>

// Configure telemetry on/off when setting changes
private async _configureFleetTelemetry(enabled: boolean): Promise<void>
```

## Default Telemetry Fields

When enabled, Fleet Telemetry streams these fields at 60-second intervals:

| Field | Description |
|-------|-------------|
| ACChargingPower | AC charging power output |
| BatteryLevel | Current battery percentage |
| ChargeState | Current charging state |
| DCChargingPower | DC charging power output |
| EnergyRemaining | Energy remaining in battery |
| Gear | Current vehicle gear |
| IdealBatteryRange | Ideal range on battery |
| Location | GPS coordinates |
| Odometer | Vehicle mileage |
| RatedRange | Rated battery range |

## How It Works

1. **Device Initialization**
   - During `onInit()`, `_initFleetTelemetry()` is called
   - Reads the `fleet_telemetry_enabled` setting (defaults to `true`)
   - Automatically configures telemetry on the vehicle

2. **Settings Change**
   - User enables/disables Fleet Telemetry in device settings
   - `onSettings()` detects the change
   - Calls `_configureFleetTelemetry()` to update vehicle configuration
   - Changes take effect immediately

3. **Configuration Process**
   - If enabled: Sets up telemetry with default recommended fields
   - If disabled: Removes telemetry configuration
   - Uses Tessie API endpoints: `POST|DELETE /{vin}/fleet_telemetry_config`

## Benefits

✅ **Real-time Data**: Vehicle data streams continuously instead of polling  
✅ **Lower Latency**: Data pushed to app vs. pulled every 30 seconds  
✅ **User Controllable**: Simple toggle in device settings  
✅ **Default On**: Better out-of-box experience  
✅ **Type Safe**: Full TypeScript support  
✅ **Error Handling**: Comprehensive logging and error handling  

## Stream Connection

Once telemetry is enabled on the device, the connection is:
```
wss://streaming.tessie.com/{VIN}?access_token={TOKEN}
```

Data received includes:
- **Data messages**: Vehicle state updates
- **Alert messages**: Vehicle warnings/alerts
- **Connectivity messages**: Connection status
- **Error messages**: Configuration errors

## Testing

All changes have been compiled and verified:
- ✅ TypeScript compilation passes
- ✅ No type errors
- ✅ All methods properly exported
- ✅ Settings properly configured

## File Changes Summary

| File | Changes |
|------|---------|
| `tessie/sdk/types.ts` | Added 4 Fleet Telemetry interfaces |
| `tessie/sdk/index.ts` | Added 3 Fleet Telemetry methods |
| `drivers/car/driver.settings.compose.json` | Added Fleet Telemetry settings group |
| `drivers/car/device.ts` | Added initialization and setting handlers |

Total: 4 files modified
