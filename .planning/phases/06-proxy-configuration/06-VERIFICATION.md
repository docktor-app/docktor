---
phase: 06-proxy-configuration
verified: 2026-09-07T19:15:00Z
status: human_needed
score: 21/23 must-haves verified (2 present, behavior-unverified)
behavior_unverified: 2
overrides_applied: 0
covered_files:
  - ".planning/REQUIREMENTS.md"
  - ".planning/phases/06-proxy-configuration/06-01-PLAN.md"
  - ".planning/phases/06-proxy-configuration/06-01-SUMMARY.md"
  - ".planning/phases/06-proxy-configuration/06-02-PLAN.md"
  - ".planning/phases/06-proxy-configuration/06-02-SUMMARY.md"
  - ".planning/phases/06-proxy-configuration/06-03-PLAN.md"
  - ".planning/phases/06-proxy-configuration/06-03-SUMMARY.md"
  - ".planning/phases/06-proxy-configuration/06-04-PLAN.md"
  - ".planning/phases/06-proxy-configuration/06-04-SUMMARY.md"
  - ".planning/phases/06-proxy-configuration/06-05-PLAN.md"
  - ".planning/phases/06-proxy-configuration/06-05-SUMMARY.md"
  - ".planning/phases/06-proxy-configuration/06-06-PLAN.md"
  - ".planning/phases/06-proxy-configuration/06-06-SUMMARY.md"
  - ".planning/phases/06-proxy-configuration/06-07-PLAN.md"
  - ".planning/phases/06-proxy-configuration/06-07-SUMMARY.md"
  - ".planning/phases/06-proxy-configuration/06-UAT.md"
  - "client/package.json"
  - "package.json"
  - "server/package.json"
  - "server/src/routes/proxy.ts"
  - "server/test/unit/routes/proxy-validation.test.ts"
  - "server/test/unit/shared-schema-parity.test.ts"
  - "shared/src/validation/proxy.ts"
covered_digest: "v1:sha256:2d49f629b91878bb5922d4ac860fd6b477776f43237b32bfba9db696776e7fae"
re_verification:
  previous_status: human_needed
  previous_score: 15/17
  gaps_closed:
    - "G-06-3: 'Assigning a domain with an invalid hostname returns 400' — root-caused to a stale/never-rebuilt @docktor/shared compiled dist/ (never rebuilt before server/client tests or yarn dev consumed it); fixed by chaining an explicit `yarn workspace @docktor/shared build &&` onto every server/client test script and the root dev script, plus two new server unit tests that pin the 400 from both the route side and the compiled-artifact side"
    - "Live database schema verification (previously PRESENT_BEHAVIOR_UNVERIFIED) — resolved via 06-UAT.md test 2, run on an unrestricted host, result: pass"
    - "409 duplicate-domain / 400 proxy-stack-not-deployed (previously PRESENT_BEHAVIOR_UNVERIFIED) — resolved via 06-UAT.md test 3's live run: only the invalid-hostname assertion failed (G-06-3); the other assertions in the same integration test file passed"
    - "Live proxy-stack deploy and full first-run wizard walkthrough (previously PRESENT_BEHAVIOR_UNVERIFIED) — resolved via 06-UAT.md tests 6, 8, 9, all pass"
  gaps_remaining: []
  regressions: []
gaps: []
behavior_unverified_items:
  - truth: "The full authenticated HTTP integration round trip (test/integration/proxy.test.ts's 'returns 400 for an invalid hostname' case, plus the rest of the assignDomain/listByStack suite) re-confirms the 400 on an unrestricted host now that the build-freshness fix is in place"
    test: "On a host with a reachable Postgres (no TCP-to-Docker-published-port block), run `yarn workspace @docktor/server test:integration test/integration/proxy.test.ts`"
    expected: "All cases pass, including 'returns 400 for an invalid hostname' at proxy.test.ts:132 (previously 201, G-06-3)"
    why_human: "This sandbox reproduces the exact P1001 `Can't reach database server` failure at the testcontainers `startContainer()` step — independently reproduced in this verification session, identical in signature to what 05.1-01, 05.1-05, 05.1-06, 06-01, and this phase's own prior verification and 06-07-SUMMARY all document. This is the plan's own designated D4 human-check item and is still formally open."
  - truth: "DNS-based certificate issuance shows 'Secured' for a DNS-pointed domain and 'Cert failed' with a real acme-companion log line for a non-pointed domain"
    test: "With the proxy stack deployed on a real host and a domain assigned with TLS on, point one test domain's DNS at the host and leave another unpointed; observe cert-status badges converge to Secured / Cert failed"
    why_human: "No real host with public DNS was available in this or the prior UAT session (06-UAT.md test 7: skipped, unchanged by this gap-closure plan) — this class of check requires live DNS propagation and a real acme-companion run that no static analysis or sandboxed test can substitute for."
