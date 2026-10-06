---
phase: 12-compose-safety-and-templates
plan: 02
subsystem: api
tags: [strategy-pattern, yaml, compose, validation, rule-engine, zod]

requires:
  - phase: 12-compose-safety-and-templates
    provides: "12-01's review-before-apply gate (ComposeReviewService, DiffConfirmDialog) — the UI surface 12-05 will attach these findings to"
provides:
  - "server/src/infrastructure/compose-rule-engine.ts — ComposeRuleEngine (evaluate, ruleDescriptors) + composeRuleEngine singleton"
  - "server/src/application/ports/compose-rule-engine-port.ts — ComposeRuleEnginePort, ComposeRuleSeverity, ComposeRuleContext, ComposeFinding, ComposeEvaluation, ComposeRuleDescriptor"
  - "server/src/infrastructure/compose-rules/registry.ts — BUILT_IN_COMPOSE_RULES (6 rules, D-11 severity order)"
  - "server/src/infrastructure/compose-rules/*.ts — Rule interface + 6 rule classes (privileged, dockerSocket, bindOutsideStack, namedVolume, inlineEnv, missingEnvFile)"
  - "shared/src/validation/settings.ts — COMPOSE_RULE_IDS, CONFIGURABLE_COMPOSE_RULE_IDS, composeCheckSettingsSchema"
  - "ComposeAnalyzer extensions: BindMountInfo.index, ~-prefixed path classification, list-form inline env detection"
affects: [12-05, 12-06, 12-08]

actuals:
  tokens: 16136
  tasks: 2
  commits: 2
  plan_head_before: 037edbc0aa95807aa76fabd222e98c0b227e0647
  plan_head_after: 394991b51fbbfe18d0ab55673a4f1aa72d7c106b

tech-stack:
  added: []
  patterns:
    - "D-12 Strategy-pattern rule registry: every compose check is its own class implementing Rule {id, severity, configurable, check(doc, context)}, registered by one line in BUILT_IN_COMPOSE_RULES — adding a built-in rule is a one-file change plus one registration line"
    - "configurable: boolean declared explicitly on every rule (assumption-delta Signal 2, promoted) — the engine applies one filter (!rule.configurable || enabled.has(rule.id)) to all rules, never a special-cased subset"
    - "Segment-boundary-aware path containment (compose-document.ts's isWithinDirectory/resolveHostPath) via path.relative, never string-prefix matching — posix/win32 flavour chosen from the directory argument's own form"
    - "ComposeRuleEngine locates each finding's YAML line by walking the yaml Document's raw Pair/item tree along the finding's path after parsing with merge-key support enabled — a value only present through a `<<` merge key is still flagged (engine sees the resolved plain-JS doc) but carries line: null (no literal pair exists to point at)"

key-files:
  created:
    - server/src/application/ports/compose-rule-engine-port.ts
    - server/src/infrastructure/compose-rule-engine.ts
    - server/src/infrastructure/compose-rules/rule.ts
    - server/src/infrastructure/compose-rules/compose-document.ts
    - server/src/infrastructure/compose-rules/registry.ts
    - server/src/infrastructure/compose-rules/privileged-rule.ts
    - server/src/infrastructure/compose-rules/docker-socket-rule.ts
    - server/src/infrastructure/compose-rules/bind-outside-stack-rule.ts
    - server/src/infrastructure/compose-rules/named-volume-rule.ts
    - server/src/infrastructure/compose-rules/inline-env-rule.ts
    - server/src/infrastructure/compose-rules/missing-env-file-rule.ts
  modified:
    - shared/src/validation/settings.ts
    - server/src/infrastructure/compose-analyzer.ts

key-decisions:
  - "Severity names are 'danger' (always-on, red) and 'warning' (configurable, yellow) per the plan — PATTERNS.md's earlier draft name 'blocking-style' was deliberately not used; nothing in this phase blocks (#20: all checks warn, none block)"
  - "resolveHostPath expands a leading '~' to the real home directory (os.homedir()) rather than leaving it as a literal path segment — joining it against the stack directory unresolved would lexically land inside the stack directory and be misclassified as contained"
  - "InlineEnvRule determines object- vs list-form from the raw service definition (via compose-document's serviceEntries), not from the shape of ComposeAnalyzer's output, so it can compute the correct path (key vs list index) for each finding"
  - "DOCKER_SOCKET_PATHS is exported from docker-socket-rule.ts and reused by bind-outside-stack-rule.ts so a Docker-socket mount is never double-reported as 'outside the stack directory' too"

