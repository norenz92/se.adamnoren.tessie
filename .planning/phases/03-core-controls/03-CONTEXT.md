# Phase 3: Core Controls - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Essential vehicle commands from Homey device cards and capability listeners. Covers: start/stop charging, charge limit adjustment, charging amps adjustment, charge port open/close, climate on/off, target cabin temperature, lock/unlock, sentry mode toggle, trunk open/close, and frunk open. Commands must auto-wake sleeping vehicles. No extended controls (seat heaters, windows, valet, speed limit) — those are Phase 5.

</domain>

<decisions>
## Implementation Decisions

### Command feedback & confirmation
- After a successful command, trigger an immediate re-poll of vehicle state so capabilities reflect the actual result
- Do not wait for the next scheduled adaptive poll cycle — re-poll right away

### Wake behavior
- All commands auto-wake sleeping vehicles before executing — no commands are blocked when asleep
- Success criteria requires this: "Commands sent to a sleeping vehicle wake it automatically before executing"

### Trunk & frunk presentation
- Frunk: button/action capability (open only) — no close API exists, so no toggle state
- Trunk: boolean toggle (open/close) — reflects actual trunk state from polling
- Charge port: boolean toggle (open/close) — consistent with trunk pattern

### Charge limit control
- Slider capability for charge limit percentage (50-100%)
- Matches Homey's dim-style slider pattern — visual, intuitive

### Charging amps control
- Slider capability with dynamic max based on connected charger
- Max amps updates based on what charger is connected

### Climate control
- Use Homey's standard `target_temperature` thermostat capability for cabin temperature setting
- Climate on/off as a boolean toggle (Homey `onoff` or equivalent thermostat mode)

### Claude's Discretion
- Command feedback approach (optimistic update vs wait for confirmation)
- Error notification method for failed commands (toast, silent revert, or other)
- Treatment of Tessie API "queued" command responses
- Wake implementation details (timeout, retry behavior, shared wake method)
- Charge limit slider step size (1% vs 5%)
- Charging amps slider step size and min/max behavior
- Climate temperature min/max/step values
- Sentry mode capability type (boolean toggle)
- No safety confirmations for trunk/frunk — just execute immediately
- Lock state and sentry mode state refresh after command completes (per success criteria)

</decisions>

<specifics>
## Specific Ideas

No specific references — open to standard Homey app patterns and Tessie API conventions.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TessieClient` (`lib/tessie-client.ts`): Currently GET-only with `request()` method — needs POST/command methods for vehicle controls
- `VehicleDevice.registerCapabilityListener('locked', ...)`: Placeholder already exists in device.ts (line 38), throws "Control not yet available" — replace with actual lock/unlock implementation
- `VehicleDevice.updateCapabilities()`: Maps Tessie state to Homey capabilities — extend to include new control capabilities (charge port state, trunk state, sentry mode, etc.)
- `VehicleDevice.pollCycle()` and `scheduleNextPoll()`: Existing adaptive polling infrastructure — re-poll mechanism can hook into this

### Established Patterns
- `node:https` for all API calls (no fetch/axios)
- `export =` for CommonJS compatibility
- `homey.setTimeout` for scheduling (not `setInterval` for adaptive polling)
- `setAvailable()`/`setUnavailable()` for device reachability
- Token stored per-device via `getStoreValue('token')`
- `driver.compose.json` capabilities array for capability registration

### Integration Points
- `driver.compose.json`: Add new control capabilities (charge_limit, charging_amps, target_temperature, sentry_mode, trunk, frunk, charge_port, climate_onoff)
- `TessieClient`: Add command methods (startCharging, stopCharging, setChargeLimit, setChargingAmps, openChargePort, closeChargePort, climateOn, climateOff, setTemperature, lock, unlock, sentryOn, sentryOff, openTrunk, openFrunk)
- `VehicleDevice.onInit()`: Register capability listeners for all new controllable capabilities
- `VehicleDevice.updateCapabilities()`: Add mappings for trunk state, charge port state, sentry mode, charge limit, charging amps from Tessie API response

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-core-controls*
*Context gathered: 2026-03-04*
