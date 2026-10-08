---
phase: 03-core-controls
plan: 02
subsystem: device
tags: [homey, vehicle-controls, auto-wake, capability-listeners, tessie]

# Dependency graph
requires:
  - phase: 03-core-controls
    plan: 01
    provides: "TessieClient.command() and wake() methods, 9 capability JSON definitions"
provides:
  - "10 functional capability listeners dispatching Tessie commands from Homey device cards"
  - "ensureAwake() with 30s timeout wake polling for sleeping vehicles"
  - "executeCommand() chaining wake -> command -> refreshState"
  - "refreshState() for immediate state re-poll after command success"
  - "updateCapabilities() extended with 9 new control state field mappings"
  - "Dynamic charging amps max updated from charger via setCapabilityOptions"
affects: [04-flow-actions, 05-advanced-features]

# Tech tracking
tech-stack:
  added: []
  patterns: ["ensureAwake -> executeCommand -> refreshState command chain", "Promise-wrapped homey.setTimeout for async delays"]

key-files:
  created:
    - tests/device-controls.test.ts
  modified:
    - drivers/car/device.ts
    - tests/device.test.ts

key-decisions:
  - "Used Promise-wrapped homey.setTimeout for wake polling and refresh delay to stay compatible with Homey SDK"
  - "refreshState is public (not private) because VehicleDriver.onRepair also calls it"

patterns-established:
  - "Command dispatch pattern: capability listener -> executeCommand(name, params?) -> ensureAwake -> command -> refreshState"
  - "State field mapping pattern: null-guarded if (field != null) for all updateCapabilities entries"

requirements-completed: [CHRG-04, CHRG-05, CHRG-06, CHRG-07, CLIM-01, CLIM-02, ACCS-01, ACCS-02, ACCS-03, ACCS-04]

# Metrics
duration: 5min
completed: 2026-03-04
---

# Phase 3 Plan 2: Vehicle Controls Wiring Summary

**10 capability listeners with auto-wake and immediate refresh, mapping lock/sentry/climate/charging/trunk controls to Tessie API commands**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-04T11:13:39Z
- **Completed:** 2026-03-04T11:18:39Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 3

## Accomplishments
- 10 capability listeners wired to Tessie commands covering lock, sentry, climate, temperature, charge limit, charging amps, charge port, charging control, trunk, and frunk
- ensureAwake() auto-wakes sleeping vehicles with 2s polling and 30s timeout before any command
- executeCommand() chains wake -> command -> refreshState for immediate device card updates
- updateCapabilities() extended with 9 new state field mappings including dynamic charging amps max
- ALL_CAPABILITIES updated with 9 new IDs for existing device migration
- 30 new tests covering all control methods and state mappings (98 total, 0 failures)

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Failing tests for vehicle controls** - `3e3c71e` (test)
2. **Task 1 (GREEN): Implementation** - `14ac09d` (feat)

## Files Created/Modified
- `drivers/car/device.ts` - Added ensureAwake, executeCommand, refreshState, 10 capability listeners, extended updateCapabilities with 9 new state field mappings
- `tests/device-controls.test.ts` - 30 new tests for control methods, capability listeners, and state mapping
- `tests/device.test.ts` - Updated MockTessieClient with command/wake stubs, added 9 new capability IDs, updated locked listener test

## Decisions Made
- Used Promise-wrapped homey.setTimeout for wake polling and refresh delay to stay compatible with Homey SDK
- refreshState is public (not private) because VehicleDriver.onRepair also needs to call it

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 10 vehicle control capabilities fully functional from Homey device cards
- Ready for Phase 4 (Flow Actions) to wire these controls to Homey Flow triggers and actions
- Ready for Phase 5 (Advanced Features) to build on the command infrastructure

---
*Phase: 03-core-controls*
*Completed: 2026-03-04*