requirements-completed: ["#20"]

coverage:
  - id: D1
    description: "D-12 rule registry: every compose check is its own class implementing one shared Rule interface, registered by exactly one line in BUILT_IN_COMPOSE_RULES"
    requirement: "#20"
    verification:
      - kind: unit
        ref: "server/test/unit/infrastructure/compose-rule-engine.test.ts#the default engine's ruleDescriptors ids exactly match COMPOSE_RULE_IDS, in order"
        status: pass
      - kind: other
        ref: "grep -c 'new .*Rule()' server/src/infrastructure/compose-rules/registry.ts -> 6"
        status: pass
    human_judgment: false
  - id: D2
    description: "configurable: boolean is a first-class property on every rule; the engine filters by that property and the enabled set with no special-cased subset"
    requirement: "#20"
    verification:
      - kind: unit
        ref: "server/test/unit/infrastructure/compose-rule-engine.test.ts#filters configurable rules by the enabled set while always-on rules keep running"
        status: pass
      - kind: unit
        ref: "server/test/unit/infrastructure/compose-rule-engine.test.ts#the default engine's configurable ids exactly match CONFIGURABLE_COMPOSE_RULE_IDS"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-11 data: privileged/dockerSocket/bindOutsideStack are always-on danger; namedVolume/inlineEnv/missingEnvFile are configurable warning"
    requirement: "#20"
    verification:
      - kind: unit
        ref: "server/test/unit/infrastructure/compose-rules/privileged-rule.test.ts, docker-socket-rule.test.ts, bind-outside-stack-rule.test.ts, named-volume-rule.test.ts, inline-env-rule.test.ts, missing-env-file-rule.test.ts#declares its D-12/D-11 shape"
        status: pass
    human_judgment: false
  - id: D4
    description: "Each of the six #20 checks produces a finding under the documented conditions (privileged true/\"true\", Docker-socket short/long/Windows-pipe form, bind mount outside the stack directory, named volumes, inline env object+list form, missing env_file)"
    requirement: "#20"
    verification:
      - kind: unit
        ref: "server/test/unit/infrastructure/compose-rules/*.test.ts (41 tests across 6 rule files)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Probe #20 adjacency: bind-mount containment is segment-boundary-aware (path.relative), never string-prefix matching"
    requirement: "#20"
    verification:
      - kind: unit
        ref: "server/test/unit/infrastructure/compose-rules/compose-document.test.ts#classifies a sibling directory with a shared prefix as outside"
        status: pass
      - kind: other
        ref: "grep -c 'startsWith(directory\\|startsWith(stackDirectory' server/src/infrastructure/compose-rules/compose-document.ts -> 0"
        status: pass
    human_judgment: false
  - id: D6
    description: "Probe #20 empty/ordering: zero-service/empty/scalar documents return [] without throwing; findings are returned in rule-registration order then service-declaration order; repeated evaluations are deep-equal"
    requirement: "#20"
    verification:
      - kind: unit
        ref: "server/test/unit/infrastructure/compose-rule-engine.test.ts#returns [] without throwing for an empty services object / empty document / bare YAML scalar / returns findings in rule-registration order, then service-declaration order / is deterministic across repeated evaluations"
        status: pass
    human_judgment: false
  - id: D7
    description: "Merge keys/anchors are resolved before rules run; a finding whose node can't be located (inherited via merge key) carries line: null"
    requirement: "#20"
    verification:
      - kind: unit
        ref: "server/test/unit/infrastructure/compose-rule-engine.test.ts#carries line: null for a finding whose value is only present through a merge key"
        status: pass
    human_judgment: false
  - id: D8
    description: "Every finding carries the 1-based line of the offending YAML key/item"
    requirement: "#20"
    verification:
      - kind: unit
        ref: "server/test/unit/infrastructure/compose-rule-engine.test.ts#attaches the 1-based line of the offending YAML key to a located finding"
        status: pass
    human_judgment: false
  - id: D9
    description: "No runtime plugin-loading mechanism — the registry is a hardcoded array of in-repo classes"
    requirement: "#20"
    verification:
      - kind: unit
        ref: "server/test/unit/infrastructure/compose-rule-engine.test.ts#no file under compose-rules/ or compose-rule-engine.ts loads code dynamically (D-12 no-plugin-loading prohibition)"
        status: pass
    human_judgment: false

