---
phase: "20"
slug: visual-consistency-dashboard-clarity-and-touch-targets
status: verified
threats_open: 0
asvs_level: 1
created: "2026-10-21"
---

# Phase 20 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Browser → app origin | Fonts, scripts and API calls load from the app origin only | Fonts, session cookie |
| Client → `GET /api/stacks` | Authenticated list call now carries a `hasBackup` boolean | Stack ids, backup presence |
| Operator → destructive actions | Restore, certificate delete, domain remove, service upgrade, stack delete | Intent confirmation |
| URL query → table state | `page` / `pageSize` are user-controlled | Integers |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-20-01 | Tampering (XSS) | status-labels | low | mitigate | Plain string transform; `Object.hasOwn`; no `dangerouslySetInnerHTML` in client/src | closed |
| T-20-02 | Spoofing | breadcrumb / row links | low | accept | Router `<Link to>` values only, `/stacks` prefix; no external URL formed | closed |
| T-20-03 | Tampering (XSS) | shared DataTable | low | mitigate | No HTML sinks in `components/common/data/table/*`; cells are React nodes | closed |
| T-20-04 | Denial of service | page/pageSize parsing, sort | low | accept | In-memory sort; stricter than planned: `parsePage` floors/clamps, `parsePageSize` whitelists | closed |
| T-20-05 | Tampering (mis-tap) | pagination, stack actions | low | mitigate | `gap-2 md:gap-1`; Delete still calls `confirm()` | closed |
| T-20-06 | Denial of service | `?page=` / `?pageSize=` | low | accept | Values clamped and whitelisted on read | closed |
| T-20-07 | Tampering | auth/setup form layout refactor | low | mitigate | Resolvers, `FormMessage`, submit handlers unchanged; signup test asserts invalid submit does not call `signUp` | closed |
| T-20-08 | Information disclosure | font host | medium | mitigate | Self-hosted `@fontsource-variable/geist-mono`; unit + Playwright assertions | closed |
| T-20-SC | Tampering (supply chain) | geist-mono package | high | mitigate | Pinned `^5.3.0`, lockfile checksum, OFL-1.1, no scripts, no JS | closed |
| T-20-09 | Tampering | deploy warnings text | low | mitigate | React text inside `<code>` | closed |
| T-20-10 | Denial of service | tab bar scrollIntoView | low | mitigate | Scoped, optional-called; test deletes `scrollIntoView` | closed |
| T-20-11 | Information disclosure | `hasBackup` | low | mitigate | Boolean only, merged after the protected filter; test covers hidden stacks | closed |
| T-20-12 | Elevation of privilege | `GET /api/stacks` | medium | mitigate | `requireAuth` hook; integration test asserts 401 | closed |
| T-20-13 | Denial of service | snapshot lookup | low | mitigate | One `groupBy` per list request; test asserts a single call | closed |
| T-20-14 | Tampering | `findStackIdsWithSnapshot` | low | accept | No parameters; fixed where clause | closed |
| T-20-15 | Tampering | storage/backup links | low | mitigate | `encodeURIComponent(stackId)`; values rendered as React text | closed |
| T-20-16 | Repudiation | restore | low | mitigate | Restore opens `RestoreConfirmDialog`; `triggerRestore` only on confirm; test asserts | closed |
| T-20-17 | Information disclosure | certificates upload | medium | mitigate | Files passed straight to the API; never read or rendered; test present | closed |
| T-20-18 | Tampering | certificate delete | low | mitigate | 44px button only opens the AlertDialog | closed |
| T-20-19 | Tampering | notification log cells | low | mitigate | Message rendered as React child | closed |
| T-20-20 | Elevation of privilege | two-factor dialogs | medium | mitigate | Layout wrappers and `TOUCH_TARGET` only; `handleSubmit` and API calls unchanged | closed |
| T-20-21 | Tampering | stack detail cells | low | mitigate | No HTML sinks; cause via `StackStatusBadge` | closed |
| T-20-22 | Tampering | service upgrade | low | mitigate | `UPGRADE_BLOCKED_STATES` unchanged; button disabled while blocked | closed |
| T-20-23 | Tampering | proxy domain removal | low | mitigate | API call only from the AlertDialog action | closed |
| T-20-24 | Information disclosure | font host at load | medium | mitigate | Playwright asserts every request hostname equals the app host | closed |
| T-20-25 | Tampering | Playwright isolation | low | mitigate | `_apiRouteGuard` auto-fixture aborts unstubbed `/api/**` calls | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above `workflow.security_block_on` (high) count toward threats_open*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-20-01 | T-20-02 | Links are router paths under `/stacks`; no external URL can be formed | plan-time disposition (20-PLAN threat model); premise re-verified in code | 2026-10-21 |
| AR-20-02 | T-20-04 | Client-side sort is in memory; paging inputs are clamped and whitelisted | plan-time disposition; premise re-verified in code | 2026-10-21 |
| AR-20-03 | T-20-06 | Query params only written by the pagination controls and validated on read | plan-time disposition; premise re-verified in code | 2026-10-21 |
| AR-20-04 | T-20-14 | Repository method takes no input | plan-time disposition; premise re-verified in code | 2026-10-21 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-21 | 26 | 26 | 0 | gsd-security-auditor (HEAD e97b48d, includes review-fix and CI-fix commits) |

Unregistered flags: none. Post-review commits (ItemLink, pagination validation, `useStacks` status ref) add no new attack surface.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-21
