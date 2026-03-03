# Feature Landscape

**Domain:** Tesla vehicle smart home integration (Homey Pro app via Tessie API)
**Researched:** 2026-03-03

## Table Stakes

Features users expect from a Tesla Homey integration. Missing any of these and users will use the competing "Tesla Car & Energy" app or Teslemetry instead.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Battery level & range display | Every Tesla integration shows this. Users check SoC before trips. | Low | `battery_level`, `battery_range`, `est_battery_range` from state endpoint |
| Charging status & control | Start/stop charging is the #1 reason people integrate Tesla with smart homes. | Low | `charging_state`, `start_charging`, `stop_charging` commands |
| Charge limit adjustment | Users manage battery health by setting charge limits via smart home. | Low | `set_charge_limit` command, `charge_limit_soc` state |
| Charging amps control | Smart charging (solar excess, off-peak) requires amp adjustment. | Low | `set_charging_amps` command |
| Climate on/off | Pre-conditioning cabin before departure is a core use case. | Low | `start_climate`, `stop_climate` commands |
| Temperature setting | Users set exact cabin temp, not just on/off. | Low | `set_temperatures` command (15-28C range) |
| Lock/unlock | Remote lock verification and control is expected by all Tesla app users. | Low | `lock`, `unlock` commands, `locked` state |
| Sentry mode toggle | Users toggle sentry mode based on location/time via automations. | Low | `enable_sentry`, `disable_sentry` commands |
| Trunk & frunk open | Opening trunk/frunk remotely (e.g., for deliveries) is common. | Low | `activate_front_trunk`, `activate_rear_trunk` commands |
| Location tracking | GPS position as a device tracker enables presence-based automations. | Low | `latitude`, `longitude` from drive_state |
| Odometer reading | Basic vehicle info users expect to see. | Low | `odometer` from vehicle_state |
| Inside/outside temperature | Users monitor cabin temp, especially for pets or pre-conditioning decisions. | Low | `inside_temp`, `outside_temp` from climate_state |
| Multiple vehicle support | Many Tesla households have 2+ vehicles. Each must be a separate Homey device. | Medium | Tessie `/vehicles` endpoint returns all vehicles; pairing flow must handle discovery |
| Flow triggers for state changes | Without triggers, the app is just a dashboard. Triggers enable automation. | Medium | Homey auto-generates `_changed` triggers for capabilities |
| Flow conditions | "If charging" / "if locked" conditions are essential for conditional automations. | Medium | Boolean capabilities auto-generate condition cards |
| Flow actions for all commands | Actions are how users automate. Every command must be a Flow action. | Medium | Map each Tessie command to a Homey Flow action card |
| Charge port open/close | Users automate charge port for scheduled charging workflows. | Low | `open_charge_port`, `close_charge_port` commands |
| Tire pressure display | Safety monitoring, users expect to see TPMS data. | Low | `tpms_pressure_fl/fr/rl/rr` from vehicle_state |

## Differentiators

