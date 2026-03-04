---
phase: 4
slug: real-time-streaming
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-04
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in test runner (node:test) |
| **Config file** | tsconfig.test.json |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

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
| 04-01-01 | 01 | 0 | STRM-01a | unit | `npm test` | ❌ W0 | ⬜ pending |
| 04-01-02 | 01 | 0 | STRM-01b | unit | `npm test` | ❌ W0 | ⬜ pending |
| 04-01-03 | 01 | 0 | STRM-01c,d | unit | `npm test` | ❌ W0 | ⬜ pending |
| 04-01-04 | 01 | 0 | STRM-01e | unit | `npm test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/stream-mapper.test.ts` — covers STRM-01a (pure function, translates PascalCase stream fields to capability values)
- [ ] `tests/streamer.test.ts` — covers STRM-01b, STRM-01e (mock WebSocket, verify events and exponential backoff)
- [ ] `tests/device-streaming.test.ts` — covers STRM-01c, STRM-01d (mock streamer, verify poll interval coordination)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end stream updates on real vehicle | STRM-01 | Requires live Tessie WebSocket + Homey device | Connect to real vehicle, verify capabilities update within seconds of state change |
| Reconnect after vehicle sleep/wake cycle | STRM-01 | Requires real vehicle sleep behavior | Let vehicle sleep, verify reconnection and data resumption on wake |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
