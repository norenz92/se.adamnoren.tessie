# Roadmap: Tessie for Homey

## Overview

This roadmap delivers a Homey Pro app that pairs Tesla vehicles via the Tessie API, displays comprehensive vehicle data with real-time WebSocket streaming, provides full vehicle control, and exposes everything through Homey Flows. The journey moves from getting a device paired and visible in Homey, through read-only data with sleep-aware polling, to core vehicle commands, real-time streaming (the primary differentiator), extended controls, and finally complete Flow integration with App Store submission.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation & Pairing** - App scaffold, Tessie auth, vehicle discovery, device pairing with correct data model
- [ ] **Phase 2: Vehicle Data & Polling** - Read-only sensor capabilities for all vehicle state, sleep-aware REST polling
- [ ] **Phase 3: Core Controls** - Essential vehicle commands: charging, climate basics, locks, trunk/frunk
- [ ] **Phase 4: Real-time Streaming** - WebSocket telemetry from streaming.tessie.com with automatic reconnection
- [ ] **Phase 5: Extended Controls** - Winter controls, advanced climate modes, windows, valet, speed limit, charging history
- [ ] **Phase 6: Flow Integration & App Store** - Complete Flow card coverage for all capabilities, App Store assets and submission

## Phase Details

### Phase 1: Foundation & Pairing
**Goal**: Users can add their Tesla vehicles as Homey devices through a working pairing flow
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, STOR-02
**Success Criteria** (what must be TRUE):
  1. User can enter a Tessie API token during the pairing flow and see their vehicles listed for selection
  2. User can pair multiple vehicles from the same or different Tessie accounts, each appearing as a separate device in Homey
  3. User can re-authenticate a previously paired device with a new API token without losing the device or its Flows
  4. App targets Homey Pro with compatibility >= 12.9.0 and runs without errors on Node.js 22
**Plans:** 2 plans

Plans:
- [ ] 01-01-PLAN.md — App scaffold, TessieClient library, and test infrastructure
- [ ] 01-02-PLAN.md — Vehicle driver with pairing flow, repair flow, device class, and model icons

### Phase 2: Vehicle Data & Polling
**Goal**: Users can see live vehicle state on their Homey device cards, updated via sleep-aware REST polling
**Depends on**: Phase 1
**Requirements**: CHRG-01, CHRG-02, CHRG-03, CLIM-03, DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, STRM-02, STRM-03
**Success Criteria** (what must be TRUE):
  1. User can see battery level, estimated range, and charging status on the device card
  2. User can see inside/outside temperature, GPS location, tire pressures, odometer, software update status, and battery health on the device
  3. Device data refreshes automatically via periodic REST polling without user intervention
  4. Polling does not wake a sleeping vehicle or prevent a vehicle from entering sleep (sleep-aware)
  5. Device shows as unavailable in Homey when the Tessie API is unreachable or the vehicle cannot be contacted
**Plans:** 1/2 plans executed

Plans:
- [ ] 02-01-PLAN.md — Custom capability definitions, driver manifest update, and TessieClient battery health method
- [ ] 02-02-PLAN.md — Full capability mapping, sleep-aware adaptive polling, retry logic, and tests

### Phase 3: Core Controls
**Goal**: Users can control essential vehicle functions from Homey device cards and capability listeners
**Depends on**: Phase 2
**Requirements**: CHRG-04, CHRG-05, CHRG-06, CHRG-07, CLIM-01, CLIM-02, ACCS-01, ACCS-02, ACCS-03, ACCS-04
**Success Criteria** (what must be TRUE):
  1. User can start/stop charging, adjust charge limit percentage, adjust charging amps, and open/close the charge port from Homey
  2. User can turn climate on/off and set the target cabin temperature from Homey
  3. User can lock/unlock the vehicle, toggle sentry mode, and open the trunk and frunk from Homey
  4. Commands sent to a sleeping vehicle wake it automatically before executing
  5. Lock state, sentry mode state, and charging state reflect the actual vehicle state after a command completes
**Plans**: 2 plans

Plans:
- [ ] 03-01-PLAN.md — TessieClient command/wake methods, capability definitions, driver manifest update
- [ ] 03-02-PLAN.md — VehicleDevice control wiring: ensureAwake, executeCommand, capability listeners, state refresh

### Phase 4: Real-time Streaming
**Goal**: Vehicle data updates in near-real-time via WebSocket, replacing polling as the primary data source
**Depends on**: Phase 3
**Requirements**: STRM-01
**Success Criteria** (what must be TRUE):
  1. Device capabilities update within seconds of a vehicle state change when WebSocket is connected
  2. WebSocket automatically reconnects with exponential backoff after disconnection, and the device shows as unavailable during extended outages
  3. Polling interval extends to infrequent fallback (5+ minutes) while WebSocket is actively streaming
**Plans**: TBD

Plans:
- [ ] 04-01: TBD

### Phase 5: Extended Controls
**Goal**: Users have access to the full range of vehicle controls beyond the core essentials
**Depends on**: Phase 3
**Requirements**: CHRG-08, CLIM-04, CLIM-05, CLIM-06, CLIM-07, CLIM-08, ACCS-05, ACCS-06, ACCS-07
**Success Criteria** (what must be TRUE):
  1. User can control per-seat heater levels, steering wheel heater, and max defrost mode from Homey
  2. User can set climate keeper mode (Off/Keep/Dog/Camp) and configure cabin overheat protection
  3. User can vent/close windows, enable/disable valet mode, and set/toggle speed limit mode from Homey
  4. User can view past charging sessions with energy added and location on the device
**Plans**: TBD

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD

### Phase 6: Flow Integration & App Store
**Goal**: Every capability has proper Flow cards and the app meets all App Store requirements for submission
**Depends on**: Phase 4, Phase 5
**Requirements**: FLOW-01, FLOW-02, FLOW-03, FLOW-04, FLOW-05, FLOW-06, FLOW-07, STOR-01
**Success Criteria** (what must be TRUE):
  1. Every sensor capability generates a Flow trigger card when its value changes (battery level changed, lock state changed, etc.)
  2. Every boolean capability has a Flow condition card (is locked, is charging, sentry mode active, etc.)
  3. Every controllable capability has a Flow action card (set temperature, start charging, lock vehicle, etc.)
  4. User can trigger HomeLink, flash lights, honk horn, and send a destination address via dedicated Flow action cards
  5. App has proper icons, store images, translations, and metadata that pass Homey App Store review
**Plans**: TBD

Plans:
- [ ] 06-01: TBD
- [ ] 06-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6
Note: Phase 4 and Phase 5 can potentially execute in parallel (both depend on Phase 3, not on each other).

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Pairing | 2/2 | Complete | 2026-03-03 |
| 2. Vehicle Data & Polling | 1/2 | In Progress|  |
| 3. Core Controls | 1/2 | In Progress|  |
| 4. Real-time Streaming | 0/? | Not started | - |
| 5. Extended Controls | 0/? | Not started | - |
| 6. Flow Integration & App Store | 0/? | Not started | - |
