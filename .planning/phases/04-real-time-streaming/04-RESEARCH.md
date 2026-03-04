# Phase 4: Real-time Streaming - Research

**Researched:** 2026-03-04
**Domain:** WebSocket streaming, Tessie Fleet Telemetry API, Node.js built-in WebSocket
**Confidence:** HIGH

## Summary

Phase 4 replaces polling as the primary data source with WebSocket streaming from `wss://streaming.tessie.com/{VIN}`. The Tessie streaming API provides Tesla Fleet Telemetry data over WebSocket, sending JSON messages with telemetry key-value pairs, connectivity status, alerts, and errors. Each message includes a `data` array with keys like `Soc`, `InsideTemp`, `Location`, `Locked`, etc., using a different naming convention and value format than the REST API.

Node.js 22 (Homey Pro v12.9.0+) includes a stable built-in WebSocket client (stable since v22.4.0) that follows the browser WebSocket API spec. This means no external dependencies are needed. However, the browser-spec WebSocket constructor does NOT support custom headers -- authentication must use the `access_token` query parameter approach, which Tessie explicitly supports.

The core challenge is mapping streaming telemetry field names (e.g., `Soc`, `InsideTemp`, `ChargeAmps`) to the existing capability update logic that expects REST API field paths (e.g., `charge_state.battery_level`, `climate_state.inside_temp`). A dedicated stream-to-capability mapper is needed.

**Primary recommendation:** Use the Node.js 22 built-in `WebSocket` class (zero dependencies), authenticate via query parameter, create a `TessieStreamer` class in `lib/tessie-streamer.ts` that handles connection lifecycle and emits normalized capability updates, and modify `VehicleDevice` to coordinate streaming with fallback polling.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Per-device WebSocket connection -- each VehicleDevice manages its own connection to streaming.tessie.com/{VIN}
- Consistent with existing per-device TessieClient pattern
- Device only shows as unavailable after extended outage -- brief disconnects are normal and should not trigger status flapping
- Same "Offline" status regardless of whether the cause is streaming failure or REST API failure
- When WebSocket is connected and streaming: extend polling to infrequent fallback interval (5+ minutes per success criteria)
- When WebSocket disconnects: revert to normal adaptive polling (60s awake, 2min charging, 30min asleep) until reconnection succeeds
- Fallback poll updates ALL capabilities including ones the stream may not cover (battery health, software update, etc.)
- Commands (Phase 3) continue to trigger immediate REST refreshState() after execution -- do not rely on stream for command confirmation
- Stream supplements but does not replace command feedback path
- Each streaming message updates relevant capabilities individually -- no batching or buffering
- No streaming/polling indicator on the device card
- Existing Awake/Asleep/Offline statuses remain unchanged

### Claude's Discretion
- Connection lifecycle strategy (always connected vs only when awake -- research Tessie streaming behavior)
- Reconnection backoff strategy (exponential, fixed, or hybrid)
- Reconnection backoff parameters (initial delay, max delay, jitter)
- Exact fallback polling interval while streaming is active
- State sync on reconnect (full REST poll vs trust stream)
- Data format mapping approach (separate stream mapper vs normalize to REST format -- depends on actual Tessie streaming data format)
- WebSocket library choice (node:ws, built-in, or other -- research Homey Pro Node.js 22 capabilities)
- Extended outage threshold before marking unavailable

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STRM-01 | Vehicle data updates in near-real-time via WebSocket streaming from streaming.tessie.com/{VIN} | Tessie streaming API documented with JSON data messages, field mapping researched, Node.js 22 built-in WebSocket confirmed stable, auth via query param supported |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Built-in `WebSocket` | Node.js 22+ (stable v22.4.0) | WebSocket client connection | Zero dependencies, browser-spec compliant, stable in Homey Pro runtime |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:events` | Built-in | EventEmitter for TessieStreamer | Emit parsed telemetry to VehicleDevice |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Built-in WebSocket | `ws` npm package | `ws` supports custom headers and has more features, but adds a dependency. Built-in is sufficient since Tessie supports query param auth. |

**Installation:**
```bash
# No installation needed -- all built-in to Node.js 22
```

## Architecture Patterns

### Recommended Project Structure
```
lib/
├── tessie-client.ts       # Existing REST client (unchanged)
├── tessie-streamer.ts     # NEW: WebSocket streaming client
└── stream-mapper.ts       # NEW: Maps stream fields to capability values
drivers/
└── vehicle/
    └── device.ts          # Modified: integrates streaming + fallback polling
