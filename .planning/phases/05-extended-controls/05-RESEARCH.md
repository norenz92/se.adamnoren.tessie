# Phase 5: Extended Controls - Research

**Researched:** 2026-03-04
**Domain:** Tessie API vehicle commands, Homey capability definitions, device settings
**Confidence:** HIGH

## Summary

Phase 5 adds 9 requirements covering seat heaters, steering wheel heater, max defrost, climate keeper mode, cabin overheat protection, window vent/close, valet mode, speed limit mode, and charging history. All new commands follow the existing `executeCommand()` pattern (ensureAwake -> command -> refreshState). New capabilities follow established JSON definition patterns (boolean toggles and enum dropdowns). Two features (valet mode, speed limit) require PIN storage via Homey device settings.

The Tessie API wraps Tesla Fleet API commands at `/{vin}/command/{command_name}` with query string parameters. Vehicle state fields in `climate_state` and `vehicle_state` provide read-back for all new controls. Charging history uses a separate GET endpoint `/{vin}/charges`.

**Primary recommendation:** Group implementation into two plans: (1) climate controls (seat heaters, steering wheel heater, defrost, climate keeper, cabin overheat protection) and (2) access controls + charging history (windows, valet, speed limit, charging history).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- One capability per seat: seat_heater_driver, seat_heater_passenger, seat_heater_rear_left, seat_heater_rear_center, seat_heater_rear_right
- Enum dropdown per seat with values: Off / Low / Med / High (maps to API levels 0-3)
- All 5 seats included — API handles missing seats gracefully
- Read + write: show current heater level from vehicle state AND allow control
- Climate keeper mode: single enum capability with values Off / Keep / Dog / Camp
- Cabin overheat protection: single enum capability with values Off / Fan Only / AC
- Max defrost & steering wheel heater: standard boolean toggles (defrost_mode, steering_wheel_heater)
- Charging history: last session summary capabilities (last_charge_energy kWh, last_charge_location string)
- Valet mode: boolean toggle, PIN stored in device settings
- PIN handling: user enters PIN once in device settings, stored per-device, sent automatically
- No Flow cards — those are Phase 6

### Claude's Discretion
- Exact Tessie API endpoints for each new command (research needed)
- Window state tracking approach (depends on what Tessie returns)
- Speed limit capability design (toggle+value vs toggle-only, depends on API)
- Charging history: whether to include cost data (depends on API)
- Charging history: poll frequency fine-tuning
- Seat heater capability naming and enum value labels
- Climate keeper and overheat protection enum value mapping to API
- Error handling for PIN-required commands when no PIN is set
- Capability ordering on the device card

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CHRG-08 | User can view past charging sessions with energy added and location | Tessie GET `/{vin}/charges` endpoint returns charge sessions with energy and location fields |
| CLIM-04 | User can control per-seat heater level (0-3) for each seat | Tessie `set_seat_heating` command with `seat` (0-5) and `level` (0-3) params; climate_state fields for read-back |
| CLIM-05 | User can toggle the steering wheel heater | Tessie `start_steering_wheel_heater` / `stop_steering_wheel_heater` commands; `climate_state.steering_wheel_heater` for read-back |
| CLIM-06 | User can activate and deactivate max defrost mode | Tessie `start_max_defrost` / `stop_max_defrost` commands; `climate_state.defrost_mode` (0=off, non-zero=on) for read-back |
| CLIM-07 | User can set climate keeper mode (Off/Keep/Dog/Camp) | Tessie `set_climate_keeper_mode` with `mode` param (0-3); `climate_state.climate_keeper_mode` for read-back |
| CLIM-08 | User can configure cabin overheat protection mode and temperature | Tessie `set_cabin_overheat_protection` with `on`/`fan_only` params; `climate_state.cabin_overheat_protection` for read-back |
| ACCS-05 | User can vent and close windows | Tessie `vent_windows` / `close_windows` commands; `vehicle_state.fd_window`/`fp_window`/`rd_window`/`rp_window` (0=closed) for read-back |
| ACCS-06 | User can enable and disable valet mode | Tessie `enable_valet` / `disable_valet` commands; `vehicle_state.valet_mode` boolean for read-back; no PIN required by API |
| ACCS-07 | User can set and toggle speed limit mode | Tessie `set_speed_limit`, `enable_speed_limit`, `disable_speed_limit` commands; `vehicle_state.speed_limit_mode` object for read-back; PIN required for activate/deactivate |
</phase_requirements>

