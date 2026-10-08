---
phase: 14-health-uptime-and-disk-visibility
plan: 08
subsystem: ui
tags: [react, react-hook-form, zod, yaml, compose, health-probe, vitest, playwright]

requires:
  - phase: 14-health-uptime-and-disk-visibility
    provides: 14-01 shared/src/validation/health.ts module (this plan appends to it)
provides:
  - shared healthProbeSchema / healthProbeUrlSchema / healthProbeTimeoutSchema / healthProbeFormSchema with the amended D-05 loopback host guard, plus HEALTH_PROBE_* constants and types
  - client/src/lib/compose-health-probe.ts (readHealthProbes / setHealthProbe / removeHealthProbe over the yaml Document API)
  - HealthProbeForm section on the stack Config tab writing x-docktor.health-probe into the compose buffer
affects: [14-06 http probe engine (reuses the shared schema server-side), 14-07 stack overview, phase verification of ROADMAP criterion 1]

actuals:
  tokens: 19854
  tasks: 2
  commits: 2
plan_head_before: 3bee395cdd3105ab7c8fc47bcb91ffa0d9d9b1f8
plan_head_after: 94a1ad9cbfac45674bf467b9f14c662f9e1f582f

tech-stack:
  added: []
  patterns:
    - "Self-vs-external buffer write guard (lastEmittedRef doubles as the latest-known buffer so consecutive edits accumulate)"
    - "Compose edits through the yaml Document API; every writer is a no-op that returns the input string when the document cannot be edited safely"
    - "Async form validation re-reads the row after the await, so a blur racing a switch-off cannot leave stale errors"

key-files:
  created:
    - client/src/lib/compose-health-probe.ts
    - client/src/routes/app/stacks/components/health-probe-form.tsx
    - client/test/unit/lib/compose-health-probe.test.ts
    - client/test/unit/routes/stacks/health-probe-form.test.tsx
    - client/test/integration/health-probe.spec.ts
  modified:
    - shared/src/validation/health.ts
    - shared/test/unit/validation/health.test.ts
    - client/src/routes/app/stacks/components/config-tab.tsx
    - client/test/unit/routes/stacks/config-tab.test.tsx

key-decisions:
  - "readHealthProbes treats a missing, null or empty services key as ok:true with zero services; only a non-map services, a non-map root or a parse error is ok:false, so a service-less file shows the 'Add a service' copy rather than the YAML-error Alert"
  - "Writes happen on field blur or switch change (per the plan), not per keystroke; a row already matching the buffer, or an enabled row with no URL yet, writes nothing so a blur never dirties the compose file"
  - "setHealthProbe returns the input unchanged when x-docktor holds a non-map value, the service is missing or the YAML does not parse, rather than destroying data or throwing"
  - "The URL/timeout grid uses minmax(0,1fr) instead of 1fr so the URL column can shrink and a long URL scrolls inside its input"

patterns-established:
  - "Form-in-front-of-a-text-buffer: a section component edits a shared string buffer through pure helpers and re-seeds only on external changes"

requirements-completed: ["#23"]

