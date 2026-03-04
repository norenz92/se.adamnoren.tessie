---
phase: 03-core-controls
plan: 01
subsystem: api
tags: [tessie, commands, capabilities, homey-compose]

# Dependency graph
requires:
  - phase: 01-foundation-pairing
    provides: "TessieClient with request() method and https-based API transport"
provides:
  - "TessieClient.command() for sending POST commands with query params"
  - "TessieClient.wake() for waking sleeping vehicles"
  - "9 Homey capability JSON definitions for vehicle controls"
  - "Updated driver.compose.json with all control capability IDs"
affects: [03-core-controls plan 02, 04-flow-actions, 05-advanced-features]

# Tech tracking
tech-stack:
  added: []
  patterns: ["URLSearchParams for query string building in command()", "Capability JSON schema pattern for settable controls"]

key-files:
  created:
    - .homeycompose/capabilities/charge_limit.json
    - .homeycompose/capabilities/charging_amps.json
    - .homeycompose/capabilities/target_temperature.json
    - .homeycompose/capabilities/climate_onoff.json
    - .homeycompose/capabilities/sentry_mode.json
    - .homeycompose/capabilities/charge_port.json
    - .homeycompose/capabilities/trunk.json
    - .homeycompose/capabilities/frunk.json
    - .homeycompose/capabilities/charging_control.json
    - tests/commands.test.ts
  modified:
    - lib/tessie-client.ts
    - drivers/vehicle/driver.compose.json
    - tests/manifest.test.ts

key-decisions:
  - "Used URLSearchParams for query string building in command() for proper encoding"
  - "Frunk capability is getable:false (button, not toggle) since it cannot be closed remotely"

patterns-established:
  - "Command method pattern: command(vin, commandName, params?) returns boolean"
  - "Capability JSON pattern for settable controls with slider/toggle/button/thermostat uiComponent"

requirements-completed: [CHRG-04, CHRG-05, CHRG-06, CHRG-07, CLIM-01, CLIM-02, ACCS-01, ACCS-02, ACCS-03, ACCS-04]

# Metrics
duration: 2min
completed: 2026-03-04
---

# Phase 3 Plan 1: Command Infrastructure & Capability Definitions Summary

**TessieClient command/wake POST methods with URLSearchParams and 9 Homey capability definitions for charging, climate, and access controls**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-04T11:09:52Z
- **Completed:** 2026-03-04T11:11:39Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 13

## Accomplishments
- TessieClient extended with command() and wake() methods for POST-based vehicle control
- 9 capability JSON files created covering charging (4), climate (2), and access (3) controls
- driver.compose.json updated with all new capability IDs for device card display
- Manifest test extended to validate capability file/compose alignment
- All 68 tests pass (9 new command tests + 2 new manifest tests)

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Failing tests for command/wake** - `f1d51f6` (test)
2. **Task 1 (GREEN): Implementation** - `e98c002` (feat)

## Files Created/Modified
- `lib/tessie-client.ts` - Added command() and wake() methods
- `.homeycompose/capabilities/charge_limit.json` - Charge limit slider (50-100%)
- `.homeycompose/capabilities/charging_amps.json` - Charging amps slider (1-48A)
- `.homeycompose/capabilities/target_temperature.json` - Target temp thermostat (15-28C)
- `.homeycompose/capabilities/climate_onoff.json` - Climate on/off toggle
- `.homeycompose/capabilities/sentry_mode.json` - Sentry mode toggle
- `.homeycompose/capabilities/charge_port.json` - Charge port toggle
- `.homeycompose/capabilities/trunk.json` - Trunk toggle
- `.homeycompose/capabilities/frunk.json` - Frunk button (not getable)
- `.homeycompose/capabilities/charging_control.json` - Charging start/stop toggle
- `drivers/vehicle/driver.compose.json` - Added 9 new capability IDs
- `tests/commands.test.ts` - Unit tests for command() and wake()
- `tests/manifest.test.ts` - Added driver compose capability validation

## Decisions Made
- Used URLSearchParams for query string building in command() for proper URL encoding
- Frunk capability is getable:false with button uiComponent since trunk cannot be closed remotely via API

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- command() and wake() ready for device.ts to wire up capability listeners in Plan 02
- All capability definitions in place for Homey Compose to generate app.json
- Existing paired devices will gain new capabilities via migration logic (Plan 02)

## Self-Check: PASSED

All 14 files verified present. Both commits (f1d51f6, e98c002) verified in git log.

---
*Phase: 03-core-controls*
*Completed: 2026-03-04*