## Standard Stack

### Core
No new libraries needed. All implementation uses existing dependencies:

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node:https | built-in | Tessie API calls | Already used by TessieClient |
| homey-apps-sdk-v3-types | ^0.3.0 | TypeScript types for Homey SDK | Already in devDependencies |
| typescript | ^5.9.3 | Compilation | Already in devDependencies |

### Supporting
No additional packages. All new features are implemented via:
- New `.homeycompose/capabilities/*.json` files (capability definitions)
- New `driver.settings.compose.json` file (PIN settings)
- Extensions to `device.ts` (capability listeners, state mappings)
- One new method on `TessieClient` (charging history)

## Architecture Patterns

### Recommended Project Structure
```
.homeycompose/capabilities/
├── seat_heater_driver.json          # Enum: Off/Low/Med/High
├── seat_heater_passenger.json       # Enum: Off/Low/Med/High
├── seat_heater_rear_left.json       # Enum: Off/Low/Med/High
├── seat_heater_rear_center.json     # Enum: Off/Low/Med/High
├── seat_heater_rear_right.json      # Enum: Off/Low/Med/High
├── climate_keeper_mode.json         # Enum: Off/Keep/Dog/Camp
├── cabin_overheat_protection.json   # Enum: Off/Fan Only/AC
├── defrost_mode.json                # Boolean toggle
├── steering_wheel_heater.json       # Boolean toggle
├── windows.json                     # Boolean toggle (closed=true, vented=false)
├── valet_mode.json                  # Boolean toggle
├── speed_limit_mode.json            # Boolean toggle
├── speed_limit_speed.json           # Number (50-90 mph)
├── last_charge_energy.json          # Number sensor (kWh)
└── last_charge_location.json        # String sensor

drivers/vehicle/
├── driver.compose.json              # Add all new capabilities
├── driver.settings.compose.json     # NEW: PIN settings for valet/speed limit
└── device.ts                        # Extended with new listeners + state mappings
```

### Pattern 1: Enum Capability (Settable)
**What:** Dropdown with read+write for multi-value controls
**When to use:** Seat heaters, climate keeper mode, cabin overheat protection
**Example:**
```json
{
  "type": "enum",
  "title": { "en": "Seat Heater (Driver)" },
  "getable": true,
  "setable": true,
  "uiComponent": "picker",
  "values": [
    { "id": "0", "title": { "en": "Off" } },
    { "id": "1", "title": { "en": "Low" } },
    { "id": "2", "title": { "en": "Med" } },
    { "id": "3", "title": { "en": "High" } }
  ]
}
```
Source: Existing `charging_status.json` pattern adapted for setable enums.

### Pattern 2: Boolean Toggle
**What:** On/off switch with read+write
**When to use:** Defrost, steering wheel heater, valet mode, windows, speed limit
**Example:**
```json
{
  "type": "boolean",
  "title": { "en": "Defrost" },
  "getable": true,
  "setable": true,
  "uiComponent": "toggle"
}
```
Source: Existing `sentry_mode.json`, `climate_onoff.json` patterns.

### Pattern 3: Capability Listener with Command Mapping
**What:** Register listener that maps capability value to Tessie API command
**When to use:** All new controllable capabilities
**Example:**
```typescript
// Seat heater - maps enum value to Tessie command params
this.registerCapabilityListener('seat_heater_driver', async (value: string) => {
  await this.executeCommand('set_seat_heating', { seat: 0, level: Number(value) });
});

// Boolean toggle - maps true/false to separate commands
this.registerCapabilityListener('defrost_mode', async (value: boolean) => {
  await this.executeCommand(value ? 'start_max_defrost' : 'stop_max_defrost');
});
```
Source: Existing listeners for `locked`, `sentry_mode`, `climate_onoff` in device.ts.

### Pattern 4: Device Settings for PIN Storage
**What:** User enters PIN in device settings, code reads it for commands
**When to use:** Valet mode, speed limit mode
**Example:**
```json
[
  {
    "type": "group",
    "label": { "en": "Security" },
    "children": [
      {
        "id": "speed_limit_pin",
        "type": "password",
        "label": { "en": "Speed Limit PIN" },
        "hint": { "en": "4-digit PIN for speed limit mode" },
        "value": ""
      }
    ]
  }
]
```
```typescript
// Read PIN from settings
const pin = this.getSetting('speed_limit_pin');
if (!pin) throw new Error('Speed limit PIN not set. Configure it in device settings.');
await this.executeCommand('enable_speed_limit', { pin });
```
Source: Homey Apps SDK device settings documentation.

