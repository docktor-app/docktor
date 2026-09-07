---
status: diagnosed
phase: 06-proxy-configuration
source: [06-01-SUMMARY.md, 06-02-SUMMARY.md, 06-03-SUMMARY.md, 06-04-SUMMARY.md, 06-05-SUMMARY.md, 06-06-SUMMARY.md]
started: 2026-09-04T00:00:00Z
updated: 2026-09-07T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server/service. Clear ephemeral state (temp DBs, caches, lock files). Start the application from scratch. Server boots without errors, any seed/migration completes, and a primary query (health check, homepage load, or basic API call) returns live data.
result: pass

### 2. Live database schema verification
expected: Run `yarn dotenv -e .env.development -- prisma db push --accept-data-loss --config=server/prisma/prisma.config.ts` on a host where the dev Postgres is reachable, then confirm the live schema matches server/prisma/schema/proxy.prisma and stack.prisma — Stack.isProtected present, ProxyConfig.certStatus/certMessage/certCheckedAt present, npmProxyHostId/isPublic absent.
result: pass

### 3. assignDomain / listByStack HTTP flow
expected: Run `yarn workspace @docktor/server test:integration test/integration/proxy.test.ts` on an unrestricted host with reachable Postgres. The assignDomain/listByStack HTTP round trip passes: 201 create + real compose-file write, GET list, 409 duplicate domain, 400 invalid hostname, 400 proxy-stack-not-deployed, 401 unauthenticated.
result: issue
reported: "One test failed:  FAIL   test/integration  test/integration/proxy.test.ts > Proxy API > POST /api/stacks/:id/services/:serviceName/proxy > returns 400 for an invalid hostname\nAssertionError: expected 201 to be 400 // Object.is equality\n\n- Expected\n+ Received\n\n- 400\n+ 201\n\n ❯ test/integration/proxy.test.ts:132:36\n    130|             });\n    131| \n    132|             expect(res.statusCode).toBe(400);\n       |                                    ^\n    133|         });\n    134|"
severity: major

### 4. removeDomain HTTP flow
expected: In the same `proxy.test.ts` integration run, DELETE /api/proxy-configs/:proxyConfigId returns 204 on first call and 404 on a repeat call, with no compose write on the repeat.
result: pass

### 5. Settings proxy HTTP flow
expected: In the same `proxy.test.ts` integration run, GET/PUT/POST /api/settings/proxy* pass their full happy path plus 409 port conflict, 400 compose failure, idempotent second deploy, and 401 on every route without a session cookie.
result: pass

### 6. Live proxy-stack deploy on a real host
expected: On a dedicated or verified-clear Docker host with free host ports 80/443, deploy the proxy stack through the running app (POST /api/settings/proxy/deploy or the wizard). `docker ps` shows docktor-proxy-nginx and docktor-proxy-acme running; `docker network ls` shows a bare `docktor_proxy` network. The dashboard hides docktor-proxy while proxy.showInDashboard is off, and stop/restart/delete on it return 400.
result: pass

### 7. Certificate issuance on a real host
expected: With the proxy stack deployed and a domain assigned with TLS on, confirm Docktor can read the acme-companion-written cert files. A domain whose DNS does not point at the host shows "Cert failed" with a real acme-companion log line; a domain that does point at the host reaches "Secured".
result: skipped
reason: No real host with public DNS available for testing right now

### 8. Setup wizard step6 HTTP flow
expected: Run `yarn workspace @docktor/server test:integration test/integration/setup-wizard-flow.test.ts` on an unrestricted host with reachable Postgres. POST /api/setup/step6 validates input, rejects with 400 before an admin exists, deploys via handleWizardStep6, and is closed with 410 after the wizard completes.
result: pass

### 9. Full first-run wizard walkthrough
expected: On a fresh install with an empty database, click through the whole wizard in a browser. The Proxy step appears sixth (after Import). Skip reaches the dashboard with nothing deployed. Submitting with a real ACME email on a host with free ports 80/443 leaves two running proxy containers and lands on the dashboard.
result: pass

## Summary

total: 9
passed: 7
issues: 1
pending: 0
skipped: 1
blocked: 0

## Gaps

- gap_id: G-06-3
  truth: "Assigning a domain with an invalid hostname returns 400"
  status: failed
  reason: "User reported: proxy.test.ts > POST /api/stacks/:id/services/:serviceName/proxy > returns 400 for an invalid hostname — AssertionError: expected 201 to be 400 (received 201)"
  severity: major
  test: 3
  artifacts:
    - shared/src/validation/proxy.ts        # hostnamePattern regex + assignDomainSchema — verified correct, not the cause
    - shared/package.json                   # main: "dist/index.js" — server consumes the compiled artifact, not src
    - server/src/routes/proxy.ts            # route wiring — verified correct, not the cause
    - server/package.json                   # test/test:integration scripts — no pretest/prepare rebuild of @docktor/shared
    - package.json (root)                   # only build/build:server rebuild shared first; no prepare/postinstall hook
    - .planning/debug/assigning-a-domain-with-an-invalid-hostname-returns-400.md  # full investigation
  missing:
    - "A build-freshness guarantee for @docktor/shared before @docktor/server's test/test:integration scripts run (e.g. a pretest hook running `yarn workspace @docktor/shared build`, or resolving @docktor/shared to TS source in dev/test contexts) — without it, a stale/never-built shared/dist silently serves a more permissive (or entirely unvalidated) assignDomainSchema than what's in shared/src, letting invalid hostnames like 'not a hostname' pass validation and reach 201."
