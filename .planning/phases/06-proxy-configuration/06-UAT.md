---
status: testing
phase: 06-proxy-configuration
source: [06-VERIFICATION.md]
started: 2026-09-07T19:20:00Z
updated: 2026-09-07T19:20:00Z
---

## Current Test

number: 1
name: Live DB-backed integration re-run of the invalid-hostname 400 (G-06-3 final closure)
expected: |
  On a host with a reachable Postgres (no TCP-to-Docker-published-port block), run
  `yarn workspace @docktor/server test:integration test/integration/proxy.test.ts`.
  All cases pass, including "returns 400 for an invalid hostname" at proxy.test.ts:132
  (previously 201, G-06-3).
awaiting: user response

## Tests

### 1. Live DB-backed integration re-run of the invalid-hostname 400 (G-06-3 final closure)
expected: On a host with a reachable Postgres (no TCP-to-Docker-published-port block), run `yarn workspace @docktor/server test:integration test/integration/proxy.test.ts`. All cases pass, including "returns 400 for an invalid hostname" at proxy.test.ts:132 (previously 201, G-06-3). This re-runs the same assertion that originally caught G-06-3 (formerly test 3 in this file) — the route-level mechanism is now proven correct and DB-independent (06-VERIFICATION.md Truth #18), but the plan's own human-check designates this live re-run as the final closure step.
result: pending

### 2. Certificate issuance on a real host
expected: With the proxy stack deployed and a domain assigned with TLS on, confirm Docktor can read the acme-companion-written cert files. A domain whose DNS does not point at the host shows "Cert failed" with a real acme-companion log line; a domain that does point at the host reaches "Secured".
result: skipped
reason: No real host with public DNS available for testing right now (unaffected by the 06-07 gap-closure plan; carried forward unchanged)

## Summary

total: 2
passed: 0
issues: 0
pending: 1
skipped: 1
blocked: 0

## Gaps

- gap_id: G-06-3
  truth: "Assigning a domain with an invalid hostname returns 400"
  status: mechanism_resolved_pending_live_confirmation
  reason: "Root cause (stale/never-rebuilt @docktor/shared compiled dist/) fixed by plan 06-07: every server/client test script and the root dev script now chain `yarn workspace @docktor/shared build &&` before consuming @docktor/shared, and two new server unit tests (server/test/unit/routes/proxy-validation.test.ts, server/test/unit/shared-schema-parity.test.ts) pin the 400 from both the route side and the compiled-artifact side. Both tests were falsification-tested (proven to fail when the regression is reintroduced) by 06-07's own SUMMARY and independently re-confirmed by 06-VERIFICATION.md. The one remaining step is test 1 above: a live, DB-backed re-run of the original failing assertion, which this sandbox cannot execute (same pre-existing Prisma P1001 TCP-to-Docker-published-port block documented across 05.1-01, 05.1-05, 05.1-06, 06-01, and this phase's own artifacts)."
  severity: major
  test: 1
  artifacts:
    - shared/src/validation/proxy.ts                       # unchanged since diagnosis — verified correct, not the cause
    - server/src/routes/proxy.ts                            # unchanged since diagnosis — verified correct, not the cause
    - server/test/unit/routes/proxy-validation.test.ts       # new: database-free regression pinning the 400
    - server/test/unit/shared-schema-parity.test.ts          # new: compiled-vs-source parity guard
    - server/package.json                                   # now chains `yarn workspace @docktor/shared build &&`
    - client/package.json                                   # now chains `yarn workspace @docktor/shared build &&`
    - package.json (root)                                   # dev now chains `yarn workspace @docktor/shared build &&`
    - .planning/phases/06-proxy-configuration/06-07-SUMMARY.md
    - .planning/phases/06-proxy-configuration/06-VERIFICATION.md
  missing:
    - "A live, DB-backed re-run of test/integration/proxy.test.ts's 'returns 400 for an invalid hostname' case on a host where Postgres is actually reachable (this sandbox's testcontainers Postgres accepts a raw TCP handshake but the real Prisma wire-protocol connection hangs/fails to reach it — P1001)."
