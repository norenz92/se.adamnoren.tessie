# Technology Stack

**Project:** Tessie for Homey (greenfield rebuild)
**Researched:** 2026-03-03
**Overall Confidence:** HIGH

## Context

This is a Homey Pro app that integrates with the Tessie API to expose Tesla vehicle data and controls as Homey devices. The app already exists in the Homey App Store as `com.adamnoren.tessie` (v1.x), and this research covers the stack for a clean rebuild. Homey Pro runs apps locally on Node.js 22 (since Homey v12.9.0). The Tessie API provides both REST endpoints (drop-in replacement for Tesla Fleet API) and WebSocket streaming telemetry.

---

## Recommended Stack

### Core Platform

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Homey Apps SDK | v3 | App framework, device model, Flow engine | The only option. SDK v3 is current, required for Homey >=5.0.0. Set `"sdk": 3` in manifest. | HIGH |
| Node.js | v22 | Runtime on Homey Pro | Homey v12.9.0+ runs all apps on Node.js v22. Target this directly. | HIGH |
| TypeScript | ^5.9 | Type-safe development | The Homey CLI has first-class TypeScript support. Teslemetry's Homey app (87.7% TypeScript) validates this works well. Catches bugs without running the app. | HIGH |

### Homey CLI & Dev Tooling

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| homey (CLI) | ^3.12 | App creation, running, installing, publishing | Official CLI from Athom. `homey app create`, `homey app run`, `homey app install`, `homey app publish`. Required for development workflow. | HIGH |
| homey-apps-sdk-v3-types | ^0.3.12 | TypeScript type definitions | Installed as `@types/homey`. Provides type safety for all SDK classes (Homey, App, Driver, Device, managers). Install via: `npm i -D @types/homey@npm:homey-apps-sdk-v3-types` | HIGH |
| @tsconfig/node22 | ^22.0 | TypeScript base config | Matches the actual Node.js 22 runtime on Homey Pro. The Teslemetry app uses @tsconfig/node16 which is outdated — use node22 to match reality. | HIGH |
| source-map-support | ^0.5.21 | Runtime source maps | Homey SDK docs strongly recommend enabling source maps for debugging TypeScript apps in production. Required for meaningful stack traces. | HIGH |

### HTTP & API Communication

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Native `fetch()` | Built-in (Node.js 22) | REST API calls to Tessie | Homey's Node.js 22 upgrade guide explicitly recommends native `fetch()` over `node-fetch` for new code. Handles socket management automatically. Zero dependencies. | HIGH |

**Do NOT use:**
- `node-fetch` — causes `ECONNRESET` errors on Node.js 19+ due to keep-alive socket changes. Homey docs explicitly recommend migrating away from it.
- `axios` — unnecessary dependency when native `fetch()` is available and recommended.
- `got` — same reasoning; adds weight for no benefit.

### WebSocket (Tessie Streaming Telemetry)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| ws | ^8.19 | WebSocket client for `wss://streaming.tessie.com/{VIN}` | Battle-tested, zero-dependency WebSocket client. The existing Tesla Homey app (`homey.tesla` by RonnyWinkler) uses `ws@^8.18.3` for WebSocket connections. Node.js 22 has a native WebSocket API, but community reports indicate stack overflow issues with it on Homey. The `ws` library is the safe, proven choice. | HIGH |

**Do NOT use:**
- Node.js native `WebSocket` — Stack overflow errors reported on Homey with Node.js 22's socket behavior. Not worth the risk.
- `socket.io-client` — Tessie uses raw WebSocket, not Socket.IO. Wrong protocol.

### Linting & Code Quality

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| eslint | ^9.x | Code linting | Standard for JavaScript/TypeScript projects. | HIGH |
| eslint-config-athom | ^3.1 | Athom's ESLint rules | Athom's official ESLint config. Includes TypeScript typechecking rules. Used by the Teslemetry Homey app. Ensures code meets Homey ecosystem standards. | HIGH |
| eslint-plugin-homey-app | latest | Homey-specific lint rules | Enforces best practices for Homey Apps specifically. Catches Homey-specific anti-patterns. | MEDIUM |

