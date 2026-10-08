# Architecture Patterns

**Domain:** Homey Pro device integration app (Tesla vehicle via Tessie API)
**Researched:** 2026-03-03

## Recommended Architecture

The app follows Homey's standard driver-based architecture with a single driver ("vehicle") backed by a centralized API client and a dual data pipeline (WebSocket streaming + REST polling fallback).

```
+-----------------------------------------------------------+
|  Homey Pro Runtime (Node.js 22)                          |
|                                                           |
|  +-----------------------------------------------------+ |
|  |  App (app.ts)                                        | |
|  |  - Singleton, started once at boot                   | |
|  |  - Registers app-level Flow cards                    | |
|  |  - Owns shared TessieClient instance                 | |
|  +-----------------------------------------------------+ |
|         |                                                 |
|         | this.homey.app                                   |
|         v                                                 |
|  +-----------------------------------------------------+ |
|  |  Driver (drivers/car/driver.ts)                  | |
|  |  - Handles pairing (API token + vehicle discovery)   | |
|  |  - Registers device-level Flow cards                 | |
|  |  - Maps VINs to Device instances                     | |
|  +-----------------------------------------------------+ |
|         |                                                 |
|         | creates per-vehicle                              |
|         v                                                 |
|  +-----------------------------------------------------+ |
|  |  Device (drivers/car/device.ts)   [per vehicle]  | |
|  |  - Owns WebSocket connection to streaming.tessie.com | |
|  |  - Owns polling interval (fallback)                  | |
|  |  - Maps Tessie data -> Homey capabilities            | |
|  |  - Registers capability listeners for commands       | |
|  |  - Manages device availability state                 | |
|  +-----------------------------------------------------+ |
|         |                        |                        |
|         | capability updates     | command dispatch        |
|         v                        v                        |
|  +-----------------+   +---------------------------+      |
|  | Homey Platform   |   | TessieClient (lib/)       |     |
|  | - Capabilities   |   | - REST: api.tessie.com    |     |
|  | - Flow Engine    |   | - WS: streaming.tessie.com|     |
|  | - Insights       |   | - Auth: Bearer token      |     |
|  | - UI/Mobile      |   +---------------------------+     |
|  +-----------------+                                      |
+-----------------------------------------------------------+
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **App** (`app.ts`) | Singleton entry point. No shared state needed since each device has its own API token. Registers global Flow cards if any. | Driver (via Homey lifecycle), Homey platform |
| **Driver** (`drivers/car/driver.ts`) | Vehicle discovery during pairing. Accepts API token via credentials login, calls Tessie `/vehicles` endpoint to list user's vehicles, returns device list. Registers device-scoped Flow card listeners. | App (via `this.homey.app`), Device (creates instances), Tessie REST API (during pairing only) |
| **Device** (`drivers/car/device.ts`) | Per-vehicle instance. Manages WebSocket connection for real-time telemetry. Runs polling interval as fallback. Translates Tessie data into Homey capability values. Dispatches commands via REST API when capability listeners fire. Manages availability. | TessieClient, Homey capabilities, Homey Flow engine |
| **TessieClient** (`lib/TessieClient.ts`) | Stateless HTTP client wrapping Tessie REST API. Handles authentication headers, request formatting, error normalization. One instance per device (each device may have different API tokens). | Tessie REST API (`api.tessie.com`) |
| **TessieStream** (`lib/TessieStream.ts`) | WebSocket client for `wss://streaming.tessie.com/{VIN}`. Handles connection, reconnection with backoff, message parsing, and event emission. One instance per device. | Tessie WebSocket API (`streaming.tessie.com`) |
| **CapabilityMapper** (`lib/capabilities.ts`) | Pure mapping functions between Tessie API field names and Homey capability IDs. Transforms values (unit conversion, boolean mapping, enum translation). No I/O. | Device (imported as utility) |

### Data Flow

