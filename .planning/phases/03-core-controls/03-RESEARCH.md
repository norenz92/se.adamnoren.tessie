# Phase 3: Core Controls - Research

**Researched:** 2026-03-04
**Domain:** Tessie API vehicle commands + Homey SDK settable capabilities
**Confidence:** HIGH

## Summary

Phase 3 adds vehicle control capabilities to the existing Homey device. The Tessie API provides a consistent command pattern: `POST /{vin}/command/{command_name}` with optional `wait_for_completion` and `max_attempts` query parameters, returning `{ "result": boolean }`. All 15 command endpoints needed for this phase follow this exact pattern, making the TessieClient extension straightforward.

The Homey SDK supports settable capabilities via `registerCapabilityListener()` on the device, with `uiComponent` options including `slider` (for charge limit, charging amps), `thermostat` (for target temperature), `toggle` (for boolean on/off), and `button` (for one-shot actions like frunk open). New custom capabilities are defined as JSON files in `.homeycompose/capabilities/` and registered in `driver.compose.json`.

**Primary recommendation:** Extend `TessieClient` with a generic `command()` method that handles POST requests with query parameters, then build thin wrappers per command. Add a `wakeAndCommand()` helper on the device that calls wake before any command when the vehicle is asleep. Define all new capabilities in `.homeycompose/capabilities/` and register listeners in `VehicleDevice.onInit()`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- After a successful command, trigger an immediate re-poll of vehicle state so capabilities reflect the actual result
- Do not wait for the next scheduled adaptive poll cycle -- re-poll right away
- All commands auto-wake sleeping vehicles before executing -- no commands are blocked when asleep
- Frunk: button/action capability (open only) -- no close API exists, so no toggle state
- Trunk: boolean toggle (open/close) -- reflects actual trunk state from polling
- Charge port: boolean toggle (open/close) -- consistent with trunk pattern
- Slider capability for charge limit percentage (50-100%)
- Slider capability for charging amps with dynamic max based on connected charger
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
- No safety confirmations for trunk/frunk -- just execute immediately
- Lock state and sentry mode state refresh after command completes (per success criteria)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CHRG-04 | Start and stop charging via device or Flow action | `POST /{vin}/command/start_charging` and `stop_charging` endpoints verified |
| CHRG-05 | View and adjust charge limit percentage | `POST /{vin}/command/set_charge_limit?percent=N`; state from `charge_state.charge_limit_soc` |
| CHRG-06 | View and adjust charging amps | `POST /{vin}/command/set_charging_amps?amps=N`; state from `charge_state.charge_current_request` and `charge_current_request_max` |
| CHRG-07 | Open and close charge port via device or Flow action | `POST /{vin}/command/open_charge_port` and `close_charge_port`; state from `charge_state.charge_port_door_open` |
| CLIM-01 | Turn climate on and off via device or Flow action | `POST /{vin}/command/start_climate` and `stop_climate`; state from `climate_state.is_climate_on` |
| CLIM-02 | Set target cabin temperature | `POST /{vin}/command/set_temperatures?temperature=N` (Celsius, 15-28); state from `climate_state.driver_temp_setting` |
| ACCS-01 | Lock/unlock vehicle via device or Flow action | `POST /{vin}/command/lock` and `unlock`; state from `vehicle_state.locked` (already mapped) |
| ACCS-02 | Toggle sentry mode on/off via device or Flow action | `POST /{vin}/command/enable_sentry` and `disable_sentry`; state from `vehicle_state.sentry_mode` |
| ACCS-03 | Open trunk via device or Flow action | `POST /{vin}/command/activate_rear_trunk`; state from `vehicle_state.rt` (integer, 0=closed) |
| ACCS-04 | Open frunk via device or Flow action | `POST /{vin}/command/activate_front_trunk`; state from `vehicle_state.ft` (integer, 0=closed) |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node:https | built-in | HTTP requests to Tessie API | Already used in TessieClient, project convention |
| Homey Apps SDK v3 | 3.x | Device capabilities, listeners | Project runtime |

### Supporting
No additional libraries needed. All functionality is built on existing `node:https` and Homey SDK.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| node:https | node-fetch / axios | Project convention is node:https, no external deps |

**Installation:**
```bash
# No new packages needed
```

## Tessie API Command Reference

