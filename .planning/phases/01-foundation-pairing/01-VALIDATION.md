---
phase: 1
slug: foundation-pairing
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-03
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in test runner (node:test) + assert |
| **Config file** | none — Wave 0 installs |
| **Quick run command** | `node --test tests/` |
| **Full suite command** | `node --test tests/` |
| **Estimated runtime** | ~2 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test tests/`
- **After every plan wave:** Run `node --test tests/` + `homey app validate`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 0 | STOR-02 | unit | `node --test tests/manifest.test.js` | No — W0 | pending |
| 01-01-02 | 01 | 1 | AUTH-01 | unit | `node --test tests/tessie-client.test.js` | No — W0 | pending |
| 01-01-03 | 01 | 1 | AUTH-02 | unit | `node --test tests/tessie-client.test.js` | No — W0 | pending |
| 01-01-04 | 01 | 1 | AUTH-03 | manual | `homey app run` | N/A | pending |
| 01-01-05 | 01 | 1 | AUTH-04 | unit+manual | `node --test tests/device.test.js` | No — W0 | pending |

*Status: pending · green · red · flaky*

---

## Wave 0 Requirements

- [ ] `tests/tessie-client.test.js` — mock HTTP responses for AUTH-01, AUTH-02
- [ ] `tests/device.test.js` — mock device store for AUTH-04
- [ ] `tests/manifest.test.js` — validate app.json/compose structure for STOR-02
- [ ] `package.json` test script: `"test": "node --test tests/"`
- [ ] Framework install: None needed — Node.js 22 built-in test runner

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Pairing flow UI displays token input and vehicle list | AUTH-01, AUTH-03 | Requires Homey pairing UI running on real device | 1. Run `homey app run` 2. Add device > Tessie > Vehicle 3. Enter valid token 4. Verify vehicle list shows |
| Multiple vehicles selectable in single session | AUTH-03 | Requires real Homey pairing flow | 1. Enter token with 2+ vehicles 2. Select multiple 3. Verify all appear as devices |
| Repair flow re-enters token | AUTH-04 | Requires Homey device repair trigger | 1. Open device > Advanced > Repair 2. Enter new token 3. Verify device still works |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