Features that set this app apart from the existing "Tesla Car & Energy" app and Teslemetry. These are competitive advantages.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Real-time WebSocket streaming | The existing Tesla app uses polling with up to 1-minute lag. WebSocket streaming via `streaming.tessie.com/{VIN}` provides near-instant updates. This is the single biggest differentiator. | High | Requires persistent WebSocket connection management, reconnection logic, message parsing. Tessie provides this out of the box -- no Fleet Telemetry server hosting needed. |
| No Tesla developer account required | The Tesla Car & Energy app requires users to deal with Tesla Fleet API auth (OAuth, virtual keys). Tessie abstracts this -- users just need a Tessie API token. | Low | Major UX advantage. Pairing is: enter token, pick vehicle, done. |
| No per-request API costs | Tesla Fleet API charges per request (1 EUR/1000 commands, 1 EUR/500 data, 1 EUR/50 wake). Tessie bundles this in their subscription. Users don't worry about API bills. | Low | Marketing/positioning advantage rather than technical feature. |
| Seat heater/cooler control | Per-seat heating (0-3 levels) and cooling control. Existing Tesla app has this but it's a differentiator vs basic integrations. | Medium | `set_seat_heat` (seat 0-5, level 0-3), `set_seat_cool` commands |
| Steering wheel heater | Toggle steering wheel heater for winter pre-conditioning flows. | Low | `start_steering_wheel_heater`, `stop_steering_wheel_heater` |
| Defrost mode | Full defrost (windshield + rear) is valuable for winter automations. | Low | `start_max_defrost`, `stop_max_defrost` commands |
| Window vent/close | Vent windows on hot days or close them when rain is detected (pair with weather app). | Low | `vent_windows`, `close_windows` commands |
| Sunroof vent/close | For vehicles with sunroof, vent/close control. | Low | `vent_sunroof`, `close_sunroof` commands |
| HomeLink trigger | Auto-open garage door via Homey Flow when arriving home. | Low | `trigger_homelink` command. Pairs well with location-based triggers. |
| Flash lights & honk | Find your car in parking lots, or use as notification signals in automations. | Low | `flash`, `honk` commands |
| Valet mode toggle | Enable/disable valet mode when lending car or using valet parking. | Low | `enable_valet`, `disable_valet` commands |
| Software update status | Show pending updates and installation progress. Trigger flows on update available. | Low | `software_update` object in vehicle_state |
| Battery health monitoring | Long-term battery degradation tracking via Tessie's battery health endpoints. | Medium | `/{vin}/battery_health` -- unique Tessie feature not in Tesla Fleet API |
| Charging session history | View past charging sessions with energy added, cost, location. | Medium | `/{vin}/charges` endpoint with date filtering |
| Drive history | View past drives with distance, energy consumed, efficiency. | Medium | `/{vin}/drives` endpoint |
| Charge scheduling | Add/remove charge schedules directly from Homey. | Medium | `add_charge_schedule`, `remove_charge_schedule` endpoints |
| Precondition scheduling | Schedule climate pre-conditioning from Homey flows. | Medium | `add_precondition_schedule`, `remove_precondition_schedule` endpoints |
| Climate keeper modes (Keep/Dog/Camp) | Set climate keeper mode for pets or camping. Dog mode is a beloved Tesla feature. | Low | `set_climate_keeper_mode` command |
| Cabin overheat protection settings | Configure COP mode and temperature threshold. | Low | `set_cabin_overheat_protection`, `set_cabin_overheat_protection_temp` |
| Bioweapon defense mode | Toggle HEPA filtration mode. Niche but Tessie supports it. | Low | `set_bioweapon_mode` command |
| Navigation sharing | Send destination address to vehicle from Homey Flow. | Medium | `share` endpoint -- send address/coordinates to vehicle |
| Speed limit mode | Parental controls: set speed limit from Homey. | Low | `enable_speed_limit`, `disable_speed_limit`, `set_speed_limit` |
| Geofence-based triggers | Trigger automations when vehicle enters/leaves a location radius. | High | Requires continuous location tracking + geofence calculation in app. The Tesla Car & Energy app already supports this, so it's a parity feature at the differentiator level. |
| Energy product support (Solar/Powerwall) | Tessie API supports energy products. Homey users with Tesla Solar/Powerwall want unified control. | High | Separate device class. Energy site data, battery reserve, operation mode, grid services. Would be a v2 feature. |

## Anti-Features