---

## Architecture-Critical Stack Decisions

### Tessie REST API Integration

**Base URL:** `https://api.tessie.com`
**Authentication:** Bearer token in `Authorization` header
**Format:** JSON request/response, mirrors Tesla Fleet API endpoints
**Key characteristic:** Drop-in replacement for Tesla Fleet API — point any Fleet API request at `api.tessie.com` instead of Tesla's regional servers.

Token is entered by the user during device pairing and stored in the device's `store` object (not app-level settings). This is the pattern for per-vehicle auth since each user has their own Tessie token.

```typescript
// Example: GET vehicle state
const response = await fetch(`https://api.tessie.com/api/1/vehicles/${vin}/vehicle_data`, {
  headers: { Authorization: `Bearer ${token}` }
});
```

### Tessie WebSocket Streaming

**URL:** `wss://streaming.tessie.com/{VIN}`
**Authentication:** Bearer token in `Authorization` header OR `access_token` query param
**Message format:** JSON with typed values (stringValue, locationValue, etc.)
**Message types:** Data, Alerts, Connectivity, Errors
**Telemetry fields:** Battery range, temperature, location, odometer, charge levels, energy metrics, heading, speed — full list at Tesla's `vehicle_data.proto`

Critical Homey-specific consideration: "Homey doesn't have a great track record when it comes to long-living network connections." The app MUST implement resilient reconnection logic with exponential backoff.

```typescript
// Example: Connect to streaming
const ws = new WebSocket(`wss://streaming.tessie.com/${vin}`, {
  headers: { Authorization: `Bearer ${token}` }
});
```

### Homey Device Model

**Driver pattern:** One driver (`tesla_vehicle`) with multiple device instances (one per vehicle).

Each device uses:
- **Capabilities** — Built-in system capabilities (e.g., `measure_battery`, `measure_temperature`, `locked`) plus custom capabilities for Tesla-specific data
- **Flow cards** — Triggers (battery changed, arrived home), Conditions (is charging, is locked), Actions (lock, unlock, start climate)
- **Pairing** — `credentials-login` view (repurposed for API token entry) then `list_devices` to discover vehicles via Tessie API

### Homey Compose Structure

Use the `.homeycompose/` directory pattern — never edit `app.json` directly. The CLI merges compose files into `app.json` at build time.

```
.homeycompose/
  app.json                              # App metadata (id, sdk, compatibility, etc.)
  capabilities/                         # Custom capability definitions
    measure_range.json
    charge_limit.json
    ...
  flow/
    triggers/                           # App-level Flow triggers
    conditions/                         # App-level Flow conditions
    actions/                            # App-level Flow actions
drivers/
  tesla_vehicle/
    driver.compose.json                 # Driver definition (class, capabilities, pair steps)
    driver.flow.compose.json            # Device-specific Flow cards
    driver.ts                           # Driver class (pairing logic)
    device.ts                           # Device class (capability management, polling, WebSocket)
    assets/
      icon.svg                          # Device icon (960x960 SVG)
      images/
        small.png                       # 75x75
        large.png                       # 500x500
        xlarge.png                      # 1000x1000
```

---

## Full Dependency List

### Production Dependencies

```json
{
  "dependencies": {
    "source-map-support": "^0.5.21",
    "ws": "^8.19.0"
  }
}
```

That is the entire production dependency list. Native `fetch()` handles REST. The `ws` library handles WebSocket. `source-map-support` enables TypeScript debugging. Minimal footprint is intentional — Homey apps run on constrained hardware and fewer dependencies means fewer attack vectors and maintenance burden.

### Development Dependencies

```json
{
  "devDependencies": {
    "@tsconfig/node22": "^22.0.5",
    "@types/homey": "npm:homey-apps-sdk-v3-types@^0.3.12",
    "@types/node": "^22.0.0",
    "@types/source-map-support": "^0.5.10",
    "@types/ws": "^8.18.0",
    "eslint": "^9.0.0",
    "eslint-config-athom": "^3.1.5",
    "homey": "^3.12.0",
    "typescript": "^5.9.0"
  }
}
```

### Installation

```bash
# Create app scaffold
homey app create

