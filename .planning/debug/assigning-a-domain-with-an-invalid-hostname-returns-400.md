---
status: diagnosed
trigger: "G-06-3: Assigning a domain with an invalid hostname to a service's proxy config should return HTTP 400, but the integration test shows it returns 201 (the domain is accepted and a compose write happens) instead."
created: 2026-09-07T00:00:00Z
updated: 2026-09-07T00:00:00Z
---

## Current Focus

[diagnosis complete — goal: find_root_cause_only, stopping before fix_and_verify]

reasoning_checkpoint:
  hypothesis: "assignDomainSchema's own logic (hostnamePattern regex + Zod chain in shared/src/validation/proxy.ts) is correct and rejects the test's payload; the 201 is explained by server/src/routes/proxy.ts consuming @docktor/shared through its compiled dist/ build (package.json main: dist/index.js) with no build step wired into the server's test/test:integration scripts (nor a prepare/postinstall hook) — so whenever shared/dist/validation/proxy.js is stale relative to shared/src (never built, or built before the regex existed), the server silently validates with the stale, more permissive schema and accepts invalid hostnames."
  confirming_evidence:
    - "Direct regex test (node -e) proves hostnamePattern correctly rejects 'not a hostname' and accepts 'app.example.com' — the regex itself is correct as committed."
    - "A synthetic Fastify app using the real imported @docktor/shared assignDomainSchema + the real fastify-type-provider-zod validatorCompiler correctly returns 400 for the exact test payload."
    - "Importing the ACTUAL production server/src/routes/proxy.ts module (with only auth-middleware and application/index mocked) and hitting it via app.inject also correctly returns 400 for the exact test payload — ruling out any route-registration/hook-ordering bug in proxy.ts or app.ts."
    - "git log shows shared/src/validation/proxy.ts has exactly one commit ever (3e096c1, phase 06-01) and has been unchanged since — the regex was never absent at any committed point in history, so a 'test predates a fix' explanation is ruled out."
    - "shared/dist/ is gitignored (confirmed via .gitignore lines 14-17) and has no tracked/committed copy; no prepare/postinstall script exists at the root; server's package.json test/test:integration scripts do not depend on `yarn workspace @docktor/shared build` first (only the root build/build:server scripts do) — so shared/dist is whatever was last built on that machine, with no gate ensuring freshness before server tests run."
    - "DIRECT REPRODUCTION: manually replacing the committed-fresh shared/dist/validation/proxy.js with a version that drops only the `.regex(hostnamePattern, ...)` check (everything else identical) and re-running the exact same real-route test flips the result from 400 to 201 with body {id:'pc1', domain:'app.example.com'} — i.e., a stale/under-built shared/dist is a sufficient and exact mechanism to produce this precise symptom. File was restored immediately after and reconfirmed back to 400."
  falsification_test: "If the reported UAT run's shared/dist/validation/proxy.js (or shared/dist/index.js re-export chain) at the time of that run had contained the full current regex-bearing schema, this hypothesis would be false and validation would have correctly returned 400 there too — cannot be checked retroactively since dist/ is gitignored and not preserved from that run, but the reproduction above shows the mechanism is real and sufficient, not merely theoretical."
  fix_rationale: "N/A — find_root_cause_only mode, no fix applied. (For future fix: server's test/test:integration scripts, or a root pretest/prepare hook, should force `yarn workspace @docktor/shared build` — or the monorepo should resolve @docktor/shared straight to its TS source in test/dev contexts — before server tests run, so a stale compiled dependency can never silently weaken validation.)"
  blind_spots: "Could not execute the real DB-backed integration test (test/integration/proxy.test.ts) end-to-end in this sandbox to observe the literal 201 first-hand — testcontainers' `prisma db push` hangs with P1001 even against a manually-launched, health-checked Postgres container on a freshly published port; raw TCP connects succeed instantly but a real pg wire-protocol handshake (node-postgres Client.connect()) then hangs indefinitely, confirming this is the same pre-existing, already-documented (STATE.md, Phase 05.1-01) host-level TCP-payload-to-Docker-published-port block, not a repo defect. This means the 'stale shared/dist' explanation is the strongest evidence-backed mechanism, not a directly-witnessed cause of that exact original 201 — I cannot rule out with certainty that the specific machine which produced the UAT capture had, e.g., a différent unresolved edge case, though no other candidate survived testing."
  candidate_causes:
    - "config: shared workspace package resolves callers to a compiled dist/ artifact (package.json main field) with zero freshness/build guarantee before the consuming workspace's tests run — a monorepo build-pipeline gap (category: config)"
    - "code: none found in the validation/route code itself — hostnamePattern, assignDomainSchema, and routes/proxy.ts's wiring were all independently verified correct against the exact failing payload (category: code, ruled out)"
  and_gate: "no — a single missing build step (stale/never-built shared/dist) is sufficient on its own to reproduce the exact symptom; no second simultaneous condition is required. The code-layer candidate was actively tested and eliminated, leaving the config-layer cause as the sole confirmed mechanism."