All commands use the same pattern. Verified from official Tessie developer docs (developer.tessie.com).

### Command Endpoints (all POST)

| Command | Path | Extra Query Params |
|---------|------|--------------------|
| Wake | `/{vin}/wake` | none |
| Lock | `/{vin}/command/lock` | - |
| Unlock | `/{vin}/command/unlock` | - |
| Start Charging | `/{vin}/command/start_charging` | - |
| Stop Charging | `/{vin}/command/stop_charging` | - |
| Set Charge Limit | `/{vin}/command/set_charge_limit` | `percent` (number, required) |
| Set Charging Amps | `/{vin}/command/set_charging_amps` | `amps` (number, required) |
| Open Charge Port | `/{vin}/command/open_charge_port` | - |
| Close Charge Port | `/{vin}/command/close_charge_port` | - |
| Start Climate | `/{vin}/command/start_climate` | - |
| Stop Climate | `/{vin}/command/stop_climate` | - |
| Set Temperature | `/{vin}/command/set_temperatures` | `temperature` (number, Celsius, 15-28) |
| Enable Sentry | `/{vin}/command/enable_sentry` | - |
| Disable Sentry | `/{vin}/command/disable_sentry` | - |
| Open Rear Trunk | `/{vin}/command/activate_rear_trunk` | - |
| Open Front Trunk | `/{vin}/command/activate_front_trunk` | - |

### Common Query Parameters (all commands except wake)
- `wait_for_completion` (boolean, default: `true`) -- wait for vehicle confirmation
- `max_attempts` (integer, default: `3`, range: 1-3) -- retry count

### Response Format (all commands)
```json
{ "result": true }
```

### Vehicle State Fields for Polling

| Capability | API Path | Type |
|------------|----------|------|
| Lock state | `vehicle_state.locked` | boolean |
| Sentry mode | `vehicle_state.sentry_mode` | boolean |
| Rear trunk | `vehicle_state.rt` | integer (0=closed, non-zero=open) |
| Front trunk | `vehicle_state.ft` | integer (0=closed, non-zero=open) |
| Charge port open | `charge_state.charge_port_door_open` | boolean |
| Charge limit | `charge_state.charge_limit_soc` | number (50-100) |
| Charging amps | `charge_state.charge_current_request` | number |
| Max charging amps | `charge_state.charge_current_request_max` | number |
| Climate on | `climate_state.is_climate_on` | boolean |
| Target temperature | `climate_state.driver_temp_setting` | number (Celsius) |
| Charging state | `charge_state.charging_state` | string (already mapped) |

## Architecture Patterns

### New Capability Definitions

Define in `.homeycompose/capabilities/`:

| Capability ID | Type | uiComponent | setable | getable | Details |
|---------------|------|-------------|---------|---------|---------|
| `charge_limit` | number | slider | true | true | min: 50, max: 100, step: 1, units: "%" |
| `charging_amps` | number | slider | true | true | min: 1, max: 48, step: 1, units: "A" |
| `target_temperature` | number | thermostat | true | true | min: 15, max: 28, step: 0.5, units: "C" |
| `climate_onoff` | boolean | toggle | true | true | title: "Climate" |
| `sentry_mode` | boolean | toggle | true | true | title: "Sentry Mode" |
| `charge_port` | boolean | toggle | true | true | title: "Charge Port" |
| `trunk` | boolean | toggle | true | true | title: "Trunk" |
| `frunk` | boolean | button | true | false | title: "Frunk" (action only, not getable) |
| `charging_control` | boolean | toggle | true | true | title: "Charging" (start/stop) |

**Notes on capability choices:**
- `target_temperature` uses the Homey built-in `thermostat` uiComponent which provides a nice temperature dial UI. Pair it with existing `measure_temperature.inside` for the thermostat display.
- `frunk` is `setable: true, getable: false` with `uiComponent: button` because there is no close command and we only trigger an open action.
- `trunk` is a boolean toggle because `activate_rear_trunk` is actually a toggle command (open if closed, close if open).
- `charging_control` is separate from the existing `charging_status` enum sensor, which remains read-only for status display.

### Recommended Discretion Choices

**Command feedback: wait for confirmation (not optimistic update)**
- Tessie's `wait_for_completion=true` (default) blocks until the vehicle confirms. This takes 2-10 seconds but guarantees accuracy.
- After command succeeds, trigger immediate re-poll (per locked decision) to update all capabilities.
- If command fails (`result: false`), throw an error that Homey displays as a notification.