```

### Pattern 1: Separate Streamer Class
**What:** `TessieStreamer` extends `EventEmitter`, owns WebSocket lifecycle (connect, reconnect, parse messages), emits `data` events with normalized capability key-value pairs.
**When to use:** Always -- keeps WebSocket complexity out of VehicleDevice.
**Example:**
```typescript
// Source: Architecture recommendation based on Tessie API docs
import { EventEmitter } from 'node:events';

class TessieStreamer extends EventEmitter {
  private ws: WebSocket | null = null;
  private vin: string;
  private token: string;
  private reconnectDelay: number = 1000;
  private maxReconnectDelay: number = 60000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connected: boolean = false;

  constructor(vin: string, token: string) {
    super();
    this.vin = vin;
    this.token = token;
  }

  connect(): void {
    const url = `wss://streaming.tessie.com/${this.vin}?access_token=${this.token}`;
    this.ws = new WebSocket(url);

    this.ws.addEventListener('open', () => {
      this.connected = true;
      this.reconnectDelay = 1000; // Reset backoff
      this.emit('connected');
    });

    this.ws.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(String(event.data));
        if (msg.data) {
          this.emit('data', msg.data, msg.createdAt);
        }
        if (msg.status) {
          this.emit('connectivity', msg.status);
        }
      } catch (e) {
        // Ignore parse errors
      }
    });

    this.ws.addEventListener('close', () => {
      this.connected = false;
      this.emit('disconnected');
      this.scheduleReconnect();
    });

    this.ws.addEventListener('error', () => {
      // Error is always followed by close
    });
  }

  private scheduleReconnect(): void {
    const jitter = Math.random() * 0.3 * this.reconnectDelay;
    const delay = this.reconnectDelay + jitter;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }

  get isConnected(): boolean {
    return this.connected;
  }

  destroy(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }
}

export = TessieStreamer;
```

### Pattern 2: Stream Field Mapper
**What:** Translates Tessie streaming telemetry keys to Homey capability updates. The streaming API uses different field names and value formats than the REST API.
**When to use:** On every incoming data message.
**Example:**
```typescript
// Source: Tessie streaming API docs + fleet-telemetry proto
// Stream fields use PascalCase keys with typed values (stringValue, locationValue, etc.)

interface StreamDataPoint {
  key: string;
  value: {
    stringValue?: string;
    locationValue?: { latitude: number; longitude: number };
    // Other value types exist but these cover our needs
  };
}

interface CapabilityUpdate {
  id: string;
  value: any;
}

function mapStreamData(dataPoints: StreamDataPoint[], isMetric: boolean, usesPsi: boolean): CapabilityUpdate[] {
  const updates: CapabilityUpdate[] = [];

  for (const point of dataPoints) {
    const val = point.value.stringValue;
    switch (point.key) {
      case 'Soc':
        if (val != null) updates.push({ id: 'measure_battery', value: Number(val) });
        break;
      case 'IdealBatteryRange':
        if (val != null) {
          const rangeMiles = Number(val);
          updates.push({ id: 'measure_range', value: isMetric ? Math.round(rangeMiles * 1.60934) : Math.round(rangeMiles) });
        }
        break;
      case 'InsideTemp':
        if (val != null) updates.push({ id: 'measure_temperature.inside', value: Number(val) });
        break;
      case 'OutsideTemp':
        if (val != null) updates.push({ id: 'measure_temperature.outside', value: Number(val) });
        break;
      case 'Location':
        if (point.value.locationValue) {
          updates.push({ id: 'measure_latitude', value: point.value.locationValue.latitude });
          updates.push({ id: 'measure_longitude', value: point.value.locationValue.longitude });
        }
        break;
      case 'Odometer':
        if (val != null) {
          const miles = Number(val);
          updates.push({ id: 'measure_odometer', value: isMetric ? Math.round(miles * 1.60934) : Math.round(miles) });
        }
        break;
      case 'Locked':
        if (val != null) updates.push({ id: 'locked', value: val === 'true' });
        break;
      case 'SentryMode':
        if (val != null) updates.push({ id: 'sentry_mode', value: val !== 'Off' });
        break;
      case 'ChargeAmps':
      case 'ChargeCurrentRequest':
        if (val != null) updates.push({ id: 'charging_amps', value: Number(val) });
        break;
      case 'ChargeLimitSoc':
        if (val != null) updates.push({ id: 'charge_limit', value: Number(val) / 100 });
        break;
      case 'ChargeState':
        if (val != null) {
          updates.push({ id: 'charging_status', value: val });
          updates.push({ id: 'charging_control', value: val === 'Charging' });
        }
        break;
      case 'HvacPower':
        if (val != null) updates.push({ id: 'climate_onoff', value: val !== 'Off' });
        break;
      // ChargePort, DoorState, etc. - add as fields are confirmed available
    }
  }

  return updates;
}
```

### Pattern 3: Polling Coordination in VehicleDevice
**What:** VehicleDevice checks `streamer.isConnected` during `pollCycle()` to decide between fallback interval (10 min) and normal adaptive interval.
**When to use:** Every poll cycle.
**Example:**
```typescript
// In pollCycle(), after successful poll:
const STREAMING_FALLBACK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

