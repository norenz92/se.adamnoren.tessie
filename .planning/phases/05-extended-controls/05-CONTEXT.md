# Phase 5: Extended Controls - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Full range of vehicle controls beyond core essentials. Covers: per-seat heaters (driver, passenger, rear left, center, right), steering wheel heater, max defrost mode, climate keeper mode (Off/Keep/Dog/Camp), cabin overheat protection, window vent/close, valet mode, speed limit mode, and charging history display. No new Flow cards — those are Phase 6.

</domain>

<decisions>
## Implementation Decisions

### Seat heater presentation
- One capability per seat: seat_heater_driver, seat_heater_passenger, seat_heater_rear_left, seat_heater_rear_center, seat_heater_rear_right
- Enum dropdown per seat with values: Off / Low / Med / High (maps to API levels 0-3)
- All 5 seats included — API handles missing seats gracefully
- Read + write: show current heater level from vehicle state AND allow control
- Consistent with tire pressure pattern (separate capabilities per position)

### Climate keeper mode
- Single enum capability: climate_keeper_mode with values Off / Keep / Dog / Camp
- Read + write: shows current mode from vehicle state
- Maps directly to Tessie API set_climate_keeper_mode command

### Cabin overheat protection
- Single enum capability: cabin_overheat_protection with values Off / Fan Only / AC
- Combines on/off state with mode in one dropdown
- Read + write from vehicle state

### Max defrost & steering wheel heater
- Standard boolean toggles: defrost_mode (on/off) and steering_wheel_heater (on/off)
- Consistent with existing sentry_mode and climate_onoff patterns
- Read + write from vehicle state

### Charging history
- Last session summary capabilities on device card: last_charge_energy (kWh), last_charge_location (string)
- Claude decides whether to include cost based on Tessie API availability
- Refresh on each poll cycle (piggybacks on existing REST polling)
- Flow trigger capability deferred to Phase 6 (all Flow cards are Phase 6 scope)

### Window controls
- Claude decides presentation based on what state data Tessie returns for windows
- Tessie API has vent_windows and close_windows as separate commands
- Research needed: does Tessie return window state in vehicle data?

### Valet mode
- Boolean toggle: valet_mode on/off
- Requires PIN — stored in device settings (entered once, sent automatically)
- Device settings storage enables Flow automation (no interactive prompt)

### Speed limit mode
- Claude decides: toggle + speed value or toggle-only, based on Tessie API capabilities
- Also requires PIN — same device settings storage approach as valet mode

### PIN handling (valet + speed limit)
- User enters PIN once in Homey device settings
- Stored per-device, sent with commands automatically
- No prompt on each use — enables headless Flow automation

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

</decisions>

<specifics>
## Specific Ideas

No specific references — open to standard Homey app patterns and Tessie API conventions.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TessieClient.command(vin, command, params)`: Generic command method already supports any Tessie command with parameters — all new controls use this directly
- `VehicleDevice.executeCommand()`: ensureAwake → command → refreshState pattern — all new capability listeners follow this
- `VehicleDevice.updateCapabilities(state)`: Maps Tessie REST state to Homey capabilities — extend with new seat heater, climate mode, window, valet, speed limit mappings
- `ALL_CAPABILITIES` array: Capability migration list — add all new capabilities here
- `.homeycompose/capabilities/`: 22 existing custom capability JSON definitions — add new ones following same patterns

### Established Patterns
- `export =` for CommonJS compatibility
- Enum capabilities: `charging_status` and `vehicle_state_status` use string enums — same pattern for climate_keeper_mode, cabin_overheat_protection, seat heaters
- Boolean toggles: `sentry_mode`, `climate_onoff`, `charge_port` — same pattern for defrost_mode, steering_wheel_heater, valet_mode
- `registerCapabilityListener` in `onInit()` for all controllable capabilities
- Dynamic capability options: `setCapabilityOptions()` used for tire pressure units and charging amps max — reusable for speed limit units
- Device settings: `getStoreValue()`/`setStoreValue()` for per-device token — same mechanism for PIN storage

### Integration Points
- `driver.compose.json`: Add all new capabilities to the capabilities array
- `VehicleDevice.onInit()`: Register capability listeners for all new controls
- `VehicleDevice.updateCapabilities()`: Add state mappings for new capabilities
- `TessieClient`: May need `getChargingHistory(vin)` method for charging sessions (new endpoint, not command)
- Homey device settings: Add PIN input field for valet/speed limit commands

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-extended-controls*
*Context gathered: 2026-03-04*