Features to explicitly NOT build. These would waste effort, create maintenance burden, or harm the user experience.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Direct Tesla Fleet API integration | OAuth flow is complex (requires web server for callback, virtual key installation on vehicle, domain verification). Tessie handles all of this. Adding direct API support doubles the maintenance surface for no user benefit. | Use Tessie API exclusively. Users who want direct Tesla API can use the "Tesla Car & Energy" app. |
| Homey Cloud support | Homey Cloud has limited Node.js runtime -- no persistent WebSocket connections, restricted background execution. The core differentiator (real-time streaming) would not work. | Target Homey Pro only. State this clearly in app description. |
| Smart charging algorithm | Building solar-excess charging, time-of-use optimization, or dynamic rate charging is a massive scope expansion. It requires electricity price APIs, solar production data, and complex scheduling logic. | Expose charge amp control and charge limit as Flow actions. Let users build their own smart charging Flows using Homey's energy monitoring, weather apps, and logic. |
| In-app dashboards or charts | Homey's UI paradigm is device cards + Flows, not custom dashboards. Building drive history charts or battery degradation graphs fights the platform. | Expose data as capabilities and Flow triggers. Users can use Homey Insights for historical data visualization. |
| Camera/live view streaming | Sentry mode camera streaming is not available via Tessie API (Tesla restricts this to first-party apps). Even if it were, Homey has no video player UI. | Expose `dashcam_state` as a sensor. Users can be notified of sentry events. |
| Non-Tesla vehicles | Tessie is Tesla-only. Attempting to abstract for other EVs would be over-engineering with no API to back it. | Name the app "Tessie" not "EV Controller". Keep scope tight. |
| Duplicate Homey built-in capabilities | Homey has built-in presence detection, geofencing, and location services. Rebuilding these in the app is redundant. | Use Homey's location capabilities and expose vehicle GPS. Let users combine with Homey's built-in geofencing in Flows. |
| Fleet management features | Tessie has fleet/driver management endpoints. These are for commercial fleet operators, not smart home users. | Skip fleet-only endpoints: driver management, invitations, charging invoices, fleet battery health. |
| Boombox / fart sound | Novelty feature (`remote_boombox`) that would confuse App Store reviewers and add no smart home value. | Skip entirely. |

## Feature Dependencies

```
Tessie API Token Authentication
  |-> Vehicle Discovery (GET /vehicles)
       |-> Device Pairing (create Homey device per vehicle)
            |-> Vehicle State Polling (GET /{vin}/state)
            |    |-> All sensor capabilities (battery, range, temp, location, etc.)
            |    |-> All condition Flow cards
            |    |-> All trigger Flow cards
            |
            |-> WebSocket Streaming (wss://streaming.tessie.com/{VIN})
            |    |-> Real-time capability updates (battery, location, speed, temp)
            |    |-> Faster triggers (near-instant vs polling interval)
            |
            |-> Vehicle Commands (POST /{vin}/command/*)
                 |-> All action Flow cards
                 |-> Climate control (start/stop, temp, seats, defrost)
                 |-> Charging control (start/stop, amps, limit, port)
                 |-> Access control (lock/unlock, trunk, frunk, windows)
                 |-> Other (sentry, valet, homelink, flash, honk)

Vehicle State Polling (required first)
  |-> WebSocket Streaming (supplements/replaces polling for real-time fields)

Climate Start/Stop (prerequisite)
  |-> Temperature Setting (climate must be on)
  |-> Seat Heater/Cooler (climate system active)
  |-> Steering Wheel Heater (climate system active)

Wake Vehicle (may be needed before any command)
  |-> Any command when vehicle is asleep
```

## MVP Recommendation

Build in this priority order. Each tier should be shippable to the App Store.

### Tier 1: Core (App Store launch)
Prioritize these -- they represent table stakes and the minimum viable product:

1. **API token authentication + vehicle discovery** -- the foundation
2. **Periodic polling for vehicle state** -- reliable data pipeline before tackling WebSocket
3. **Battery & charging capabilities** -- battery level, range, charging state, charge limit, charge amps, start/stop charging
4. **Climate capabilities** -- climate on/off, temperature, inside/outside temp
5. **Access capabilities** -- lock state, lock/unlock, trunk, frunk
6. **Sentry mode** -- toggle on/off
7. **Location** -- latitude, longitude as capabilities
8. **Tire pressure** -- display TPMS data
9. **Basic Flow cards** -- auto-generated triggers/conditions from capabilities, plus action cards for all commands above

### Tier 2: Real-time + Extended Controls
The key differentiator, plus filling out the command set:

10. **WebSocket streaming** -- connect to `streaming.tessie.com/{VIN}`, update capabilities in real-time, fall back to polling on disconnect
11. **Window vent/close** -- popular automation trigger (weather-based)
12. **Defrost mode** -- winter pre-conditioning
13. **Seat heaters/coolers** -- per-seat control
14. **Steering wheel heater** -- winter comfort
15. **Climate keeper modes** -- Dog/Camp/Keep
16. **HomeLink trigger** -- garage door automation
17. **Flash lights & honk** -- car finder / notification
18. **Charge port open/close** -- charging workflow automation
19. **Valet mode** -- toggle