// Determine next interval
if (this.streamer?.isConnected) {
  nextInterval = STREAMING_FALLBACK_INTERVAL_MS;
} else if (isAsleep) {
  nextInterval = ASLEEP_INTERVAL_MS;
} else if (state.charge_state?.charging_state === 'Charging') {
  nextInterval = CHARGING_INTERVAL_MS;
} else {
  nextInterval = AWAKE_INTERVAL_MS;
}
```

### Anti-Patterns to Avoid
- **Reconnecting immediately on close:** WebSocket servers may close connections legitimately (vehicle asleep). Always use backoff to avoid hammering the server.
- **Trusting stream alone for availability:** The stream only sends data when the vehicle's computer is awake. Do not mark a device unavailable just because the stream disconnects -- vehicles sleep normally.
- **Replacing updateCapabilities with stream-only updates:** The REST poll's `updateCapabilities()` covers fields the stream may not provide (software_update, battery_health, trunk state). Fallback polls must remain comprehensive.
- **Using `this.homey.setTimeout` for reconnect timers inside the streamer class:** The streamer class should not depend on Homey SDK. Use plain `setTimeout`/`clearTimeout` inside the library class. Only VehicleDevice uses `this.homey.setTimeout`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebSocket client | Raw HTTP upgrade with `node:https` | Built-in `WebSocket` class | Handles protocol negotiation, framing, ping/pong automatically |
| Exponential backoff | Manual delay doubling | Simple formula with jitter | `delay = min(baseDelay * 2^attempt, maxDelay) + random(0, 0.3 * delay)` prevents thundering herd |
| JSON message parsing | Custom stream parser | `JSON.parse()` on `event.data` | Tessie sends complete JSON objects per message, no fragmentation handling needed |

**Key insight:** The Node.js 22 built-in WebSocket handles all the low-level protocol concerns. The implementation effort is in message mapping and polling coordination, not in WebSocket mechanics.

## Common Pitfalls

### Pitfall 1: Vehicle Sleep Causes Stream Disconnect
**What goes wrong:** Stream disconnects when vehicle goes to sleep, code treats this as an error and marks device offline.
**Why it happens:** Vehicle sleep is normal behavior, not an API failure.
**How to avoid:** Treat stream disconnect as expected. Only mark unavailable after extended consecutive failures from BOTH stream AND REST polling.
**Warning signs:** Device flapping between available/unavailable every time vehicle sleeps.

### Pitfall 2: Browser-Spec WebSocket Cannot Set Authorization Header
**What goes wrong:** Attempting `new WebSocket(url, { headers: { Authorization: ... } })` fails silently or throws.
**Why it happens:** Node.js 22's WebSocket follows the browser spec which only accepts `(url, protocols?)`.
**How to avoid:** Use query parameter: `wss://streaming.tessie.com/{VIN}?access_token={TOKEN}`
**Warning signs:** WebSocket connection fails with auth errors despite correct token.

### Pitfall 3: Stream Field Names Differ from REST API
**What goes wrong:** Trying to reuse `updateCapabilities(state)` directly with stream data fails because field names and structure are completely different.
**Why it happens:** REST returns nested objects (`charge_state.battery_level`), stream returns flat PascalCase keys (`Soc`) with typed value wrappers (`{ stringValue: "85" }`).
**How to avoid:** Build a dedicated stream mapper that translates stream fields to capability updates.
**Warning signs:** Capabilities not updating despite receiving stream messages.

### Pitfall 4: Not Resetting Backoff on Successful Connection
**What goes wrong:** After a period of disconnection, reconnect delay stays at maximum (e.g., 60s) even after a successful reconnection and subsequent disconnect.
**Why it happens:** Forgetting to reset the backoff counter in the `open` handler.
**How to avoid:** Always reset `reconnectDelay` to initial value on successful connection open.
**Warning signs:** Reconnection taking unnecessarily long after brief glitches.