**Error handling: throw Error with descriptive message**
- Homey catches errors from `registerCapabilityListener` callbacks and shows them as notifications.
- Revert capability value to previous state on failure (re-poll handles this automatically).

**Wake implementation: shared `ensureAwake()` method**
- Before any command, check `vehicle_state_status` capability. If asleep, call `POST /{vin}/wake` first.
- Wake can take 10-30 seconds. Use a polling loop (check status every 2s, timeout after 30s).
- Cache wake state briefly (e.g., 60s) to avoid redundant wake calls for rapid command sequences.

**Charge limit step: 1%** -- matches Tesla app behavior, gives full control.

**Charging amps: step 1A, min 1, max 48** -- max dynamically updated from `charge_current_request_max` during polling. Default max of 48A covers most home chargers.

**Temperature: min 15, max 28, step 0.5** -- matches Tessie API range exactly (verified from set_temperatures endpoint).

**Sentry mode: boolean toggle** -- simple on/off maps directly to enable_sentry/disable_sentry.

### TessieClient Extension Pattern

```typescript
// Source: Pattern derived from existing TessieClient.request() + Tessie API docs
async command(vin: string, command: string, params?: Record<string, string | number | boolean>): Promise<boolean> {
  const query = new URLSearchParams();
  query.set('wait_for_completion', 'true');
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      query.set(key, String(value));
    }
  }
  const path = `/${vin}/command/${command}?${query.toString()}`;
  const response = await this.request(path, 'POST');
  return response.result === true;
}

async wake(vin: string): Promise<boolean> {
  const response = await this.request(`/${vin}/wake`, 'POST');
  return response.result === true;
}
```

### Device Wake-and-Command Pattern

```typescript
// Source: Pattern for VehicleDevice
private async ensureAwake(): Promise<void> {
  const vin = this.getData().id;
  const status = this.getCapabilityValue('vehicle_state_status');
  if (status === 'Asleep') {
    await this.client.wake(vin);
    // Poll status until awake or timeout
    const maxWait = 30_000;
    const pollInterval = 2_000;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      await new Promise(resolve => this.homey.setTimeout(resolve, pollInterval));
      const statusResp = await this.client.getStatus(vin);
      if (statusResp?.status === 'awake') {
        await this.setCapabilityValue('vehicle_state_status', 'Awake');
        return;
      }
    }
    throw new Error('Vehicle did not wake up in time');
  }
}

private async executeCommand(command: string, params?: Record<string, string | number | boolean>): Promise<void> {
  const vin = this.getData().id;
  await this.ensureAwake();
  const success = await this.client.command(vin, command, params);
  if (!success) {
    throw new Error(`Command ${command} failed`);
  }
  // Immediate re-poll per locked decision
  await this.refreshState();
}
```

### Capability Listener Registration Pattern

```typescript
// Source: Homey SDK registerCapabilityListener pattern
// In VehicleDevice.onInit():

this.registerCapabilityListener('locked', async (value: boolean) => {
  await this.executeCommand(value ? 'lock' : 'unlock');
});

this.registerCapabilityListener('sentry_mode', async (value: boolean) => {
  await this.executeCommand(value ? 'enable_sentry' : 'disable_sentry');
});

this.registerCapabilityListener('climate_onoff', async (value: boolean) => {
  await this.executeCommand(value ? 'start_climate' : 'stop_climate');
});

this.registerCapabilityListener('target_temperature', async (value: number) => {
  await this.executeCommand('set_temperatures', { temperature: value });
});

this.registerCapabilityListener('charge_limit', async (value: number) => {
  await this.executeCommand('set_charge_limit', { percent: value });
});

this.registerCapabilityListener('charging_amps', async (value: number) => {
  await this.executeCommand('set_charging_amps', { amps: value });
});

this.registerCapabilityListener('charge_port', async (value: boolean) => {
  await this.executeCommand(value ? 'open_charge_port' : 'close_charge_port');
});

this.registerCapabilityListener('charging_control', async (value: boolean) => {
  await this.executeCommand(value ? 'start_charging' : 'stop_charging');
});

this.registerCapabilityListener('trunk', async (value: boolean) => {
  await this.executeCommand('activate_rear_trunk');
});

this.registerCapabilityListener('frunk', async () => {
  await this.executeCommand('activate_front_trunk');
});
```