duration: ~15min
completed: 2026-10-02
status: complete
---

# Phase 12 Plan 2: Compose-check Strategy-pattern rule engine Summary

**D-12 Strategy-pattern compose-rule engine — six built-in rules (privileged, dockerSocket, bindOutsideStack, namedVolume, inlineEnv, missingEnvFile) behind one `Rule` interface, a hardcoded registry, and a `ComposeRuleEngine` that parses YAML with merge-key support and attaches each finding's source line.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-10-02T14:4x (approx, from first task commit)
- **Completed:** 2026-10-02T14:57:10+02:00
- **Tasks:** 2/2
- **Files modified:** 22 (across 2 commits)

## Accomplishments

- Built the D-12 Strategy-pattern rule engine end to end: `Rule` interface → `BUILT_IN_COMPOSE_RULES` registry → `ComposeRuleEngine.evaluate()` → located `ComposeFinding[]`, behind a new `ComposeRuleEnginePort`.
- All six #20 checks now exist as registered rules with the D-11 severity split encoded as data: `privileged`, `dockerSocket`, `bindOutsideStack` are always-on `"danger"`; `namedVolume`, `inlineEnv`, `missingEnvFile` are configurable `"warning"`.
- `ComposeRuleEngine` parses with YAML merge-key support, filters rules by `configurable` + an enabled-id set (one filter, no special-cased subset — assumption-delta Signal 2 promoted), and locates each finding's 1-based source line by walking the parsed `yaml` `Document`'s raw node tree — a value only present through a `<<` merge key is still flagged but carries `line: null`.
- `compose-rules/compose-document.ts`'s `isWithinDirectory`/`resolveHostPath` implement segment-boundary-aware bind-mount containment (`path.relative`-based, posix/win32 flavour-aware) — proven against the probe #20 adjacency case (`/stacks/foo-evil` is never misclassified as inside `/stacks/foo`) and a `~`-prefixed home-relative path (expanded to the real home directory, never joined as a literal path segment).
- `ComposeAnalyzer` gained three backward-compatible extensions the new rules need: `BindMountInfo.index` (position in the service's volumes list), `~`-prefixed host paths classified `"absolute"`, and list-form (`- KEY=value`) inline env var detection — all existing `compose-analyzer.test.ts`/`brownfield-scanner.test.ts` expectations still pass unchanged.
- `shared/src/validation/settings.ts` gained `COMPOSE_RULE_IDS`/`CONFIGURABLE_COMPOSE_RULE_IDS`/`composeCheckSettingsSchema`, pinned by a consistency test against the engine's own `ruleDescriptors` — a future configurable rule cannot ship without its settings key.

## Task Commits

Each task was committed atomically:

1. **Task 1: Engine tracer — privileged rule through port → rule → registry → engine → line location** - `dbd18a1` (feat)
2. **Task 2: The other five rules + analyzer extensions + registry/settings consistency** - `394991b` (feat)

**Plan metadata:** pending (this commit)

## Files Created/Modified

- `shared/src/validation/settings.ts` - `COMPOSE_RULE_IDS`, `CONFIGURABLE_COMPOSE_RULE_IDS`, `composeCheckSettingsSchema`
- `server/src/application/ports/compose-rule-engine-port.ts` - `ComposeRuleEnginePort`, `ComposeRuleSeverity`, `ComposeRuleContext`, `ComposeFinding`, `ComposeEvaluation`, `ComposeRuleDescriptor`
- `server/src/infrastructure/compose-rule-engine.ts` - `ComposeRuleEngine` (evaluate, ruleDescriptors, line location) + `composeRuleEngine` singleton
- `server/src/infrastructure/compose-rules/rule.ts` - `Rule`, `RuleFinding`
- `server/src/infrastructure/compose-rules/compose-document.ts` - `asRecord`, `serviceEntries`, `isWithinDirectory`, `resolveHostPath`
- `server/src/infrastructure/compose-rules/registry.ts` - `BUILT_IN_COMPOSE_RULES` (6 rules, D-11 order)
- `server/src/infrastructure/compose-rules/privileged-rule.ts`, `docker-socket-rule.ts`, `bind-outside-stack-rule.ts`, `named-volume-rule.ts`, `inline-env-rule.ts`, `missing-env-file-rule.ts` - the six rule classes
- `server/src/infrastructure/compose-analyzer.ts` - `BindMountInfo.index`, `~`-prefixed absolute classification, list-form inline env detection
- Test files: `server/test/unit/infrastructure/compose-rule-engine.test.ts`, `server/test/unit/infrastructure/compose-rules/*.test.ts` (new, one per rule + compose-document), `server/test/unit/infrastructure/compose-analyzer.test.ts` (extended)

## Decisions Made

- **Severity naming:** used `"danger"`/`"warning"` per the plan's explicit instruction, not PATTERNS.md's earlier draft name `"blocking-style"` — nothing in this phase blocks.
- **`~` path resolution:** `resolveHostPath` expands a leading `~` to the real home directory (`os.homedir()`) before containment math, rather than leaving it as a literal segment that would lexically (and incorrectly) resolve inside the stack directory.
- **Docker-socket/bind-outside-stack de-duplication:** `DOCKER_SOCKET_PATHS` is exported from `docker-socket-rule.ts` and imported by `bind-outside-stack-rule.ts` so the same mount is never reported by both rules.
- **InlineEnvRule path computation:** reads the service's raw `environment` value (via `compose-document.ts`'s `serviceEntries`) to decide whether a finding's path uses the object key or the list index, rather than trying to infer form from `ComposeAnalyzer`'s already-normalized output.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Task 1's engine doc comment duplicated the exact-count acceptance-criteria grep**
- **Found during:** Task 1, acceptance-criteria verification
- **Issue:** `compose-rule-engine.ts`'s module docstring quoted `merge: true` verbatim in prose, which doubled the plan's `grep -c 'merge: true'` count (expected exactly 1 — the real `parseDocument` call option, not an incidental doc mention). Same class of issue as 12-01's SUMMARY-documented docstring fixup.
- **Fix:** Reworded the doc comment to describe the behavior without repeating the literal option string; no code or behavior changed.
- **Files modified:** `server/src/infrastructure/compose-rule-engine.ts`
- **Committed in:** `dbd18a1` (Task 1 commit — caught before commit, not a separate fixup)