```
INBOUND (Tessie -> Homey):

  streaming.tessie.com/{VIN}    api.tessie.com/{VIN}/state
         |                              |
    WebSocket messages            REST response (JSON)
         |                              |
    TessieStream.ts              TessieClient.ts
         |                              |
         +--------> Device.ts <---------+
                       |
              CapabilityMapper.ts
                       |
              setCapabilityValue()
                       |
              +--------+--------+
              |        |        |
           Homey    Homey    Homey
           UI       Flows    Insights


OUTBOUND (Homey -> Tessie):

  User taps button / Flow action fires
              |
     registerCapabilityListener()
              |
           Device.ts
              |
        TessieClient.ts
              |
   POST api.tessie.com/{VIN}/command/{cmd}
```

## Patterns to Follow

### Pattern 1: Single Driver, Single Device Class

Use ONE driver (`vehicle`) with device class `"other"` (no `"car"` class exists in Homey). Each Tesla vehicle becomes a single Homey device with many capabilities, rather than splitting into multiple sub-devices (air conditioner, trunk, etc.).

**Why:** Simpler mental model for users. One device = one car. All capabilities, Flow cards, and settings in one place. The existing `meg768/homey-tesla-vehicle` splits into sub-devices and it creates confusion. The official `homey.tesla` by RonnyWinkler uses a single device approach and it is the dominant pattern in the Homey App Store.

**driver.compose.json structure:**
```json
{
  "name": { "en": "Tesla Vehicle" },
  "class": "other",
  "capabilities": [
    "measure_battery",
    "locked",
    "measure_temperature.inside",
    "measure_temperature.outside",
    "sentry_mode",
    "charging_state",
    "..."
  ],
  "platforms": ["local"],
  "connectivity": ["cloud"],
  "pair": [
    {
      "id": "login_credentials",
      "template": "login_credentials",
      "options": {
        "title": { "en": "Tessie API" },
        "usernameLabel": { "en": "API Token" },
        "usernamePlaceholder": { "en": "Enter your Tessie API token" },
        "passwordLabel": { "en": "Confirm Token" },
        "passwordPlaceholder": { "en": "Re-enter your API token" }
      }
    },
    {
      "id": "list_devices",
      "template": "list_devices",
      "navigation": { "next": "add_devices" }
    },
    {
      "id": "add_devices",
      "template": "add_devices"
    }
  ]
}
```

### Pattern 2: Dual Data Pipeline with WebSocket Primary

WebSocket streaming provides real-time data. REST polling runs at a longer interval (e.g., every 5 minutes) as a fallback and to catch any fields not in the telemetry stream.

**What:** Connect to `wss://streaming.tessie.com/{VIN}?access_token={token}` on device init. Parse incoming JSON messages and update capabilities. If WebSocket disconnects, increase polling frequency until reconnected.

**When:** Always. This is the core data strategy.

**Example:**
```typescript
// In Device.ts
async onInit() {
  // Start WebSocket stream
  this.stream = new TessieStream(this.vin, this.token);
  this.stream.on('data', (fields) => this.handleTelemetry(fields));
  this.stream.on('disconnect', () => this.onStreamDisconnect());
  this.stream.on('connect', () => this.onStreamConnect());
  this.stream.connect();

  // Start fallback polling (long interval while WS is active)
  this.pollInterval = this.homey.setInterval(
    () => this.pollState(),
    this.stream.isConnected ? 300_000 : 60_000  // 5min vs 1min
  );
}

private async handleTelemetry(fields: TelemetryField[]) {
  for (const field of fields) {
    const mapped = mapTelemetryToCapability(field);
    if (mapped) {
      await this.setCapabilityValue(mapped.id, mapped.value).catch(this.error);
    }
  }
}
```

### Pattern 3: Capability-Driven Command Dispatch

Register capability listeners for settable capabilities. When the user toggles a lock, changes climate, etc., the listener dispatches the corresponding Tessie API command.

**What:** Map each settable capability to a Tessie command endpoint. Use `registerCapabilityListener` for each.

**Example:**
```typescript
// In Device.ts onInit()
this.registerCapabilityListener('locked', async (value) => {
  if (value) {
    await this.client.post(`/${this.vin}/command/lock`);
  } else {
    await this.client.post(`/${this.vin}/command/unlock`);
  }
});

this.registerCapabilityListener('target_temperature', async (value) => {
  await this.client.post(`/${this.vin}/command/set_temperatures`, {
    driver_temp: value,
    passenger_temp: value,
  });
});
```

