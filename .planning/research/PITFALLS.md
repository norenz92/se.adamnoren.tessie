# Domain Pitfalls

**Domain:** Homey Pro smart home app with third-party Tesla API (Tessie) integration
**Researched:** 2026-03-03

---

## Critical Pitfalls

Mistakes that cause rewrites, App Store rejection, or major user-facing issues.

### Pitfall 1: Phantom Battery Drain from Aggressive Polling

**What goes wrong:** REST polling the Tessie API at short intervals (e.g. every 30 seconds) to keep vehicle data fresh prevents the Tesla from entering sleep mode. Tesla vehicles need sustained periods without API contact to enter the low-power sleep state. Third-party apps that poll continuously are one of the most common causes of "phantom drain" -- a well-documented issue in the Tesla community where idle vehicles lose several percent of battery per day.

**Why it happens:** Developers default to frequent polling for "freshness" without understanding that Tesla vehicles have three states: `awake`, `waiting_for_sleep`, and `asleep`. Any data request to the Tessie REST API while the vehicle is in `waiting_for_sleep` resets the sleep timer. Fleet Telemetry via WebSocket does NOT have this problem because it streams data pushed from the vehicle rather than pulling.

**Consequences:**
- Users blame the Homey app for battery drain, leave 1-star reviews
- Tesla community forums will actively warn people away from the app
- Undermines the core value proposition of convenient Tesla monitoring

**Prevention:**
1. Use WebSocket streaming (streaming.tessie.com/{VIN}) as the primary data source -- it does not prevent sleep
2. Only poll the REST API as a fallback when WebSocket is disconnected, and use long intervals (5-10 minutes minimum when vehicle is idle)
3. Before any REST poll, check the vehicle's last known state. If `asleep` or `waiting_for_sleep`, skip the poll entirely unless the user explicitly requested a command
4. Implement an adaptive polling strategy: poll frequently only while charging or driving (vehicle is awake anyway), reduce to near-zero when parked

**Detection (warning signs):**
- Users report unexpected battery loss
- Vehicle state logs show it rarely enters `asleep`
- REST API calls happening at regular intervals regardless of vehicle state

**Phase:** Must be addressed in Phase 1 (core architecture). The dual data pipeline design must have sleep-awareness baked in from day one. Retrofitting sleep-awareness onto a polling-first architecture requires significant rework.

**Confidence:** HIGH -- well-documented across Tessie help docs, Tesla community, and Home Assistant integration issues.