### Anti-Patterns to Avoid
- **Don't create one capability for all seats:** Each seat needs its own capability for independent control and display on the device card.
- **Don't prompt for PIN on each command:** Store PIN in device settings for headless Flow automation compatibility.
- **Don't poll charging history on every cycle:** Charging history is historical data that changes infrequently. Poll it on init and on a slower cadence (e.g., hourly alongside battery health).

## Tessie API Command Reference

### Discretionary Decisions (Researched)

#### Tessie Command Names
Tessie uses its own command naming that wraps Tesla Fleet API. Based on the Tessie developer docs and the established pattern in TessieClient (`/{vin}/command/{name}`):

| Feature | Tessie Command | Parameters | Notes |
|---------|---------------|------------|-------|
| Seat heating | `set_seat_heating` | `seat` (0-5), `level` (0-3) | seat: 0=driver, 1=passenger, 2=rear_left, 4=rear_center, 5=rear_right |
| Steering wheel heater on | `start_steering_wheel_heater` | none | |
| Steering wheel heater off | `stop_steering_wheel_heater` | none | |
| Max defrost on | `start_max_defrost` | none | |
| Max defrost off | `stop_max_defrost` | none | |
| Climate keeper mode | `set_climate_keeper_mode` | `mode` (0-3) | 0=Off, 1=Keep, 2=Dog, 3=Camp |
| Cabin overheat protection | `set_cabin_overheat_protection` | `on` (bool), `fan_only` (bool) | on=false -> Off, on=true+fan_only=true -> Fan Only, on=true+fan_only=false -> AC |
| Vent windows | `vent_windows` | none | |
| Close windows | `close_windows` | none | |
| Enable valet | `enable_valet` | none | PIN NOT required by Tessie API |
| Disable valet | `disable_valet` | none | PIN NOT required by Tessie API |
| Set speed limit | `set_speed_limit` | `limit_mph` (50-90) | Always MPH |
| Enable speed limit | `enable_speed_limit` | `pin` (4-digit string) | PIN required |
| Disable speed limit | `disable_speed_limit` | `pin` (4-digit string) | PIN required |

**Confidence:** MEDIUM - Command names derived from Tessie developer docs (llms.txt index), Tesla unofficial API docs, and Tessie Python wrapper patterns. Exact parameter names may vary slightly.

#### Vehicle State Fields for Read-Back

| Feature | State Path | Type | Values |
|---------|-----------|------|--------|
| Seat heater (driver) | `climate_state.seat_heater_left` | int | 0-3 |
| Seat heater (passenger) | `climate_state.seat_heater_right` | int | 0-3 |
| Seat heater (rear left) | `climate_state.seat_heater_rear_left` | int | 0-3 |
| Seat heater (rear center) | `climate_state.seat_heater_rear_center` | int | 0-3 |
| Seat heater (rear right) | `climate_state.seat_heater_rear_right` | int | 0-3 |
| Steering wheel heater | `climate_state.steering_wheel_heater` | bool | true/false |
| Defrost mode | `climate_state.defrost_mode` | int | 0=off, non-zero=on |
| Climate keeper mode | `climate_state.climate_keeper_mode` | string | "off", "dog", "camp", "keep" |
| Cabin overheat protection | `climate_state.cabin_overheat_protection` | string | "Off", "FanOnly", "On" |
| COP activation temp | `climate_state.cop_activation_temperature` | string | "High", "Medium", "Low" |
| Window (front driver) | `vehicle_state.fd_window` | int | 0=closed, 1=vented, 2=open |
| Window (front passenger) | `vehicle_state.fp_window` | int | 0=closed |
| Window (rear driver) | `vehicle_state.rd_window` | int | 0=closed |
| Window (rear passenger) | `vehicle_state.rp_window` | int | 0=closed |
| Valet mode | `vehicle_state.valet_mode` | bool | true/false |
| Speed limit active | `vehicle_state.speed_limit_mode.active` | bool | true/false |
| Speed limit mph | `vehicle_state.speed_limit_mode.current_limit_mph` | number | 50-90 |
| Speed limit PIN set | `vehicle_state.speed_limit_mode.pin_code_set` | bool | true/false |

