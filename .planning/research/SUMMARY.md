# Project Research Summary

**Project:** Tessie for Homey (greenfield rebuild of com.adamnoren.tessie)
**Domain:** Homey Pro device integration app — Tesla vehicle control via Tessie API
**Researched:** 2026-03-03
**Confidence:** HIGH

## Executive Summary

This is a Homey Pro app that exposes Tesla vehicles as smart home devices using the Tessie API as the intermediary. Tessie abstracts away Tesla's complex OAuth flow, Vehicle Command Protocol signing, and regional routing — users need only a Tessie API token to get started. The established pattern for this type of integration is a single driver with one device per vehicle, each device managing its own WebSocket connection to `streaming.tessie.com/{VIN}` for real-time telemetry, backed by a REST polling fallback. Two real-world reference implementations (Teslemetry's Homey app and RonnyWinkler's Tesla app) validate this architecture. The stack is well-defined: TypeScript on Homey SDK v3 targeting Node.js 22, with native `fetch()` for REST and the `ws` library for WebSocket.

The single biggest product differentiator is real-time WebSocket streaming. The dominant competitor ("Tesla Car & Energy") uses polling with up to one minute of lag. Tessie provides Fleet Telemetry streaming out of the box at no extra infrastructure cost — the app simply needs to connect to the streaming endpoint and parse JSON messages. This requires serious attention to connection resilience: exponential backoff reconnection, heartbeat monitoring, and proper device availability management when the connection drops.

The most dangerous pitfall — and the one that will kill this app in App Store reviews — is phantom battery drain from aggressive REST polling. Any polling that runs while the Tesla is in `waiting_for_sleep` state resets its sleep timer, draining the 12V battery overnight. WebSocket streaming avoids this problem entirely. The architecture must treat WebSocket as the primary data source and make polling genuinely sleep-aware from day one. A secondary architectural constraint is that Homey's timers (`this.homey.setInterval()`) must be used instead of native Node.js timers or the app will leak resources across restarts. Both of these constraints need to be baked into Phase 1 infrastructure, not retrofitted later.

## Key Findings

### Recommended Stack

