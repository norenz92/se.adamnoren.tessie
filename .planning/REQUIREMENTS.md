# Requirements: Tessie for Homey

**Defined:** 2026-03-03
**Core Value:** Tesla owners can monitor and control their vehicles directly from their Homey smart home hub, with real-time data and full Flow integration.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Authentication & Pairing

- [ ] **AUTH-01**: User can enter Tessie API token during vehicle pairing flow
- [ ] **AUTH-02**: App discovers all vehicles from the user's Tessie account after token entry
- [ ] **AUTH-03**: User can pair multiple vehicles, each appearing as a separate Homey device
- [ ] **AUTH-04**: User can repair/re-authenticate a device without deleting it (token rotation)

### Battery & Charging

- [ ] **CHRG-01**: User can see battery level percentage on the device
- [ ] **CHRG-02**: User can see estimated range on the device
- [ ] **CHRG-03**: User can see current charging status (charging, not charging, complete, etc.)
- [ ] **CHRG-04**: User can start and stop charging via the device or Flow action
- [ ] **CHRG-05**: User can view and adjust the charge limit percentage
- [ ] **CHRG-06**: User can view and adjust the charging amps
- [ ] **CHRG-07**: User can open and close the charge port via the device or Flow action
- [ ] **CHRG-08**: User can view past charging sessions with energy added and location

### Climate

- [ ] **CLIM-01**: User can turn climate on and off via the device or Flow action
- [ ] **CLIM-02**: User can set the target cabin temperature
- [ ] **CLIM-03**: User can see inside and outside temperature on the device
- [ ] **CLIM-04**: User can control per-seat heater level (0-3) for each seat
- [ ] **CLIM-05**: User can toggle the steering wheel heater
- [ ] **CLIM-06**: User can activate and deactivate max defrost mode
- [ ] **CLIM-07**: User can set climate keeper mode (Off/Keep/Dog/Camp)
- [ ] **CLIM-08**: User can configure cabin overheat protection mode and temperature

### Access & Security

- [ ] **ACCS-01**: User can see lock state and lock/unlock the vehicle via the device or Flow action
- [ ] **ACCS-02**: User can toggle sentry mode on/off via the device or Flow action
- [ ] **ACCS-03**: User can open the trunk via the device or Flow action
- [ ] **ACCS-04**: User can open the frunk via the device or Flow action
- [ ] **ACCS-05**: User can vent and close windows via Flow action
- [ ] **ACCS-06**: User can enable and disable valet mode via Flow action
- [ ] **ACCS-07**: User can set and toggle speed limit mode via Flow action

### Vehicle Data

- [ ] **DATA-01**: User can see GPS location (latitude/longitude) on the device
- [ ] **DATA-02**: User can see tire pressure for all four tires on the device
- [ ] **DATA-03**: User can see odometer reading on the device
- [ ] **DATA-04**: User can see software update status and pending version on the device
- [ ] **DATA-05**: User can see battery health/degradation data on the device

### Real-time Streaming

- [ ] **STRM-01**: Vehicle data updates in near-real-time via WebSocket streaming from streaming.tessie.com/{VIN}
- [ ] **STRM-02**: App falls back to periodic REST polling when WebSocket is disconnected
- [ ] **STRM-03**: Polling is sleep-aware (does not poll when vehicle is asleep or waiting for sleep)

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
- [ ] **STOR-02**: App targets Homey Pro only with compatibility >= 12.9.0

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
| AUTH-01 | — | Pending |
| AUTH-02 | — | Pending |
| AUTH-03 | — | Pending |
| AUTH-04 | — | Pending |
| CHRG-01 | — | Pending |
| CHRG-02 | — | Pending |
| CHRG-03 | — | Pending |
| CHRG-04 | — | Pending |
| CHRG-05 | — | Pending |
| CHRG-06 | — | Pending |
| CHRG-07 | — | Pending |
| CHRG-08 | — | Pending |
| CLIM-01 | — | Pending |
| CLIM-02 | — | Pending |
| CLIM-03 | — | Pending |
| CLIM-04 | — | Pending |
| CLIM-05 | — | Pending |
| CLIM-06 | — | Pending |
| CLIM-07 | — | Pending |
| CLIM-08 | — | Pending |
| ACCS-01 | — | Pending |
| ACCS-02 | — | Pending |
| ACCS-03 | — | Pending |
| ACCS-04 | — | Pending |
| ACCS-05 | — | Pending |
| ACCS-06 | — | Pending |
| ACCS-07 | — | Pending |
| DATA-01 | — | Pending |
| DATA-02 | — | Pending |
| DATA-03 | — | Pending |
| DATA-04 | — | Pending |
| DATA-05 | — | Pending |
| STRM-01 | — | Pending |
| STRM-02 | — | Pending |
| STRM-03 | — | Pending |
| FLOW-01 | — | Pending |
| FLOW-02 | — | Pending |
| FLOW-03 | — | Pending |
| FLOW-04 | — | Pending |
| FLOW-05 | — | Pending |
| FLOW-06 | — | Pending |
| FLOW-07 | — | Pending |
| STOR-01 | — | Pending |
| STOR-02 | — | Pending |

**Coverage:**
- v1 requirements: 44 total
- Mapped to phases: 0
- Unmapped: 44 ⚠️

---
*Requirements defined: 2026-03-03*
*Last updated: 2026-03-03 after initial definition*
