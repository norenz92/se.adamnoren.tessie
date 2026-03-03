# Phase 1: Foundation & Pairing - Research

**Researched:** 2026-03-03
**Domain:** Homey SDK v3 app development, Tessie REST API integration, device pairing flows
**Confidence:** HIGH

## Summary

This phase creates a greenfield Homey Pro app from scratch using the Homey SDK v3 and the Tessie REST API. The core deliverables are an app scaffold, a Tessie API client for token validation and vehicle discovery, a multi-step pairing flow (token input then vehicle selection), and a repair flow for token rotation. Each paired vehicle becomes a separate Homey device with battery level and lock state as early capabilities.

The Homey SDK v3 provides well-documented patterns for custom pairing views, device lifecycle management, and the compose-based project structure. The Tessie API is straightforward: a single bearer token authenticates against `https://api.tessie.com/vehicles` to return all vehicles with full state data, including VIN, display name, and `vehicle_config.car_type` (model identifier). The existing Tesla Homey app (`com.tesla.car` by RonnyWinkler) confirms that `car` is a valid Homey device class, providing a proven reference for driver structure.

**Primary recommendation:** Use a custom pairing view for token input (not `login_credentials` template, which forces username/password semantics), followed by the `list_devices` system template for vehicle selection, and the `add_devices` template for completion. Store the API token per-device in the Homey store (not settings, not data) to support multiple Tessie accounts and independent token rotation via repair flow.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Token input screen with a help link showing where to find the API token in Tessie's dashboard
- After valid token, show vehicle list with checkboxes -- user selects which vehicles to pair in a single session
- Each vehicle in the list shows: display name, model (e.g. Model 3), and last 4 of VIN
- Invalid token or API errors show inline on the token input screen -- user stays on screen to correct and retry
- Default device name uses the Tessie display name (user can rename in Homey later)
- Model-specific device icons -- different icons for Model 3, Model Y, Model S, Model X, Cybertruck
- Phase 1 card includes battery level and lock state as early capabilities so the card isn't empty before Phase 2
- Multiple Tessie accounts supported -- each pairing session asks for a token, users can mix vehicles from different accounts
- Re-authentication uses Homey's standard repair flow (user triggers repair, re-enters token)
- Duplicate VIN detection -- block pairing with a message if the vehicle is already paired

