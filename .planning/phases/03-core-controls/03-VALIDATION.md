---
phase: 3
slug: core-controls
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-04
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in test runner (node:test) |
| **Config file** | tsconfig.test.json (compiles to dist-test/) |
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
| 03-01-01 | 01 | 1 | CHRG-04 | unit | `npm test` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | CHRG-05 | unit | `npm test` | ❌ W0 | ⬜ pending |
| 03-01-03 | 01 | 1 | CHRG-06 | unit | `npm test` | ❌ W0 | ⬜ pending |
| 03-01-04 | 01 | 1 | CHRG-07 | unit | `npm test` | ❌ W0 | ⬜ pending |
| 03-01-05 | 01 | 1 | CLIM-01 | unit | `npm test` | ❌ W0 | ⬜ pending |
| 03-01-06 | 01 | 1 | CLIM-02 | unit | `npm test` | ❌ W0 | ⬜ pending |
| 03-01-07 | 01 | 1 | ACCS-01 | unit | `npm test` | ❌ W0 | ⬜ pending |
| 03-01-08 | 01 | 1 | ACCS-02 | unit | `npm test` | ❌ W0 | ⬜ pending |
| 03-01-09 | 01 | 1 | ACCS-03 | unit | `npm test` | ❌ W0 | ⬜ pending |
| 03-01-10 | 01 | 1 | ACCS-04 | unit | `npm test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/commands.test.ts` — unit tests for TessieClient.command() and wake() methods (mock HTTP)
- [ ] `tests/device-controls.test.ts` — unit tests for capability listener command dispatch and wake behavior
- [ ] Verify existing `tests/manifest.test.ts` passes with new capabilities in driver.compose.json

*Existing test infrastructure (node:test, tsconfig.test.json) covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Vehicle actually wakes and responds to commands | All | Requires real vehicle + Tessie API | Send command via Homey, verify vehicle responds |
| Slider UI renders correctly for charge limit / amps / temperature | CHRG-05, CHRG-06, CLIM-02 | UI rendering requires Homey app runtime | Pair device, verify slider min/max/step in Homey app |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