# Production deps
npm install source-map-support ws

# Dev deps (TypeScript + types)
npm install -D typescript @tsconfig/node22 @types/homey@npm:homey-apps-sdk-v3-types @types/node @types/source-map-support @types/ws

# Dev deps (Tooling)
npm install -D homey eslint eslint-config-athom
```

---

## Configuration Files

### tsconfig.json

```json
{
  "extends": "@tsconfig/node22/tsconfig.json",
  "compilerOptions": {
    "outDir": ".homeybuild/",
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["app.ts", "api.ts", "drivers/**/*.ts", "lib/**/*.ts"],
  "exclude": ["node_modules", ".homeybuild"]
}
```

**Note:** `outDir` MUST be `.homeybuild/` — the Homey CLI expects compiled output there. The CLI runs TypeScript compilation automatically when `tsconfig.json` exists.

### Key app.json / .homeycompose/app.json Fields

```json
{
  "id": "com.adamnoren.tessie",
  "version": "2.0.0",
  "compatibility": ">=12.9.0",
  "sdk": 3,
  "platforms": ["local"],
  "brandColor": "#FFFFFF",
  "name": { "en": "Tessie" },
  "description": { "en": "Monitor and control your Tesla via Tessie" },
  "category": "cars",
  "permissions": [],
  "images": {
    "small": "/assets/images/small.png",
    "large": "/assets/images/large.png",
    "xlarge": "/assets/images/xlarge.png"
  }
}
```

**Notes:**
- `"platforms": ["local"]` — Homey Pro only, no Cloud support needed
- `"compatibility": ">=12.9.0"` — Targets Node.js 22 runtime
- `"sdk": 3` — Current and only supported SDK version
- `"category": "cars"` — Homey doesn't have a dedicated "cars" category, but check the allowed list: lights, video, music, appliances, security, climate, tools, internet, localization, energy. Most likely fits under `"tools"` or `"internet"`.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| HTTP client | Native `fetch()` | `node-fetch` | Causes ECONNRESET on Node.js 19+. Homey docs say migrate away. |
| HTTP client | Native `fetch()` | `axios` | Unnecessary dependency. Native fetch is recommended and sufficient. |
| WebSocket | `ws` | Native WebSocket (Node.js 22) | Stack overflow bugs reported on Homey. Not worth the risk. |
| WebSocket | `ws` | `socket.io-client` | Tessie uses raw WebSocket protocol, not Socket.IO. Wrong tool. |
| Language | TypeScript | JavaScript | TypeScript provides type safety, better IDE support, catches bugs at compile time. Homey CLI has first-class TS support. |
| Types base | `@tsconfig/node22` | `@tsconfig/node16` | Homey now runs Node.js 22. Target the actual runtime for accurate type checking. |
| Auth library | None (manual Bearer token) | `homey-oauth2app` | Tessie uses simple API tokens, not OAuth2. OAuth2 would add unnecessary complexity. |

---

## Version Verification

| Package | Verified Version | Source | Date Checked |
|---------|-----------------|--------|--------------|
| Homey Apps SDK | v3 | [Homey SDK Docs](https://apps.developer.homey.app) | 2026-03-03 |
| Node.js on Homey | v22 (Homey v12.9.0+) | [Homey Node 22 Guide](https://apps.developer.homey.app/upgrade-guides/node-22) | 2026-03-03 |
| homey CLI | ^3.12 | [Teslemetry app package.json](https://github.com/Teslemetry/homey) | 2026-03-03 |
| homey-apps-sdk-v3-types | 0.3.12 | [npm](https://www.npmjs.com/package/homey-apps-sdk-v3-types) | 2026-03-03 |
| ws | 8.19.0 | [npm](https://www.npmjs.com/package/ws) | 2026-03-03 |
| TypeScript | ^5.9 | [Teslemetry app package.json](https://github.com/Teslemetry/homey) | 2026-03-03 |
| @tsconfig/node22 | 22.0.5 | [npm](https://www.npmjs.com/package/@tsconfig/node22) | 2026-03-03 |
| eslint-config-athom | ^3.1.5 | [GitHub](https://github.com/athombv/eslint-config-athom) | 2026-03-03 |

---

## Tessie API Reference

### REST API

- **Base URL:** `https://api.tessie.com`
- **Auth:** `Authorization: Bearer {token}`
- **Mirrors:** Tesla Fleet API endpoints — same paths, same responses
- **Key endpoints used:**
  - `GET /api/1/vehicles` — List vehicles (for pairing/discovery)
  - `GET /api/1/vehicles/{vin}/vehicle_data` — Full vehicle state
  - `POST /api/1/vehicles/{vin}/command/{command}` — Vehicle commands
- **Pricing:** $6.99/vehicle/month for unlimited polling (paid by the end user, not the app)
- **Features:** Automatic regional routing, automatic command signing (Vehicle Command Protocol), retry logic for failed commands

### WebSocket Streaming API

- **URL:** `wss://streaming.tessie.com/{VIN}`
- **Auth:** `Authorization: Bearer {token}` header or `?access_token={token}` query param
- **Message types:** Data (telemetry), Alerts, Connectivity status, Errors
- **Data format:** JSON with typed values (`stringValue`, `locationValue`, etc.) plus timestamps and VIN
- **Explorer/example:** `https://streaming.tessie.com/explorer` (view source for implementation reference)
- **Field reference:** [Tesla vehicle_data.proto](https://github.com/teslamotors/fleet-telemetry/blob/main/protos/vehicle_data.proto)
- **Rate limit:** Custom telemetry configs limited to max 1 signal/second

---

## Homey App Store Compliance Notes

Key requirements that affect stack/build decisions:

1. **App name:** "Tessie" (brand name, max 4 words, no "Homey" in name)
2. **Description:** Cannot start with "Adds support for" — use something like "Monitor and control your Tesla via Tessie"
3. **Icons:** App icon (SVG, transparent background, no text), Driver icons (SVG, 960x960, device-resembling)
4. **Images:** Required in 3 resolutions per asset type
5. **Flow cards:** Short titles, no parentheses, use `titleFormatted` for arguments, include `hint`
6. **English required;** additional languages encouraged but must be complete
7. **No `node-fetch`** or similar — keep dependencies minimal for review
8. **Testing:** Pair flow must work, error messages must be clear, device state must sync bidirectionally

---

## Sources

- [Homey Apps SDK Documentation](https://apps.developer.homey.app) — Official SDK docs
- [Homey Apps SDK v3 Reference](https://apps-sdk-v3.developer.homey.app/Homey.html) — API reference
- [Homey Node.js 22 Upgrade Guide](https://apps.developer.homey.app/upgrade-guides/node-22) — Migration guide
- [Homey App Store Guidelines](https://apps.developer.homey.app/app-store/guidelines) — Publishing requirements
- [Homey TypeScript Guide](https://apps.developer.homey.app/guides/tools/typescript) — TypeScript setup
- [Homey Compose Guide](https://apps.developer.homey.app/advanced/homey-compose) — Compose file structure
- [Tessie Developer Portal](https://developer.tessie.com) — API documentation
- [Tessie Fleet API Access](https://developer.tessie.com/reference/access-tesla-fleet-api) — REST API details
- [Tessie Fleet Telemetry](https://developer.tessie.com/reference/access-tesla-fleet-telemetry) — WebSocket streaming
- [Tessie Developers Page](https://www.tessie.com/developers) — Pricing and overview
- [Teslemetry Homey App (GitHub)](https://github.com/Teslemetry/homey) — Reference implementation (TypeScript Homey + Tesla)
- [RonnyWinkler Tesla Homey App (GitHub)](https://github.com/RonnyWinkler/homey.tesla) — Reference implementation (WebSocket + Tesla)
- [Homey Community: WebSocket Persistence](https://community.homey.app/t/building-own-app-that-can-sustain-a-websocket-connection-to-a-3rd-party-platform/103492) — WebSocket reliability guidance
- [ws npm package](https://www.npmjs.com/package/ws) — WebSocket library
- [homey-apps-sdk-v3-types npm](https://www.npmjs.com/package/homey-apps-sdk-v3-types) — TypeScript types
