---
phase: 5
slug: extended-controls
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-04
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in test runner (node:test) |
| **Config file** | tsconfig.test.json (compiles to dist-test/) |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-XX | 01 | 1 | CLIM-04 | unit | `node --test dist-test/tests/device-controls.test.js` | Yes (extend) | ⬜ pending |
| 05-01-XX | 01 | 1 | CLIM-05 | unit | `node --test dist-test/tests/device-controls.test.js` | Yes (extend) | ⬜ pending |
| 05-01-XX | 01 | 1 | CLIM-06 | unit | `node --test dist-test/tests/device-controls.test.js` | Yes (extend) | ⬜ pending |
| 05-01-XX | 01 | 1 | CLIM-07 | unit | `node --test dist-test/tests/device-controls.test.js` | Yes (extend) | ⬜ pending |
| 05-01-XX | 01 | 1 | CLIM-08 | unit | `node --test dist-test/tests/device-controls.test.js` | Yes (extend) | ⬜ pending |
| 05-02-XX | 02 | 1 | ACCS-05 | unit | `node --test dist-test/tests/device-controls.test.js` | Yes (extend) | ⬜ pending |
| 05-02-XX | 02 | 1 | ACCS-06 | unit | `node --test dist-test/tests/device-controls.test.js` | Yes (extend) | ⬜ pending |
| 05-02-XX | 02 | 1 | ACCS-07 | unit | `node --test dist-test/tests/device-controls.test.js` | Yes (extend) | ⬜ pending |
| 05-02-XX | 02 | 1 | CHRG-08 | unit | `node --test dist-test/tests/tessie-client.test.js` | Yes (extend) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. Tests extend existing files (`device-controls.test.ts`, `tessie-client.test.ts`, `device.test.ts`).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Seat heater UI shows correct levels | CLIM-04 | UI rendering on Homey device | Set each seat to each level, verify Homey shows correct state |
| Climate keeper dropdown works | CLIM-07 | Homey enum UI behavior | Select each mode, verify state persists |
| Speed limit PIN stored securely | ACCS-07 | Settings password field masking | Enter PIN in device settings, verify it's masked |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
