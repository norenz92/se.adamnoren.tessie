---
phase: 02-vehicle-data-polling
plan: 01
subsystem: api
tags: [homey, capabilities, tessie, battery-health, tesla]

# Dependency graph
requires:
  - phase: 01-foundation-pairing
    provides: TessieClient base class, driver.compose.json skeleton
provides:
  - 12 custom Homey capability definitions (range, charging, tires, odometer, vehicle state, GPS, software, battery health)
  - Updated driver manifest with 16 capabilities
  - TessieClient.getBatteryHealth(vin) method
affects: [02-vehicle-data-polling]

# Tech tracking
tech-stack:
  added: []
  patterns: [homey-capability-json-schema, enum-capabilities, sub-capabilities]

key-files:
  created:
    - .homeycompose/capabilities/measure_range.json
    - .homeycompose/capabilities/charging_status.json
    - .homeycompose/capabilities/measure_tire_pressure_fl.json
    - .homeycompose/capabilities/measure_tire_pressure_fr.json
    - .homeycompose/capabilities/measure_tire_pressure_rl.json
    - .homeycompose/capabilities/measure_tire_pressure_rr.json
    - .homeycompose/capabilities/measure_odometer.json
    - .homeycompose/capabilities/vehicle_state_status.json
    - .homeycompose/capabilities/measure_latitude.json
    - .homeycompose/capabilities/measure_longitude.json
    - .homeycompose/capabilities/software_update.json
    - .homeycompose/capabilities/measure_battery_health.json
  modified:
    - drivers/car/driver.compose.json
    - lib/tessie-client.ts

key-decisions:
  - "Omit icon fields from capability JSON since no custom SVG icons exist yet"
  - "Use bar as default tire pressure unit (dynamically switchable to psi by device)"

patterns-established:
  - "Capability JSON pattern: type/title/getable/setable/uiComponent with optional units/min/max/step/decimals"
  - "Sub-capability naming: measure_temperature.inside/outside with capabilitiesOptions for display titles"
  - "Enum capability pattern: values array with id/title objects"

requirements-completed: [CHRG-01, CHRG-02, CHRG-03, CLIM-03, DATA-01, DATA-02, DATA-03, DATA-04, DATA-05]

# Metrics
duration: 1min
completed: 2026-03-04
---

# Phase 02 Plan 01: Capability Definitions Summary

**12 custom Homey capability JSONs for vehicle sensor data plus getBatteryHealth API method on TessieClient**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-04T10:20:21Z
- **Completed:** 2026-03-04T10:21:38Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- Created 12 custom capability definition JSON files covering range, charging, tires, odometer, vehicle state, GPS, software update, and battery health
- Updated driver.compose.json with all 16 capabilities (2 existing + 2 sub-capabilities + 12 custom) and capabilitiesOptions
- Added getBatteryHealth(vin) method to TessieClient that queries /battery_health endpoint and filters by VIN

## Task Commits

Each task was committed atomically:

1. **Task 1: Create custom capability definitions and update driver manifest** - `80508a3` (feat)
2. **Task 2: Add getBatteryHealth method to TessieClient** - `eb553a6` (feat)

## Files Created/Modified
- `.homeycompose/capabilities/measure_range.json` - Range in km, number type, 0-700
- `.homeycompose/capabilities/charging_status.json` - Enum: Disconnected/Charging/Stopped/Complete/NoPower
- `.homeycompose/capabilities/measure_tire_pressure_fl.json` - Front-left tire pressure in bar, 0-5
- `.homeycompose/capabilities/measure_tire_pressure_fr.json` - Front-right tire pressure in bar, 0-5
- `.homeycompose/capabilities/measure_tire_pressure_rl.json` - Rear-left tire pressure in bar, 0-5
- `.homeycompose/capabilities/measure_tire_pressure_rr.json` - Rear-right tire pressure in bar, 0-5
- `.homeycompose/capabilities/measure_odometer.json` - Odometer in km, 0-999999
- `.homeycompose/capabilities/vehicle_state_status.json` - Enum: Awake/Asleep/Offline
- `.homeycompose/capabilities/measure_latitude.json` - GPS latitude, -90 to 90, 6 decimals
- `.homeycompose/capabilities/measure_longitude.json` - GPS longitude, -180 to 180, 6 decimals
- `.homeycompose/capabilities/software_update.json` - Software version string
- `.homeycompose/capabilities/measure_battery_health.json` - Battery health percentage, 0-100
- `drivers/car/driver.compose.json` - Updated with 16 capabilities and temperature sub-capability options
- `lib/tessie-client.ts` - Added getBatteryHealth(vin) method

## Decisions Made
- Omitted icon fields from capability JSON since no custom SVG icons exist yet (Homey uses defaults)
- Used bar as default tire pressure unit (device code will dynamically switch to psi based on user preference)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 12 capability definitions ready for device.ts to call setCapabilityValue()
- driver.compose.json manifest complete for Homey Compose to generate app.json
- TessieClient.getBatteryHealth() ready for device polling logic in Plan 02

## Self-Check: PASSED

- All 14 files verified present on disk
- Both task commits (80508a3, eb553a6) verified in git log

---
*Phase: 02-vehicle-data-polling*
*Completed: 2026-03-04*
