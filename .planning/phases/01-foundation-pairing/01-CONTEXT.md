# Phase 1: Foundation & Pairing - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

App scaffold with Tessie API authentication and vehicle discovery. Users can add their Tesla vehicles as Homey devices through a pairing flow. No vehicle data display beyond basic preview — comprehensive data comes in Phase 2.

</domain>

<decisions>
## Implementation Decisions

### Pairing flow steps
- Token input screen with a help link showing where to find the API token in Tessie's dashboard
- After valid token, show vehicle list with checkboxes — user selects which vehicles to pair in a single session
- Each vehicle in the list shows: display name, model (e.g. Model 3), and last 4 of VIN
- Invalid token or API errors show inline on the token input screen — user stays on screen to correct and retry

### Device presentation
- Default device name uses the Tessie display name (user can rename in Homey later)
- Model-specific device icons — different icons for Model 3, Model Y, Model S, Model X, Cybertruck
- Phase 1 card includes battery level and lock state as early capabilities so the card isn't empty before Phase 2

### Token & multi-account
- Multiple Tessie accounts supported — each pairing session asks for a token, users can mix vehicles from different accounts
- Re-authentication uses Homey's standard repair flow (user triggers repair, re-enters token)
- Duplicate VIN detection — block pairing with a message if the vehicle is already paired

### Claude's Discretion
- Device class selection (research Homey's available classes, pick best fit for vehicles)
- Token storage approach (per-device vs shared — follow Homey SDK conventions for multi-device apps)
- App scaffold structure and file organization
- Error handling internals beyond user-facing inline errors
- Exact help link text and instructions for finding Tessie API token

</decisions>

<specifics>
## Specific Ideas

No specific references — open to standard Homey app patterns and conventions.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project, no existing code

### Established Patterns
- None yet — Phase 1 establishes the patterns all subsequent phases will follow

### Integration Points
- Tessie REST API for token validation and vehicle discovery
- Homey SDK pairing flow views (login_credentials or similar)
- Homey device capability model for battery level and lock state preview

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation-pairing*
*Context gathered: 2026-03-03*
