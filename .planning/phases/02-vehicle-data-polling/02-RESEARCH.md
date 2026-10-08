# Phase 2: Vehicle Data & Polling - Research

**Researched:** 2026-03-03
**Domain:** Tessie REST API polling, Homey device capabilities, sleep-aware data refresh
**Confidence:** HIGH

## Summary

Phase 2 extends the existing vehicle device (which currently has `measure_battery` and `locked`) with all sensor capabilities needed to display full vehicle state on Homey device cards. The core challenge is mapping Tessie API state fields to Homey capabilities while implementing sleep-aware adaptive polling that never wakes a sleeping vehicle.

The Tessie API makes sleep-aware polling straightforward: the `GET /{vin}/state` endpoint with `use_cache=true` (the default) always returns cached data without waking the vehicle. A separate lightweight `GET /{vin}/status` endpoint returns the vehicle's sleep state (`asleep`, `waiting_for_sleep`, `awake`) without impact. The architecture should use status checks to determine poll interval, and always fetch state with the cache enabled.

Homey's capability system supports both built-in system capabilities (like `measure_battery`, `measure_temperature`, `locked`) and custom capabilities defined in `.homeycompose/capabilities/` JSON files. Sub-capabilities (e.g., `measure_temperature.inside`) allow the same capability type to appear multiple times on a device. Custom capabilities require manual Flow card creation in Phase 6. Temperature capabilities with `"units": "C"` get automatic Fahrenheit conversion by Homey.