coverage:
  - id: D1
    description: "The shared probe schema accepts only http/https URLs without userinfo on localhost, 127.0.0.1 or [::1], with the three documented URL messages and a whole-number 1-30 timeout; the form schema validates only enabled rows"
    requirement: "#23"
    verification:
      - kind: unit
        ref: "shared/test/unit/validation/health.test.ts#healthProbeSchema"
        status: pass
      - kind: unit
        ref: "shared/test/unit/validation/health.test.ts#healthProbeFormSchema"
        status: pass
    human_judgment: false
  - id: D2
    description: "A client helper reads, sets and removes the per-service x-docktor.health-probe block through the yaml Document API, preserving comments and sibling keys and pruning only an emptied x-docktor map"
    requirement: "#23"
    verification:
      - kind: unit
        ref: "client/test/unit/lib/compose-health-probe.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "The Config tab has an HTTP Health Probes section between Compose File and Environment Variables; enabling a probe and entering a valid URL writes the block into the compose buffer, and the existing Compose File Save opens the diff review with the block in the preview request"
    requirement: "#23"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/stacks/config-tab.test.tsx#renders the HTTP Health Probes section between Compose File and Environment Variables (D-01)"
        status: pass
      - kind: unit
        ref: "client/test/unit/routes/stacks/health-probe-form.test.tsx#writes the probe block into the buffer once, after a valid URL is typed and the field blurred"
        status: pass
      - kind: e2e
        ref: "client/test/integration/health-probe.spec.ts#enabling a probe writes x-docktor.health-probe into the compose buffer and Save opens the diff review"
        status: pass
    human_judgment: false
  - id: D4
    description: "Invalid URL, host, userinfo or timeout shows the documented inline message after blur and never writes to the buffer; switching a service off removes its probe and prunes an emptied x-docktor"
    requirement: "#23"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/stacks/health-probe-form.test.tsx#HealthProbeForm — edge states"
        status: pass
      - kind: unit
        ref: "client/test/unit/routes/stacks/health-probe-form.test.tsx#HealthProbeForm — switch off"
        status: pass
      - kind: e2e
        ref: "client/test/integration/health-probe.spec.ts#a non-container host shows the inline error and never reaches the compose buffer"
        status: pass
    human_judgment: false
  - id: D5
    description: "The form tells its own buffer writes apart from external code-editor edits: typing never duplicates text or loses keystrokes, consecutive edits accumulate, external edits re-seed"
    requirement: "#23"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/stacks/health-probe-form.test.tsx#HealthProbeForm — two-way sync with the buffer (11-12 regression class)"
        status: pass
    human_judgment: false
  - id: D6
    description: "A buffer that does not parse swaps the form for the documented Alert, and a file with no services shows the documented empty copy"
    requirement: "#23"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/stacks/health-probe-form.test.tsx#replaces the form with the YAML-error Alert and never writes while the buffer does not parse"
        status: pass
      - kind: unit
        ref: "client/test/unit/routes/stacks/health-probe-form.test.tsx#shows the no-services message and no rows for a compose file without services"
        status: pass
    human_judgment: false
  - id: D7
    description: "A long probe URL scrolls horizontally inside its input at phone width instead of wrapping, and the section renders correctly in light and dark at desktop and phone width"
    requirement: "#23"
    verification:
      - kind: e2e
        ref: "client/test/integration/health-probe.spec.ts#a long probe URL scrolls inside its input at phone width instead of wrapping or overflowing the page"
        status: pass
    human_judgment: true
    rationale: "Scroll behaviour is asserted by script at 412px and the section was reviewed from scripted Edge screenshots (light and dark, 1280px and 412px) by the executor, but a person has not looked at it (the plan's human-check). Recorded in .planning/WINDOWS.md."

duration: 19min
completed: 2026-10-08
status: complete
---

# Phase 14 Plan 08: HTTP health probe configuration Summary

**An `HTTP Health Probes` section on the stack Config tab that writes a per-service `x-docktor.health-probe {url, timeout}` block into the compose buffer through the yaml Document API, validated by a shared Zod schema that restricts the probe host to localhost, 127.0.0.1 and [::1]**

## Performance

- **Duration:** 19 min
- **Started:** 2026-10-08T08:11:49Z
- **Completed:** 2026-10-08T08:31:05Z
- **Tasks:** 2 (1 tracer, 1 auto)
- **Files modified:** 9 (5 created, 4 modified)

## Accomplishments
- Shared `healthProbeSchema` (the YAML block), `healthProbeFormSchema` (string-field form rows, only enabled rows validated) and the `HEALTH_PROBE_*` constants, appended to `shared/src/validation/health.ts` with 14-01's exports untouched. This is the schema 14-06 re-applies server-side (amended D-05 SSRF guard). Each failure carries exactly one UI-SPEC message: invalid or non-http(s) URL, userinfo, non-container host, timeout out of 1-30.
- `compose-health-probe.ts`: pure read/set/remove over the yaml Document API. Comments, quoting and sibling keys survive; removal prunes `x-docktor` only when it is left an empty map; every writer returns the input untouched when it cannot edit safely.
- `HealthProbeForm` (react-hook-form + `standardSchemaResolver`) mounted in `ConfigTab` between two Separators, with no Save of its own: the existing Compose File Save is the only save, so probe edits go through `DiffConfirmDialog`. `use-stack-config-files.ts` and `diff-confirm-dialog.tsx` are untouched.
- The `lastEmittedRef` guard separates the form's own writes from code-editor edits. A regression test round-trips the form's output back in as `composeContent` and types a URL, confirming no duplication or lost keystrokes.
- Edge states: YAML-error Alert replaces the form (nothing can write), the no-services copy, inline errors after blur, switch-off pruning.
- Tracer gate: `Tracer verified end-to-end - expanding` (shared and client unit sets, `yarn typecheck` and Playwright all passed before Task 2 started).