---

# Phase 6: Proxy Configuration — Verification Report (Re-verification after 06-07 gap closure)

**Phase Goal:** Users can configure domain and TLS exposure for any service directly from the stack detail page, without touching Nginx configuration manually
**Verified:** 2026-09-07
**Status:** human_needed
**Re-verification:** Yes — after G-06-3 gap closure (plan 06-07)

## Context

The prior 06-VERIFICATION.md (2026-09-04) passed 15/17 truths with 2 items routed to human verification. A subsequent human UAT pass (06-UAT.md) executed those human-verification items on a real host and resolved most of them, but surfaced a new defect not previously caught: **G-06-3** — assigning a domain with an invalid hostname (`"not a hostname"`) returned `201` instead of `400`. Root cause, per `.planning/debug/assigning-a-domain-with-an-invalid-hostname-returns-400.md`: the hostname regex, `assignDomainSchema`, and `routes/proxy.ts` were all independently verified correct; the actual defect was that nothing rebuilt the gitignored `shared/dist` before `@docktor/server`'s test scripts (or `yarn dev`) ran, so a stale compiled schema could silently be more permissive than `shared/src`.

Plan 06-07 closed this by (a) chaining an explicit `yarn workspace @docktor/shared build &&` onto every server/client test script and the root `dev` script, and (b) adding two new server unit tests: a database-free route-level regression pinning the 400, and a compiled-vs-source parity guard. It deliberately did not touch `shared/src/validation/proxy.ts`, `server/src/routes/proxy.ts`, or `server/src/app.ts`.

This report independently re-verifies: (1) whether G-06-3 is genuinely closed, (2) whether PRXY-01..05 and the phase's must-haves still hold with no regression, and (3) how to route the one remaining, plan-acknowledged human-check item (live DB-backed integration re-run) consistent with this project's prior handling of the same recurring Postgres-P1001 sandbox restriction.

## Goal Achievement

### Roadmap Success Criteria (the contract)

| # | Success Criterion | Status | Evidence |
|---|---|---|---|
| 1 | User can configure ACME email + proxy-stack settings in Settings; Docktor auto-deploys nginx-proxy+acme-companion, offered as an optional wizard step | ✓ VERIFIED | Unaffected by 06-07 (no files in this area were touched); 06-UAT.md tests 6, 8, 9 confirm the live deploy and wizard walkthrough pass on a real host. |
| 2 | User assigns domain(s)/port/TLS from the stack detail page; Docktor writes routing/TLS env vars and redeploys | ✓ VERIFIED | Unit-level compose-editor tests still pass (regression-confirmed this session); the domain-validation boundary (the part G-06-3 actually broke) is now pinned by a database-free behavioral test — see Truth #18 below. |
| 3 | User removes a proxy config from the UI; env vars removed, service redeployed | ✓ VERIFIED | Unaffected; regression-confirmed via full unit suite. |
| 4 | Proxy operations are idempotent | ✓ VERIFIED | Unaffected; regression-confirmed via full unit suite. |

### Observable Truths

