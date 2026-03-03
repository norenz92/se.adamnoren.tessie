---
phase: 2
slug: vehicle-data-polling
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-03
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in test runner (`node:test`) with TypeScript |
| **Config file** | `tsconfig.test.json` (compiles to `dist-test/`) |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 0 | CHRG-01 | unit | `npm test` | Partial | ⬜ pending |
| 02-01-02 | 01 | 0 | CHRG-02 | unit | `npm test` | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 0 | CHRG-03 | unit | `npm test` | ❌ W0 | ⬜ pending |
| 02-01-04 | 01 | 0 | CLIM-03 | unit | `npm test` | ❌ W0 | ⬜ pending |
| 02-01-05 | 01 | 0 | DATA-01 | unit | `npm test` | ❌ W0 | ⬜ pending |
| 02-01-06 | 01 | 0 | DATA-02 | unit | `npm test` | ❌ W0 | ⬜ pending |
| 02-01-07 | 01 | 0 | DATA-03 | unit | `npm test` | ❌ W0 | ⬜ pending |
| 02-01-08 | 01 | 0 | DATA-04 | unit | `npm test` | ❌ W0 | ⬜ pending |
| 02-01-09 | 01 | 0 | DATA-05 | unit | `npm test` | ❌ W0 | ⬜ pending |
| 02-01-10 | 01 | 0 | STRM-02 | unit | `npm test` | Partial | ⬜ pending |
| 02-01-11 | 01 | 0 | STRM-03 | unit | `npm test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/device.test.ts` — expand mock state fixtures to include ALL Tessie state fields (climate_state, drive_state, vehicle_state with tpms, gui_settings, software_update)
- [ ] `tests/device.test.ts` — add test cases for: range with unit conversion, charging status enum mapping, temperature sub-capabilities, GPS lat/lng, tire pressure mapping and null handling, odometer with unit conversion, software update string formatting, battery health, adaptive poll intervals, retry/unavailable logic, vehicle state status capability
- [ ] Mock TessieClient needs `getStatus()` and `getBatteryHealth()` methods added

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Device card shows battery level visually | CHRG-01 | Requires Homey UI | Run `homey app run`, check device card |
| Polling doesn't wake sleeping vehicle | STRM-03 | Requires real vehicle | Monitor Tessie dashboard during poll cycle |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