### Pattern 4: Custom Capabilities via Homey Compose

Tesla vehicles have many data points that do not map to Homey system capabilities. Define custom capabilities in `.homeycompose/capabilities/` for Tesla-specific data.

**What:** System capabilities where they exist (e.g., `measure_battery`, `measure_temperature`, `locked`). Custom capabilities for Tesla-specific fields (e.g., `sentry_mode`, `charging_state`, `tire_pressure_fl`, `range_km`).

**Example custom capability (`.homeycompose/capabilities/charging_state.json`):**
```json
{
  "type": "enum",
  "title": { "en": "Charging State" },
  "getable": true,
  "setable": false,
  "uiComponent": "sensor",
  "values": [
    { "id": "disconnected", "title": { "en": "Disconnected" } },
    { "id": "connected", "title": { "en": "Connected" } },
    { "id": "charging", "title": { "en": "Charging" } },
    { "id": "complete", "title": { "en": "Complete" } },
    { "id": "stopped", "title": { "en": "Stopped" } }
  ]
}
```

### Pattern 5: Device Availability Based on Connection State

Set the device as unavailable when neither WebSocket nor polling can reach the vehicle (API errors, expired token). This blocks capability interactions and Flow actions, preventing confusion.

```typescript
// Connection restored
this.setAvailable().catch(this.error);

// Connection lost / API error
this.setUnavailable('Vehicle unreachable').catch(this.error);
```

### Pattern 6: Credential Storage in Device Store

Store the API token in the device store (persisted across reboots), not in app-level settings. Each vehicle can have a different token (different Tessie accounts). Use the device store because it is encrypted and per-device.

```typescript
// During pairing - store token
store: { apiToken: token }

// In device.ts
const token = this.getStoreValue('apiToken');
```

## Homey Compose File Structure

The complete project file structure using Homey Compose:

```
se.adamnoren.tessie/
+-- .homeycompose/
|   +-- app.json                          # App metadata, permissions, brandColor
|   +-- capabilities/
|   |   +-- charging_state.json           # Custom: enum (disconnected/charging/complete/...)
|   |   +-- range_km.json                 # Custom: number (estimated range)
|   |   +-- sentry_mode.json              # Custom: boolean
|   |   +-- climate_on.json              # Custom: boolean (climate active)
|   |   +-- tire_pressure_fl.json         # Custom: number (front-left tire psi)
|   |   +-- tire_pressure_fr.json         # Custom: number
|   |   +-- tire_pressure_rl.json         # Custom: number
|   |   +-- tire_pressure_rr.json         # Custom: number
|   |   +-- charge_limit.json             # Custom: number (0-100)
|   |   +-- charge_port_open.json         # Custom: boolean
|   |   +-- frunk_open.json               # Custom: boolean (button)
|   |   +-- trunk_open.json               # Custom: boolean (button)
|   |   +-- odometer.json                 # Custom: number
|   |   +-- vehicle_state.json            # Custom: enum (online/asleep/offline)
|   |   +-- software_version.json         # Custom: string
|   |   +-- speed.json                    # Custom: number
|   |   +-- ... (more as needed)
|   +-- flow/
|   |   +-- triggers/                     # App-level triggers (if any)
|   |   +-- conditions/                   # App-level conditions (if any)
|   |   +-- actions/                      # App-level actions (if any)
+-- assets/
|   +-- icon.svg                          # App icon (Tessie-themed)
|   +-- images/
|       +-- small.jpg                     # 250x175
|       +-- large.jpg                     # 500x350
|       +-- xlarge.jpg                    # 1000x700
+-- drivers/
|   +-- vehicle/
|       +-- assets/
|       |   +-- icon.svg                  # Vehicle driver icon
|       |   +-- images/
|       |       +-- small.png             # 75x75
|       |       +-- large.png             # 500x500
|       |       +-- xlarge.png            # 1000x1000
|       +-- driver.compose.json           # Class, capabilities, pairing flow
|       +-- driver.flow.compose.json      # Device-specific Flow cards
|       +-- driver.settings.compose.json  # Per-device settings
|       +-- driver.ts                     # Pairing logic, Flow card registration
|       +-- device.ts                     # Per-vehicle instance logic
+-- lib/
|   +-- TessieClient.ts                   # REST API wrapper
|   +-- TessieStream.ts                   # WebSocket streaming client
|   +-- capabilities.ts                   # Capability <-> Tessie field mapping
|   +-- constants.ts                      # API URLs, intervals, defaults
+-- locales/
|   +-- en.json                           # English translations
+-- app.ts                                # App entry point
+-- app.json                              # AUTO-GENERATED (never edit manually)
+-- package.json
+-- tsconfig.json
+-- .homeyignore
+-- .homeychangelog.json
```