### Claude's Discretion
- Device class selection (research Homey's available classes, pick best fit for vehicles)
- Token storage approach (per-device vs shared -- follow Homey SDK conventions for multi-device apps)
- App scaffold structure and file organization
- Error handling internals beyond user-facing inline errors
- Exact help link text and instructions for finding Tessie API token

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTH-01 | User can enter Tessie API token during vehicle pairing flow | Custom pairing view with HTML form, `Homey.emit()` to backend, `session.setHandler()` validation pattern |
| AUTH-02 | App discovers all vehicles from the user's Tessie account after token entry | `GET https://api.tessie.com/vehicles` with bearer token returns `results[]` array with VIN, display_name, vehicle_config.car_type |
| AUTH-03 | User can pair multiple vehicles, each appearing as a separate Homey device | `list_devices` template with multi-select (default), each device gets unique `data.id` = VIN |
| AUTH-04 | User can repair/re-authenticate a device without deleting it | `repair` array in driver.compose.json, `onRepair(session, device)` handler, custom view for token re-entry |
| STOR-02 | App targets Homey Pro with compatibility >= 12.9.0 | `"platforms": ["local"]`, `"compatibility": ">=12.9.0"` in .homeycompose/app.json, SDK v3 |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| homey | 3.12.x | Homey CLI tool + SDK types | Official Athom CLI, required for app development and deployment |
| homey-apps-sdk-v3-types | 0.3.x | TypeScript type definitions | Official type definitions for SDK v3 (optional but recommended for IDE support) |
| Node.js | 22 | Runtime on Homey Pro >= 12.9.0 | Homey Pro runs Node.js 22 as of v12.9.0 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node:https (built-in) | N/A | HTTP requests to Tessie API | All API calls -- no external HTTP library needed for simple REST calls |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Built-in node:https | axios/node-fetch | Adds dependency for minimal benefit; Tessie API is simple REST with JSON. Keep dependencies minimal for Homey apps. |
| Custom pairing view | login_credentials template | Template forces username+password fields; we need a single token field with custom help text and inline error display |

**Installation:**
```bash
npm install --global --no-optional homey
# In project directory:
npm install homey-apps-sdk-v3-types --save-dev
```

## Architecture Patterns

### Recommended Project Structure
```
se.adamnoren.tessie/
├── .homeycompose/
│   ├── app.json                    # App manifest (id, version, compatibility, etc.)
│   └── capabilities/               # Custom capability definitions (if any)
├── assets/
│   ├── icon.svg                    # App icon (SVG, transparent bg, full canvas)
│   └── images/
│       ├── small.png               # 250x175 store image
│       ├── large.png               # 500x350 store image
│       └── xlarge.png              # 1000x700 store image
├── drivers/
│   └── vehicle/
│       ├── assets/
│       │   ├── icon.svg            # Default driver icon (960x960 canvas)
│       │   └── images/
│       │       ├── small.png       # 75x75
│       │       ├── large.png       # 500x500
│       │       └── xlarge.png      # 1000x1000
│       ├── pair/
│       │   └── token_input.html    # Custom pairing view for API token entry
│       ├── device.js               # Device class (capabilities, polling, lifecycle)
│       ├── driver.js               # Driver class (pairing, repair, flow cards)
│       └── driver.compose.json     # Driver manifest (class, capabilities, pair, repair)
├── lib/
│   └── tessie-client.js            # Tessie API client (auth, vehicles, commands)
├── locales/
│   └── en.json                     # English translations
├── app.js                          # App class (shared state, initialization)
├── app.json                        # Generated -- never edit manually
├── package.json
├── .homeyignore
└── .gitignore
```

### Pattern 1: Custom Pairing View with Token Input
**What:** HTML view for API token entry with inline validation
**When to use:** When the pairing flow needs a custom form (not username/password)
**Example:**

Frontend (`drivers/vehicle/pair/token_input.html`):
```html
<script>
  function submitToken() {
    const token = document.getElementById('token').value.trim();
    if (!token) return;

    Homey.showLoadingOverlay();
    Homey.emit('validate_token', token)
      .then(function() {
        Homey.hideLoadingOverlay();
        Homey.nextView();
      })
      .catch(function(err) {
        Homey.hideLoadingOverlay();
        document.getElementById('error').textContent = err.message || 'Invalid token';
        document.getElementById('error').style.display = 'block';
      });
  }
</script>
```

Backend (`drivers/vehicle/driver.js`):
```javascript
// Source: https://apps.developer.homey.app/advanced/custom-views/custom-pairing-views
async onPair(session) {
  let token = null;

  session.setHandler('validate_token', async (inputToken) => {
    const client = new TessieClient(inputToken);
    const vehicles = await client.getVehicles(); // throws on invalid token
    token = inputToken;
    return true;
  });

  session.setHandler('list_devices', async () => {
    const client = new TessieClient(token);
    const vehicles = await client.getVehicles();
    return vehicles.map(v => ({
      name: v.last_state.display_name || `Tesla ${v.vin.slice(-4)}`,
      data: { id: v.vin },
      store: { token },
      icon: getIconForModel(v.last_state.vehicle_config.car_type),
    }));
  });
}
```

### Pattern 2: Repair Flow for Token Rotation
**What:** Re-use token input view during repair, update store without losing device
**When to use:** AUTH-04 -- user needs to update API token

```javascript
// Source: https://apps.developer.homey.app/the-basics/devices/pairing
async onRepair(session, device) {
  session.setHandler('validate_token', async (inputToken) => {
    const client = new TessieClient(inputToken);
    const vehicles = await client.getVehicles();
    // Verify the device's VIN is still accessible with new token
    const found = vehicles.find(v => v.vin === device.getData().id);
    if (!found) throw new Error('Vehicle not found with this token');
    await device.setStoreValue('token', inputToken);
    return true;
  });
}
```

### Pattern 3: Tessie API Client
**What:** Thin wrapper around Tessie REST API using Node.js built-in https
**When to use:** All Tessie API interactions

```javascript
// lib/tessie-client.js
const https = require('https');

class TessieClient {
  constructor(token) {
    this.token = token;
    this.baseUrl = 'api.tessie.com';
  }

  async request(path) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.baseUrl,
        path,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Accept': 'application/json',
        },
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`Tessie API error: ${res.statusCode}`));
            return;
          }
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error('Invalid response from Tessie API')); }
        });
      });
      req.on('error', reject);
      req.end();
    });
  }

  async getVehicles() {
    const response = await this.request('/vehicles?only_active=true');
    return response.results;
  }

  async getVehicle(vin) {
    return this.request(`/${vin}/state`);
  }

  async getStatus(vin) {
    return this.request(`/${vin}/status`);
  }
}
```

### Pattern 4: Device Data/Store/Settings Usage
**What:** Proper separation of immutable identity, persistent runtime state, and user-configurable values
**When to use:** Every device

```javascript
// During pairing - returned from list_devices handler:
{
  name: 'Seneca',           // Tessie display_name
  data: { id: 'VIN123...' }, // Immutable after pairing. VIN is the unique identifier.
  store: { token: '...' },   // Mutable, persisted across reboots. Token stored here.
}

// In device.js:
async onInit() {
  const vin = this.getData().id;
  const token = this.getStoreValue('token');
  this.client = new TessieClient(token);
}
```

### Anti-Patterns to Avoid
- **Storing token in `data`:** Data is immutable after pairing. Token must be updatable for repair flow.
- **Storing token in `settings`:** Settings are user-visible in device advanced settings. API tokens should not be exposed in the UI.
- **Global token in app settings:** Breaks multi-account support. Each device needs its own token since vehicles can come from different Tessie accounts.
- **Using `fetch()` or importing `node-fetch`:** Homey runs Node.js 22 which has global `fetch()`, but using built-in `https` module is more explicit and avoids potential compatibility issues. Either approach works, but be consistent.
- **Editing `app.json` directly:** Always edit `.homeycompose/app.json` and `driver.compose.json`. The root `app.json` is generated.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pairing UI styling | Custom CSS framework | Homey Style Library (auto-included in pair views) | Homey pair views automatically include the Homey style library for consistent look |
| Device list selection | Custom checkbox UI | `list_devices` system template | Built-in multi-select with proper Homey UX, handles add_devices flow |
| App manifest generation | Manual app.json editing | Homey Compose (.homeycompose/ directory) | `homey app build` merges compose files into app.json; manual edits get overwritten |
| OAuth/complex auth | Custom OAuth2 flow | Tessie API tokens (simple bearer auth) | Tessie already wraps Tesla OAuth; we just need a token string |

**Key insight:** The Homey SDK provides system templates and compose tooling that handle the heavy lifting. Custom code should only be written where the SDK templates don't fit (like the token input view).

## Common Pitfalls

### Pitfall 1: Editing app.json Directly
**What goes wrong:** Changes get overwritten when `homey app build` or `homey app run` is executed
**Why it happens:** app.json is a generated file, composed from .homeycompose/app.json + driver.compose.json files
**How to avoid:** Always edit `.homeycompose/app.json` for app-level config, `driver.compose.json` for driver config
**Warning signs:** app.json contains changes not in compose files

### Pitfall 2: Using Immutable data Object for Changeable Values
**What goes wrong:** Cannot update API token after pairing, breaking repair flow
**Why it happens:** `data` is immutable after device creation -- set once during pairing and never changed
**How to avoid:** Put VIN in `data.id` (permanent identifier), put token in `store` (mutable, persistent)
**Warning signs:** Repair flow cannot save new token

### Pitfall 3: Tessie API Returning Inactive Vehicles
**What goes wrong:** User sees vehicles they no longer own or have access to
**Why it happens:** `GET /vehicles` returns all vehicles by default, including inactive ones
**How to avoid:** Pass `?only_active=true` query parameter
**Warning signs:** Vehicle list includes unexpected entries

### Pitfall 4: Missing Error Handling on Pairing View
**What goes wrong:** Token validation fails silently or shows cryptic error
**Why it happens:** `Homey.emit()` promise rejection not caught, or error thrown without user-friendly message
**How to avoid:** Always wrap emit in try/catch, display error text inline on the token input screen, use `Homey.hideLoadingOverlay()` before showing error
**Warning signs:** Loading spinner never disappears on error

### Pitfall 5: Not Verifying VIN During Repair
**What goes wrong:** User enters a token from a different account that doesn't have access to the device's vehicle
**Why it happens:** Only validated that token is valid, not that it grants access to the specific VIN
**How to avoid:** After token validation, check that the device's VIN appears in the new token's vehicle list
**Warning signs:** Device becomes unavailable after repair with wrong account

### Pitfall 6: Homey Store Images and Icon Requirements
**What goes wrong:** App rejected from Homey App Store
**Why it happens:** Missing required image sizes, wrong format, or clipart/logo-only images
**How to avoid:** App icon: SVG with transparent background, full canvas. Store images: 250x175, 500x350, 1000x700 (jpg/png). Driver images: 75x75, 500x500, 1000x1000 with white background.
**Warning signs:** `homey app validate` reports missing assets

### Pitfall 7: Rate Limits on Tessie API
**What goes wrong:** API requests get throttled or blocked
**Why it happens:** Tessie API rate limits are undocumented (noted in project STATE.md as a concern)
**How to avoid:** Implement defensive rate limiting in TessieClient from the start -- add simple request throttling/queuing. For Phase 1, only pairing calls are made, so risk is low, but the pattern should be established.
**Warning signs:** Intermittent 429 or connection errors from Tessie API

## Code Examples

### driver.compose.json for Vehicle Driver
```json
{
  "name": { "en": "Vehicle" },
  "class": "car",
  "platforms": ["local"],
  "connectivity": ["cloud"],
  "capabilities": [
    "measure_battery",
    "locked"
  ],
  "capabilitiesOptions": {
    "measure_battery": {
      "title": { "en": "Battery" }
    }
  },
  "pair": [
    {
      "id": "token_input",
      "navigation": { "next": "list_devices" }
    },
    {
      "id": "list_devices",
      "template": "list_devices",
      "navigation": { "next": "add_devices" }
    },
    {
      "id": "add_devices",
      "template": "add_devices"
    }
  ],
  "repair": [
    {
      "id": "token_input"
    }
  ],
  "images": {
    "small": "/drivers/vehicle/assets/images/small.png",
    "large": "/drivers/vehicle/assets/images/large.png",
    "xlarge": "/drivers/vehicle/assets/images/xlarge.png"
  }
}
```

### .homeycompose/app.json
```json
{
  "id": "se.adamnoren.tessie",
  "version": "0.1.0",
  "compatibility": ">=12.9.0",
  "sdk": 3,
  "platforms": ["local"],
  "brandColor": "#4A90D9",
  "name": { "en": "Tessie" },
  "description": { "en": "Monitor and control your Tesla vehicles via Tessie" },
  "category": ["cars"],
  "permissions": [],
  "images": {
    "small": "/assets/images/small.png",
    "large": "/assets/images/large.png",
    "xlarge": "/assets/images/xlarge.png"
  }
}
```

### Tessie API Vehicle Response (Key Fields for Pairing)
```json
{
  "results": [
    {
      "vin": "5YJXCAE43LF123456",
      "is_active": true,
      "last_state": {
        "display_name": "Seneca",
        "state": "online",
        "charge_state": {
          "battery_level": 89
        },
        "vehicle_state": {
          "locked": true
        },
        "vehicle_config": {
          "car_type": "modelx"
        }
      }
    }
  ]
}
```

### Model-to-Icon Mapping
```javascript
// Known car_type values from Tessie API / Tesla Fleet API:
// "models", "modelx", "model3", "modely", "cybertruck"
function getIconForModel(carType) {
  const iconMap = {
    'models': '/drivers/vehicle/assets/icons/model_s.svg',
    'modelx': '/drivers/vehicle/assets/icons/model_x.svg',
    'model3': '/drivers/vehicle/assets/icons/model_3.svg',
    'modely': '/drivers/vehicle/assets/icons/model_y.svg',
    'cybertruck': '/drivers/vehicle/assets/icons/cybertruck.svg',
  };
  return iconMap[carType] || '/drivers/vehicle/assets/icon.svg';
}
```

Note: Per Homey SDK, the `icon` property in the device object returned from `list_devices` can override the default driver icon. Icons can reference paths relative to the app root. Each icon must be an SVG at 960x960 canvas.

### Device Class with Early Capabilities (Battery + Lock)
```javascript
// Source: https://apps.developer.homey.app/the-basics/devices/capabilities
const Homey = require('homey');
const TessieClient = require('../../lib/tessie-client');

class VehicleDevice extends Homey.Device {
  async onInit() {
    const vin = this.getData().id;
    const token = this.getStoreValue('token');
    this.client = new TessieClient(token);

    // Register capability listener for lock toggle
    this.registerCapabilityListener('locked', async (value) => {
      // Phase 1: lock/unlock not implemented yet, just display state
      // Will be implemented in Phase 3 (Access & Security)
      throw new Error('Control not yet available');
    });

    // Initial data fetch
    await this.refreshState();

    // Periodic polling (every 5 minutes for Phase 1)
    this.pollInterval = this.homey.setInterval(
      () => this.refreshState(),
      5 * 60 * 1000
    );
  }

  async refreshState() {
    try {
      const state = await this.client.getVehicle(this.getData().id);
      if (state.charge_state?.battery_level != null) {
        await this.setCapabilityValue('measure_battery', state.charge_state.battery_level);
      }
      if (state.vehicle_state?.locked != null) {
        await this.setCapabilityValue('locked', state.vehicle_state.locked);
      }
      await this.setAvailable();
    } catch (err) {
      this.error('Failed to refresh vehicle state:', err);
      await this.setUnavailable('Unable to reach Tessie API');
    }
  }

  async onDeleted() {
    if (this.pollInterval) {
      this.homey.clearInterval(this.pollInterval);
    }
  }
}

module.exports = VehicleDevice;
```

### Duplicate VIN Detection
```javascript
// In driver.js onPair handler, before returning device list:
session.setHandler('list_devices', async () => {
  const client = new TessieClient(token);
  const vehicles = await client.getVehicles();

  // Get all currently paired device VINs
  const pairedVins = new Set(this.getDevices().map(d => d.getData().id));

  return vehicles.map(v => {
    const isPaired = pairedVins.has(v.vin);
    return {
      name: v.last_state.display_name || `Tesla ${v.vin.slice(-4)}`,
      data: { id: v.vin },
      store: { token },
      icon: getIconForModel(v.last_state.vehicle_config?.car_type),
      // Note: Homey SDK does not natively support disabling items in list_devices.
      // Duplicate detection must happen in the device.js onInit or via a custom view.
    };
  }).filter(v => !pairedVins.has(v.data.id));
  // Filter out already-paired vehicles from the list entirely
});
```

## Discretion Recommendations

### Device Class: Use `car`
**Confidence:** HIGH
**Rationale:** The existing Tesla Homey app (`com.tesla.car` by RonnyWinkler, v4.0.6) uses `"class": "car"` in its driver.compose.json and is published in the Homey App Store. This confirms `car` is a valid Homey device class. It is the most semantically correct choice for vehicles.

### Token Storage: Per-Device in Store
**Confidence:** HIGH
**Rationale:** The Homey SDK provides three storage mechanisms: `data` (immutable), `settings` (user-visible), and `store` (mutable, persistent, programmatic-only). Since:
1. Tokens must be updatable (repair flow -- AUTH-04)
2. Tokens should not be user-visible (security)
3. Different devices may have different tokens (multi-account)

The `store` is the correct choice. Store the token per-device via `device.setStoreValue('token', token)`. This is set during pairing (via the `store` property in the device object) and updated during repair (via `device.setStoreValue()`).

### App Scaffold: Standard Homey Compose Structure
**Confidence:** HIGH
**Rationale:** Use `.homeycompose/` directory with `app.json`, per-driver `driver.compose.json`, and `homey app build` to generate the root `app.json`. This is the standard Homey SDK v3 pattern. Single driver named `vehicle` (not `car` to avoid confusion with the device class name).

### Error Handling: Wrap All API Calls, Surface User-Friendly Messages
**Confidence:** HIGH
**Rationale:** Tessie API errors should be caught at the TessieClient level and translated to user-friendly messages. During pairing, errors display inline on the token input screen. During device operation, errors set the device to unavailable state with a message.

### Help Link Text: Direct to Tessie Dashboard
**Confidence:** MEDIUM
**Rationale:** Token generation happens at `https://dash.tessie.com/settings/api`. The help link in the pairing view should say something like "Find your API token in Tessie Settings > API" and link to `https://dash.tessie.com/settings/api` (or `https://my.tessie.com/settings/api` -- verify current URL).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SDK v2 with callback-based APIs | SDK v3 with async/await everywhere | Homey 5.0.0 | Use async/await in all lifecycle methods |
| Node.js 18 runtime | Node.js 22 runtime | Homey v12.9.0 | Can use modern JS features (top-level await not applicable in Homey modules, but all ES2023 features available) |
| Manual app.json editing | Homey Compose (.homeycompose/) | Current SDK v3 standard | Never edit app.json directly |
| Tesla direct API (OAuth2) | Tessie API (bearer token) | Project decision | Vastly simpler auth -- single token, no OAuth dance |

**Deprecated/outdated:**
- SDK v2 patterns: Do not use `callback` style APIs or the v2 documentation site
- `apps-sdk-v2.developer.athom.com`: Outdated reference, use `apps.developer.homey.app` instead

## Open Questions

1. **Exact `car_type` values for all Tesla models**
   - What we know: `"modelx"`, `"models"`, `"model3"`, `"modely"` confirmed from API examples. `"cybertruck"` likely but not confirmed in Tessie docs.
   - What's unclear: Are there variants (e.g., `"model3_performance"`)? What does Tesla Semi return?
   - Recommendation: Map known values, use a default fallback icon for unknown types. Validate during implementation with real API data.

2. **Tessie API error response format for invalid tokens**
   - What we know: API uses bearer auth, returns JSON. HTTP 4xx expected for invalid tokens.
   - What's unclear: Exact status code (401? 403?) and error body format not documented.
   - Recommendation: Handle any 4xx as "invalid token" during pairing. Test with an invalid token during implementation.

3. **Tessie API rate limits**
   - What we know: Undocumented. Tessie claims "unlimited, free vehicle data polling."
   - What's unclear: Whether there are per-token or per-IP rate limits in practice.
   - Recommendation: Implement basic request throttling in TessieClient from day one. For Phase 1, pairing-only calls are low volume so risk is minimal.

4. **Dynamic icon assignment during pairing**
   - What we know: The `icon` property in the device object returned from `list_devices` can override the default driver icon. Path must be relative to the app.
   - What's unclear: Whether icon paths work with `/drivers/vehicle/assets/icons/model_3.svg` or need to be in a specific location. Also whether icons must be pre-declared.
   - Recommendation: Test icon assignment with a simple prototype. Fallback plan: use a single generic vehicle icon and differentiate by device name.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (node:test) + assert |
| Config file | none -- see Wave 0 |
| Quick run command | `node --test tests/` |
| Full suite command | `node --test tests/` |

Note: Homey apps run on the Homey device and do not have a standard test infrastructure. Unit tests can cover the TessieClient and utility functions. Integration testing requires `homey app run` on a real Homey Pro device. The test framework choice is pragmatic -- Node.js 22 includes a capable built-in test runner, avoiding additional dependencies.

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | Token input form emits token, backend validates against Tessie API | unit (TessieClient) + manual (pairing UI) | `node --test tests/tessie-client.test.js` | No -- Wave 0 |
| AUTH-02 | getVehicles returns vehicle array with expected fields | unit (TessieClient mock) | `node --test tests/tessie-client.test.js` | No -- Wave 0 |
| AUTH-03 | Multiple devices can be created with different VINs | manual (pairing flow on Homey) | manual-only: `homey app run` | N/A |
| AUTH-04 | Repair flow updates token in store | unit (device store mock) + manual | `node --test tests/device.test.js` | No -- Wave 0 |
| STOR-02 | App manifest has correct compatibility and platform | unit (JSON validation) | `node --test tests/manifest.test.js` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `node --test tests/`
- **Per wave merge:** `node --test tests/` + `homey app validate`
- **Phase gate:** Full suite green + successful `homey app run` on Homey Pro

### Wave 0 Gaps
- [ ] `tests/tessie-client.test.js` -- covers AUTH-01, AUTH-02 (mock HTTP responses)
- [ ] `tests/device.test.js` -- covers AUTH-04 (mock device store)
- [ ] `tests/manifest.test.js` -- covers STOR-02 (validate app.json/compose structure)
- [ ] `package.json` test script: `"test": "node --test tests/"`
- [ ] Framework install: None needed -- Node.js 22 built-in test runner

## Sources

### Primary (HIGH confidence)
- [Homey Apps SDK - Pairing](https://apps.developer.homey.app/the-basics/devices/pairing) - Pairing flow templates, onPair, onRepair
- [Homey Apps SDK - Custom Pairing Views](https://apps.developer.homey.app/advanced/custom-views/custom-pairing-views) - HTML views, emit/setHandler, navigation, device creation
- [Homey Apps SDK - Capabilities](https://apps.developer.homey.app/the-basics/devices/capabilities) - System capabilities (measure_battery, locked), custom capabilities, UI components
- [Homey Apps SDK - Devices](https://apps.developer.homey.app/the-basics/devices) - Device class, data/settings/store, lifecycle methods
- [Homey Apps SDK - App Structure](https://apps.developer.homey.app/the-basics/app) - Compose structure, folder layout, app.js lifecycle
- [Homey Apps SDK - Getting Started](https://apps.developer.homey.app/the-basics/getting-started) - CLI installation, app create, app run
- [Homey Apps SDK - Settings](https://apps.developer.homey.app/the-basics/devices/settings) - Device settings types and handlers
- [Homey Apps SDK - Guidelines](https://apps.developer.homey.app/app-store/guidelines) - App store requirements, image sizes, naming
- [Tessie API - Get Vehicles](https://developer.tessie.com/reference/get-all-vehicles.md) - Full endpoint spec with response schema
- [Tessie API - Get Vehicle](https://developer.tessie.com/reference/get-vehicle.md) - Single vehicle state endpoint
- [Tessie API - Get Status](https://developer.tessie.com/reference/get-status.md) - Vehicle status (asleep/awake/waiting_for_sleep)
- [Tessie API - Authentication](https://developer.tessie.com/reference/authentication.md) - Token generation, bearer auth format

### Secondary (MEDIUM confidence)
- [RonnyWinkler/homey.tesla](https://github.com/RonnyWinkler/homey.tesla) - Existing Tesla Homey app, confirms `car` device class, driver structure patterns
- [Tessie API - Quick Start](https://developer.tessie.com/reference/quick-start.md) - API usage patterns, endpoint format
- [Homey Apps SDK - Homey Compose](https://apps.developer.homey.app/advanced/homey-compose) - Compose directory structure, templating

### Tertiary (LOW confidence)
- [Tessie API - Streaming](https://developer.tessie.com/reference/access-tesla-fleet-telemetry) - WebSocket format (out of scope for Phase 1 but noted for future phases)
- car_type values for Cybertruck -- inferred but not confirmed in documentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Homey SDK v3 is well-documented, Tessie API is straightforward REST
- Architecture: HIGH - Homey Compose patterns are prescriptive, existing Tesla app provides reference
- Pitfalls: HIGH - Well-documented SDK patterns, clear data/store/settings separation
- Discretion items: HIGH for device class (confirmed by existing app), HIGH for token storage (SDK docs are explicit about store vs settings vs data)

**Research date:** 2026-03-03
**Valid until:** 2026-04-03 (30 days -- both Homey SDK and Tessie API are stable)