**Confidence:** HIGH - Fields verified via unofficial Tesla API documentation (timdorr/tesla-api), which Tessie passes through in its `/{vin}/state` endpoint.

#### Window Capability Design (Discretionary)
**Recommendation:** Single boolean toggle `windows` (closed=true, vented=false).
- Rationale: Tessie only offers `vent_windows` and `close_windows` as all-or-nothing commands (no per-window control). Individual window state fields exist for read-back but individual control is not possible.
- The toggle shows aggregate window state: true when all 4 windows report 0 (closed), false when any window is non-zero.
- This matches the existing trunk/frunk button pattern.

#### Speed Limit Capability Design (Discretionary)
**Recommendation:** Boolean toggle `speed_limit_mode` (active/inactive) + number capability `speed_limit_speed` (50-90, units: mph).
- Rationale: The API supports separate set + activate/deactivate operations. Users need both: set the speed AND toggle activation.
- The toggle calls `enable_speed_limit`/`disable_speed_limit` (requires PIN from settings).
- The number control calls `set_speed_limit` with `limit_mph` parameter (no PIN needed to set, only to activate).
- Read-back from `vehicle_state.speed_limit_mode.active` and `vehicle_state.speed_limit_mode.current_limit_mph`.

#### Charging History Design (Discretionary)
**Recommendation:** Include cost if available, fetch on init + hourly cadence (alongside battery health).
- Tessie `GET /{vin}/charges` returns charge sessions with fields including energy, location, and cost data.
- The charging invoices endpoint returns: `energy_used`, `location`, `total_cost`, `cost_per_kwh`, `currency`.
- **Include cost:** Add `last_charge_cost` string capability (formatted as "$X.XX" or locale equivalent). Only populate if the API returns cost data.
- **Poll frequency:** Fetch on device init and on the existing battery health hourly cadence. Charging history is historical and changes only after a charge session completes.

#### Valet Mode PIN (Discretionary)
**Recommendation:** No PIN field needed for valet mode.
- The Tessie API `enable_valet` and `disable_valet` commands do NOT require a PIN parameter.
- Simplifies implementation: valet is a simple boolean toggle like sentry mode.
- Only speed limit mode needs PIN storage in device settings.

#### Error Handling for Missing PIN
**Recommendation:** Throw descriptive error when speed limit toggle is used without PIN configured.
```typescript
const pin = this.getSetting('speed_limit_pin');
if (!pin) {
  throw new Error('Speed limit PIN not configured. Set it in device settings.');
}
```
This surfaces a user-friendly message in the Homey UI and prevents silent failures.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Seat heater seat number mapping | Custom seat name to number mapper | Hardcoded constant map | Only 5 fixed seats, mapping is static and well-known |
| Climate mode enum to API value conversion | Complex switch/case | Simple lookup object | Direct integer mapping (0-3) |
| Device settings UI | Custom pair view for PIN input | `driver.settings.compose.json` | Homey provides settings UI for free with type: "password" |
| Charging history formatting | Custom date/currency formatters | Simple string concatenation | Only displaying last session, not complex table |

## Common Pitfalls

### Pitfall 1: Seat Number Mapping is Non-Sequential
**What goes wrong:** Assuming seats are numbered 0-5 sequentially. Rear center is 4 (not 3), rear right is 5.
**Why it happens:** API seat numbering has a gap (0, 1, 2, 4, 5 — no seat 3).
**How to avoid:** Use a constant map:
```typescript
const SEAT_MAP: Record<string, number> = {
  seat_heater_driver: 0,
  seat_heater_passenger: 1,
  seat_heater_rear_left: 2,
  seat_heater_rear_center: 4,
  seat_heater_rear_right: 5,
};
```
**Warning signs:** Rear center heater controlling wrong seat.

### Pitfall 2: Climate Keeper Mode String vs Integer Mismatch
**What goes wrong:** Sending string values to API or comparing wrong types from state.
**Why it happens:** API command takes integer (0-3), but state returns string ("off", "dog", "camp", "keep").
**How to avoid:** Map in both directions:
```typescript
const CLIMATE_KEEPER_TO_API: Record<string, number> = { 'off': 0, 'keep': 1, 'dog': 2, 'camp': 3 };
const CLIMATE_KEEPER_FROM_STATE: Record<string, string> = { 'off': 'Off', 'keep': 'Keep', 'dog': 'Dog', 'camp': 'Camp' };
```
**Warning signs:** "Invalid enum value" errors in Homey logs.