### updateCapabilities Extension

```typescript
// Add to existing updateCapabilities() method:

// Charge limit
if (state.charge_state?.charge_limit_soc != null) {
  await this.setCapabilityValue('charge_limit', state.charge_state.charge_limit_soc);
}

// Charging amps (and update max dynamically)
if (state.charge_state?.charge_current_request != null) {
  await this.setCapabilityValue('charging_amps', state.charge_state.charge_current_request);
}
if (state.charge_state?.charge_current_request_max != null) {
  await this.setCapabilityOptions('charging_amps', {
    max: state.charge_state.charge_current_request_max,
  });
}

// Charge port state
if (state.charge_state?.charge_port_door_open != null) {
  await this.setCapabilityValue('charge_port', state.charge_state.charge_port_door_open);
}

// Climate on/off
if (state.climate_state?.is_climate_on != null) {
  await this.setCapabilityValue('climate_onoff', state.climate_state.is_climate_on);
}

// Target temperature
if (state.climate_state?.driver_temp_setting != null) {
  await this.setCapabilityValue('target_temperature', state.climate_state.driver_temp_setting);
}

// Sentry mode
if (state.vehicle_state?.sentry_mode != null) {
  await this.setCapabilityValue('sentry_mode', state.vehicle_state.sentry_mode);
}

// Trunk state (rt = rear trunk, 0 = closed)
if (state.vehicle_state?.rt != null) {
  await this.setCapabilityValue('trunk', state.vehicle_state.rt !== 0);
}

// Charging on/off (derived from charging_state)
if (state.charge_state?.charging_state != null) {
  await this.setCapabilityValue('charging_control', state.charge_state.charging_state === 'Charging');
}
```

### Anti-Patterns to Avoid
- **Sending commands without wake check:** Vehicle commands fail silently on sleeping vehicles. Always call `ensureAwake()` first.
- **Optimistic UI updates without re-poll:** Setting capability values before command confirmation leads to UI inconsistency if the command fails.
- **Polling immediately after command without delay:** The vehicle state may not reflect the change for 1-2 seconds after command confirmation. A small delay (1-2s) before re-poll may improve accuracy.
- **Hardcoding charging amps max:** Different chargers support different max amps. Always use `charge_current_request_max` from state.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Wake management | Custom wake state tracking | `ensureAwake()` pattern with Tessie wake endpoint | Tessie handles the wake/retry complexity server-side with `wait_for_completion` |
| Command retries | Retry logic in client | Tessie's `max_attempts` query parameter | Tessie retries server-side, no need to duplicate |
| Temperature conversion | Celsius/Fahrenheit conversion | Homey's built-in thermostat unit handling | Homey handles display conversion for thermostat capabilities |

## Common Pitfalls

### Pitfall 1: TessieClient.request() only supports GET
**What goes wrong:** Current `request()` method does not send a request body and always uses GET-style calls. POST commands need query parameters appended to the path.
**Why it happens:** Phase 1-2 only needed GET endpoints.
**How to avoid:** Extend `request()` or add a `command()` method that constructs the full path with query string parameters. Tessie commands use query params, not request body, so the existing `request()` pattern works if the path includes the query string.
**Warning signs:** Commands return 400 or 404.

### Pitfall 2: Trunk toggle is not open/close -- it's a single toggle
**What goes wrong:** `activate_rear_trunk` is a toggle command (opens if closed, closes if open). There is no separate "close trunk" endpoint.
**Why it happens:** Tesla API design -- trunk is a physical toggle.
**How to avoid:** The capability listener should always call `activate_rear_trunk` regardless of the boolean value. The re-poll will set the correct state.
**Warning signs:** Trunk appears stuck in wrong state if command is sent when state is already at desired position.

### Pitfall 3: Charging amps max changes dynamically
**What goes wrong:** Slider shows wrong max value (e.g., 48A when connected to a 32A charger, or 48A when no charger connected).
**Why it happens:** Max amps depends on connected charger hardware.
**How to avoid:** Update `setCapabilityOptions('charging_amps', { max: ... })` in `updateCapabilities()` whenever `charge_current_request_max` changes.
**Warning signs:** User can set amps higher than charger supports, command fails.

