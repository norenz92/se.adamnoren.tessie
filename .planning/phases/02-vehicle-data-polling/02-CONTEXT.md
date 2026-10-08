# Phase 2: Vehicle Data & Polling - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Display all vehicle sensor data on Homey device cards with sleep-aware REST polling. Covers battery, range, charging status, temperatures, GPS location, tire pressures, odometer, software update status, and battery health. Polling must not wake sleeping vehicles. No vehicle commands — controls come in Phase 3. No WebSocket streaming — that's Phase 4.

</domain>

<decisions>
## Implementation Decisions

### Device card data density
- All sensor data on the main card — no primary/secondary split, Homey handles scrolling
- Four separate tire pressure capabilities (FL, FR, RL, RR) — one per wheel
- Battery level (`measure_battery`) and lock state (`locked`) already exist from Phase 1

### Sleep-aware polling
- Adaptive poll intervals: poll more frequently when vehicle is awake or charging, reduce frequency when asleep
- Show last known capability values when asleep — data doesn't change while sleeping so values remain accurate
- Add a vehicle state capability showing sleep status (e.g. "Asleep", "Awake", "Offline") as a visual indicator
- Wake on init: fetch full state immediately when device initializes, even if vehicle is sleeping — user just paired it and expects data
- Distinct states for "Asleep" (normal, vehicle resting) vs "Offline" (problem, can't reach vehicle at all)

### Capability units
- Range and odometer: follow the Tessie/Tesla vehicle unit setting (km or miles depending on what the vehicle reports)
- Tire pressure: follow the vehicle unit setting (bar or psi)
- Consistent approach: respect the user's Tesla unit preferences rather than forcing a single unit system

### Error handling
- Retry a few failed polls before marking device unavailable — tolerate brief API hiccups rather than flipping unavailable on first failure
- Sleep indicator on card is sufficient for data freshness — no separate "last updated" timestamp capability needed

### Claude's Discretion
- Sleep check approach (status endpoint vs use_cache parameter vs other Tessie API mechanism)
- Exact adaptive poll interval values (awake rate, asleep rate, charging rate)
- Number of retries before marking unavailable
- GPS location representation (lat/lng capabilities vs address string vs Homey location capability)
- Charging status capability type (text enum, boolean + text, or other)
- Temperature units (Celsius vs follow vehicle — research Homey's temperature capability conventions)
- Software update status display format
- Battery health/degradation display format (depends on what Tessie API actually provides)

</decisions>

<specifics>
## Specific Ideas

No specific references — open to standard Homey app patterns and Tessie API conventions.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TessieClient` (`lib/tessie-client.ts`): Has `getVehicle(vin)` for full state and `getStatus(vin)` for lightweight status check — both usable for sleep-aware polling
- `VehicleDevice.refreshState()` (`drivers/car/device.ts`): Existing poll cycle fetching battery and lock — extend this for all capabilities
- `driver.compose.json`: Current capabilities `["measure_battery", "locked"]` — extend with all new sensor capabilities

### Established Patterns
- `node:https` for API calls (no fetch/axios)
- `export =` for CommonJS compatibility
- `homey.setInterval` for periodic polling
- `setAvailable()`/`setUnavailable()` for device reachability
- Token stored per-device via `getStoreValue('token')`

### Integration Points
- `driver.compose.json` capabilities array — add all new capabilities here
- `VehicleDevice.refreshState()` — expand to map all Tessie API state fields to Homey capabilities
- `VehicleDevice.onInit()` — modify polling setup for adaptive intervals and sleep awareness
- `TessieClient` — may need new methods or parameters for sleep-aware data fetching

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-vehicle-data-polling*
*Context gathered: 2026-03-03*