### Tier 3: Advanced Features
Nice-to-haves that deepen the integration:

20. **Software update status** -- show pending updates, trigger on available
21. **Geofence-based triggers** -- arrive/depart location triggers using vehicle GPS
22. **Cabin overheat protection** -- configure mode and temp
23. **Speed limit mode** -- parental control
24. **Navigation sharing** -- send destinations to vehicle
25. **Battery health monitoring** -- degradation tracking
26. **Charge/drive session history** -- exposed as Flow triggers or capability data

**Defer indefinitely:**
- Energy product support (Solar/Powerwall): Large scope, separate device class, separate user base. Do this only if there's clear demand after launch.
- Charge/precondition scheduling: Complex scheduling UI that Tessie's own app handles better. Users can build equivalent Flows.
- Bioweapon defense mode: Too niche.

## Competitive Landscape

| Feature | This App (Tessie) | Tesla Car & Energy | Teslemetry |
|---------|-------------------|-------------------|------------|
| Real-time data | WebSocket streaming | Polling (1-min lag) | Fleet Telemetry streaming |
| Auth complexity | Simple API token | OAuth + virtual key + Tesla dev account | OAuth (handled by service) |
| Ongoing cost to user | Tessie subscription | Tesla API per-request fees | $2.50/mo + $2.50/vehicle/mo |
| Battery/charging | Full | Full | Full |
| Climate control | Full | Full | Partial (~80% complete) |
| Vehicle commands | Full | Full (some gaps noted by users) | 2000 commands included, then extra |
| Energy products | Not in v1 (Tessie supports it) | Yes | Yes |
| Seat heaters | Per-seat | Per-seat | Unknown |
| Location tracking | Yes | Yes + geofencing | Yes |
| Drive/charge history | Via Tessie API | Limited | Unknown |
| Battery health | Via Tessie API | No | Unknown |
| App maturity | New (v1.3.0 existing, rebuild planned) | Mature (active development) | Early (~80% complete) |

## Sources

- [Tessie Developer Documentation](https://developer.tessie.com) -- HIGH confidence, official API reference
- [Tessie OpenAPI Specification](https://developer.tessie.com/openapi.yaml) -- HIGH confidence, authoritative endpoint list
- [Tessie Fleet Telemetry Access](https://developer.tessie.com/reference/access-tesla-fleet-telemetry) -- HIGH confidence, WebSocket streaming details
- [Home Assistant Tessie Integration](https://www.home-assistant.io/integrations/tessie/) -- HIGH confidence, comprehensive entity list showing what's possible
- [Tesla Car & Energy Homey App](https://homey.app/en-us/app/com.tesla.car/Tesla-Car-&-Energy/) -- HIGH confidence, primary competitor feature list
- [Tesla Car & Energy Community Thread](https://community.homey.app/t/app-pro-tesla/100824) -- MEDIUM confidence, user feedback and feature requests
- [Teslemetry Homey Community Thread](https://community.homey.app/t/introducing-teslemetry-real-time-data-from-tesla-vehicles/147636) -- MEDIUM confidence, competitor positioning
- [Existing Tessie Homey App](https://homey.app/en-us/app/com.adamnoren.tessie/Tessie/) -- HIGH confidence, current feature baseline
- [Tesla Fleet API Vehicle Commands](https://developer.tesla.com/docs/fleet-api/endpoints/vehicle-commands) -- HIGH confidence, official Tesla command reference
- [TeslaMate GitHub](https://github.com/teslamate-org/teslamate/) -- MEDIUM confidence, data logging feature reference
- [Homey Apps SDK - Capabilities](https://apps.developer.homey.app/the-basics/devices/capabilities) -- HIGH confidence, Homey platform constraints
- [Homey Apps SDK - Flow](https://apps.developer.homey.app/the-basics/flow) -- HIGH confidence, Flow card system
- [Homey App Store Guidelines](https://apps.developer.homey.app/app-store/guidelines) -- HIGH confidence, submission requirements