## Capability Mapping Strategy

### System Capabilities (reuse Homey built-ins)

| Homey Capability | Type | Settable | Tessie Source |
|-----------------|------|----------|---------------|
| `measure_battery` | number (0-100) | No | `charge_state.battery_level` |
| `measure_temperature.inside` | number | No | `climate_state.inside_temp` |
| `measure_temperature.outside` | number | No | `climate_state.outside_temp` |
| `locked` | boolean | Yes | `vehicle_state.locked` / `command/lock` or `command/unlock` |
| `measure_power` | number (W) | No | `charge_state.charger_power * 1000` |

### Custom Capabilities (Tesla-specific)

| Custom Capability | Type | Settable | Tessie Source |
|-------------------|------|----------|---------------|
| `charging_state` | enum | No | `charge_state.charging_state` |
| `range_km` | number | No | `charge_state.battery_range * 1.60934` |
| `sentry_mode` | boolean | Yes | `vehicle_state.sentry_mode` / `command/enable_sentry` |
| `climate_on` | boolean | Yes | `climate_state.is_climate_on` / `command/start_climate` |
| `charge_limit` | number | Yes | `charge_state.charge_limit_soc` / `command/set_charge_limit` |
| `tire_pressure_fl` | number | No | `vehicle_state.tpms_pressure_fl` |
| `tire_pressure_fr` | number | No | `vehicle_state.tpms_pressure_fr` |
| `tire_pressure_rl` | number | No | `vehicle_state.tpms_pressure_rl` |
| `tire_pressure_rr` | number | No | `vehicle_state.tpms_pressure_rr` |
| `charge_port_open` | boolean | Yes | `charge_state.charge_port_door_open` / `command/open_charge_port` |
| `frunk_open` | button | -- | `command/activate_front_trunk` |
| `trunk_open` | button | -- | `command/activate_rear_trunk` |
| `odometer` | number | No | `vehicle_state.odometer` |
| `vehicle_state` | enum | No | `status` endpoint (asleep/awake) |
| `software_version` | string | No | `vehicle_state.car_version` |
| `speed` | number | No | Telemetry stream |

### Flow Card Strategy

**Device-level Flow cards** (in `driver.flow.compose.json`):

Triggers:
- `charging_started` - When charging begins
- `charging_stopped` - When charging ends
- `charging_complete` - When charge reaches limit
- `sentry_mode_changed` - When sentry mode toggles
- `vehicle_arrived` - When vehicle location changes (geofence)
- `vehicle_left` - When vehicle leaves location
- `battery_below` - Battery drops below threshold (argument: percentage)

Conditions:
- `is_charging` - Vehicle is currently charging
- `is_locked` - Vehicle is locked
- `is_climate_on` - Climate is active
- `is_sentry_on` - Sentry mode is enabled
- `is_at_home` - Vehicle is at home location
- `battery_above` - Battery above percentage (argument)

Actions:
- `honk_horn` - Honk the horn
- `flash_lights` - Flash the lights
- `open_frunk` - Open the front trunk
- `open_trunk` - Open/close the rear trunk
- `start_climate` - Start climate preconditioning
- `stop_climate` - Stop climate
- `set_temperature` - Set cabin temperature (argument: degrees)
- `start_charging` - Start charging
- `stop_charging` - Stop charging
- `set_charge_limit` - Set charge limit (argument: percentage)
- `enable_sentry` - Enable sentry mode
- `disable_sentry` - Disable sentry mode
- `vent_windows` - Vent all windows
- `close_windows` - Close all windows
- `lock` - Lock the vehicle
- `unlock` - Unlock the vehicle
- `wake` - Wake the vehicle

