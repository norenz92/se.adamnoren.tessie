# Tessie for Homey

## What This Is

A Homey Pro app that integrates with the Tessie API to display Tesla vehicle data and provide full vehicle control. Users add their Tesla vehicles as Homey devices, getting real-time data via WebSocket telemetry and periodic polling, with all data exposed as Homey capabilities for use in Flows (automations). Built for the Homey App Store.

## Core Value

Tesla owners can monitor and control their vehicles directly from their Homey smart home hub, with real-time data and full Flow integration.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Display all available vehicle data (battery, range, location, climate, tire pressure, charging status, etc.)
- [ ] Full vehicle controls (climate, charging, locks, trunk, frunk, sentry mode, etc.)
- [ ] Real-time data via WebSocket streaming from streaming.tessie.com/{VIN}
- [ ] Periodic polling as fallback/supplement to telemetry
- [ ] Multiple vehicle support (each vehicle as a separate Homey device)
- [ ] Homey Flow integration (triggers, conditions, actions for all capabilities)
- [ ] Tessie API token entered during vehicle pairing flow
- [ ] Homey App Store quality and standards compliance

### Out of Scope

- Homey Cloud support — targeting Homey Pro only
- Direct Tesla API integration — using Tessie as the API layer
- Non-Tesla vehicles — Tessie is Tesla-specific

## Context

- **Tessie API**: Third-party Tesla API service providing REST endpoints for vehicle data and commands, plus WebSocket streaming at streaming.tessie.com/{VIN} for real-time telemetry
- **Homey Pro**: Smart home hub running local Node.js apps with a capability-based device model, Flow engine for automations, and an App Store for distribution
- **Authentication**: Tessie uses API tokens (bearer auth) — user provides their token during the pairing flow to discover and add vehicles
- **Data pipeline**: Dual approach — WebSocket streaming for real-time updates, periodic REST polling as fallback

## Constraints

- **Platform**: Homey Pro only (local Node.js runtime)
- **API dependency**: All vehicle interaction goes through Tessie's API — subject to their rate limits and availability
- **App Store**: Must meet Homey App Store guidelines for review and publication
- **Distribution**: Public app — needs proper error handling, user-friendly pairing, and documentation

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Tessie API over direct Tesla API | Tessie handles OAuth complexity, provides stable API, adds WebSocket streaming | — Pending |
| Homey Pro only (no Cloud) | Local runtime gives full Node.js capabilities, WebSocket support | — Pending |
| Dual data pipeline (WebSocket + polling) | WebSocket for real-time, polling as fallback for reliability | — Pending |
| Token during pairing (not app settings) | Cleaner UX — auth happens when adding the device, not as a separate step | — Pending |

---
*Last updated: 2026-03-03 after initialization*