### Pitfall 3: Cabin Overheat Protection Two-Parameter Mapping
**What goes wrong:** Treating COP as a simple enum when the API needs two booleans.
**Why it happens:** UI shows 3 options (Off/Fan Only/AC) but API uses `on` + `fan_only` boolean combination.
**How to avoid:** Map the enum to two params:
```typescript
const COP_MAP: Record<string, { on: boolean; fan_only: boolean }> = {
  'Off': { on: false, fan_only: false },
  'FanOnly': { on: true, fan_only: true },
  'AC': { on: true, fan_only: false },
};
```
**Warning signs:** COP always setting to same mode regardless of selection.

### Pitfall 4: Speed Limit Units Are Always MPH
**What goes wrong:** Sending km/h value to API that expects MPH.
**Why it happens:** Vehicle may be configured for metric, but speed limit API always uses MPH (50-90).
**How to avoid:** Always pass MPH to API. Display can convert for UI but API parameter is always `limit_mph`.
**Warning signs:** Speed limit set to wrong value (e.g., 80 km/h interpreted as 80 mph).

### Pitfall 5: Window State Aggregation
**What goes wrong:** Showing windows as "closed" when only some windows are closed.
**Why it happens:** 4 separate window state fields but single boolean capability.
**How to avoid:** Aggregate: windows are "closed" only when ALL four window fields equal 0.
```typescript
const allClosed = [fd_window, fp_window, rd_window, rp_window].every(w => w === 0);
await this.setCapabilityValue('windows', allClosed);
```
**Warning signs:** Window toggle showing "closed" when one window is vented.

### Pitfall 6: Capability Migration for Existing Devices
**What goes wrong:** New capabilities not appearing on already-paired devices.
**Why it happens:** Capabilities are only set during pairing; existing devices need migration.
**How to avoid:** All new capabilities MUST be added to the `ALL_CAPABILITIES` array in device.ts. The existing migration loop handles adding missing capabilities on init.
**Warning signs:** New controls visible on freshly paired devices but not on existing ones.

### Pitfall 7: Charging History Endpoint is Different Pattern
**What goes wrong:** Trying to use `client.command()` for charging history.
**Why it happens:** Unlike commands, charging history is a GET request to `/{vin}/charges`, not a command endpoint.
**How to avoid:** Add a new `getCharges(vin)` method to TessieClient, similar to existing `getVehicle()` and `getBatteryHealth()`.
**Warning signs:** 404 or method-not-allowed errors when fetching charges.

## Code Examples

### Seat Heater Capability Listener
```typescript
// Source: Established pattern from device.ts + Tessie API docs
const SEAT_MAP: Record<string, number> = {
  seat_heater_driver: 0,
  seat_heater_passenger: 1,
  seat_heater_rear_left: 2,
  seat_heater_rear_center: 4,
  seat_heater_rear_right: 5,
};

for (const [capId, seatNum] of Object.entries(SEAT_MAP)) {
  this.registerCapabilityListener(capId, async (value: string) => {
    await this.executeCommand('set_seat_heating', { seat: seatNum, level: Number(value) });
  });
}
```

### Seat Heater State Mapping
```typescript
// Source: climate_state fields from Tesla API docs
const SEAT_STATE_MAP: Array<[string, string]> = [
  ['seat_heater_left', 'seat_heater_driver'],
  ['seat_heater_right', 'seat_heater_passenger'],
  ['seat_heater_rear_left', 'seat_heater_rear_left'],
  ['seat_heater_rear_center', 'seat_heater_rear_center'],
  ['seat_heater_rear_right', 'seat_heater_rear_right'],
];

for (const [stateField, capId] of SEAT_STATE_MAP) {
  const val = state.climate_state?.[stateField];
  if (val != null) {
    await this.setCapabilityValue(capId, String(val));
  }
}
```