hypothesis: CONFIRMED — root cause is a monorepo build-freshness gap (@docktor/server resolves @docktor/shared through its gitignored dist/ build, which nothing forces to be rebuilt before server test/test:integration runs)
next_action: none — return ROOT CAUSE FOUND to caller

## Symptoms

expected: POST /api/stacks/:id/services/:serviceName/proxy with an invalid hostname value for `domain` returns 400 Bad Request.
actual: Same request returns 201 Created — the invalid domain is accepted as if valid.
errors: |
  FAIL   test/integration  test/integration/proxy.test.ts > Proxy API > POST /api/stacks/:id/services/:serviceName/proxy > returns 400 for an invalid hostname
  AssertionError: expected 201 to be 400 // Object.is equality

  - Expected
  + Received

  - 400
  + 201

   ❯ test/integration/proxy.test.ts:132:36
      130|             });
      131|
      132|             expect(res.statusCode).toBe(400);
         |                                    ^
      133|         });
      134|
reproduction: Run `yarn workspace @docktor/server test:integration test/integration/proxy.test.ts` on a host with reachable Postgres. See the specific failing case "returns 400 for an invalid hostname" around line 132 of test/integration/proxy.test.ts.
started: Discovered during Phase 06 (proxy-configuration) UAT, test 3 (assignDomain / listByStack HTTP flow).

## Eliminated

- hypothesis: "hostnamePattern regex in shared/src/validation/proxy.ts fails to reject 'not a hostname' (some regex escaping/lookaround bug)"
  evidence: "node -e direct regex test: hostnamePattern.test('not a hostname') === false; hostnamePattern.test('app.example.com') === true. Regex is correct as written."
  timestamp: 2026-09-07T00:00:00Z

- hypothesis: "route-registration / hook-ordering bug in server/src/routes/proxy.ts or app.ts causes body-schema validation to be skipped or bypassed (e.g. requireAuth mutating body, onRequest short-circuit, route-path collision with stacks.ts)"
  evidence: "Imported the real server/src/routes/proxy.ts module (mocking only auth-middleware and application/index) into a Fastify app wired identically to app.ts (setValidatorCompiler(validatorCompiler) + setSerializerCompiler), sent the exact failing payload — got 400 with message 'body/domain Must be a valid hostname'. No other router registers an overlapping path (grepped stacks.ts for ':serviceName' — only 'tags' and 'upgrade' subpaths, no 'proxy' collision)."
  timestamp: 2026-09-07T00:00:00Z

- hypothesis: "duplicate/mismatched zod package versions across workspaces cause fastify-type-provider-zod's safeParse (from zod/v4/core) to not recognize assignDomainSchema as a valid $ZodType and silently skip validation"
  evidence: "yarn.lock shows a single hoisted zod@4.3.6 resolution shared by shared/server/client (only an unrelated zod@3.25.76 exists, scoped to the shadcn CLI devDependency, never touching server runtime)."
  timestamp: 2026-09-07T00:00:00Z

- hypothesis: "test predates the regex fix (schema was weaker when the UAT capture ran, later strengthened)"
  evidence: "git log --oneline -- shared/src/validation/proxy.ts shows exactly one commit ever (3e096c1, phase 06-01, 2026-09-04) — the .regex(hostnamePattern) check has been present unchanged since the file's creation, predating every later phase-06 commit including the UAT capture commit (fb54318)."
  timestamp: 2026-09-07T00:00:00Z

## Evidence

- timestamp: 2026-09-07T00:00:00Z
  checked: shared/src/validation/proxy.ts and shared/dist/validation/proxy.js (byte-for-byte comparison)
  found: Both contain the identical hostnamePattern regex and .regex(hostnamePattern, ...) check; dist mtime (00:45:55) is after src mtime (00:38:20), i.e. currently in sync.
  implication: On THIS checkout, the compiled artifact happens to be fresh — but nothing guarantees this stays true, since it's rebuilt manually, not via any test-time hook.