Note: Many custom capability changes will automatically generate Flow triggers (e.g., `charging_state_changed`) via Homey's built-in capability trigger system. Manual trigger cards are only needed for triggers with custom logic (threshold checks, geofencing).

## Anti-Patterns to Avoid

### Anti-Pattern 1: Multiple Drivers for One Physical Device
**What:** Creating separate Homey drivers for climate, charging, locks, trunk, etc.
**Why bad:** Users see 5+ devices for one car. Confusing UX, harder to manage in Flows, and the Homey App Store reviewers may reject it as poor design. The `meg768/homey-tesla-vehicle` does this and it is not the recommended pattern.
**Instead:** Single driver with sub-capabilities (e.g., `measure_temperature.inside`, `measure_temperature.outside`).

### Anti-Pattern 2: Polling-Only Data Strategy
**What:** Using only REST polling at short intervals to get vehicle state.
**Why bad:** Frequent polling wakes the vehicle, draining 12V battery. Tessie rate limits apply. Data is stale between polls. Misses real-time events.
**Instead:** WebSocket streaming as primary, polling as fallback at 5-minute intervals.

### Anti-Pattern 3: App-Level Token Storage
**What:** Storing the Tessie API token in app settings (global) rather than per-device.
**Why bad:** Only supports one Tessie account. Users with multiple accounts or shared family vehicles cannot add vehicles from different tokens.
**Instead:** Store token in device store during pairing. Each device carries its own token.

### Anti-Pattern 4: Blocking WebSocket in App.ts
**What:** Running the WebSocket connection in the App singleton instead of per-device.
**Why bad:** App.ts initializes before any devices exist. WebSocket connections are per-VIN so they belong to the device lifecycle (onInit/onUninit). Putting them in App.ts creates lifecycle management nightmares.
**Instead:** Each Device instance manages its own WebSocket connection in onInit(), tears it down in onUninit().

### Anti-Pattern 5: Waking Vehicle for Every Command
**What:** Always calling `/wake` before every command request.
**Why bad:** Tessie's REST API already handles automatic waking for commands. Explicit wake calls add unnecessary latency and API calls.
**Instead:** Let Tessie handle auto-wake. The Tessie API documentation states it provides "automatic wakes and automatic firmware error handling." Only use explicit wake as a user-triggered Flow action.

## Scalability Considerations

| Concern | 1 Vehicle | 3-5 Vehicles | 10+ Vehicles |
|---------|-----------|--------------|-------------|
| WebSocket connections | 1 connection, negligible | 3-5 connections, fine | May hit Homey memory limits; consider connection pooling |
| Polling load | 1 req/5min | 3-5 req/5min | Stagger intervals to avoid burst |
| Homey memory | ~20MB | ~40MB | Monitor; Homey Pro 2023/2026 has 2-4GB RAM |
| Tessie API rate limits | No concern | No concern | Verify with Tessie; their docs say "unlimited polling" |
| Flow card count | Fast | Fast | Homey handles well |

## Tessie API Reference Summary

### Base URLs
- REST API: `https://api.tessie.com`
- WebSocket streaming: `wss://streaming.tessie.com/{VIN}`

### Authentication
- Bearer token in `Authorization` header, or `access_token` query parameter
- Single token works across REST and WebSocket

### Key Endpoints Used by This App

**Data retrieval:**
- `GET /vehicles` - List all vehicles (used in pairing)
- `GET /{vin}/state` - Full vehicle state (used in polling)
- `GET /{vin}/status` - Vehicle sleep state
- `GET /{vin}/battery` - Battery details
- `GET /{vin}/location` - GPS coordinates

**Commands (all POST):**
- `/{vin}/command/lock`, `unlock`
- `/{vin}/command/start_climate`, `stop_climate`, `set_temperatures`
- `/{vin}/command/start_charging`, `stop_charging`, `set_charge_limit`, `set_charging_amps`
- `/{vin}/command/enable_sentry`, `disable_sentry`
- `/{vin}/command/activate_front_trunk`, `activate_rear_trunk`
- `/{vin}/command/vent_windows`, `close_windows`
- `/{vin}/command/flash`, `honk`
- `/{vin}/command/open_charge_port`, `close_charge_port`
- `/{vin}/command/start_max_defrost`, `stop_max_defrost`
- `/{vin}/command/set_seat_heat`, `set_seat_cool`
- `/{vin}/command/start_steering_wheel_heater`, `stop_steering_wheel_heater`
- `/{vin}/command/wake`

