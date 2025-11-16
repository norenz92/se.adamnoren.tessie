# Tesla Fleet Telemetry Implementation

## Overview
This implementation adds support for Tesla Fleet Telemetry via Tessie, enabling users to receive real-time streamed vehicle data for more up-to-date values. Users can enable/disable this feature from the car device settings, with Fleet Telemetry enabled by default.

## Changes Made

### 1. **Tessie SDK Types** (`tessie/sdk/types.ts`)
Added new TypeScript interfaces for Fleet Telemetry configuration:

- `FleetTelemetryField` - Represents a telemetry field configuration with update interval
- `FleetTelemetryConfig` - Container for telemetry field configurations
- `FleetTelemetryConfigResponse` - Response from getting telemetry config (includes sync status, hostname, CA, port, fields, and alert types)
- `SetFleetTelemetryConfigParams` - Parameters for setting telemetry configuration

**Key Features:**
- Full type support for all Fleet Telemetry configuration options
- Structured response types matching Tessie API documentation
- Strongly typed field definitions with interval_seconds configuration

### 2. **Tessie SDK Methods** (`tessie/sdk/index.ts`)
Added three new methods to the TessieSDK class:

#### `getFleetTelemetryConfig(vin: string): Promise<FleetTelemetryConfigResponse>`
- Retrieves the current Fleet Telemetry configuration for a vehicle
- Returns sync status, connection details, configured fields, and alert types

#### `setFleetTelemetryConfig(params: SetFleetTelemetryConfigParams): Promise<CommandResponse>`
- Configures Fleet Telemetry with specified fields and update intervals
- Allows customization of which vehicle data fields are streamed

#### `deleteFleetTelemetryConfig(vin: string): Promise<CommandResponse>`
- Removes the Fleet Telemetry configuration for a vehicle
- Effectively disables telemetry streaming

**Default Configuration:**
The implementation includes a sensible default configuration with common telemetry fields:
- `ACChargingPower` - AC charging power at 60-second intervals
- `BatteryLevel` - Battery level at 60-second intervals
- `ChargeState` - Charge state at 60-second intervals
- `DCChargingPower` - DC charging power at 60-second intervals
- `EnergyRemaining` - Energy remaining at 60-second intervals
- `Gear` - Vehicle gear at 60-second intervals
- `IdealBatteryRange` - Ideal range at 60-second intervals
- `Location` - GPS location at 60-second intervals
- `Odometer` - Odometer reading at 60-second intervals
- `RatedRange` - Rated range at 60-second intervals

### 3. **Car Device Settings** (`drivers/car/driver.settings.compose.json`)
Added a new "Fleet Telemetry" settings group with:

- **Fleet Telemetry Toggle** (`fleet_telemetry_enabled`)
  - Type: Checkbox
  - Default: `true` (enabled by default)
  - Label: "Enable Fleet Telemetry"
  - Hint: "Enable real-time vehicle data streaming for more up-to-date values"

### 4. **Car Device Implementation** (`drivers/car/device.ts`)
Enhanced the CarDevice class with Fleet Telemetry support:

#### Initialization
- Added `_initFleetTelemetry()` method called during device initialization
- Automatically configures Fleet Telemetry based on user settings
- Handles errors gracefully during setup

#### Settings Change Handling
- Extended `onSettings()` to listen for `fleet_telemetry_enabled` changes
- Defers configuration changes to prevent conflicts with other settings
- Logs all configuration changes for debugging

#### Configuration Method
- Added `_configureFleetTelemetry(enabled: boolean)` private method
- When enabled: Sets up telemetry with default recommended fields
- When disabled: Cleanly removes the telemetry configuration
- Provides comprehensive error handling and logging

## API Integration

### WebSocket Connection
Once Fleet Telemetry is enabled, users can receive streamed data via:
```
wss://streaming.tessie.com/{VIN}?access_token={TOKEN}
```

### Data Received
The telemetry stream provides real-time updates including:
- **Data Messages**: Vehicle state fields (battery, location, odometer, etc.)
- **Alert Messages**: Vehicle alerts and warnings
- **Connectivity Messages**: Connection status updates
- **Error Messages**: Configuration or field errors

### Update Intervals
All configured fields stream at 60-second intervals by default, providing a good balance between data freshness and bandwidth usage.

## Benefits

1. **Real-Time Updates**: Get vehicle data streamed in real-time instead of polled every 30 seconds
2. **Reduced Latency**: Information is pushed to the app rather than pulled periodically
3. **User Control**: Simple toggle to enable/disable based on preference
4. **Default Enabled**: Better out-of-box experience with telemetry enabled by default
5. **Type Safe**: Full TypeScript support for all Fleet Telemetry operations
6. **Error Handling**: Comprehensive error handling and logging

## Usage

### For End Users
1. Open car device settings
2. Scroll to "Fleet Telemetry" section
3. Check/uncheck "Enable Fleet Telemetry" as desired
4. Save settings

The device will automatically configure or disable telemetry accordingly.

### For Developers
```typescript
// Get current Fleet Telemetry configuration
const config = await getTessieSDK().getFleetTelemetryConfig(vin);

// Enable with custom fields
await getTessieSDK().setFleetTelemetryConfig({
  vin,
  fields: {
    Location: { interval_seconds: 30 },
    BatteryLevel: { interval_seconds: 60 },
  }
});

// Disable telemetry
await getTessieSDK().deleteFleetTelemetryConfig(vin);
```

## Testing

The implementation includes:
- Full TypeScript compilation with no errors
- Proper error handling and type safety
- Deferred async operations to prevent settings conflicts
- Comprehensive logging for debugging

## Related Documentation

- **Tessie API**: https://developer.tessie.com/reference/access-tesla-fleet-telemetry
- **Tesla Fleet Telemetry**: WebSocket streaming protocol for real-time vehicle data
- **Default Fields**: Based on Tessie's recommended configuration

## Future Enhancements

Potential improvements could include:
1. Custom field selection UI for power users
2. Adjustable update intervals per field
3. Telemetry data visualization in widgets
4. Historical telemetry data analysis
5. Connectivity status monitoring and alerts