- timestamp: 2026-09-07T00:00:00Z
  checked: server/package.json scripts, root package.json scripts, shared/package.json, .gitignore
  found: shared/package.json main is "dist/index.js" (a compiled-output import, not source). server's "test"/"test:integration" scripts are plain `vitest run` with no pretest/prepare step. Root has no prepare/postinstall script. Only the root's "build"/"build:server" scripts explicitly run `yarn workspace @docktor/shared build` first. .gitignore excludes shared/dist/, server/dist/, client/dist/ — confirmed via `git ls-files shared/dist` returning nothing.
  implication: There is no mechanism — git-tracked artifact, build hook, or test hook — that guarantees @docktor/shared's compiled output is in sync with its source before @docktor/server's tests (including proxy.test.ts) run. A stale or never-built shared/dist is silently possible on any fresh clone or after any unbuilt edit to shared/src.

- timestamp: 2026-09-07T00:00:00Z
  checked: Attempted to run the real DB-backed test/integration/proxy.test.ts twice via `yarn workspace @docktor/server test:integration`, and separately via a manually docker-run Postgres container + direct `prisma db push` + a raw node-postgres Client.connect()
  found: Every attempt fails identically with Prisma P1001 ("Can't reach database server") despite `docker ps`/`pg_isready` confirming the container is healthy and a raw bash `/dev/tcp` / Node `net.connect()` TCP handshake to the same published port succeeding instantly; a real node-postgres wire-protocol Client.connect() to the same port then hangs indefinitely (never resolves, never rejects within timeout).
  implication: This sandbox has the same pre-existing, already-documented (STATE.md, Phase 05.1-01/05.1-05/05.1-06/06-01) host-level TCP-payload-to-Docker-published-port block. The real end-to-end integration test cannot be executed here; the root-cause finding below rests on isolated reproduction of the validation/routing layer, not a first-hand replay of the exact 201 response, which requires a human on an unrestricted host.

- timestamp: 2026-09-07T00:00:00Z
  checked: Deliberately edited (then restored) shared/dist/validation/proxy.js to drop only the `.regex(hostnamePattern, "Must be a valid hostname")` check (kept `.min(1).toLowerCase()`), leaving shared/src untouched, then re-ran the real-route reproduction test
  found: Result flipped from `400 {"error":"Validation error", message: "body/domain Must be a valid hostname"}` to `201 {"id":"pc1","domain":"app.example.com"}` — an exact match for the reported symptom shape (domain accepted, 201 returned). Restoring the original dist file immediately reproduced 400 again.
  implication: A stale/under-built shared/dist (missing the regex check specifically) is proven to be a sufficient, exact mechanism for this bug's symptom. Combined with the "Why not caught" evidence above (no build-freshness guarantee anywhere in the test pipeline), this is the most evidence-backed explanation for the UAT-reported 201, since every other layer (regex correctness, route wiring, zod version consistency, git history) was independently tested and ruled out.

## Resolution

root_cause: "@docktor/server imports assignDomainSchema from @docktor/shared, which resolves via shared/package.json's `main: dist/index.js` — a compiled, gitignored build artifact. Neither server's `test`/`test:integration` scripts, nor any root prepare/postinstall hook, rebuild @docktor/shared before running server tests (only the root `build`/`build:server` scripts do). When shared/dist/validation/proxy.js is stale relative to shared/src/validation/proxy.ts — e.g. never built on a fresh checkout, or built at an earlier point before/without the `.regex(hostnamePattern, ...)` hostname check — the server silently validates POST /api/stacks/:id/services/:serviceName/proxy request bodies against the stale, more permissive schema. This lets an invalid domain like 'not a hostname' pass validation, reach ProxyService.assignDomain(), and complete the full write path (ProxyConfig row + compose file write), producing 201 instead of the expected 400. The hostnamePattern regex itself, and every other layer of the route (auth middleware, hook ordering, route-path matching, zod version consistency across workspaces), were each independently verified correct and are not implicated."
fix: (not applied — find_root_cause_only mode)
verification: "Reproduced the exact symptom (201 instead of 400, same response shape) by simulating a stale shared/dist build; restored and reconfirmed correct 400 behavior. Could not replay the original failing DB-backed integration test end-to-end due to a pre-existing sandbox environmental block (Prisma P1001 / TCP-payload-block), documented separately in STATE.md and reconfirmed independently in this session."
files_changed: []
