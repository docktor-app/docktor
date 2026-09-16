---
created: 2026-09-16T00:00:00Z
title: Windows CI check fails on real platform bugs — blocks all merges to main
area: testing
severity: blocker
files:
  - server/src/lib/stacks-dir.ts
  - server/test/unit/lib/stacks-dir.test.ts
  - server/src/infrastructure/brownfield-scanner.ts
  - server/test/unit/infrastructure/brownfield-scanner.test.ts
  - server/src/jobs/proxy-cert-poller.ts
  - server/test/unit/jobs/proxy-cert-poller.test.ts
---

## Problem

Phase 09 plan 02 added a `cross-platform-unit` CI job (windows-latest +
macos-latest matrix) and made both platforms required status checks on the
`main` branch protection rule (D-07). The first real run
(https://github.com/raphaelmue/docktor/actions/runs/35063784652, draft PR
#6) found `cross-platform-unit (windows-latest)` genuinely red — not a CI
config flake, not the Pitfall-5 zero-tests signature (the server unit
tests step ran for a real 10 seconds, 06:32:50Z–06:33:00Z) — but three
real, previously-uncaught Windows platform bugs:

1. **`server/test/unit/lib/stacks-dir.test.ts`** (failing assertions at
   lines 212, 265, 284, 341, 363) — the mount-point detection logic
   assumes POSIX `/proc/mounts`-style parsing and cannot find a
   Windows-style drive path such as `D:\opt\docktor\stacks`.
2. **`server/test/unit/infrastructure/brownfield-scanner.test.ts`**
   (failing assertions at lines 95, 141, 153, 166, 182) — path
   normalization assumes POSIX separators (observed failure:
   `expected '\opt\myapp' to be '/opt/myapp'`), with a related
   duplicate-stack-detection miscount downstream of the same path-format
   assumption.
3. **`server/test/unit/jobs/proxy-cert-poller.test.ts`** (failing
   assertion at line 120) — a mock-call assertion failure
   (`expected "vi.fn()" to be called with... Number of calls: 0`), likely
   a timezone/date-comparison sensitivity. Not yet root-caused.

Because `cross-platform-unit (windows-latest)` is a required check
(D-07) and there was no exemption carved out for it, **no pull request —
including the PR that added this very check (#6) — can currently merge to
`main`** until these are fixed or the check otherwise passes.
`cross-platform-unit (macos-latest)` passed cleanly (8s, real suite, no
failures), so this is Windows-specific.

Fixing these was explicitly out of scope for phase 09 plan 02, whose job
was only to add the CI job and make it required — not to make the
existing suites pass on a platform they were never previously run on. See
`.planning/todos/completed/2026-09-03-ci-has-no-windows-runner.md`'s
Resolution section for the full run details.

## Solution

For each of the three files:

1. **`stacks-dir.ts`** — make mount-point detection platform-aware (e.g.
   branch on `process.platform === 'win32'` and either skip
   `/proc/mounts`-based detection or use an equivalent Windows signal),
   or normalize both the target path and the parsed mount source to a
   common comparable form before matching.
2. **`brownfield-scanner.ts`** — normalize path separators (e.g. via
   `path.posix` conversion or a shared `toPosixPath()` helper) before
   comparing/asserting expected path strings, so scan results are
   platform-independent; re-check the duplicate-stack-detection logic
   once separator normalization is fixed, since the miscount may resolve
   as a side effect.
3. **`proxy-cert-poller.ts`** — root-cause the zero-calls assertion
   failure; likely candidates are a `Date`/timezone comparison that
   differs on the Windows runner's default locale/timezone, or a mock
   setup that behaves differently under Windows' event-loop timing.
   Investigate with the actual CI run logs before guessing further.

Re-run the `cross-platform-unit (windows-latest)` check (push to this
branch or open a new PR) after each fix to confirm; all three failures
should be fixed together before the check is expected to go green, since
partial fixes still leave `main` unmergeable.
