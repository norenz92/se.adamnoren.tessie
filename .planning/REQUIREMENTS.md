# Requirements: Tessie for Homey

**Defined:** 2026-03-03
**Core Value:** Tesla owners can monitor and control their vehicles directly from their Homey smart home hub, with real-time data and full Flow integration.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Authentication & Pairing

- [x] **AUTH-01**: User can enter Tessie API token during vehicle pairing flow
- [x] **AUTH-02**: App discovers all vehicles from the user's Tessie account after token entry
- [x] **AUTH-03**: User can pair multiple vehicles, each appearing as a separate Homey device
- [x] **AUTH-04**: User can repair/re-authenticate a device without deleting it (token rotation)

### Battery & Charging

- [x] **CHRG-01**: User can see battery level percentage on the device
- [x] **CHRG-02**: User can see estimated range on the device
- [x] **CHRG-03**: User can see current charging status (charging, not charging, complete, etc.)
- [x] **CHRG-04**: User can start and stop charging via the device or Flow action
- [x] **CHRG-05**: User can view and adjust the charge limit percentage
- [x] **CHRG-06**: User can view and adjust the charging amps
- [x] **CHRG-07**: User can open and close the charge port via the device or Flow action
- [ ] **CHRG-08**: User can view past charging sessions with energy added and location

### Climate

- [x] **CLIM-01**: User can turn climate on and off via the device or Flow action
- [x] **CLIM-02**: User can set the target cabin temperature
- [x] **CLIM-03**: User can see inside and outside temperature on the device
- [ ] **CLIM-04**: User can control per-seat heater level (0-3) for each seat
- [ ] **CLIM-05**: User can toggle the steering wheel heater
- [ ] **CLIM-06**: User can activate and deactivate max defrost mode
- [ ] **CLIM-07**: User can set climate keeper mode (Off/Keep/Dog/Camp)
- [ ] **CLIM-08**: User can configure cabin overheat protection mode and temperature

### Access & Security

- [x] **ACCS-01**: User can see lock state and lock/unlock the vehicle via the device or Flow action
- [x] **ACCS-02**: User can toggle sentry mode on/off via the device or Flow action
- [x] **ACCS-03**: User can open the trunk via the device or Flow action
- [x] **ACCS-04**: User can open the frunk via the device or Flow action
- [ ] **ACCS-05**: User can vent and close windows via Flow action
- [ ] **ACCS-06**: User can enable and disable valet mode via Flow action
- [ ] **ACCS-07**: User can set and toggle speed limit mode via Flow action

### Vehicle Data

- [x] **DATA-01**: User can see GPS location (latitude/longitude) on the device
- [x] **DATA-02**: User can see tire pressure for all four tires on the device
- [x] **DATA-03**: User can see odometer reading on the device
- [x] **DATA-04**: User can see software update status and pending version on the device
- [x] **DATA-05**: User can see battery health/degradation data on the device

### Real-time Streaming

- [x] **STRM-01**: Vehicle data updates in near-real-time via WebSocket streaming from streaming.tessie.com/{VIN}
- [x] **STRM-02**: App falls back to periodic REST polling when WebSocket is disconnected
- [x] **STRM-03**: Polling is sleep-aware (does not poll when vehicle is asleep or waiting for sleep)

### Automations (Flows)

- [ ] **FLOW-01**: All sensor capabilities generate Flow trigger cards on value change
- [ ] **FLOW-02**: All boolean capabilities generate Flow condition cards
- [ ] **FLOW-03**: All controllable capabilities generate Flow action cards
- [ ] **FLOW-04**: User can trigger HomeLink (garage door) via Flow action
- [ ] **FLOW-05**: User can flash lights via Flow action
- [ ] **FLOW-06**: User can honk horn via Flow action
- [ ] **FLOW-07**: User can send a destination address to the vehicle via Flow action

### App Store