### Climate Keeper Mode Mapping
```typescript
// Source: Tessie API + Tesla API climate_state docs
const KEEPER_FROM_STATE: Record<string, string> = {
  'off': 'Off', 'keep': 'Keep', 'dog': 'Dog', 'camp': 'Camp',
};
const KEEPER_TO_API: Record<string, number> = {
  'Off': 0, 'Keep': 1, 'Dog': 2, 'Camp': 3,
};

// Read-back
if (state.climate_state?.climate_keeper_mode != null) {
  const mapped = KEEPER_FROM_STATE[state.climate_state.climate_keeper_mode] || 'Off';
  await this.setCapabilityValue('climate_keeper_mode', mapped);
}

// Write
this.registerCapabilityListener('climate_keeper_mode', async (value: string) => {
  await this.executeCommand('set_climate_keeper_mode', { mode: KEEPER_TO_API[value] });
});
```

### Charging History Fetch
```typescript
// New method on TessieClient
async getCharges(vin: string): Promise<any[]> {
  const response = await this.request(`/${vin}/charges`);
  return Array.isArray(response.results) ? response.results : [];
}

// In device.ts - get last charge
const charges = await this.client.getCharges(vin);
if (charges.length > 0) {
  const last = charges[0]; // Most recent
  if (last.charge_energy_added != null) {
    await this.setCapabilityValue('last_charge_energy', Math.round(last.charge_energy_added * 10) / 10);
  }
  if (last.location) {
    await this.setCapabilityValue('last_charge_location', last.location);
  }
}
```