### Pitfall 4: Wake timeout for sleeping vehicles
**What goes wrong:** Command appears to hang for 30+ seconds on sleeping vehicles.
**Why it happens:** Vehicle wake takes 10-30 seconds (cellular modem startup).
**How to avoid:** Set a reasonable timeout (30s) and throw a clear error if exceeded. Consider that Homey capability listener callbacks should not hang indefinitely.
**Warning signs:** Homey UI shows "loading" spinner for too long.

### Pitfall 5: Capability migration for existing paired devices
**What goes wrong:** Devices paired before Phase 3 don't have new capabilities.
**Why it happens:** `driver.compose.json` capabilities only apply at pairing time.
**How to avoid:** Extend the existing `ALL_CAPABILITIES` array and the migration loop in `onInit()` that calls `addCapability()` for missing capabilities.
**Warning signs:** New capabilities don't appear on already-paired devices.

### Pitfall 6: Frunk capability as button needs special handling
**What goes wrong:** Button-type capability fires with `true` value but there's no state to track.
**Why it happens:** Frunk is open-only (no close API), so getable should be false.
**How to avoid:** Define frunk with `setable: true, getable: false, uiComponent: "button"`. The listener fires but doesn't need to set capability value afterward.
**Warning signs:** Frunk shows as stuck "on" after pressing.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tesla Owner API direct | Tessie API proxy | 2023+ | Tessie handles auth, command signing, wake, retries |
| Custom wake + retry logic | `wait_for_completion=true` + `max_attempts=3` | Tessie API feature | Server-side retry eliminates client complexity |

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
| CHRG-04 | Start/stop charging commands call correct API endpoints | unit | `npm test` | No - Wave 0 |
| CHRG-05 | Set charge limit sends correct percent parameter | unit | `npm test` | No - Wave 0 |
| CHRG-06 | Set charging amps sends correct amps parameter | unit | `npm test` | No - Wave 0 |
| CHRG-07 | Open/close charge port calls correct endpoints | unit | `npm test` | No - Wave 0 |
| CLIM-01 | Start/stop climate calls correct endpoints | unit | `npm test` | No - Wave 0 |
| CLIM-02 | Set temperature sends correct Celsius value in range 15-28 | unit | `npm test` | No - Wave 0 |
| ACCS-01 | Lock/unlock calls correct endpoints; locked state updates after re-poll | unit | `npm test` | No - Wave 0 |
| ACCS-02 | Enable/disable sentry calls correct endpoints | unit | `npm test` | No - Wave 0 |
| ACCS-03 | Activate rear trunk calls correct endpoint | unit | `npm test` | No - Wave 0 |
| ACCS-04 | Activate front trunk calls correct endpoint | unit | `npm test` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/commands.test.ts` -- unit tests for TessieClient command methods (mock HTTP)
- [ ] `tests/device-controls.test.ts` -- unit tests for capability listener command dispatch and wake behavior
- [ ] Verify existing `tests/manifest.test.ts` passes with new capabilities in driver.compose.json

## Sources

### Primary (HIGH confidence)
- [Tessie Developer Docs](https://developer.tessie.com) -- all 16 command endpoints verified individually
- [Tessie API llms.txt](https://developer.tessie.com/llms.txt) -- endpoint index
- [Homey Apps SDK Capabilities](https://apps.developer.homey.app/the-basics/devices/capabilities) -- uiComponent types, setable/getable behavior, registerCapabilityListener

### Secondary (MEDIUM confidence)
- [Tesla API (unofficial)](https://tesla-api.timdorr.com/vehicle/state/chargestate) -- vehicle state field names (charge_state, vehicle_state, climate_state structure)
- [Tesla API vehicle data](https://tesla-api.timdorr.com/vehicle/state/data) -- rt/ft trunk fields, sentry_mode field location

### Tertiary (LOW confidence)
- Temperature range 15-28C from Tessie set_temperatures endpoint docs -- may vary by vehicle model/market

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, extending existing patterns
- Architecture: HIGH -- Tessie API fully documented, Homey capability patterns verified
- Pitfalls: HIGH -- based on actual API behavior and existing codebase analysis
- API endpoints: HIGH -- each endpoint individually fetched from developer.tessie.com

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (stable APIs, 30-day validity)