---

**Total deviations:** 1 auto-fixed (Rule 1, caught by the plan's own acceptance-criteria grep before committing)
**Impact on plan:** No scope creep — a docstring wording fix only, no behavior change.

## Issues Encountered

None. All `<verify>` automated commands (unit tests per task, `yarn typecheck`) and acceptance-criteria greps passed on the first full run after each task's implementation. The full `yarn workspace @docktor/server test:unit` suite (68 files, 1117 tests, including `layering.test.ts` and `brownfield-scanner*.test.ts`) and `yarn typecheck` both pass cleanly after both tasks.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `ComposeRuleEngine`, `composeRuleEngine` (singleton), `ComposeRuleEnginePort`, and the shared `COMPOSE_RULE_IDS`/`CONFIGURABLE_COMPOSE_RULE_IDS`/`composeCheckSettingsSchema` constants are the stable foundation plan 12-05 (review dialog findings + create-flow enforcement) and 12-08 (deploy-time re-check, D-09) build on, per the plan's own "Planning notes."
- `ComposeFinding.path`/`.line` are already shaped for the review dialog to anchor a finding next to its diff line (D-03) without any reshaping.
- No blockers. No flagged assumptions beyond what's already captured in the plan's `assumption_delta_decision` (Signal 2 promoted, now implemented and pinned by a consistency test).

---
*Phase: 12-compose-safety-and-templates*
*Completed: 2026-10-02*

## Self-Check: PASSED

All 11 created files and 2 modified files verified present on disk; both commits (`dbd18a1`, `394991b`) verified present in git history.