### Device Settings for Speed Limit PIN
```json
[
  {
    "type": "group",
    "label": { "en": "Security PINs" },
    "children": [
      {
        "id": "speed_limit_pin",
        "type": "password",
        "label": { "en": "Speed Limit PIN" },
        "hint": { "en": "4-digit PIN required to activate/deactivate speed limit mode" },
        "value": ""
      }
    ]
  }
]
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tesla Owner API direct | Tessie wraps Tesla Fleet API | 2023-2024 | Tessie handles OAuth, command signing, wake management |
| `set_valet_mode` with password | `enable_valet` / `disable_valet` (no PIN) | Tessie API simplification | No PIN needed for valet via Tessie |
| Single `remote_seat_heater_request` | Tessie `set_seat_heating` | Tessie wrapper | Same underlying API, simplified name |

## Open Questions

1. **Exact response format of `GET /{vin}/charges`**
   - What we know: Endpoint exists, returns charge sessions with energy/location data
   - What's unclear: Exact field names in response (could be `charge_energy_added` or `energy_used` or `energy_added`). Charging invoices use `energy_used`.
   - Recommendation: Implement defensively — check for multiple possible field names, log response on first fetch for debugging. LOW confidence on exact field names.

2. **Cabin overheat protection temperature setting**
   - What we know: `set_cabin_overheat_protection_temp` command exists. State has `cop_activation_temperature` with values "High"/"Medium"/"Low".
   - What's unclear: Whether this should be a separate capability or if the three-value enum (Off/Fan Only/AC) is sufficient for CLIM-08.
   - Recommendation: Skip temperature setting for now. The requirement says "configure cabin overheat protection mode and temperature" but the temperature is just High/Medium/Low — could add later. Focus on mode toggle which is the primary user need.

3. **Seat heater rear fields may be absent on some vehicles**
   - What we know: Not all Tesla models have heated rear seats. State fields may be null/undefined.
   - What's unclear: Whether the API returns an error or silently ignores commands for missing seats.
   - Recommendation: All 5 seat capabilities added (per user decision), but handle null state gracefully. The capability shows on the card but displays no value if seat doesn't exist.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (node:test) |
| Config file | tsconfig.test.json (compiles to dist-test/) |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CLIM-04 | Seat heater capability listeners send correct command with seat+level | unit | `node --test dist-test/tests/device-controls.test.js` | Yes (extend) |
| CLIM-05 | Steering wheel heater toggle sends start/stop commands | unit | `node --test dist-test/tests/device-controls.test.js` | Yes (extend) |
| CLIM-06 | Defrost toggle sends start_max_defrost/stop_max_defrost | unit | `node --test dist-test/tests/device-controls.test.js` | Yes (extend) |
| CLIM-07 | Climate keeper mode enum sends correct mode integer | unit | `node --test dist-test/tests/device-controls.test.js` | Yes (extend) |
| CLIM-08 | Cabin overheat protection enum maps to on/fan_only booleans | unit | `node --test dist-test/tests/device-controls.test.js` | Yes (extend) |
| ACCS-05 | Window toggle sends vent_windows/close_windows | unit | `node --test dist-test/tests/device-controls.test.js` | Yes (extend) |
| ACCS-06 | Valet mode toggle sends enable_valet/disable_valet | unit | `node --test dist-test/tests/device-controls.test.js` | Yes (extend) |
| ACCS-07 | Speed limit toggle reads PIN from settings, sends with command | unit | `node --test dist-test/tests/device-controls.test.js` | Yes (extend) |
| ACCS-07 | Speed limit toggle without PIN throws descriptive error | unit | `node --test dist-test/tests/device-controls.test.js` | Yes (extend) |
| CHRG-08 | getCharges returns parsed charge array | unit | `node --test dist-test/tests/tessie-client.test.js` | Yes (extend) |
| CHRG-08 | updateCapabilities maps last charge to capabilities | unit | `node --test dist-test/tests/device.test.js` | Yes (extend) |

### Sampling Rate
- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
None — existing test infrastructure covers all phase requirements. Tests extend existing files (`device-controls.test.ts`, `tessie-client.test.ts`, `device.test.ts`).

## Sources

### Primary (HIGH confidence)
- [timdorr/tesla-api - climate state](https://github.com/timdorr/tesla-api/blob/master/docs/vehicle/state/climatestate.md) - seat heater fields, climate keeper mode, cabin overheat protection, defrost mode state fields
- [timdorr/tesla-api - climate commands](https://github.com/timdorr/tesla-api/blob/master/docs/vehicle/commands/climate.md) - remote_seat_heater_request params (seat 0-5, level 0-3), steering wheel heater, set_preconditioning_max, set_climate_keeper_mode, set_cabin_overheat_protection
- [timdorr/tesla-api - vehicle state](https://github.com/timdorr/tesla-api/blob/master/docs/vehicle/state/vehiclestate.md) - window fields (fd_window etc), valet_mode, speed_limit_mode object
- [timdorr/tesla-api - speed limit](https://github.com/timdorr/tesla-api/blob/master/docs/vehicle/commands/speedlimit.md) - speed_limit_set_limit, activate, deactivate commands with PIN params
- [timdorr/tesla-api - valet](https://github.com/timdorr/tesla-api/blob/master/docs/vehicle/commands/valet.md) - set_valet_mode, password not required
- [Homey Apps SDK - Device Settings](https://apps.developer.homey.app/the-basics/devices/settings) - driver.settings.compose.json format, password type, onSettings callback
- Existing codebase: device.ts, tessie-client.ts, capability JSON files (direct inspection)

### Secondary (MEDIUM confidence)
- [Tessie Developer Docs - llms.txt](https://developer.tessie.com/llms.txt) - Full command list including set_seat_heating, start/stop_steering_wheel_heater, start/stop_max_defrost, vent/close_windows
- [Tessie Developer Docs - Set Climate Keeper Mode](https://developer.tessie.com/reference/set-climate-keeper-mode) - Confirmed endpoint exists
- [Tessie Developer Docs - Enable Valet](https://developer.tessie.com/reference/enable-valet) - Confirmed endpoint exists, no PIN required
- [Tessie Developer Docs - Set Speed Limit](https://developer.tessie.com/reference/set-speed-limit) - Confirmed endpoint with limit_mph param
- [Tessie Developer Docs - Get Charges](https://developer.tessie.com/reference/get-charges) - Charging history endpoint confirmed

### Tertiary (LOW confidence)
- Tessie charging history response field names - Could be `charge_energy_added`, `energy_used`, or `energy_added`. Multiple naming conventions seen across different Tessie endpoints.
- Tessie `set_seat_heating` exact parameter names - Derived from Tesla API `remote_seat_heater_request` but Tessie may rename params (e.g., `seat` vs `heater`, `level` vs `seat_heater_level`).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies, extends existing patterns
- Architecture: HIGH - Direct extension of established capability + listener patterns
- API commands: MEDIUM - Command names confirmed via Tessie docs index; exact parameter names may differ slightly from Tesla API
- State field mapping: HIGH - Verified via timdorr/tesla-api documentation
- Charging history fields: LOW - Endpoint confirmed but exact response schema unverified
- Pitfalls: HIGH - Well-documented in Tesla API community

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (stable domain, Tessie API rarely changes)