### Pitfall 5: Stream Values Are Strings
**What goes wrong:** Setting capability values with string `"85"` instead of number `85`.
**Why it happens:** Tessie stream sends most values as `stringValue` (e.g., `"171.833"`). Must parse to `Number()`.
**How to avoid:** Always convert `stringValue` to appropriate type before setting capability.
**Warning signs:** Homey type errors or incorrect display values.

## Code Examples

### Connecting to Tessie Streaming API
```typescript
// Source: https://developer.tessie.com/reference/access-tesla-fleet-telemetry
// Auth via query parameter (required for browser-spec WebSocket)
const ws = new WebSocket(`wss://streaming.tessie.com/${vin}?access_token=${token}`);
```

### Incoming Data Message Format
```typescript
// Source: https://developer.tessie.com/reference/access-tesla-fleet-telemetry
// Each message is a complete JSON object:
{
  "data": [
    { "key": "Soc", "value": { "stringValue": "85" } },
    { "key": "IdealBatteryRange", "value": { "stringValue": "171.833" } },
    { "key": "Location", "value": { "locationValue": { "latitude": 37.49, "longitude": -121.94 } } },
    { "key": "InsideTemp", "value": { "stringValue": "22.5" } },
    { "key": "Locked", "value": { "stringValue": "true" } }
  ],
  "createdAt": "2024-08-01T00:44:39.138Z",
  "vin": "LRW3F7FR9NC123456"
}
```

### Connectivity Message Format
```typescript
// Source: https://developer.tessie.com/reference/access-tesla-fleet-telemetry
{
  "vin": "LRW3F7FR9NC123456",
  "connectionId": "913a422e-7169-48fa-a4a4-2eab9f12ab34",
  "status": "DISCONNECTED",
  "createdAt": "2024-10-29T21:56:14.764Z"
}
```

### VehicleDevice Integration Point
```typescript
// In device.ts onInit():
this.streamer = new TessieStreamer(vin, token);

this.streamer.on('data', async (dataPoints: StreamDataPoint[]) => {
  const updates = mapStreamData(dataPoints, this.isMetric, this.usesPsi);
  for (const update of updates) {
    await this.setCapabilityValue(update.id, update.value).catch(() => {});
  }
});

this.streamer.on('connected', () => {
  this.log('Stream connected');
  this.consecutiveFailures = 0;
  this.setAvailable();
});

this.streamer.on('disconnected', () => {
  this.log('Stream disconnected');
  // Don't mark unavailable -- vehicle may just be sleeping
  // Normal polling will resume at adaptive rate
});

this.streamer.connect();
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `ws` npm package for WebSocket | Node.js built-in `WebSocket` | Node.js 22 (v22.4.0 stable) | Zero external dependencies needed for WebSocket client |
| Tesla Streaming API (legacy) | Tesla Fleet Telemetry (via Tessie) | 2024 | Different message format, more fields, protobuf-based under the hood |

**Deprecated/outdated:**
- Legacy Tesla streaming API: Replaced by Fleet Telemetry. Tessie abstracts this, providing JSON over WebSocket.

## Discretion Recommendations

Based on research findings, here are recommendations for areas left to Claude's discretion:

### WebSocket Library Choice
**Recommendation:** Use Node.js 22 built-in `WebSocket`. Confidence: HIGH.
- Stable since v22.4.0, Homey Pro runs Node.js 22 (v12.9.0+)
- Browser-spec API is sufficient; Tessie supports query param auth
- Zero dependencies aligns with project philosophy (`node:https` pattern)

### Connection Lifecycle Strategy
**Recommendation:** Always attempt connection, let server/vehicle manage availability. Confidence: MEDIUM.
- The stream will naturally disconnect when the vehicle sleeps
- Reconnect with backoff -- if vehicle is asleep, reconnections will fail until it wakes
- No need to check vehicle status before connecting -- simpler and the stream endpoint handles it
- On `DISCONNECTED` connectivity message, expect the WebSocket to close shortly after

### Reconnection Backoff Strategy
**Recommendation:** Exponential backoff with jitter. Confidence: HIGH.
- Initial delay: 1 second
- Max delay: 60 seconds
- Multiplier: 2x
- Jitter: 0-30% of current delay (prevents thundering herd)
- Reset to initial on successful `open` event

### Fallback Polling Interval
**Recommendation:** 10 minutes while streaming is active. Confidence: HIGH.
- Meets "5+ minutes" success criteria with comfortable margin
- Still catches fields the stream does not cover (software_update, battery_health, trunk)
- Does not poll status endpoint when streaming (stream provides connectivity status)