- [ ] **STOR-01**: App meets Homey App Store guidelines (icons, images, translations, metadata)
- [x] **STOR-02**: App targets Homey Pro only with compatibility >= 12.9.0

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Energy Products

- **ENRG-01**: User can see Solar/Powerwall status as a separate Homey device
- **ENRG-02**: User can control Powerwall reserve and operation mode

### Advanced Automations

- **ADVF-01**: User can set geofence-based triggers (vehicle arrives/departs location)
- **ADVF-02**: User can add/remove charge schedules from Homey
- **ADVF-03**: User can add/remove precondition schedules from Homey

### History

- **HIST-01**: User can view past drive sessions with distance and efficiency

## Out of Scope

| Feature | Reason |
|---------|--------|
| Direct Tesla Fleet API integration | Tessie handles OAuth complexity, command signing, and regional routing. Doubles maintenance for no user benefit. |
| Homey Cloud support | Cloud runtime cannot sustain WebSocket connections. Core differentiator would not work. |
| Smart charging algorithm | Scope explosion. Expose charge controls and let users build their own Flows with Homey's energy/weather apps. |
| In-app dashboards or charts | Fights Homey's UI paradigm (device cards + Flows). Users can use Homey Insights for historical visualization. |
| Camera/live view streaming | Not available via Tessie API. Homey has no video player UI. |
| Fleet management features | Commercial fleet endpoints are irrelevant for smart home users. |
| Charge/precondition scheduling | Tessie's own app handles this with a proper UI. Deferred to v2 if demand exists. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Complete |
| AUTH-02 | Phase 1 | Complete |
| AUTH-03 | Phase 1 | Complete |
| AUTH-04 | Phase 1 | Complete |
| CHRG-01 | Phase 2 | Complete |
| CHRG-02 | Phase 2 | Complete |
| CHRG-03 | Phase 2 | Complete |
| CHRG-04 | Phase 3 | Complete |
| CHRG-05 | Phase 3 | Complete |
| CHRG-06 | Phase 3 | Complete |
| CHRG-07 | Phase 3 | Complete |
| CHRG-08 | Phase 5 | Pending |
| CLIM-01 | Phase 3 | Complete |
| CLIM-02 | Phase 3 | Complete |
| CLIM-03 | Phase 2 | Complete |
| CLIM-04 | Phase 5 | Pending |
| CLIM-05 | Phase 5 | Pending |
| CLIM-06 | Phase 5 | Pending |
| CLIM-07 | Phase 5 | Pending |
| CLIM-08 | Phase 5 | Pending |
| ACCS-01 | Phase 3 | Complete |
| ACCS-02 | Phase 3 | Complete |
| ACCS-03 | Phase 3 | Complete |
| ACCS-04 | Phase 3 | Complete |
| ACCS-05 | Phase 5 | Pending |
| ACCS-06 | Phase 5 | Pending |
| ACCS-07 | Phase 5 | Pending |
| DATA-01 | Phase 2 | Complete |
| DATA-02 | Phase 2 | Complete |
| DATA-03 | Phase 2 | Complete |
| DATA-04 | Phase 2 | Complete |
| DATA-05 | Phase 2 | Complete |
| STRM-01 | Phase 4 | Complete |
| STRM-02 | Phase 2 | Complete |
| STRM-03 | Phase 2 | Complete |
| FLOW-01 | Phase 6 | Pending |
| FLOW-02 | Phase 6 | Pending |
| FLOW-03 | Phase 6 | Pending |
| FLOW-04 | Phase 6 | Pending |
| FLOW-05 | Phase 6 | Pending |
| FLOW-06 | Phase 6 | Pending |
| FLOW-07 | Phase 6 | Pending |
| STOR-01 | Phase 6 | Pending |
| STOR-02 | Phase 1 | Complete |

**Coverage:**
- v1 requirements: 44 total
- Mapped to phases: 44
- Unmapped: 0

---
*Requirements defined: 2026-03-03*
*Last updated: 2026-03-03 after roadmap creation*
