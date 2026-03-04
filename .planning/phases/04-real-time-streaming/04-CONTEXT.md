# Phase 4: Real-time Streaming - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning

<domain>
## Phase Boundary

WebSocket telemetry from streaming.tessie.com/{VIN} replacing polling as the primary data source while vehicle is awake. Automatic reconnection with backoff on disconnect. Polling becomes an infrequent fallback while streaming is active, and resumes normal adaptive rates when streaming is down. No new capabilities or controls — this phase changes the data transport, not what data is shown.

</domain>

<decisions>
## Implementation Decisions

### Connection architecture
- Per-device WebSocket connection — each VehicleDevice manages its own connection to streaming.tessie.com/{VIN}
- Consistent with existing per-device TessieClient pattern

### Unavailability threshold
- Device only shows as unavailable after extended outage — brief disconnects are normal and should not trigger status flapping
- Same "Offline" status regardless of whether the cause is streaming failure or REST API failure

### Polling coordination
- When WebSocket is connected and streaming: extend polling to infrequent fallback interval (5+ minutes per success criteria)
- When WebSocket disconnects: revert to normal adaptive polling (60s awake, 2min charging, 30min asleep) until reconnection succeeds
- Fallback poll updates ALL capabilities including ones the stream may not cover (battery health, software update, etc.)

### Command refresh
- Commands (Phase 3) continue to trigger immediate REST refreshState() after execution — do not rely on stream for command confirmation
- Stream supplements but does not replace command feedback path

### Data updates
- Each streaming message updates relevant capabilities individually — no batching or buffering
- Lowest latency: users see changes the moment stream data arrives

### Status visibility
- No streaming/polling indicator on the device card — users care about data freshness, not transport
- Existing Awake/Asleep/Offline statuses remain unchanged
- Same Offline state regardless of cause (stream down vs API down)

### Claude's Discretion
- Connection lifecycle strategy (always connected vs only when awake — research Tessie streaming behavior)
- Reconnection backoff strategy (exponential, fixed, or hybrid)
- Reconnection backoff parameters (initial delay, max delay, jitter)
- Exact fallback polling interval while streaming is active
- State sync on reconnect (full REST poll vs trust stream)
- Data format mapping approach (separate stream mapper vs normalize to REST format — depends on actual Tessie streaming data format)
- WebSocket library choice (node:ws, built-in, or other — research Homey Pro Node.js 22 capabilities)
- Extended outage threshold before marking unavailable

</decisions>

<specifics>
## Specific Ideas

No specific references — open to standard WebSocket patterns and Tessie streaming API conventions.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `VehicleDevice.updateCapabilities(state)`: Maps full Tessie REST state to Homey capabilities — reusable if stream data can be normalized to same format
- `VehicleDevice.pollCycle()`: Existing adaptive polling with sleep detection and failure tracking — modify to support fallback mode
- `VehicleDevice.scheduleNextPoll(ms)`: Timer management for poll intervals — extend to switch between streaming-fallback and normal-adaptive rates
- `TessieClient`: Currently REST-only using `node:https` — needs WebSocket streaming method or separate streaming class

### Established Patterns
- `node:https` for all API calls (no fetch/axios)
- `export =` for CommonJS compatibility
- `homey.setTimeout` for scheduling (not `setInterval` for adaptive polling)
- `setAvailable()`/`setUnavailable()` for device reachability
- Per-device token via `getStoreValue('token')`
- `consecutiveFailures` counter with `MAX_CONSECUTIVE_FAILURES` threshold for unavailability

### Integration Points
- `VehicleDevice.onInit()`: Initialize WebSocket connection alongside existing polling setup
- `VehicleDevice.pollCycle()`: Modify to check WebSocket state and use fallback interval when streaming
- `VehicleDevice.onDeleted()`: Clean up WebSocket connection alongside poll timer cleanup
- `TessieClient` or new module: WebSocket connection to `streaming.tessie.com/{VIN}` with auth token
- Streaming endpoint: `streaming.tessie.com/{VIN}` (from PROJECT.md)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-real-time-streaming*
*Context gathered: 2026-03-04*