## Task Commits

1. **Task 1: End-to-end probe config (tracer)** - `a627be0` (feat)
2. **Task 2: Probe form edge states and sync safety** - `94a1ad9` (feat)

**Plan metadata:** committed separately (docs: complete plan)

_Note: tests were written before the implementation in both tasks and RED was observed (shared schema: 36 failing; helper: module missing; Task 2: 6 failing). They landed in the same commit as the implementation because CLAUDE.md forbids committing failing tests._

## Files Created/Modified
- `shared/src/validation/health.ts` - probe constants and schemas
- `client/src/lib/compose-health-probe.ts` - YAML read/set/remove helpers
- `client/src/routes/app/stacks/components/health-probe-form.tsx` - the section component (`HealthProbeForm`, plus a private `ProbeRow`)
- `client/src/routes/app/stacks/components/config-tab.tsx` - mounts the section between the two Separators
- `shared/test/unit/validation/health.test.ts`, `client/test/unit/lib/compose-health-probe.test.ts`, `client/test/unit/routes/stacks/health-probe-form.test.tsx`, `client/test/unit/routes/stacks/config-tab.test.tsx` - unit and regression tests
- `client/test/integration/health-probe.spec.ts` - three e2e cases (preview request carries the block, host error blocks the write, long URL at 412px)

## Decisions Made
See `key-decisions` above. The notable one: a compose file with no `services` key is "no services yet", not "unparseable".

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stale inline error after a blur raced a switch-off**
- **Found during:** Task 2 (regression test for switch-off)
- **Issue:** Focus in the Timeout field, then clicking the switch: the blur fires before the click and starts an async validation. Its result landed after the switch-off had cleared errors, so switching the row back on showed an error on an empty URL, contradicting "errors appear after blur, not before".
- **Fix:** `commitRow` re-reads the row after the awaited validation. A row that is no longer enabled has its errors cleared; a missing row is ignored.
- **Files modified:** `client/src/routes/app/stacks/components/health-probe-form.tsx`
- **Verification:** `does not resurrect a stale error when an empty row is switched off and on again`
- **Committed in:** 94a1ad9

**2. [Rule 1 - Bug] Controlled/uncontrolled Switch warning when an external edit adds a service**
- **Found during:** Task 2, in the full client suite run (stderr)
- **Issue:** For one render after an external edit adds a service, that row's index has no form value (the re-seed effect runs after paint), so `checked` was `undefined`.
- **Fix:** `checked={field.value ?? false}`, with a comment.
- **Files modified:** `client/src/routes/app/stacks/components/health-probe-form.tsx`
- **Verification:** full client suite prints no `uncontrolled` warning
- **Committed in:** 94a1ad9