**WebSocket streaming:**
- Connect to `wss://streaming.tessie.com/{VIN}?access_token={TOKEN}`
- Receives JSON messages with types: data, alert, connectivity, error
- Data messages contain key-value pairs with vehicle telemetry fields

## Suggested Build Order

Based on component dependencies, the recommended implementation order:

```
Phase 1: Foundation
  1. Project scaffold (Homey CLI, TypeScript config, Compose structure)
  2. TessieClient.ts (REST wrapper - needed by everything)
  3. Driver pairing flow (credentials login + vehicle discovery)
  4. Basic Device with core capabilities (battery, range, locked)
     Dependencies: TessieClient, Driver

Phase 2: Data Pipeline
  5. REST polling in Device (periodic state refresh)
  6. TessieStream.ts (WebSocket client with reconnection)
  7. Integrate WebSocket into Device (primary data source)
  8. CapabilityMapper (systematic Tessie -> Homey mapping)
     Dependencies: Phase 1 complete

Phase 3: Commands & Controls
  9. Capability listeners for settable capabilities (lock, climate, charging)
  10. Command dispatch through TessieClient
  11. All remaining capabilities (tire pressure, sentry, trunk, etc.)
      Dependencies: Phase 2 (need data flow working first)

Phase 4: Flow Integration
  12. Device-level Flow trigger cards
  13. Condition cards
  14. Action cards with arguments
      Dependencies: Phase 3 (capabilities must exist first)

Phase 5: Polish & Store
  15. Error handling, availability management
  16. Repair flow (re-enter API token)
  17. Assets, icons, images, translations
  18. App Store submission
      Dependencies: Phase 4 complete
```

**Build order rationale:**
- TessieClient must exist before anything can talk to the API
- Pairing must work before devices can be created
- Polling comes before WebSocket because it is simpler and validates the data pipeline
- Commands depend on having the capability model established
- Flow cards depend on capabilities and commands being implemented
- Polish is last because it does not block functionality

## Sources

- [Homey Apps SDK - App structure](https://apps.developer.homey.app/the-basics/app) (HIGH confidence)
- [Homey Apps SDK - Drivers & Devices](https://apps.developer.homey.app/the-basics/devices) (HIGH confidence)
- [Homey Apps SDK - Capabilities](https://apps.developer.homey.app/the-basics/devices/capabilities) (HIGH confidence)
- [Homey Apps SDK - Flow](https://apps.developer.homey.app/the-basics/flow) (HIGH confidence)
- [Homey Apps SDK - Pairing](https://apps.developer.homey.app/the-basics/devices/pairing) (HIGH confidence)
- [Homey Apps SDK - Credentials Login](https://apps.developer.homey.app/the-basics/devices/pairing/system-views/credentials-login) (HIGH confidence)
- [Homey Apps SDK - Homey Compose](https://apps.developer.homey.app/advanced/homey-compose) (HIGH confidence)
- [Homey Apps SDK - Device Settings](https://apps.developer.homey.app/the-basics/devices/settings) (HIGH confidence)
- [Homey App Store Guidelines](https://apps.developer.homey.app/app-store/guidelines) (HIGH confidence)
- [Tessie Developer API](https://developer.tessie.com/) (HIGH confidence)
- [Tessie Fleet Telemetry](https://developer.tessie.com/reference/access-tesla-fleet-telemetry) (HIGH confidence)
- [Tessie API Help](https://help.tessie.com/article/65-developer-api) (MEDIUM confidence)
- [Tessie streaming explorer](https://streaming.tessie.com/explorer) (HIGH confidence)
- [Existing Homey Tesla apps](https://github.com/RonnyWinkler/homey.tesla) - reference architecture (MEDIUM confidence)
- [Teslemetry Homey app](https://github.com/Teslemetry/homey) - reference architecture (MEDIUM confidence)