Rows 1-17 carry forward the prior verification's representative sample, re-checked for regression this session. Rows 18-21 are new, specific to 06-07's G-06-3 closure. Rows 22-23 are the two items still routed to human verification (down from 3 in the prior report — live DB schema and the non-invalid-hostname integration assertions were resolved by the intervening UAT run).

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | `setServiceProxyEnv`/`readServiceProxyEnv`/`removeServiceProxyEnv` preserve every other byte of a compose file | ✓ VERIFIED | Regression-confirmed: full server unit suite re-ran green this session (40/40 files, 616 passed, 2 todo). |
| 2 | D-08 promote invariant — multiple domains render one comma-joined `VIRTUAL_HOST` key | ✓ VERIFIED | Regression-confirmed (same suite run). |
| 3 | Assigning a domain already owned by another service returns 409; assigning without the proxy stack deployed returns 400 | ✓ VERIFIED | Resolved by 06-UAT.md test 3's live run: the integration file executed against a real Postgres, and only the invalid-hostname assertion failed (tracked separately as G-06-3 / Truth #18); the 409 and stack-not-deployed assertions in that same run passed. |
| 4 | Concurrent writes to one stack's compose file are serialized (`withKeyedLock`) | ✓ VERIFIED | Regression-confirmed. |
| 5 | Removing the last domain clears env vars and the `docktor_proxy` network entry | ✓ VERIFIED | Regression-confirmed. |
| 6 | Hand-written `VIRTUAL_HOST` domains are adopted into `ProxyConfig` rows | ✓ VERIFIED | Regression-confirmed. |
| 7 | `stopStack`/`restartStack`/`deleteStack` reject `isProtected` stacks with 400 | ✓ VERIFIED | Regression-confirmed. |
| 8 | Dashboard hides `isProtected` stacks unless `proxy.showInDashboard === "true"` | ✓ VERIFIED | Regression-confirmed. |
| 9 | `renderProxyStackCompose` produces a pinned, bind-mount-only, adversarial-input-safe compose file | ✓ VERIFIED | Regression-confirmed. |
| 10 | `deployProxyStack` refuses to deploy over an occupied host port (D-11) | ✓ VERIFIED | Regression-confirmed at unit level; 06-UAT.md test 6 additionally confirms a live deploy succeeded cleanly on a real host. |
| 11 | ProxyCertPoller classifies issued/pending/failed correctly | ✓ VERIFIED | Regression-confirmed. |
| 12 | `useProxyStatus` merges live SSE status per stack | ✓ VERIFIED | Regression-confirmed. |
| 13 | Proxy tab renders exact UI-SPEC copy; icon-only remove button has `aria-label` | ✓ VERIFIED | Regression-confirmed. |
| 14 | Settings > Proxy card and StackActions protected-action disabling | ✓ VERIFIED | Regression-confirmed. |
| 15 | Wizard step 6 is optional, terminal, does not block reaching the dashboard on skip | ✓ VERIFIED | Regression-confirmed at unit level; 06-UAT.md test 9 confirms the full live walkthrough passes. |
| 16 | Live database schema matches the revised Prisma models (`isProtected`, `certStatus`/`certMessage`/`certCheckedAt`, dropped `npmProxyHostId`/`isPublic`) | ✓ VERIFIED | Resolved by 06-UAT.md test 2, run on an unrestricted host: result "pass". |
| 17 | Full Playwright coverage of the 4 proxy UI flows and the 6-step wizard flow | ✓ VERIFIED (per SUMMARY, not re-run) | Unaffected by 06-07's changes to `client/package.json`'s `test:integration`/`test:integration:headed` scripts (both now correctly chain the shared build first — confirmed by direct `cat` of the file); not re-executed this session (expensive; unit-level equivalents re-verified instead). |
| 18 | **[G-06-3 core]** `POST /api/stacks/:id/services/:serviceName/proxy` with `{domain: "not a hostname", ...}` returns 400 and never calls `ProxyService.assignDomain` | ✓ VERIFIED | `server/test/unit/routes/proxy-validation.test.ts` registers the *real* `routes/proxy.ts` default export on a bare Fastify instance wired with the real `validatorCompiler`/`serializerCompiler` (only `auth-middleware` and `application/index` are mocked) and drives the exact G-06-3 payload through `app.inject(...)`. Re-ran this session: passes. Falsification-tested: I independently reproduced G-06-3 live by removing `.regex(hostnamePattern, ...)` from `shared/src/validation/proxy.ts` and re-running this test through the yarn script — it flipped 5 of 9 tests to failing, exactly the mechanism this truth claims to catch — then restored the source and rebuilt, confirming green again. This is genuine behavioral proof, not presence-only. |
| 19 | Multiple additional invalid domain/port shapes (dotless label, leading-hyphen label, trailing-hyphen label, 64-char over-long label, empty string, out-of-range `internalPort`) also return 400, and a valid/mixed-case payload still returns 201 with the lowercase transform reaching the handler | ✓ VERIFIED | Same test file, `it.each` block; all sub-cases pass (re-ran this session, 9/9 in this file). |
| 20 | Every test/dev entry point that consumes `@docktor/shared`'s compiled output rebuilds it first — even from a never-built checkout | ✓ VERIFIED | Direct inspection: `server/package.json`'s `test`/`test:unit`/`test:integration` and `client/package.json`'s `test`/`test:unit`/`test:integration`/`test:integration:headed` and root `package.json`'s `dev` all begin with `yarn workspace @docktor/shared build &&`. **Behaviorally reproduced, not just grepped:** I deleted `shared/dist` and `shared/tsconfig.tsbuildinfo` entirely and ran `yarn workspace @docktor/server test:unit test/unit/lib/slugify.test.ts` — the compiled `shared/dist/validation/proxy.js` was regenerated before the test ran, and the test passed. |
| 21 | A compiled `@docktor/shared` that disagrees with `shared/src` fails a sub-second, self-explaining unit test | ✓ VERIFIED | `server/test/unit/shared-schema-parity.test.ts` (4 tests, all pass, re-ran this session). Falsification-tested: mutating `shared/dist/validation/proxy.js` directly (bypassing the rebuild) flipped this test to failing with a message naming `yarn workspace @docktor/shared build` as the remedy; restoring the file returned it to green. |
| 22 | The full authenticated HTTP integration round trip (`test/integration/proxy.test.ts`'s "returns 400 for an invalid hostname" case and the rest of the `assignDomain`/`listByStack` suite) re-confirms the fix end-to-end on an unrestricted host | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | The route-level mechanism is proven correct (Truth #18) and does not depend on database access (Zod schema validation runs before any repository/Prisma call in the real code path too), but the plan's own `<human-check>` explicitly designates this live re-run as the final closure step for G-06-3, and I could not execute it in this sandbox — see below. |
| 23 | DNS-based certificate issuance shows "Secured"/"Cert failed" correctly on a real host | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Unaffected, carried forward unchanged from 06-UAT.md test 7 (skipped — no real host with public DNS available). |

**Score:** 21/23 verified, 2 present-and-wired-but-behavior-unverified (both are live-infrastructure-dependent: one Postgres/TCP-published-port restricted, the other requiring real public DNS — neither is a code defect, and both were flagged as open by the phase's own artifacts before this verification began).

### Required Artifacts (delta — 06-07 only; full artifact list unchanged from prior verification)

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `server/test/unit/routes/proxy-validation.test.ts` | database-free route-level regression pinning the 400 | ✓ VERIFIED | 114 lines, 9 tests, all pass; registers the real `routes/proxy.ts` default export, not a reimplementation |
| `server/test/unit/shared-schema-parity.test.ts` | compiled-vs-source parity guard | ✓ VERIFIED | 79 lines, 4 tests, all pass; imports both `@docktor/shared` (compiled) and `../../../shared/src/index.js` (source) in one process |
| `server/package.json` | `test`/`test:unit`/`test:integration` chain a shared build | ✓ VERIFIED | All 3 scripts confirmed to begin with `yarn workspace @docktor/shared build &&` |
| `client/package.json` | `test`/`test:unit`/`test:integration`/`test:integration:headed` chain a shared build | ✓ VERIFIED | All 4 scripts confirmed |
| `package.json` (root) | `dev` chains a shared build before `concurrently` | ✓ VERIFIED | Confirmed; `concurrently` invocation byte-identical after `&&`, per plan |
| `shared/src/validation/proxy.ts`, `server/src/routes/proxy.ts`, `server/src/app.ts` | **must remain untouched** | ✓ VERIFIED | `git diff --stat dda822e HEAD -- shared/src server/src/routes/proxy.ts server/src/app.ts` → empty; zero changes since the prior verification's baseline commit |

### Key Link Verification (delta)

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `server/package.json` test scripts | `shared/dist/index.js` | `yarn workspace @docktor/shared build &&` prefix | ✓ WIRED | Reproduced live from a deleted `shared/dist` — the artifact regenerates before vitest starts |
| `server/test/unit/shared-schema-parity.test.ts` | `shared/src/index.ts` | `import * as source from "../../../shared/src/index.js"` | ✓ WIRED | Confirmed by successful execution; compares against `@docktor/shared`'s compiled export set |
| `server/test/unit/routes/proxy-validation.test.ts` | `server/src/routes/proxy.ts` | real `Fastify` instance + `validatorCompiler`/`serializerCompiler` + `app.register(proxyRoutes)` | ✓ WIRED | Confirmed: `app.inject(...)` against the real route returns the expected status codes |

### Behavioral Spot-Checks / Falsification Tests Run This Session

| Behavior | Command | Result | Status |
|---|---|---|---|
| New test files pass in isolation | `yarn workspace @docktor/server exec vitest run --project unit test/unit/routes/proxy-validation.test.ts test/unit/shared-schema-parity.test.ts` | 2 files / 13 tests passed | ✓ PASS |
| Freshness guarantee holds from a never-built checkout | `rm -rf shared/dist shared/tsconfig.tsbuildinfo && yarn workspace @docktor/server test:unit test/unit/lib/slugify.test.ts && test -f shared/dist/validation/proxy.js` | `shared/dist/validation/proxy.js` regenerated; test passed | ✓ PASS |
| G-06-3 reproduced live and caught (source-side mutation) | removed `.regex(hostnamePattern, ...)` from `shared/src/validation/proxy.ts`, re-ran `proxy-validation.test.ts` through the yarn script (rebuilds shared), then restored + rebuilt | 5/9 tests flipped to failing; restored to 9/9 green after fix reverted | ✓ PASS |
| Compiled-artifact staleness caught (dist-side mutation) | manually edited `shared/dist/validation/proxy.js` to strip the regex check, re-ran `shared-schema-parity.test.ts` without a rebuild | Test failed with a message naming `yarn workspace @docktor/shared build`; passed again after restoring the file | ✓ PASS |
| No regression in the broader server unit suite | `yarn workspace @docktor/server test:unit` (full run, once) | 40/40 files, 616 passed, 2 todo | ✓ PASS |
| No regression in server types | `yarn workspace @docktor/server tsc --noEmit` | zero errors | ✓ PASS |
| Client still resolves the freshly-built shared artifact | `yarn workspace @docktor/client test test/unit/routes/proxy-tab.test.tsx` | 1 file / 10 tests passed | ✓ PASS |
| Live DB-backed integration re-run attempted | `yarn workspace @docktor/server test:integration test/integration/proxy.test.ts` | Failed at `startContainer()`: `Error: P1001: Can't reach database server at localhost:<port>` — identical signature to every prior 06-* session's documented sandbox restriction | ? SKIP (environmental, routed to human — see Truth #22) |

### Requirements Coverage

| Requirement | Source Plan(s) | Status | Evidence |
|---|---|---|---|
| PRXY-01 | 06-01, 06-05, 06-07 | ✓ SATISFIED | Assign endpoint + Proxy tab (unaffected, regression-confirmed); domain-validation boundary now additionally pinned by a database-free behavioral test (06-07) that closes G-06-3 |
| PRXY-02 | 06-01, 06-03, 06-04, 06-06 | ✓ SATISFIED | Unaffected by 06-07; regression-confirmed |
| PRXY-03 | 06-03, 06-05, 06-06 | ✓ SATISFIED | Unaffected by 06-07; regression-confirmed |
| PRXY-04 | 06-02, 06-05 | ✓ SATISFIED | Unaffected by 06-07; regression-confirmed |
| PRXY-05 | 06-02 | ✓ SATISFIED | Unaffected by 06-07; regression-confirmed |

No orphaned requirements — REQUIREMENTS.md maps exactly PRXY-01 through PRXY-05 to Phase 6 (lines 82-86, 169-173), and all five remain claimed by at least one plan's `requirements:` frontmatter, including 06-07 which re-claims PRXY-01 for the gap closure.

### Prohibitions Check (06-07 plan frontmatter)

| Prohibition | Status | Evidence |
|---|---|---|
| MUST NOT relax, delete, or bypass `hostnamePattern`/`assignDomainSchema` in `shared/src/validation/proxy.ts` | ✓ RESOLVED | `git diff --stat` against the pre-06-07 baseline commit shows zero changes to `shared/src`. The regex was only ever touched transiently during this verification's own falsification test, and restored immediately (confirmed via `git diff --exit-code`). |
| MUST NOT make server/client tests resolve `@docktor/shared` to `shared/src` via a vitest alias | ✓ RESOLVED | No alias for `@docktor/shared` found in `server/vitest.config.ts`; `shared-schema-parity.test.ts` deliberately imports the compiled package (`@docktor/shared`, through `package.json`'s `main`) and a separate relative path into `shared/src`, comparing them — not aliasing one to the other. |

### Anti-Patterns / Code-Review Findings

Debt-marker scan (`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`) across the 5 files 06-07 touched (`server/test/unit/routes/proxy-validation.test.ts`, `server/test/unit/shared-schema-parity.test.ts`, `server/package.json`, `client/package.json`, `package.json`) — zero matches. `06-REVIEW.md`'s incremental-scope note (dated 2026-09-07) independently confirms the same two new test files were reviewed and verified by executing them and confirming they fail when `shared/dist` is deliberately reverted — no new critical/warning findings were raised against the 06-07 delta itself; the 7 pre-existing warning-level findings from the original phase review are all pre-06-07 and unaffected.

### Human Verification Required

1. **Live DB-backed integration re-run (D4)** — On a host with a reachable Postgres (no TCP-to-Docker-published-port block), run `yarn workspace @docktor/server test:integration test/integration/proxy.test.ts`. Expected: all cases pass, including "returns 400 for an invalid hostname" at `proxy.test.ts:132` (previously 201, G-06-3). Why human: this sandbox reproduces the identical, already-documented `P1001` restriction seen in 05.1-01, 05.1-05, 05.1-06, 06-01, and this phase's own prior verification and 06-07-SUMMARY — I independently re-confirmed it this session rather than trusting the SUMMARY's claim. This is the plan's own designated closure step for G-06-3; the underlying validation mechanism is otherwise proven correct and DB-independent (Truth #18).

2. **DNS-based certificate issuance on a real host** — Carried forward unchanged from the original phase (06-UAT.md test 7, skipped: "No real host with public DNS available for testing right now"). Not affected by 06-07.

### Gaps Summary

No must-have truth failed inspection, and no regression was found. G-06-3 is genuinely closed at the mechanism level: the build-freshness fix is demonstrated to work from a from-scratch checkout (freshness reproduced by deleting `shared/dist` entirely), and both new tests are proven — by live mutation, not just by reading them — to actually catch the exact defect class that produced G-06-3 (a stale/weakened compiled schema), from both the source side and the compiled-artifact side. The three files independently verified correct during the original debug session (`shared/src/validation/proxy.ts`, `server/src/routes/proxy.ts`, `server/src/app.ts`) remain byte-for-byte unchanged. The full server unit suite (616 tests) and `tsc --noEmit` both stay green, and a targeted client test confirms the client side still resolves the freshly-built artifact correctly — no regression from the five files 06-07 modified.

The one item the plan itself could not close in this sandbox — a live, DB-backed re-run of the actual HTTP integration test that originally caught G-06-3 — remains open for the same well-documented, pre-existing environmental reason every prior 06-* session has hit, and is routed to human verification rather than a false pass or a false gap, consistent with how this project's prior VERIFICATION.md and SUMMARY.md files have handled the identical restriction. The DNS-based certificate-issuance check is likewise carried forward unchanged, unaffected by this gap-closure plan.

---

_Verified: 2026-09-07_
_Verifier: Claude (gsd-verifier)_