**Primary recommendation:** Use Tessie's cached state endpoint for all data, check vehicle status separately for adaptive poll intervals, define custom capabilities in `.homeycompose/capabilities/`, and migrate existing devices in `onInit()` using `addCapability()`.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- All sensor data on the main card -- no primary/secondary split, Homey handles scrolling
- Four separate tire pressure capabilities (FL, FR, RL, RR) -- one per wheel
- Battery level (`measure_battery`) and lock state (`locked`) already exist from Phase 1
- Adaptive poll intervals: poll more frequently when vehicle is awake or charging, reduce frequency when asleep
- Show last known capability values when asleep -- data doesn't change while sleeping so values remain accurate
- Add a vehicle state capability showing sleep status (e.g. "Asleep", "Awake", "Offline") as a visual indicator
- Wake on init: fetch full state immediately when device initializes, even if vehicle is sleeping -- user just paired it and expects data
- Distinct states for "Asleep" (normal, vehicle resting) vs "Offline" (problem, can't reach vehicle at all)
- Range and odometer: follow the Tessie/Tesla vehicle unit setting (km or miles depending on what the vehicle reports)
- Tire pressure: follow the vehicle unit setting (bar or psi)
- Consistent approach: respect the user's Tesla unit preferences rather than forcing a single unit system
- Retry a few failed polls before marking device unavailable -- tolerate brief API hiccups rather than flipping unavailable on first failure
- Sleep indicator on card is sufficient for data freshness -- no separate "last updated" timestamp capability needed

### Claude's Discretion
- Sleep check approach (status endpoint vs use_cache parameter vs other Tessie API mechanism)
- Exact adaptive poll interval values (awake rate, asleep rate, charging rate)
- Number of retries before marking unavailable
- GPS location representation (lat/lng capabilities vs address string vs Homey location capability)
- Charging status capability type (text enum, boolean + text, or other)
- Temperature units (Celsius vs follow vehicle -- research Homey's temperature capability conventions)
- Software update status display format
- Battery health/degradation display format (depends on what Tessie API actually provides)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CHRG-01 | User can see battery level percentage on the device | Already implemented via `measure_battery` in Phase 1. Verify it still works with expanded refreshState. |
| CHRG-02 | User can see estimated range on the device | Map `charge_state.battery_range` (miles) or `charge_state.ideal_battery_range` to a custom range capability. Use `gui_settings.gui_distance_units` for km/mi. |
| CHRG-03 | User can see current charging status | Map `charge_state.charging_state` (string: "Complete", "Charging", "Disconnected", "Stopped", "NoPower") to a custom enum capability. |
| CLIM-03 | User can see inside and outside temperature on the device | Map `climate_state.inside_temp` and `climate_state.outside_temp` (Celsius floats) to `measure_temperature.inside` and `measure_temperature.outside` sub-capabilities. |
| DATA-01 | User can see GPS location on the device | Map `drive_state.latitude` and `drive_state.longitude` to custom number capabilities for lat/lng. |
| DATA-02 | User can see tire pressure for all four tires | Use `vehicle_state.tpms_pressure_fl/fr/rl/rr` (bar floats) from state endpoint. Four custom capabilities. Use `gui_settings` for unit preference, convert if needed. |
| DATA-03 | User can see odometer reading | Map `vehicle_state.odometer` (miles float) to custom capability. Convert using `gui_settings.gui_distance_units`. |
| DATA-04 | User can see software update status and pending version | Map `vehicle_state.software_update.status` and `.version` to a custom string capability. |
| DATA-05 | User can see battery health/degradation data | Use Tessie-specific `GET /battery_health` endpoint. Returns `health_percent`, `degradation_percent`, `capacity`, `original_capacity`. Map to custom number capability. |
| STRM-02 | App falls back to periodic REST polling when WebSocket is disconnected | Phase 2 implements REST polling as the primary mechanism. WebSocket is Phase 4; this polling becomes the fallback. |
| STRM-03 | Polling is sleep-aware (does not poll when vehicle is asleep or waiting for sleep) | Use `GET /{vin}/status` for sleep checks + `GET /{vin}/state?use_cache=true` for data. Adaptive intervals based on status. |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Homey SDK v3 | 3.x | Device capabilities, polling, lifecycle | Required by Homey app platform |
| node:https | built-in | HTTP requests to Tessie API | Already established in Phase 1, no external deps |
| TypeScript | 5.9.x | Type safety | Already established in project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| homey-apps-sdk-v3-types | 0.3.x | TypeScript types for Homey SDK | Already installed, dev dependency |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| node:https | fetch (Node 18+) | fetch is simpler but Phase 1 established node:https pattern. Stick with it for consistency. |
| Separate tire pressure endpoint | tpms fields in vehicle_state | vehicle_state already contains tpms_pressure_* fields; no need for extra API call |

**Installation:**
No new packages needed. All dependencies are already installed.

## Architecture Patterns

### Recommended Project Structure
```
.homeycompose/
  capabilities/                # NEW: Custom capability JSON definitions
    measure_range.json
    charging_status.json
    measure_tire_pressure_fl.json
    measure_tire_pressure_fr.json
    measure_tire_pressure_rl.json
    measure_tire_pressure_rr.json
    measure_odometer.json
    vehicle_state_status.json
    measure_latitude.json
    measure_longitude.json
    software_update.json
    measure_battery_health.json
drivers/car/
  device.ts                    # MODIFY: Expand refreshState, add adaptive polling
  driver.compose.json          # MODIFY: Add all new capabilities
lib/
  tessie-client.ts             # MODIFY: Add getStatus(), getBatteryHealth() methods
tests/
  device.test.ts               # MODIFY: Test new capabilities and polling logic
```

### Pattern 1: Custom Capability Definition
**What:** Define custom capabilities as JSON files in `.homeycompose/capabilities/`
**When to use:** For any data point not covered by Homey's built-in system capabilities
**Example:**
```json
// .homeycompose/capabilities/measure_range.json
{
  "type": "number",
  "title": { "en": "Range" },
  "getable": true,
  "setable": false,
  "uiComponent": "sensor",
  "icon": "/assets/capabilities/range.svg",
  "units": { "en": "km" },
  "min": 0,
  "max": 700,
  "step": 1,
  "decimals": 0
}
```
Source: [Homey Apps SDK - Capabilities](https://apps.developer.homey.app/the-basics/devices/capabilities)

### Pattern 2: Sub-Capabilities for Duplicate Types
**What:** Use dot-notation to have multiple capabilities of the same type (e.g., two temperature sensors)
**When to use:** When a device has inside AND outside temperature, or multiple sensors of the same type
**Example:**
```json
// In driver.compose.json capabilities array:
["measure_temperature.inside", "measure_temperature.outside"]

// In capabilitiesOptions:
{
  "measure_temperature.inside": {
    "title": { "en": "Inside" }
  },
  "measure_temperature.outside": {
    "title": { "en": "Outside" }
  }
}
```
**Important:** Flow Cards are NOT automatically generated for sub-capabilities. Must be created manually (Phase 6).
Source: [Homey Apps SDK - Capabilities](https://apps.developer.homey.app/the-basics/devices/capabilities)

### Pattern 3: Capability Migration for Existing Devices
**What:** Add new capabilities to already-paired devices using `addCapability()` in `onInit()`
**When to use:** When updating an app to add capabilities that didn't exist when user first paired
**Example:**
```typescript
async onInit(): Promise<void> {
  // Migrate: add capabilities not present on already-paired devices
  const requiredCapabilities = [
    'measure_temperature.inside',
    'measure_temperature.outside',
    'measure_range',
    'charging_status',
    // ... all new capabilities
  ];
  for (const cap of requiredCapabilities) {
    if (!this.hasCapability(cap)) {
      await this.addCapability(cap);
    }
  }
}
```
Source: [Homey Apps SDK - Breaking Changes](https://apps.developer.homey.app/guides/how-to-breaking-changes)

### Pattern 4: Sleep-Aware Adaptive Polling
**What:** Check vehicle status to determine poll frequency, always use cached state data
**When to use:** Every poll cycle
**Example:**
```typescript
// Recommended approach: status-driven adaptive polling
async pollCycle(): Promise<void> {
  const status = await this.client.getStatus(this.vin);
  // status is "asleep" | "waiting_for_sleep" | "awake"

  if (status === 'asleep' || status === 'waiting_for_sleep') {
    this.setNextPollInterval(ASLEEP_INTERVAL); // e.g., 30 minutes
  } else {
    this.setNextPollInterval(AWAKE_INTERVAL); // e.g., 1 minute
  }

  // Always fetch with cache - safe regardless of sleep state
  const state = await this.client.getVehicle(this.vin);
  // use_cache=true is the default - returns cached data when asleep
  this.updateCapabilities(state);
}
```

### Pattern 5: Dynamic Unit Handling via setCapabilityOptions
**What:** Read vehicle's gui_settings to determine preferred units, update capability display accordingly
**When to use:** On init and when gui_settings change
**Example:**
```typescript
// Read unit preferences from Tessie state
const distanceUnits = state.gui_settings?.gui_distance_units; // "km/hr" or "mi/hr"
const isMetric = distanceUnits?.startsWith('km');

// Update capability options dynamically (expensive - do sparingly)
if (isMetric) {
  await this.setCapabilityOptions('measure_range', { units: { en: 'km' } });
} else {
  await this.setCapabilityOptions('measure_range', { units: { en: 'mi' } });
}
```
Source: [Homey Apps SDK - Capabilities](https://apps.developer.homey.app/the-basics/devices/capabilities)

### Anti-Patterns to Avoid
- **Polling with use_cache=false:** This bypasses Tessie's cache and directly contacts the vehicle via Tesla's API, preventing it from sleeping. NEVER use `use_cache=false` for periodic polling.
- **Calling addCapability on every init:** Check `hasCapability()` first. `addCapability()` is expensive and should only run once per migration.
- **Calling setCapabilityOptions on every poll:** This is expensive. Only call when units actually change (compare with stored value).
- **Setting unavailable on first API error:** Tolerate transient failures. Use a retry counter.
- **Fixed-interval polling regardless of sleep state:** Wastes API calls and risks rate limiting. Use adaptive intervals.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Temperature unit conversion | Manual C/F conversion | Homey's built-in `"units": "C"` on capabilities | Homey automatically converts to Fahrenheit when user's locale requires it |
| Capability migration | Manual database tracking of capability versions | `hasCapability()` + `addCapability()` | Homey SDK handles persistence; just check and add |
| Sleep-aware caching | Local state cache with TTL | Tessie's `use_cache=true` parameter | Tessie server-side caches vehicle state; your cache would duplicate theirs |
| Periodic scheduling | Custom setTimeout chains | `homey.setInterval()` + `homey.clearInterval()` | Homey manages timer lifecycle, survives app restarts |

**Key insight:** Tessie's server-side cache eliminates the need for client-side sleep management complexity. Always poll with `use_cache=true` and you get correct data whether the vehicle is awake or asleep.

## Common Pitfalls

### Pitfall 1: Waking the Vehicle with API Calls
**What goes wrong:** Using `use_cache=false` or calling the wake endpoint during polling directly contacts the vehicle, preventing sleep and draining the 12V battery.
**Why it happens:** Developer assumes fresh data requires a live connection.
**How to avoid:** Always use `use_cache=true` (the default). Only call wake endpoint during user-initiated actions (Phase 3 commands), never during background polling.
**Warning signs:** Vehicle phantom drain complaints from users; Tessie API returning `{"state": "asleep"}` errors.

### Pitfall 2: Tire Pressure Data Availability
**What goes wrong:** TPMS data (`tpms_pressure_*` fields) may be `null` or `0` when the vehicle is parked. TPMS sensors stop reporting once the vehicle is in Park.
**Why it happens:** Tesla firmware resets TPMS readings when the car stops moving.
**How to avoid:** Store the last known non-null tire pressure values. Display those values with a note that they're from the last drive. Guard against null/0 values in capability mapping.
**Warning signs:** All four tire pressures showing 0 or null.

### Pitfall 3: Battery Range Units Mismatch
**What goes wrong:** Tessie's state endpoint returns `battery_range` in miles regardless of vehicle settings. Displaying raw API values shows miles to a km-configured user.
**Why it happens:** The Tesla API always returns miles; the car's display converts locally.
**How to avoid:** Check `gui_settings.gui_distance_units` from the state response. Convert miles to km (multiply by 1.60934) when the vehicle is configured for metric. Same for odometer.
**Warning signs:** Range/odometer values that seem too low for metric users (showing miles as if they were km).

### Pitfall 4: Custom Capability Naming Collision
**What goes wrong:** Using a capability name that conflicts with Homey's built-in capabilities or another app's custom capabilities.
**Why it happens:** Custom capabilities are namespaced by app ID only when referenced externally, but must not shadow system capability names.
**How to avoid:** Prefix all custom capabilities with a distinctive name. Homey Compose automatically prefixes custom capabilities with the app ID (e.g., `se.adamnoren.tessie.measure_range`). Use clear non-conflicting names in the JSON filename.
**Warning signs:** Compilation warnings about capability conflicts.

### Pitfall 5: Marking Device Unavailable Too Quickly
**What goes wrong:** A single failed API call causes the device to show "Unavailable" in Homey, alarming the user.
**Why it happens:** Network blips, Tessie API maintenance, or brief connectivity issues.
**How to avoid:** Implement a consecutive failure counter. Only mark unavailable after 3+ consecutive failures. Reset counter on any successful poll.
**Warning signs:** Device flipping between available and unavailable frequently.

### Pitfall 6: Temperature Always in Celsius
**What goes wrong:** Developer tries to convert temperatures based on vehicle gui_settings, creating double-conversion when Homey also converts.
**Why it happens:** Tessie returns temperatures in Celsius; if you convert to Fahrenheit, and Homey also converts, the user sees wrong values.
**How to avoid:** Always store temperature values in Celsius. Set capability units to `"C"`. Homey handles conversion to user's preferred unit automatically.
**Warning signs:** Temperature values that are nonsensically high or low.

## Code Examples

### Tessie API Status Check
```typescript
// Source: Tessie API documentation at developer.tessie.com
// GET /{vin}/status
// Returns: { "status": "asleep" | "waiting_for_sleep" | "awake" }
async getStatus(vin: string): Promise<{ status: string }> {
  return this.request(`/${vin}/status`);
}
```

### Tessie API State with Cache (Default, Sleep-Safe)
```typescript
// Source: Tessie API documentation at developer.tessie.com
// GET /{vin}/state
// use_cache defaults to true - returns cached data, never wakes vehicle
// Response includes: charge_state, climate_state, drive_state, vehicle_state, gui_settings
async getVehicle(vin: string): Promise<any> {
  return this.request(`/${vin}/state`);
  // use_cache=true is default, no parameter needed
}
```

### Tessie API Battery Health
```typescript
// Source: Tessie API documentation at developer.tessie.com
// GET /battery_health
// Returns: { results: [{ vin, health_percent, degradation_percent, capacity, original_capacity, ... }] }
async getBatteryHealth(): Promise<any> {
  return this.request('/battery_health');
}
```

### Custom Capability JSON Definition (Enum Example)
```json
// .homeycompose/capabilities/charging_status.json
{
  "type": "enum",
  "title": { "en": "Charging" },
  "getable": true,
  "setable": false,
  "uiComponent": "sensor",
  "values": [
    { "id": "Disconnected", "title": { "en": "Disconnected" } },
    { "id": "Charging", "title": { "en": "Charging" } },
    { "id": "Stopped", "title": { "en": "Stopped" } },
    { "id": "Complete", "title": { "en": "Complete" } },
    { "id": "NoPower", "title": { "en": "No Power" } }
  ]
}
```

### Mapping Tessie State to Capabilities
```typescript
// Source: Tesla API field reference + Homey SDK setCapabilityValue
async updateCapabilities(state: any): Promise<void> {
  // Charging data
  if (state.charge_state?.battery_level != null) {
    await this.setCapabilityValue('measure_battery', state.charge_state.battery_level);
  }
  if (state.charge_state?.battery_range != null) {
    const range = this.isMetric
      ? Math.round(state.charge_state.battery_range * 1.60934)
      : Math.round(state.charge_state.battery_range);
    await this.setCapabilityValue('measure_range', range);
  }
  if (state.charge_state?.charging_state != null) {
    await this.setCapabilityValue('charging_status', state.charge_state.charging_state);
  }

  // Climate data (always Celsius from API, Homey converts for user)
  if (state.climate_state?.inside_temp != null) {
    await this.setCapabilityValue('measure_temperature.inside', state.climate_state.inside_temp);
  }
  if (state.climate_state?.outside_temp != null) {
    await this.setCapabilityValue('measure_temperature.outside', state.climate_state.outside_temp);
  }

  // Location
  if (state.drive_state?.latitude != null) {
    await this.setCapabilityValue('measure_latitude', state.drive_state.latitude);
  }
  if (state.drive_state?.longitude != null) {
    await this.setCapabilityValue('measure_longitude', state.drive_state.longitude);
  }

  // Tire pressures (bar from API, convert to psi if vehicle prefers)
  const tpmsFields = ['fl', 'fr', 'rl', 'rr'] as const;
  for (const pos of tpmsFields) {
    const val = state.vehicle_state?.[`tpms_pressure_${pos}`];
    if (val != null && val > 0) {
      const pressure = this.usesPsi ? val * 14.5038 : val;
      await this.setCapabilityValue(`measure_tire_pressure_${pos}`, Math.round(pressure * 10) / 10);
    }
  }

  // Odometer (miles from API, convert if metric)
  if (state.vehicle_state?.odometer != null) {
    const odometer = this.isMetric
      ? Math.round(state.vehicle_state.odometer * 1.60934)
      : Math.round(state.vehicle_state.odometer);
    await this.setCapabilityValue('measure_odometer', odometer);
  }

  // Software update
  const sw = state.vehicle_state?.software_update;
  if (sw) {
    const status = sw.version
      ? `${sw.status || 'Available'}: ${sw.version}`
      : 'Up to date';
    await this.setCapabilityValue('software_update', status);
  }

  // Lock state (existing from Phase 1)
  if (state.vehicle_state?.locked != null) {
    await this.setCapabilityValue('locked', state.vehicle_state.locked);
  }
}
```

### Adaptive Polling with Retry Logic
```typescript
const AWAKE_INTERVAL_MS = 60 * 1000;           // 1 minute when awake
const CHARGING_INTERVAL_MS = 2 * 60 * 1000;    // 2 minutes when charging
const ASLEEP_INTERVAL_MS = 30 * 60 * 1000;     // 30 minutes when asleep
const MAX_CONSECUTIVE_FAILURES = 3;

private consecutiveFailures = 0;

async pollCycle(): Promise<void> {
  try {
    const statusResp = await this.client.getStatus(this.vin);
    const vehicleStatus = statusResp.status; // "asleep" | "waiting_for_sleep" | "awake"

    // Update vehicle state indicator
    const displayStatus = vehicleStatus === 'waiting_for_sleep' ? 'Asleep' :
      vehicleStatus.charAt(0).toUpperCase() + vehicleStatus.slice(1);
    await this.setCapabilityValue('vehicle_state_status', displayStatus);

    // Fetch cached state (safe regardless of sleep status)
    const state = await this.client.getVehicle(this.vin);
    await this.updateCapabilities(state);

    // Reset failure counter and mark available
    this.consecutiveFailures = 0;
    await this.setAvailable();

    // Schedule next poll based on vehicle state
    const isCharging = state.charge_state?.charging_state === 'Charging';
    if (vehicleStatus === 'asleep' || vehicleStatus === 'waiting_for_sleep') {
      this.scheduleNextPoll(ASLEEP_INTERVAL_MS);
    } else if (isCharging) {
      this.scheduleNextPoll(CHARGING_INTERVAL_MS);
    } else {
      this.scheduleNextPoll(AWAKE_INTERVAL_MS);
    }
  } catch (err: any) {
    this.consecutiveFailures++;
    this.error(`Poll failed (${this.consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}):`, err.message);

    if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      await this.setCapabilityValue('vehicle_state_status', 'Offline');
      await this.setUnavailable('Unable to reach Tessie API');
    }
    // Keep polling at current interval to detect recovery
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Poll with `use_cache=false` for fresh data | Always `use_cache=true` (default) | Tessie API design | Eliminates vehicle wake risk entirely |
| Fixed 5-min poll interval | Adaptive polling (1min/2min/30min) | Best practice from HA integration | Faster updates when awake, less API load when asleep |
| Direct Tesla Fleet API | Tessie API wrapper | Project decision | Tessie handles OAuth, command signing, regional routing |

**Deprecated/outdated:**
- Tesla Owner API (owner-api.teslamotors.com): Deprecated in favor of Tesla Fleet API, but Tessie abstracts this away
- TPMS fields only available during driving: This was a firmware limitation resolved in newer firmware versions (2022.4.5+)

## Open Questions

1. **Tessie API Rate Limits**
   - What we know: Rate limits are undocumented (noted as a blocker in STATE.md). The existing TessieClient has no rate limiting.
   - What's unclear: Exact requests-per-minute limit. Whether status + state count as 2 calls or are bundled.
   - Recommendation: Implement defensive rate limiting. With 1-minute awake polling and two calls per cycle (status + state), that is 2 req/min maximum per vehicle. This is conservative and unlikely to hit any limit. Add exponential backoff on 429 responses.

2. **Battery Health Endpoint Scope**
   - What we know: `GET /battery_health` returns data for ALL vehicles (no per-VIN path). Returns `health_percent`, `degradation_percent`, `capacity`, `original_capacity`.
   - What's unclear: Whether this endpoint costs significantly more than a state call. Whether it should be called every poll or on a much slower cadence.
   - Recommendation: Call battery health once per hour or on device init only. Filter results by VIN. It's ancillary data that changes very slowly.

3. **Tire Pressure Data Source**
   - What we know: Two sources -- `vehicle_state.tpms_pressure_*` fields in the state endpoint AND a dedicated `GET /{vin}/tire_pressure` endpoint. The state endpoint returns bar values. The dedicated endpoint returns bar values with status fields.
   - What's unclear: Whether `tpms_pressure_*` values in state are always populated or only when vehicle was recently driving.
   - Recommendation: Use the `tpms_pressure_*` fields from the state endpoint to avoid an extra API call. Guard against null/0 values by keeping last known good values in device store.

4. **GPS as Homey Capability vs Custom**
   - What we know: Homey has no built-in GPS/location capability. The `car` device class doesn't include latitude/longitude.
   - What's unclear: Whether lat/lng numbers on a device card provide useful UX, or if an address string would be better.
   - Recommendation: Use two custom number capabilities (`measure_latitude`, `measure_longitude`) for machine-readable data useful in Flows (Phase 6). Consider adding a string capability for human-readable location display if Tessie provides it (the `GET /{vin}/location` endpoint returns street address).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (`node:test`) with TypeScript |
| Config file | `tsconfig.test.json` (compiles to `dist-test/`) |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CHRG-01 | Battery level mapped from charge_state.battery_level | unit | `npm test` | Partial (exists in device.test.ts) |
| CHRG-02 | Range mapped from charge_state.battery_range with unit conversion | unit | `npm test` | No -- Wave 0 |
| CHRG-03 | Charging status mapped from charge_state.charging_state | unit | `npm test` | No -- Wave 0 |
| CLIM-03 | Inside/outside temp from climate_state (Celsius) | unit | `npm test` | No -- Wave 0 |
| DATA-01 | GPS lat/lng from drive_state | unit | `npm test` | No -- Wave 0 |
| DATA-02 | Four tire pressures from vehicle_state.tpms_pressure_* | unit | `npm test` | No -- Wave 0 |
| DATA-03 | Odometer from vehicle_state.odometer with unit conversion | unit | `npm test` | No -- Wave 0 |
| DATA-04 | Software update status from vehicle_state.software_update | unit | `npm test` | No -- Wave 0 |
| DATA-05 | Battery health from /battery_health endpoint | unit | `npm test` | No -- Wave 0 |
| STRM-02 | Periodic REST polling runs automatically | unit | `npm test` | Partial (basic poll test exists) |
| STRM-03 | Polling is sleep-aware (adaptive intervals, no wake) | unit | `npm test` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/device.test.ts` -- expand mock state fixtures to include ALL Tessie state fields (climate_state, drive_state, vehicle_state with tpms, gui_settings, software_update)
- [ ] `tests/device.test.ts` -- add test cases for: range with unit conversion, charging status enum mapping, temperature sub-capabilities, GPS lat/lng, tire pressure mapping and null handling, odometer with unit conversion, software update string formatting, battery health, adaptive poll intervals, retry/unavailable logic, vehicle state status capability
- [ ] Mock TessieClient needs `getStatus()` and `getBatteryHealth()` methods added

## Sources

### Primary (HIGH confidence)
- [Tessie API - Get Vehicle State](https://developer.tessie.com/reference/get-state) - use_cache parameter, response structure
- [Tessie API - Get Status](https://developer.tessie.com/reference/get-status) - status values: asleep/waiting_for_sleep/awake
- [Tessie API - Get Battery Health](https://developer.tessie.com/reference/get-battery-health) - health_percent, degradation_percent, capacity fields
- [Tessie API - Get Tire Pressure](https://developer.tessie.com/reference/get-tire-pressure) - bar units, front_left/right, rear_left/right
- [Homey Apps SDK - Capabilities](https://apps.developer.homey.app/the-basics/devices/capabilities) - custom capability definitions, sub-capabilities, units, uiComponent
- [Homey Apps SDK - Breaking Changes](https://apps.developer.homey.app/guides/how-to-breaking-changes) - addCapability migration pattern
- [Tesla JSON API - Charge State](https://tesla-api.timdorr.com/vehicle/state/chargestate) - charge_state field reference
- [Tesla JSON API - Climate State](https://tesla-api.timdorr.com/vehicle/state/climatestate) - climate_state field reference (inside_temp, outside_temp in Celsius)
- [Tesla JSON API - GUI Settings](https://tesla-api.timdorr.com/vehicle/state/guisettings) - gui_distance_units, gui_temperature_units

### Secondary (MEDIUM confidence)
- [Tessie HA Integration - Sleep Prevention Issue](https://github.com/home-assistant/core/issues/107982) - confirms use_cache=false prevents sleep
- [Home Assistant Tessie Integration](https://www.home-assistant.io/integrations/tessie/) - comprehensive entity mapping reference
- [Tesla API - Vehicle State fields](https://github.com/timdorr/tesla-api/blob/master/docs/vehicle/state/vehiclestate.md) - tpms_pressure_fl/fr/rl/rr, software_update object, odometer
- [TeslaMate Battery Discussion](https://github.com/adriankumpf/teslamate/issues/321) - battery_level vs usable_battery_level distinction

### Tertiary (LOW confidence)
- Tessie API rate limits: undocumented, no official source found. Defensive approach recommended.
- TPMS data availability when parked: community reports suggest values may reset to 0 when vehicle is in Park. Needs validation with actual API responses.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - using established project patterns, no new libraries
- Architecture: HIGH - Tessie API use_cache mechanism is well-documented and the HA integration validates the approach
- Capability definitions: HIGH - Homey SDK documentation is clear on custom capability format
- Tessie API field mapping: MEDIUM - field names verified via unofficial Tesla API docs + HA integration, but exact Tessie response format not directly inspectable
- Pitfalls: HIGH - well-documented by HA integration issues and community reports
- Battery health: MEDIUM - endpoint exists and returns documented fields, but polling cadence needs validation

**Research date:** 2026-03-03
**Valid until:** 2026-04-03 (Tessie API is stable; Homey SDK v3 is mature)