The production dependency footprint is intentionally minimal: `ws` for WebSocket and `source-map-support` for TypeScript stack traces. Everything else is either native (Node.js 22 `fetch()`) or devDependencies (TypeScript, Homey CLI, ESLint with Athom's config). This minimalism is not just preference — Homey apps run on constrained hardware, and the App Store review process gives extra scrutiny to apps with heavy dependency trees.

**Core technologies:**
- **Homey Apps SDK v3 + TypeScript 5.9:** The only supported SDK, with first-class TypeScript support via the CLI. `@tsconfig/node22` targets the actual runtime. Catches bugs at compile time instead of on-device.
- **Native `fetch()` (Node.js 22 built-in):** Homey's own upgrade guide explicitly recommends this over `node-fetch` (which causes `ECONNRESET` errors on Node.js 19+) and over `axios` (unnecessary weight).
- **`ws` ^8.19 (WebSocket library):** Native Node.js 22 WebSocket has stack overflow bugs reported on Homey. The `ws` library is battle-tested, used by reference apps, and is the safe choice.
- **Homey Compose (`.homeycompose/` directory):** Never edit `app.json` directly. The CLI merges compose files at build time. Capabilities, Flow cards, and driver config all live in compose files.

Key version constraints: `"compatibility": ">=12.9.0"` (Node.js 22 runtime), `"sdk": 3`, `"platforms": ["local"]` (Homey Pro only — Cloud cannot sustain WebSocket connections).

### Expected Features

See [FEATURES.md](.planning/research/FEATURES.md) for the full prioritized list.

**Must have (table stakes — v1 launch):**
- Battery level, range, and charging state display — core reason people pair Tesla to Homey
- Charge control: start/stop, charge limit (%), charging amps — enables solar-excess and off-peak automation
- Climate on/off and temperature setting — pre-conditioning before departure
- Lock/unlock and sentry mode toggle — security-based automations
- Trunk and frunk open — delivery/arrival workflows
- Location (GPS) — presence-based triggers
- Tire pressure (TPMS) — safety monitoring
- Multiple vehicle support — many households have 2+ Teslas
- Flow triggers, conditions, and actions for all of the above

**Should have (differentiators — v1 or fast-follow):**
- **WebSocket real-time streaming** — the primary competitive advantage over "Tesla Car & Energy"
- Winter controls: defrost, seat heaters/coolers, steering wheel heater
- Window vent/close — weather-based automations
- HomeLink trigger — garage automation on arrival
- Charge port open/close, valet mode, flash/honk
- Climate keeper modes (Dog/Camp/Keep)

**Defer to v2+:**
- Energy products (Solar/Powerwall) — separate device class, large scope
- Geofence triggers — complex to implement correctly
- Battery health monitoring, charge/drive history — nice analytics, not core
- Charge/precondition scheduling — Tessie's own app handles this better

**Explicit anti-features (never build):**
- Direct Tesla Fleet API integration — doubles maintenance with no user benefit
- In-app dashboards or charts — fights Homey's UI paradigm
- Smart charging algorithm — scope explosion; expose controls and let users build Flows
- Camera/live view — not available via Tessie API

### Architecture Approach

The architecture follows Homey's canonical pattern: App singleton (entry point, no shared state needed since each device has its own token) → Driver (pairing, vehicle discovery) → Device instances (one per vehicle, owns WebSocket + polling). Two library classes handle external communication: `TessieClient` (stateless REST wrapper) and `TessieStream` (WebSocket client with reconnection logic). A `CapabilityMapper` module provides pure functions mapping Tessie API field names to Homey capability IDs and performing unit conversions (miles to km for range, psi for tire pressure, etc.).

**Major components:**
1. **App (`app.ts`)** — Singleton entry point. Registers app-level Flow cards if any. No shared state since auth is per-device.
2. **Driver (`drivers/car/driver.ts`)** — Handles pairing: accepts API token via credentials-login view, calls Tessie `/vehicles` to discover vehicles, returns device list. Implements `onRepair()` for token rotation.
3. **Device (`drivers/car/device.ts`)** — Per-vehicle instance. Owns `TessieStream` (WebSocket primary) and polling interval (fallback). Registers capability listeners for commands. Manages device availability state.
4. **TessieClient (`lib/TessieClient.ts`)** — Stateless HTTP wrapper for `api.tessie.com`. One instance per device (auth token may differ per device).
5. **TessieStream (`lib/TessieStream.ts`)** — WebSocket client for `streaming.tessie.com/{VIN}`. Handles connection, exponential backoff reconnection, heartbeat, and event emission.
6. **CapabilityMapper (`lib/capabilities.ts`)** — Pure mapping functions between Tessie fields and Homey capability IDs. No I/O.

Data pairing model: only the VIN goes in the immutable device `data` object. The API token goes in device `store` (updateable via `setStoreValue()`). This enables token repair without device deletion.

### Critical Pitfalls

1. **Phantom battery drain from polling** — REST polling while the vehicle is in `waiting_for_sleep` prevents the Tesla from entering sleep mode, causing overnight battery loss. Prevention: WebSocket streaming as primary data source; REST polling only as fallback at 5+ minute intervals; skip polls entirely when vehicle state is `asleep` or `waiting_for_sleep`. This constraint shapes the entire architecture and cannot be retrofitted.

2. **WebSocket connection not surviving Homey app lifecycle** — Homey's network stack has acknowledged instability with long-lived connections. The `ws` library does not auto-reconnect. Prevention: exponential backoff with jitter (1s → 60s max), application-level heartbeat/ping to detect dead connections within 30 seconds, call `setUnavailable()` immediately on disconnect, call `setAvailable()` and refresh all capabilities on reconnect. Implement `onUninit()` to properly close connections.

3. **Native `setInterval`/`setTimeout` instead of Homey-managed timers** — Native timers leak across app restarts, causing duplicate polling and eventual crashes. Prevention: exclusively use `this.homey.setInterval()` and `this.homey.setTimeout()`. Enforce with ESLint rule. Clean up non-Homey resources in `onUninit()`.

4. **No repair flow for token rotation** — Tessie tokens can be revoked or regenerated. Without `Driver#onRepair()`, users must delete the device and recreate all their Flows. Prevention: implement `onRepair()` alongside initial pairing (same infrastructure); store token in `store` not `data`.

5. **API token in immutable `data` object** — The device `data` object cannot be changed after pairing. Putting the token there permanently locks it. Prevention: `data: { id: vin }` only; `store: { apiToken: token }` for credentials; `settings` for user-configurable options.

## Implications for Roadmap

Based on the component dependency graph, capability dependencies, and pitfall phase-mapping from research, the following phase structure is recommended:

### Phase 1: Foundation and Pairing

**Rationale:** Nothing else can exist until there is a valid device in Homey's database. Pairing requires TessieClient (to call `/vehicles`), which requires the TypeScript project scaffold and Compose structure to exist. The data model (VIN in `data`, token in `store`) is a decision that cannot be changed after pairing — it must be right from day one. The repair flow belongs here because it uses the same session infrastructure as pairing.

**Delivers:** Working app scaffold, a paired Tesla device visible in Homey, correct data model, repair flow for token rotation.

**Addresses features:** API token auth, vehicle discovery, multiple vehicle support.

**Avoids pitfalls:** Immutable `data` object misuse (#5), missing repair flow (#4), app.json direct editing (#14), Node.js 22 compatibility (#15).

**Research flag:** Standard patterns — Homey pairing is well-documented. No additional research needed.

### Phase 2: Data Pipeline (REST Polling)

**Rationale:** Polling is simpler than WebSocket and validates the entire data pipeline — capability definitions, CapabilityMapper, and the TessieClient — before tackling real-time streaming. Getting polling right first means WebSocket integration only needs to replace the data source, not the mapping logic.

**Delivers:** Live vehicle state updating in Homey UI. All sensor capabilities (battery, range, temperatures, location, tire pressure, charge state, lock state, sentry, odometer). Polling is sleep-aware from day one.

**Addresses features:** All Tier 1 table stakes sensor capabilities.

**Avoids pitfalls:** Phantom battery drain (#1) — polling must check vehicle sleep state before requesting. Unhandled promise rejections (#10) — TessieClient must have centralized error handling. Device unavailable on failure (#13).

**Research flag:** No additional research needed — REST API is fully documented.

### Phase 3: Commands and Controls

**Rationale:** Commands depend on the capability model established in Phase 2. Each settable capability gets a `registerCapabilityListener` that dispatches the corresponding Tessie command. The wake-before-command logic must be implemented here.

**Delivers:** All Flow action cards. Lock/unlock, climate on/off + temperature, charging start/stop + limit + amps, trunk/frunk open, sentry toggle, charge port open/close.

**Addresses features:** All Tier 1 action capabilities.

**Avoids pitfalls:** Vehicle asleep when commanding (#6) — implement wake utility with 90-second polling loop.

**Research flag:** No additional research needed — Tessie command endpoints are documented.

### Phase 4: Real-time WebSocket Streaming

**Rationale:** WebSocket is the key differentiator but depends on a working data pipeline (Phase 2) and device lifecycle (Phase 3) to integrate with. The TessieStream class needs to emit data in the same shape as polling results so the CapabilityMapper handles both sources identically.

**Delivers:** Near-instant capability updates instead of polling lag. TessieStream with exponential backoff, heartbeat monitoring, and availability management. Polling interval extends to 5 minutes while WebSocket is active.

**Addresses features:** Real-time streaming (primary differentiator), faster Flow triggers.

**Avoids pitfalls:** WebSocket connection not surviving lifecycle (#2), timer leaks (#3) — all timers via `this.homey.setInterval()`.

**Research flag:** May benefit from additional research on Homey-specific WebSocket patterns and Tessie streaming message schema during implementation. The Tessie streaming explorer and `vehicle_data.proto` are authoritative references.

### Phase 5: Extended Controls

**Rationale:** After the core data and control flows are solid, adding extended vehicle controls (climate extras, windows, HomeLink) follows the same capability + command pattern already established. This is additive work on proven infrastructure.

**Delivers:** Winter controls (defrost, seat heaters/coolers, steering wheel heater), window vent/close, sunroof vent/close, HomeLink trigger, flash/honk, valet mode, climate keeper modes, cabin overheat protection.

**Addresses features:** Tier 2 differentiators.

**Research flag:** Standard patterns — no additional research needed.

### Phase 6: Flow Polish and App Store Launch

**Rationale:** Flow cards, sub-capability cards, error handling polish, asset preparation, and App Store submission are separable from feature work. The App Store review process is strict and has specific requirements that must be addressed systematically.

**Delivers:** Complete Flow integration (all triggers, conditions, actions with proper titles and hints). Capability migration pattern. Device repair flow polish. App Store assets (SVG icons, images, translations). Submission.

**Addresses features:** Tier 1 and Tier 2 Flow cards.

**Avoids pitfalls:** App Store rejection due to assets/metadata (#9) — prepare assets in parallel with Phase 5 code. Sub-capability Flow cards not auto-generated (#11) — manually define them. Capability migration for existing devices (#7) — implement `addCapability()` guard pattern.

**Research flag:** No additional research needed — App Store guidelines are documented.

### Phase Ordering Rationale

- **Pairing before everything:** The device must exist in Homey before any capability can be registered or updated.
- **Polling before WebSocket:** Simpler data source validates the capability model first; WebSocket then replaces the source without changing the mapping layer.
- **Commands after capabilities:** Capability listeners can only be registered for capabilities that exist.
- **WebSocket after commands:** Ensures device lifecycle (onInit/onUninit) is stable before adding the most complex infrastructure.
- **Extended controls late:** They follow the same patterns as core controls and don't block the critical path.
- **App Store last:** Polish and assets should not block functional development, but awareness of requirements must exist from day one.

### Research Flags

Needs additional research during planning:
- **Phase 4 (WebSocket Streaming):** Tessie streaming message schema is documented via the streaming explorer and proto file, but Homey-specific WebSocket behavior quirks may surface. Plan for a research spike before implementation.

Standard patterns (skip research-phase):
- **Phase 1 (Foundation):** Homey pairing is well-documented with official examples.
- **Phase 2 (REST Polling):** Tessie REST API is fully documented with OpenAPI spec.
- **Phase 3 (Commands):** Tessie command endpoints follow consistent patterns.
- **Phase 5 (Extended Controls):** Same capability + command pattern as Phase 3.
- **Phase 6 (App Store):** Official guidelines cover all requirements.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All recommendations verified against official Homey docs, actual package versions on npm, and two reference Homey+Tesla apps. `node-fetch` vs native `fetch` and native WebSocket vs `ws` are explicitly documented guidance. |
| Features | HIGH | Primary source is the official Tessie OpenAPI spec plus the Home Assistant Tessie integration (comprehensive entity list). Competitor feature set verified against live App Store listings and community threads. |
| Architecture | HIGH | Homey SDK docs are comprehensive and official. Single-driver pattern validated by dominant reference app (RonnyWinkler). Data model constraints (immutable `data`, mutable `store`) are explicitly documented. |
| Pitfalls | HIGH | All critical pitfalls are documented in official Homey SDK docs, Tessie help articles, or Homey community threads with multiple confirming sources. Phantom drain is confirmed by a specific Tessie help article and a Home Assistant bug report. |

**Overall confidence: HIGH**

### Gaps to Address

- **Tessie API rate limits:** The rate limits for `api.tessie.com` REST endpoints are undocumented. Implement defensive rate limiting (queue with minimum intervals) in TessieClient from day one and handle 429 responses with exponential backoff. Consult Tessie support before App Store submission.
- **Tessie streaming schema completeness:** The WebSocket message schema is documented via the streaming explorer and `vehicle_data.proto`, but the exact subset of fields available for a given vehicle (vs. what the proto defines theoretically) is only fully knowable at runtime with a real vehicle. Build CapabilityMapper to be defensive about missing fields.
- **App Store category:** The `"category": "cars"` value in the app manifest may not be a valid Homey category. Valid categories are: lights, video, music, appliances, security, climate, tools, internet, localization, energy. Verify the correct category before submission; likely `"tools"` or `"internet"`.
- **Multi-account households:** The architecture assumes one Tessie token per vehicle. If two family members have separate Tessie accounts for their respective vehicles, verify this works correctly during pairing.

## Sources

### Primary (HIGH confidence)
- [Homey Apps SDK Documentation](https://apps.developer.homey.app) — SDK reference, pairing, capabilities, Flow, Compose, Node.js 22 guide, App Store guidelines
- [Tessie Developer Portal](https://developer.tessie.com) — REST API reference, OpenAPI spec, Fleet Telemetry streaming
- [Tessie: Eliminating Phantom Drain](https://help.tessie.com/article/77-eliminating-phantom-drain) — sleep-aware polling guidance
- [Home Assistant Tessie Integration](https://www.home-assistant.io/integrations/tessie/) — comprehensive entity and feature reference
- [Tesla Car & Energy Homey App](https://homey.app/en-us/app/com.tesla.car/Tesla-Car-&-Energy/) — primary competitor feature baseline

### Secondary (MEDIUM confidence)
- [Teslemetry Homey App (GitHub)](https://github.com/Teslemetry/homey) — reference implementation for TypeScript + Homey + Tesla API patterns
- [RonnyWinkler Tesla Homey App (GitHub)](https://github.com/RonnyWinkler/homey.tesla) — reference implementation for WebSocket usage
- [Homey Community: WebSocket connections](https://community.homey.app/t/building-own-app-that-can-sustain-a-websocket-connection-to-a-3rd-party-platform/103492) — Homey-specific WebSocket reliability guidance
- [Tessie Streaming Explorer](https://streaming.tessie.com/explorer) — real-time WebSocket schema inspection

### Tertiary (LOW confidence)
- [Tesla vehicle_data.proto](https://github.com/teslamotors/fleet-telemetry/blob/main/protos/vehicle_data.proto) — theoretical field list; actual per-vehicle availability unknown until tested
- Undocumented Tessie API rate limits — needs validation with Tessie support

---
*Research completed: 2026-03-03*
*Ready for roadmap: yes*
