---
phase: 02-vehicle-data-polling
plan: 02
subsystem: drivers
tags: [homey, tesla, tessie, polling, capabilities, adaptive-polling, tdd]

# Dependency graph
requires:
  - phase: 02-vehicle-data-polling
    provides: 12 custom capability definitions, driver manifest, getBatteryHealth API method
  - phase: 01-foundation-pairing
    provides: TessieClient base class, driver skeleton, pairing flow
provides:
  - Full VehicleDevice with sleep-aware adaptive polling (60s/120s/1800s)
  - Complete capability mapping from Tessie API to 16 Homey capabilities
  - Unit conversion for range/odometer and tire pressure
  - Retry logic with 3-failure threshold before unavailable
  - Capability migration for already-paired devices
  - Battery health periodic fetch (hourly)
affects: [03-vehicle-commands, 04-flow-cards, 06-production-readiness]

# Tech tracking
tech-stack:
  added: []
  patterns: [adaptive-polling-with-setTimeout, capability-migration, null-guard-mapping, unit-conversion]

key-files:
  created: []
  modified:
    - drivers/vehicle/device.ts
    - tests/device.test.ts

key-decisions:
  - "Use this.homey.setTimeout for adaptive poll scheduling (not setInterval) since interval changes based on vehicle state"
  - "scheduleNextPoll helper centralizes timer management and clears previous timeout before setting new one"
  - "Tire pressure values of null or 0 are skipped to preserve last known good value on device card"
  - "Software update formatted as 'Status: version' when available, 'Up to date' when no version"

patterns-established:
  - "Adaptive polling pattern: scheduleNextPoll(ms) with this.homey.setTimeout for variable intervals"
  - "Capability mapping: null guard on each field before setCapabilityValue"
  - "Capability migration: iterate ALL_CAPABILITIES array, addCapability if !hasCapability"
  - "Unit conversion flags: isMetric/usesPsi set from gui_settings on init"

requirements-completed: [CHRG-01, CHRG-02, CHRG-03, CLIM-03, DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, STRM-02, STRM-03]

# Metrics
duration: 3min
completed: 2026-03-04
---

# Phase 02 Plan 02: Vehicle Data Polling Summary

**Full VehicleDevice with sleep-aware adaptive polling (60s/120s/1800s), complete 16-capability mapping from Tessie API, unit conversion, and 3-failure retry logic**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-04T10:23:56Z
- **Completed:** 2026-03-04T10:27:00Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 2

## Accomplishments
- Rewrote VehicleDevice with adaptive polling that adjusts interval based on vehicle state (awake 60s, charging 120s, asleep 1800s)
- Mapped all 16 Tessie API fields to Homey capabilities with null guards, unit conversion (mi/km, bar/psi), and software update formatting
- Implemented retry logic: device only marks unavailable after 3 consecutive poll failures, recovers automatically
- Added capability migration in onInit for already-paired devices to receive new capabilities
- Battery health fetched on init and refreshed hourly via this.homey.setInterval
- Comprehensive TDD test suite with 35 new tests covering all capability mappings, adaptive intervals, retry logic, and unit conversions

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Failing tests for full VehicleDevice** - `462b3ea` (test)
2. **Task 1 GREEN: Implement VehicleDevice to pass all tests** - `8624421` (feat)

## Files Created/Modified
- `drivers/vehicle/device.ts` - Full VehicleDevice with adaptive polling, capability mapping, retry logic, unit conversion (264 lines)
- `tests/device.test.ts` - Comprehensive test suite with 35 device tests across 7 test groups (688 lines)

## Decisions Made
- Used this.homey.setTimeout for poll scheduling (not setInterval) since interval must change adaptively between polls
- Created scheduleNextPoll(ms) helper that clears existing timeout before setting new one
- Tire pressure values of null/0 are skipped to preserve last known good reading on device card
- Software update capability formatted as "Status: version" or "Up to date" for readability
- Fixed test expectation bug: Math.round(200) = 200, not 201

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed incorrect test expectation for imperial range**
- **Found during:** Task 1 GREEN (test verification)
- **Issue:** Test expected Math.round(200) = 201 for imperial range, but 200 rounds to 200
- **Fix:** Corrected test expectation from 201 to 200
- **Files modified:** tests/device.test.ts
- **Verification:** All 57 tests pass
- **Committed in:** 8624421 (part of GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 bug in test expectation)
**Impact on plan:** Minor test expectation fix. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- VehicleDevice fully operational with adaptive polling and complete capability mapping
- Ready for Phase 3 vehicle commands (lock/unlock, climate control) which will add setable capability listeners
- Ready for Phase 4 flow cards which will use capability values as triggers/conditions
- All 16 capabilities populated with real-time data for Homey device cards

## Self-Check: PASSED

- All 2 files verified present on disk
- Both task commits (462b3ea, 8624421) verified in git log

---
*Phase: 02-vehicle-data-polling*
*Completed: 2026-03-04*