### State Sync on Reconnect
**Recommendation:** Trigger a full REST poll immediately on stream reconnection. Confidence: HIGH.
- Stream may have missed state changes while disconnected
- Simple, reliable, consistent with existing `refreshState()` pattern
- Small cost (one extra REST call) for guaranteed state consistency

### Data Format Mapping Approach
**Recommendation:** Separate `stream-mapper.ts` module with a pure function. Confidence: HIGH.
- Stream format (PascalCase keys, typed value wrappers) is fundamentally different from REST format (nested objects)
- Pure function is easily testable without WebSocket or Homey mocks
- Maps stream keys to `{ id, value }` pairs that VehicleDevice applies with `setCapabilityValue()`

### Extended Outage Threshold
**Recommendation:** Use existing `MAX_CONSECUTIVE_FAILURES` (3) counter from polling, unchanged. Confidence: HIGH.
- Stream disconnects do NOT increment the failure counter (sleep is normal)
- Only REST poll failures increment the counter (same as today)
- Device becomes unavailable after 3 consecutive poll failures, regardless of stream state
- This prevents flapping while still detecting genuine API outages

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (node:test) |
| Config file | tsconfig.test.json |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STRM-01a | Stream mapper correctly translates telemetry fields to capability updates | unit | `npm test` | No -- Wave 0 |
| STRM-01b | TessieStreamer connects with correct URL and emits events | unit | `npm test` | No -- Wave 0 |
| STRM-01c | Polling interval extends to fallback when stream is connected | unit | `npm test` | No -- Wave 0 |
| STRM-01d | Polling reverts to adaptive when stream disconnects | unit | `npm test` | No -- Wave 0 |
| STRM-01e | Reconnection uses exponential backoff with jitter | unit | `npm test` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/stream-mapper.test.ts` -- covers STRM-01a (pure function, easy to test)
- [ ] `tests/streamer.test.ts` -- covers STRM-01b, STRM-01e (mock WebSocket, verify events and backoff)
- [ ] `tests/device-streaming.test.ts` -- covers STRM-01c, STRM-01d (mock streamer, verify poll intervals)

## Open Questions

1. **Exact set of streaming fields available per vehicle**
   - What we know: Proto file lists many fields (Soc, Location, InsideTemp, Locked, etc.). Tessie docs show subset.
   - What's unclear: Whether all proto fields are actually sent via Tessie's streaming endpoint, or only a subset. Some vehicles may not report all fields.
   - Recommendation: Map all known relevant fields in the mapper. Use null-safe checks. Fields not received simply won't update (fallback poll fills gaps).

2. **Stream message frequency**
   - What we know: Messages arrive in near-real-time when vehicle is awake.
   - What's unclear: Exact frequency (per-second? per-change? batched?). Whether idle vehicles still stream.
   - Recommendation: Handle any frequency. No throttling needed since we apply updates individually and Homey's `setCapabilityValue` is idempotent for unchanged values.

3. **Connectivity message semantics**
   - What we know: `"status": "DISCONNECTED"` connectivity messages exist.
   - What's unclear: Whether a `"CONNECTED"` message is sent on initial connection, or only the WebSocket `open` event.
   - Recommendation: Use WebSocket `open` event for connected state. Treat `DISCONNECTED` connectivity message as a hint that vehicle-side connection dropped.

## Sources

### Primary (HIGH confidence)
- [Tessie Fleet Telemetry API Reference](https://developer.tessie.com/reference/access-tesla-fleet-telemetry) - Connection URL, auth methods, message format with examples
- [Node.js WebSocket Documentation](https://nodejs.org/en/learn/getting-started/websocket) - Built-in WebSocket API, stable since v22.4.0
- [Tesla Fleet Telemetry Proto](https://github.com/teslamotors/fleet-telemetry/blob/main/protos/vehicle_data.proto) - Complete field list

### Secondary (MEDIUM confidence)
- [Homey Node.js 22 Upgrade Guide](https://apps.developer.homey.app/upgrade-guides/node-22) - Confirms Node.js 22 runtime on Homey Pro v12.9.0+
- [Tessie Streaming Explorer](https://streaming.tessie.com/explorer) - Example WebSocket implementation with query param auth

### Tertiary (LOW confidence)
- Stream message frequency and exact field availability per vehicle -- not documented, needs runtime validation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Node.js 22 built-in WebSocket is well-documented and stable
- Architecture: HIGH - Tessie streaming API format is documented with clear examples
- Pitfalls: HIGH - Browser-spec WebSocket limitations and field mapping differences are well-understood
- Stream field coverage: MEDIUM - Proto file lists all possible fields but actual Tessie availability may vary

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (stable APIs, 30-day validity)