**3. [Rule 3 - Blocking] Playwright browsers are not installed on this machine**
- **Found during:** Task 1 verify (same as 14-03 deviation 2)
- **Issue:** the canonical `yarn workspace @docktor/client test:integration ...` cannot launch a browser.
- **Fix:** No browser was downloaded. The specs were run against the system Edge through a throwaway config kept outside the repository (it imports the project's `playwright.config.ts` and only adds `channel: "msedge"`). Nothing in the repo changed for this.
- **Verification:** `health-probe`, `config-unsaved-changes` and `stacks` specs: 25 passed, no "Unstubbed API request(s)" error.
- **Follow-up:** run the canonical command once after `yarn playwright install chromium` (recorded in `.planning/WINDOWS.md`).

### Plan refinements (not bugs)

**4. `readHealthProbes` semantics for a missing `services` key.** The plan says "`services` is not a map" is `ok: false`. Taken literally, a compose file with no `services` key (or an empty file) would show the YAML-error Alert, contradicting the documented no-services state. A missing, null or empty `services` is `ok: true` with zero services; a sequence or scalar `services`, a non-map root and parse errors (including duplicate keys) remain `ok: false`.

**5. Grid track `minmax(0,1fr)` instead of `1fr`.** Lets the URL column shrink so a long URL scrolls inside its input at phone width.

**6. "Passes on both Playwright projects" (scope note).** The `mobile-chromium` project matches only `mobile.spec.ts` (`testMatch`), so a new spec cannot run there without editing `playwright.config.ts`, which was out of scope (same as 14-03). The spec runs on the `chromium` project; the phone-width case sets a 412px viewport itself. The 14-03 note about the same limitation applies.

---

**Total deviations:** 3 auto-fixed (2 bug, 1 blocking) plus 3 plan refinements/scope notes
**Impact on plan:** No scope change. One real race and one React warning were caught by the new tests before they shipped.

## Issues Encountered
- `eslint` is not installed in this workspace, so lint was not run; `yarn typecheck` (`tsc --build`) is clean.
- Vite logs `http proxy error: /api/events` (ECONNREFUSED) during Playwright runs; the route is stubbed by `fixtures.ts` and the line is dev-server noise that predates this plan.
- Two of my own first-draft assertions in the Task 2 tests were wrong (a regex that also matched the field description; two cases that ignored that a valid URL blurred before an invalid timeout is legitimately written). They were corrected, not the component.
- Two of the typing-heavy regression tests exceeded vitest's 5s default once under the full-suite load. The per-character `user.type` loop was replaced by a single `user.type` call (still one keystroke at a time), and the full suite then passed (86 files, 788 tests).
- Out of scope, logged in `deferred-items.md`: a long single line in the compose editor widens the whole Config page at desktop width (1536px scroll width at a 1280px viewport) even with no probe configured. The probe URL input itself scrolls in its own box.

## Known Stubs
None.

## Known Gaps
- Human visual check of the section in light and dark at desktop and Pixel 7 width was done by script and by the executor reading screenshots, not by a person (recorded as `unrun-verify` in `.planning/WINDOWS.md`).
- Canonical Playwright command not run on a machine with browsers installed (deviation 3).
- Server-side re-application of the schema (T-14-27 defence in depth) belongs to 14-06 and is not part of this plan.
- Issue #23 text mentions an "expected status code" field; D-02 replaced it with "any 2xx/3xx is healthy", so the issue text should be updated when the phase closes.

## Threat Flags
None beyond the plan's register. T-14-27 (SSRF via probe host) is mitigated client-side by the shared schema and a blocked buffer write, covered by unit and e2e tests (`http://169.254.169.254/...` is rejected); the server-side half ships in 14-06. T-14-28 (compose integrity) is mitigated by the Document API, the self-write regression tests and the unchanged diff-confirm path. T-14-SC: no packages were installed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 14-06 can import `healthProbeSchema`, `HEALTH_PROBE_ALLOWED_HOSTS` and the timeout constants from `@docktor/shared` and apply them to `x-docktor.health-probe` read from disk.
- Open: install Playwright browsers and re-run the canonical e2e command; a person should glance at the section in both themes.

## Self-Check: PASSED

- All created files exist on disk (5 source/test files, plus 2 modified and 2 test files updated).
- Commits `a627be0` and `94a1ad9` are ancestors of HEAD; `git rev-list --count` from the ledger base reports 2.
- Task 1 acceptance re-run: `HEALTH_PROBE_ALLOWED_HOSTS` 2, `toString({lineWidth: 0})` 2, `<HealthProbeForm` 1, `lastEmittedRef` 6, no diff in `use-stack-config-files.ts` or `diff-confirm-dialog.tsx`.
- Task 2 acceptance re-run: YAML-error copy 1, no-services copy 1; self-write and external-edit regression cases present and passing; prune-only-when-empty and remove-without-probe covered in `compose-health-probe.test.ts`.
- Verification: shared health tests 46 passed; client unit suite 86 files / 788 tests passed; Playwright (system Edge) `health-probe`, `config-unsaved-changes`, `stacks` 25 passed; `yarn typecheck` clean.

---
*Phase: 14-health-uptime-and-disk-visibility*
*Completed: 2026-10-08*