**Sources:**
- [Tessie: Eliminating Phantom Drain](https://help.tessie.com/article/77-eliminating-phantom-drain)
- [Tessie integration prevents vehicle sleep (Home Assistant)](https://github.com/home-assistant/core/issues/107982)

---

### Pitfall 2: WebSocket Connection Not Surviving Homey App Lifecycle

**What goes wrong:** The WebSocket connection to streaming.tessie.com drops silently and never reconnects. The app continues running but shows stale data, or worse, marks all capabilities as "null" or stops updating entirely. The user sees a device that appears online but has frozen values.

**Why it happens:** Multiple interacting causes:
1. Homey's network stack has known instability with long-lived connections (acknowledged in Homey community forums)
2. WebSocket connections drop for many reasons: network changes, Tessie server restarts, idle timeouts, Homey Pro WiFi reconnections
3. Developers implement the initial connection but skip reconnection logic, or implement naive retry (immediate reconnect in a tight loop) that either hammers the server or gives up after N failures
4. The `ws` library in Node.js does not auto-reconnect -- it is a raw WebSocket implementation

**Consequences:**
- Device shows stale data indefinitely with no user-visible indication
- Flow automations based on capability values fire on stale data (or never fire)
- App appears broken but does not crash, so there is no automatic recovery

**Prevention:**
1. Implement exponential backoff with jitter for reconnection: start at 1s, increase to max 60s, add random jitter to prevent thundering herd if Tessie restarts
2. Use WebSocket ping/pong or application-level heartbeats to detect dead connections within 30 seconds (do not rely solely on TCP keep-alive)
3. On disconnect, immediately call `this.setUnavailable('Reconnecting to vehicle...')` on affected devices so the user sees accurate status and Flows are blocked from using stale data
4. On successful reconnect, call `this.setAvailable()` and refresh all capability values
5. Implement connection health logging so you can diagnose issues from crash reports
6. Close the WebSocket properly in `Device#onUninit()` to prevent orphaned connections

**Detection (warning signs):**
- Capability values stop updating but device shows as "available"
- Long gaps in telemetry data logs
- Users report "frozen" device values

**Phase:** Must be addressed in Phase 1. The WebSocket manager is core infrastructure; reliability requirements shape its entire design.

**Confidence:** HIGH -- Homey community explicitly warns about network connection instability; WebSocket reconnection is a universal engineering concern.

**Sources:**
- [Homey Forum: Building app with WebSocket connection](https://community.homey.app/t/building-own-app-that-can-sustain-a-websocket-connection-to-a-3rd-party-platform/103492)
- [Homey Forum: WebSocket error](https://community.homey.app/t/websocket-error/143433)

---

### Pitfall 3: Using Native setInterval/setTimeout Instead of Homey-Managed Timers

**What goes wrong:** Using `setInterval()` or `setTimeout()` directly (instead of `this.homey.setInterval()` / `this.homey.setTimeout()`) creates timer leaks. When the app is updated, uninstalled, or the device is removed, the native timers keep running in the background, accumulating with each restart. This causes memory leaks, duplicate polling, and eventually crashes.

**Why it happens:** It is natural for Node.js developers to reach for the native timer functions. The Homey SDK wraps them specifically to handle cleanup on app destruction, but this is easy to miss if you are not reading the SDK docs carefully.

**Consequences:**
- Memory usage grows over time, eventually crashing the app
- Multiple overlapping polling timers after each app restart, causing duplicate API calls
- Orphaned WebSocket connections from previous app instances if reconnect timers persist
- Homey Pro may become sluggish as leaked timers from your app consume resources

**Prevention:**
1. Always use `this.homey.setInterval()` and `this.homey.setTimeout()` for all timed operations
2. For any resources not managed by Homey timers (WebSocket connections, event listeners), clean up explicitly in `onUninit()` on App, Driver, and Device classes
3. Add a linting rule or code review check that flags direct `setInterval` / `setTimeout` usage
4. If you must use native timers in utility classes that lack `this.homey`, pass the homey instance to them or use the `unload` event: `this.homey.on('unload', () => clearInterval(myInterval))`

**Detection (warning signs):**
- App memory usage grows after each "homey app run" during development
- Duplicate log entries appearing after app restarts
- `grep -r "setInterval\|setTimeout" --include="*.js"` shows calls not prefixed with `this.homey.`

**Phase:** Phase 1 -- establish the pattern from the first line of code. This is a convention that must be enforced from the start.

**Confidence:** HIGH -- explicitly documented in the Homey Apps SDK and Homey Cloud guide.

**Sources:**
- [Homey Apps SDK: Homey Cloud guide](https://apps.developer.homey.app/guides/homey-cloud)
- [Homey Forum: Question regarding setInterval](https://community.homey.app/t/question-regarding-setinterval/61138)

---

### Pitfall 4: No Repair Flow for Token Re-Authentication

**What goes wrong:** The user's Tessie API token becomes invalid (revoked, regenerated in Tessie dashboard, or Tessie account change). Without a repair flow, the only way to fix it is to delete the device and re-pair it. This destroys all Flows referencing that device -- the user must manually recreate every automation.

**Why it happens:** Developers implement the pairing flow for initial token entry but forget that tokens have a lifecycle. Tessie tokens are long-lived bearer tokens (no documented expiration), but users still regenerate them, and Tessie could change their token policy at any time.

**Consequences:**
- User must delete and re-add device to update the token
- All Flows referencing the device break (Homey ties Flows to specific device instances)
- If the user has multiple vehicles with complex automations, this is devastating
- Leads to 1-star App Store reviews citing "cannot change API key"

**Prevention:**
1. Implement `Driver#onRepair(session, device)` with a custom view that lets the user enter a new API token
2. Store the token in the device's `store` (not `data` -- the `data` object is immutable after pairing)
3. Define a `repair` array in the driver manifest with a custom login view
4. On successful repair, re-initialize the WebSocket connection and REST client with the new token
5. Consider also allowing the token to be updated in device settings as a secondary path

**Detection (warning signs):**
- 401 errors from Tessie API with no way for the user to fix it
- Support requests asking "how do I change my API key"
- Device permanently stuck in `setUnavailable` state

**Phase:** Phase 1 -- the repair flow should be implemented alongside the initial pairing flow. It uses the same session/view infrastructure and is much harder to add later.

**Confidence:** HIGH -- repair flow is a documented Homey SDK feature specifically designed for this scenario.

**Sources:**
- [Homey Apps SDK: Pairing (includes repair section)](https://apps.developer.homey.app/the-basics/devices/pairing)
- [Homey Forum: Tado token expired discussion](https://community.homey.app/t/tado-invalid-refresh-token-expired/61000)

---

### Pitfall 5: Immutable `data` Object Misuse During Pairing

**What goes wrong:** Developers store volatile information (API tokens, IP addresses, configuration) in the device's `data` object during pairing. Since `data` is immutable after pairing, this information can never be updated without deleting and re-pairing the device.

**Why it happens:** The pairing flow returns a device object with `name`, `data`, and optionally `store` and `settings`. It is intuitive to put everything in `data`. The Homey SDK documentation explicitly warns: "This object cannot be changed after pairing" -- but developers miss this because it is a single sentence.

**Consequences:**
- API tokens stored in `data` cannot be updated when they change
- Any configuration that might need to change is permanently locked
- Forces device deletion and re-pairing (breaking all Flows) to update anything in `data`

**Prevention:**
1. Put ONLY the unique device identifier in `data` -- for this project, that is the vehicle VIN: `{ data: { id: vin } }`
2. Store the API token in `store`: `{ store: { apiToken: token } }` -- store can be updated at any time via `this.setStoreValue()`
3. Use `settings` for anything the user should be able to change from the device settings UI
4. Review every field in your pairing return object and ask: "Will this ever need to change?"

**Detection (warning signs):**
- Pairing return object has more than 1-2 fields in `data`
- API token or any credential is in `data`
- Users reporting they cannot update configuration without re-pairing

**Phase:** Phase 1 -- pairing is implemented once and the data model is locked in. Getting this wrong in v1 means a breaking change to fix.

**Confidence:** HIGH -- explicitly documented constraint in Homey SDK.

**Sources:**
- [Homey Apps SDK: Drivers & Devices](https://apps.developer.homey.app/the-basics/devices)

---

## Moderate Pitfalls

### Pitfall 6: Not Waking Vehicle Before Sending Commands

**What goes wrong:** User triggers a Flow action (e.g. "Turn on climate") but the vehicle is asleep. The command fails with a 408 "vehicle unavailable" error. The Flow shows a failure, but the user does not understand why -- their car is "right there."

**Why it happens:** The Tessie API requires the vehicle to be awake to receive commands. The wake process can take up to 90 seconds (Tessie wake endpoint timeout). Developers either skip the wake step entirely, or call wake once and immediately send the command without waiting for the vehicle to actually come online.

**Prevention:**
1. Before any command, call the Tessie wake endpoint
2. Poll the vehicle status in a loop (every 2-3 seconds) until state is `awake`, with a maximum timeout of 90 seconds
3. Only then send the actual command
4. Return a meaningful error to the Flow if wake times out: "Vehicle did not wake up. It may be in an area with no connectivity."
5. The wake call has no downside when the vehicle is already awake, so always call it

**Detection (warning signs):**
- Intermittent command failures, especially at night or after long idle periods
- 408 errors in logs
- Users reporting "commands only work sometimes"

**Phase:** Phase 2 (commands) -- but design the wake utility in Phase 1 infrastructure.

**Confidence:** HIGH -- documented Tesla API behavior; Tessie wake endpoint has 90-second timeout documented in their API.

**Sources:**
- [Tesla API: Wake command](https://tesla-api.timdorr.com/vehicle/commands/wake)

---

### Pitfall 7: Missing Capability Migration for Existing Devices on App Update

**What goes wrong:** You add new capabilities (e.g. tire pressure, sentry mode status) in version 2 of the app. New users get them. Existing users do not -- their already-paired devices still have the v1 capability set. They see other users discussing features they cannot access.

**Why it happens:** Homey does NOT automatically add new capabilities to already-paired devices when the driver manifest changes. The new capabilities only apply to devices paired after the update. Developers assume that updating the driver manifest is sufficient.

**Consequences:**
- Existing users miss new features
- Support requests and confusion
- Users are told to delete and re-pair (breaking Flows) to get new capabilities

**Prevention:**
1. In `Device#onInit()`, check if the device needs migration and add missing capabilities:
   ```javascript
   if (!this.hasCapability('measure_tire_pressure_fl')) {
     await this.addCapability('measure_tire_pressure_fl');
   }
   ```
2. Do NOT call `addCapability()` unconditionally on every init -- check with `hasCapability()` first
3. Similarly, use `removeCapability()` for capabilities you no longer support (but be aware this breaks Flows using those capabilities)
4. Test migration by pairing a device with v1, then updating to v2 and verifying new capabilities appear

**Detection (warning signs):**
- Users on updated app versions missing capabilities that new users have
- `hasCapability()` returning false for capabilities listed in the driver manifest

**Phase:** Phase 2+ (any phase that adds capabilities). But establish the migration pattern in Phase 1 so it is ready when needed.

**Confidence:** HIGH -- explicitly documented in Homey SDK "Breaking Changes" guide.

**Sources:**
- [Homey Apps SDK: Breaking Changes](https://apps.developer.homey.app/guides/how-to-breaking-changes)
- [Homey Forum: Capabilities not updated for existing devices](https://community.homey.app/t/capabilities-not-updated-for-existing-devices-upon-app-update/9646)

---

### Pitfall 8: One WebSocket Per Device Instead of Shared Connection Management

**What goes wrong:** Each Device instance opens its own WebSocket connection to streaming.tessie.com/{VIN}. With multiple vehicles, this means multiple independent WebSocket connections, each with their own reconnect logic, error handling, and lifecycle. When the App class is the right place for shared infrastructure, putting connection management in Device leads to duplicated logic and harder debugging.

**Why it happens:** It feels natural to manage the connection for a vehicle inside that vehicle's Device class. But the Homey App class (`/app.js`) is instantiated once and is explicitly designed for shared logic -- all devices access it via `this.homey.app`.

**Consequences:**
- Duplicated WebSocket management code in each Device
- No centralized connection health monitoring
- Harder to implement features like "reconnect all" or "disconnect all on token change"
- The API token is per-account (not per-vehicle), so token lifecycle should be centralized

**Prevention:**
1. Create a connection manager class instantiated in `App#onInit()` or `Driver#onInit()`
2. Each Device registers with the manager on init and deregisters on uninit
3. The manager handles per-VIN WebSocket connections but with shared configuration, token management, and reconnection policies
4. Devices access the manager via `this.homey.app.connectionManager` or `this.driver.connectionManager`

**Detection (warning signs):**
- WebSocket connection code duplicated across Device files
- Reconnection bugs that affect one vehicle but not another
- Token update requires touching every Device instance

**Phase:** Phase 1 -- architectural decision that affects all subsequent code.

**Confidence:** MEDIUM -- pattern recommended in Homey SDK docs (app.js for shared logic); architecture choice is project-specific.

**Sources:**
- [Homey Apps SDK: App](https://apps.developer.homey.app/the-basics/app)

---

### Pitfall 9: App Store Rejection Due to Asset and Metadata Issues

**What goes wrong:** You build a fully functional app, submit it to the Homey App Store, and it gets rejected for non-functional reasons: wrong icon format, missing translations, poor driver images, Flow card titles containing device names, or the app description being too long. Review takes up to 2 weeks, and each rejection resets the queue.

**Why it happens:** Developers focus on code and treat App Store assets as an afterthought. The Homey App Store has surprisingly specific and strict requirements that are easy to overlook:
- App icons must be SVG with transparent background
- Driver icons must be unique per driver, 960x960px canvas, right-angle perspective preferred
- Driver images need white backgrounds, specific resolutions (75x75, 500x500, 1000x1000)
- App name maximum 4 words, cannot include "Homey", "Athom", or protocol names
- Flow card titles must not contain device names or parentheses
- English is required; any additional language must be complete (all Flow cards, settings, capabilities translated)
- Description must be one engaging sentence, not repeating the app name
- Apps requiring payment for functionality are prohibited

**Consequences:**
- 2+ week delays per rejection round
- Frustration after building a working app
- Multiple revision cycles for non-code issues

**Prevention:**
1. Read the full [App Store Guidelines](https://apps.developer.homey.app/app-store/guidelines) before starting development
2. Prepare all assets (icons, images, descriptions, translations) in parallel with code, not after
3. Use the Homey Developer Tools for validation before submission
4. Create a pre-submission checklist covering every guideline requirement
5. Flow card titles: use generic descriptions like "Climate turned on" not "Tesla Model 3 climate turned on"
6. Do not request `homey:manager:api` permission unless you are building a Tools category app (stricter review)

**Detection (warning signs):**
- SVG icons with non-transparent backgrounds
- Missing or inconsistent translations
- Flow card titles mentioning specific device names
- Readme containing markdown, URLs, or changelogs (only plain text allowed)

**Phase:** Phase 1 for structure setup (correct manifest, asset directories), final phase for polish. But awareness must be there from the start.

**Confidence:** HIGH -- documented in official Homey App Store guidelines.

**Sources:**
- [Homey Apps SDK: Guidelines](https://apps.developer.homey.app/app-store/guidelines)
- [Homey Apps SDK: Publishing](https://apps.developer.homey.app/app-store/publishing)

---

### Pitfall 10: Unhandled Promise Rejections Crashing the App

**What goes wrong:** An async operation (API call, WebSocket message, capability update) throws an unhandled rejection. On Homey Cloud this immediately crashes the app. On Homey Pro the behavior is more forgiving but still causes memory leaks and unpredictable state.

**Why it happens:** The Tessie API can fail in many ways: network errors, 401 auth failures, 408 vehicle unavailable, 5xx server errors, malformed JSON responses. WebSocket messages can arrive with unexpected formats. Each of these paths needs error handling, and it is easy to miss one `await` without a `try/catch` or one `.then()` without a `.catch()`.

**Prevention:**
1. Wrap every `await` in try/catch, especially: `setCapabilityValue()`, Tessie API calls, WebSocket operations
2. For fire-and-forget promises, always append `.catch(this.error)` to log without crashing
3. Implement a centralized API client that handles common error codes (401, 408, 429, 5xx) and translates them into meaningful actions (mark unavailable, retry, log)
4. Add a global unhandled rejection handler as a safety net (but fix the root causes): `process.on('unhandledRejection', ...)`
5. Test with network disconnection, invalid tokens, and Tessie API downtime

**Detection (warning signs):**
- App crashes during normal operation with no obvious trigger
- "UnhandledPromiseRejectionWarning" in logs
- Intermittent device unavailability that fixes itself after app restart

**Phase:** Phase 1 -- error handling patterns must be established in the API client and WebSocket manager from the start.

**Confidence:** HIGH -- explicitly called out in Homey SDK documentation.

**Sources:**
- [Homey Apps SDK: Homey Cloud guide](https://apps.developer.homey.app/guides/homey-cloud)

---

## Minor Pitfalls

### Pitfall 11: Flow Cards Not Auto-Generated for Sub-Capabilities

**What goes wrong:** You define sub-capabilities using dot notation (e.g. `measure_temperature.inside`, `measure_temperature.outside`) to reuse the temperature capability for interior and exterior readings. Flow cards for these sub-capabilities are not automatically generated -- users cannot use them in Flows.

**Prevention:**
- Manually create Flow trigger, condition, and action cards for each sub-capability
- Define them in `.homeycompose/flow/` with proper titles and hints
- Test that all sub-capability Flow cards appear in the Flow editor

**Phase:** Phase 1 (if using sub-capabilities for temperature, tire pressure, etc.).

**Confidence:** HIGH -- explicitly documented in Homey SDK capabilities guide.

**Sources:**
- [Homey Apps SDK: Capabilities](https://apps.developer.homey.app/the-basics/devices/capabilities)

---

### Pitfall 12: Tessie API Rate Limits Are Undocumented

**What goes wrong:** You implement polling or command retries without rate limiting awareness, hit Tessie's rate limits, and get 429 responses or temporary bans. Since the limits are not publicly documented, you cannot design around specific thresholds.

**Prevention:**
1. Implement conservative rate limiting on your side: queue API calls, enforce minimum intervals between requests
2. Handle 429 responses gracefully: honor `Retry-After` headers if present, use exponential backoff
3. Telemetry streaming has a documented limit: maximum 1 signal per second for custom telemetry configurations
4. Prefer WebSocket streaming over REST polling to reduce API call volume
5. Consider contacting Tessie support to ask about rate limits before publishing

**Detection (warning signs):**
- 429 HTTP responses in logs
- API calls suddenly returning errors after periods of heavy usage

**Phase:** Phase 1 (API client infrastructure).

**Confidence:** LOW for specific rate limits (not documented), HIGH for the pattern of implementing defensive rate limiting.

**Sources:**
- [Tessie Developer API Overview](https://developer.tessie.com/reference/about)

---

### Pitfall 13: Not Setting Device Unavailable on API/Connection Failure

**What goes wrong:** The Tessie API returns errors or the WebSocket disconnects, but the device remains marked as "available" in Homey. Users attempt to use the device in Flows or manually, get confusing failures, and do not understand why the device is not working.

**Prevention:**
1. Call `this.setUnavailable('Reason')` immediately when: WebSocket disconnects, API returns 401, API returns repeated errors, vehicle goes offline
2. Call `this.setAvailable()` when connectivity is restored
3. When unavailable, Homey automatically prevents capability writes and Flow actions, protecting against stale-data automations
4. Include a human-readable reason string: "Vehicle offline", "API authentication failed", "Reconnecting..."
5. Note: `setUnavailable()` requires a message parameter to actually work (there is a known SDK bug where omitting the message does not properly mark the device as unavailable)

**Phase:** Phase 1 -- availability management is part of the core device lifecycle.

**Confidence:** HIGH -- documented SDK behavior.

**Sources:**
- [Homey SDK Issue #313: setUnavailable requires message](https://github.com/athombv/homey-apps-sdk-issues/issues/313)

---

### Pitfall 14: Editing app.json Directly Instead of Using Homey Compose

**What goes wrong:** You edit `/app.json` directly to add capabilities, Flow cards, or driver configuration. The next time you build, Homey Compose regenerates `app.json` from the compose files, overwriting your changes.

**Prevention:**
1. Never edit `/app.json` manually -- it is auto-generated
2. All configuration goes in compose files:
   - `/.homeycompose/app.json` for app-level settings
   - `/.homeycompose/capabilities/` for custom capability definitions
   - `/.homeycompose/flow/` for Flow card definitions
   - `/drivers/<id>/driver.compose.json` for driver configuration
3. Add `/app.json` to `.gitignore` or document clearly that it is generated

**Phase:** Phase 1 -- project structure decision.

**Confidence:** HIGH -- documented in Homey SDK.

**Sources:**
- [Homey Apps SDK: Homey Compose](https://apps.developer.homey.app/advanced/homey-compose)

---

### Pitfall 15: Node.js 22 Compatibility Issues

**What goes wrong:** The app uses npm packages or Node.js APIs that behave differently in Node.js 22. As of Homey v12.9.0, all platforms run Node.js 22. Notably, the `ws` WebSocket library and socket.io have known behavioral differences in Node.js 22 around socket closure.

**Prevention:**
1. Develop and test with Node.js 22 from the start
2. Check that all npm dependencies support Node.js 22
3. If using `node-homey-api`, use version 3.14.17 or newer (fixes Node.js 22 socket closure issues)
4. Set the `"engines"` field in `package.json` to require Node.js 22

**Phase:** Phase 1 -- development environment setup.

**Confidence:** HIGH -- documented in Homey SDK Node.js 22 upgrade guide.

**Sources:**
- [Homey Apps SDK: Node.js 22 Upgrade Guide](https://apps.developer.homey.app/upgrade-guides/node-22)

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Project setup | Editing app.json directly (#14) | Use Homey Compose from day one |
| Project setup | Node.js version mismatch (#15) | Target Node.js 22 from start |
| Pairing flow | Storing token in immutable `data` (#5) | VIN in `data`, token in `store` |
| Pairing flow | Missing repair flow (#4) | Implement alongside initial pairing |
| WebSocket streaming | Connection not surviving lifecycle (#2) | Exponential backoff, heartbeats, setUnavailable |
| WebSocket streaming | Timer leaks (#3) | Use `this.homey.setInterval()` exclusively |
| REST polling | Phantom battery drain (#1) | WebSocket-first, sleep-aware polling |
| REST polling | Undocumented rate limits (#12) | Defensive rate limiting, prefer streaming |
| Commands | Vehicle asleep when commanding (#6) | Always wake before commands, 90s timeout |
| Capabilities | Sub-capability Flow cards missing (#11) | Manual Flow card creation |
| App updates | Capability migration (#7) | addCapability() with hasCapability() guard |
| Error handling | Unhandled promise rejections (#10) | Centralized error handling, .catch() everywhere |
| Device status | Not reflecting API failures (#13) | setUnavailable/setAvailable lifecycle |
| Connection architecture | Per-device connections (#8) | Centralized connection manager |
| App Store submission | Asset/metadata rejection (#9) | Prepare assets early, follow guidelines exactly |

---

## Sources

- [Homey Apps SDK Documentation](https://apps.developer.homey.app)
- [Homey Apps SDK: App Store Guidelines](https://apps.developer.homey.app/app-store/guidelines)
- [Homey Apps SDK: Breaking Changes](https://apps.developer.homey.app/guides/how-to-breaking-changes)
- [Homey Apps SDK: Homey Cloud Guide](https://apps.developer.homey.app/guides/homey-cloud)
- [Homey Apps SDK: Pairing](https://apps.developer.homey.app/the-basics/devices/pairing)
- [Homey Apps SDK: Capabilities](https://apps.developer.homey.app/the-basics/devices/capabilities)
- [Homey Apps SDK: Node.js 22 Upgrade Guide](https://apps.developer.homey.app/upgrade-guides/node-22)
- [Homey Apps SDK: Permissions](https://apps.developer.homey.app/the-basics/app/permissions)
- [Homey Community Forum: WebSocket connections](https://community.homey.app/t/building-own-app-that-can-sustain-a-websocket-connection-to-a-3rd-party-platform/103492)
- [Homey Community Forum: API polling patterns](https://community.homey.app/t/what-is-the-best-way-to-regularly-poll-an-api-for-device-state/56665)
- [Tessie Developer Documentation](https://developer.tessie.com)
- [Tessie: Access Tesla Fleet Telemetry](https://developer.tessie.com/reference/access-tesla-fleet-telemetry)
- [Tessie: Eliminating Phantom Drain](https://help.tessie.com/article/77-eliminating-phantom-drain)
- [Homey SDK Issues: setUnavailable bug](https://github.com/athombv/homey-apps-sdk-issues/issues/313)
