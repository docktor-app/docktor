---
status: complete
phase: 12-compose-safety-and-templates
source: [12-VERIFICATION.md]
started: 2026-10-03T19:48:51.885Z
updated: 2026-10-04T12:55:00.000Z
---

## Current Test

[testing complete]

## Tests

### 1. Merged diff + warning dialog visual layout (D-03)
expected: Dialog shows the unified diff with the `privileged` finding anchored as a red badge directly under the diff line that introduced it, legible in both light and dark mode; "Keep Editing" preserves the edit, "Confirm & Apply" writes it.
result: issue
reported: "pass. However, leave some space between the findings or seperate them. Currently, this looks squashy. Also the text directly next to the check name is not that good. maybe wrap them in a card or structure them as a table."
severity: cosmetic

### 2. Template grid browse/search UX (D-07)
expected: Open `/stacks/create/templates`, search by name, filter by category. Card grid updates live as the user types/filters; empty search/filter state reads clearly; "Use Template" on a single-variant template goes straight to the prefilled create form, a multi-variant template opens the picker dialog.
result: skipped
reason: "Deferred follow-up: pass. However, I'd like to have some variables introduced like for container_name property. So user set the variable e.g. container-base-name to nextcloud and you will have nextcloud-server, nextcloud-db etc."

### 3. Real host-level, non-Docker port conflict (D-13 last-resort tier)
expected: The pre-deploy warnings banner reports the port as already in use by the host-level process (name + PID, or "unknown process" fallback) and the deploy proceeds either way (never blocked).
result: issue
reported: "No banner appeared, when deploying I'll only get an error since the port is already in use."
severity: blocker

### 3. Real host-level, non-Docker port conflict (D-13 last-resort tier)
expected: Bind a host port with a process outside Docker (e.g. a local `nc -l` or another non-containerized service), then deploy a Docktor stack whose compose file requests that same port. The pre-deploy warnings banner reports the port as already in use by that process (name + PID) when `ss`/`lsof` can resolve it, or falls back to an "unknown process" holder when it can't — and the deploy proceeds either way (never blocked).
result: [pending]

## Summary

total: 3
passed: 0
issues: 2
pending: 0
skipped: 1
blocked: 0

## Deferred Follow-Ups

- test: 2
  idea: "pass. However, I'd like to have some variables introduced like for container_name property. So user set the variable e.g. container-base-name to nextcloud and you will have nextcloud-server, nextcloud-db etc."
  deferred_at: 2026-10-04

## Gaps

- gap_id: G-12-1
  truth: "Dialog shows the unified diff with the `privileged` finding anchored as a red badge directly under the diff line that introduced it, legible in both light and dark mode; \"Keep Editing\" preserves the edit, \"Confirm & Apply\" writes it."
  status: resolved
  resolved_in: "ComposeFindingRow card layout (client/src/components/domain/stack/compose-finding-row.tsx)"
  reason: "User reported: pass. However, leave some space between the findings or seperate them. Currently, this looks squashy. Also the text directly next to the check name is not that good. maybe wrap them in a card or structure them as a table."
  severity: cosmetic
  test: 1
  root_cause: "Both finding-rendering blocks in DiffConfirmDialog use a bare `flex items-center gap-2` row — ComposeWarningBadge immediately followed by a plain `<span>` message — with no card/border/background/divider around or between rows. The anchored (inline, under-the-diff-line) block wraps multiple findings in only `space-y-1 py-1`, and the listed (\"Compose check warnings\") block uses only `space-y-2`; neither adds any surface, border, or divider to separate one finding from the next or from the monospace diff line it sits against, so stacked findings read as one squashed run of text. The badge and message also sit directly adjacent with only an 8px gap and no distinguishing typography, which is the second part of the complaint (\"text directly next to the check name is not that good\"). The UI-SPEC for this phase (12-UI-SPEC.md) never pinned a layout treatment for multiple findings beyond the badge color/copy contract — Dimension 2 (Visuals) was explicitly flagged non-blocking for \"no explicit visual-anchor declaration for ... the diff+warning dialog\" — so this was a known spec gap that execution carried through unaddressed, and 12-UI-REVIEW.md's later audit also did not catch this specific presentation issue (it flagged unrelated spacing-scale and font-weight nits in the same file)."
  artifacts:
    - path: "client/src/components/domain/stack/diff-confirm-dialog.tsx"
      issue: "Anchored-finding block (~lines 161-183, rendered as the `annotations` map passed to UnifiedDiffView) renders each finding as `<div className=\"flex items-center gap-2\"><ComposeWarningBadge .../><span className=\"text-xs\">{finding.message}</span></div>` inside an outer `space-y-1 py-1` wrapper — no border/background/divider separates stacked findings or separates the badge from the message."
    - path: "client/src/components/domain/stack/diff-confirm-dialog.tsx"
      issue: "Listed-findings block (~lines 209-223, the \"Compose check warnings\" section) renders each finding as `<div className=\"flex items-center gap-2 text-sm\">` with only `space-y-2` between rows — same flat, unseparated presentation as the anchored block, plus optional `line {n}` and `new` ToneBadge appended inline with no structure."
    - path: "client/src/components/common/unified-diff-view.tsx"
      issue: "Renders the passed-in annotation node directly beneath the diff line via a plain `<div data-diff-annotation-for={line.newLine}>{annotation}</div>` (~lines 86-88) with no padding/border of its own, so whatever DiffConfirmDialog hands it sits flush against the monospace code line above — compounds the squashed appearance from the dialog's own markup."
  missing:
    - "Wrap each finding row — both the inline diff-anchored block (diff-confirm-dialog.tsx ~161-183) and the \"Compose check warnings\" listed block (~209-223) — in a bordered/surfaced container (e.g. `rounded-md border p-2`) instead of a bare flex row, so each finding is visually separated from the diff code line and from neighboring findings."
    - "Replace the `space-y-1`/`space-y-2` gaps with real row separation (a `divide-y` between findings, or larger gap plus padding) so multiple findings stacked in the same section no longer read as one squashed block."
    - "Give `finding.message` its own visual treatment distinct from the adjacent `ComposeWarningBadge` label (e.g. message on its own line below the badge, or `text-muted-foreground` plus clearer spacing) so the message isn't read as a run-on continuation of the badge text."
    - "Consider the user's explicit suggestion of a table layout (rule | message | line) for the listed-findings block, since each row already carries badge + message + optional line number + optional \"new\" badge — a table would organize that more clearly than a flex row."
    - "Re-verify the new treatment in both light and dark mode per CLAUDE.md's dark-mode rule, since any added border/background utility classes need `dark:` counterparts."
  debug_session: ""

- gap_id: G-12-2
  truth: "The pre-deploy warnings banner reports the port as already in use by the host-level process (name + PID, or \"unknown process\" fallback) and the deploy proceeds either way (never blocked)."
  status: resolved
  resolved_in: "SocketInspector host-namespace helper-container probe (server/src/infrastructure/socket-inspector.ts)"
  reason: "User reported: No banner appeared, when deploying I'll only get an error since the port is already in use."
  severity: blocker
  test: 3
  root_cause: "Two independent facts combine to produce the observed behavior. (1) No banner: SocketInspector's `ss`/`lsof` shell-out runs inside the Docktor server's own container, which docker-compose.yml places on the default bridge network (no `network_mode: host`/`pid: host`) — confirmed during 12-RESEARCH.md as 'Pitfall 1' and accepted as a known limitation rather than solved. Each container gets an isolated network namespace, so `ss`/`lsof` run from inside Docktor's container can only ever see Docktor's own sockets, never a genuinely host-level (non-Docker) process's. Critically, `resolveListenerHolder()` in port-conflicts.ts only emits `{kind: \"unknown\"}` when a `SocketListener` entry *exists* for the requested port with `processName`/`pid` null (e.g. permission denied reading /proc) — when SocketInspector never reports a listener for that port at all (the actual case here, because the port is outside Docktor's netns), there is no listener object to match against, so the tier-3 resolver returns `null` and `resolvePortConflicts()` emits no conflict whatsoever for that port. The socket-inspector.ts header comment's claim that the caller 'falls through to reporting unknown process' is therefore inaccurate for this exact scenario — that fallback only covers 'tool ran but couldn't attribute a process', not 'tool couldn't see the socket at all'. Both DB tier (tier 1: other Docktor stacks) and container tier (tier 2: dockerode-visible containers) also legitimately find nothing, since the holder here is neither a Docktor stack nor any container. (2) Deploy 'errors out': deployStack() in stack-service.ts is not itself hard-blocking — it calls `runPreflight()` then always proceeds to `this.docker.up(id)` regardless of `portConflicts` (lines 444-518), exactly per D-14's 'warn, never block' contract. Because the host port is genuinely bound by another process, the real `docker compose up` fails at the Docker-daemon level ('bind: address already in use'); this is caught at line 467-470 and surfaces as a normal ERROR-status deployment failure with the raw Docker stderr as the message. This is expected, unavoidable Docker behavior (Docktor cannot start a container that successfully binds an already-held port), not a Docktor-side block — but because fact (1) suppressed any advance warning, the user experienced an unexplained failure rather than a predicted one, reading as 'blocked'."
  artifacts:
    - path: "server/src/domain/port-conflicts.ts"
      issue: "resolveListenerHolder() (lines 144-153) only returns a holder (including the `{kind: \"unknown\"}` fallback) when a `SocketListener` entry exists in `input.listeners` for the requested port/protocol. When SocketInspector reports zero listeners for that port (the real case for a socket outside Docktor's network namespace), the function returns `null` and the port gets no conflict entry at all — not even the 'unknown process' fallback the UAT truth expects."
    - path: "server/src/infrastructure/socket-inspector.ts"
      issue: "Header doc comment (lines ~1-14) documents the network-namespace limitation correctly but asserts the degraded case 'falls through to reporting unknown process' — this does not match resolveListenerHolder's actual behavior when no listener entry exists at all (see above); the comment overstates what tier 3 can provide in the standard containerized deployment."
    - path: "docker-compose.yml"
      issue: "Docktor's own service definition runs on the default bridge network (no `network_mode: host`/`pid: host`), which is the structural root cause of socket-tier blindness to any genuinely host-level, non-Docker-managed listening socket — already identified and accepted as a limitation in 12-RESEARCH.md's Pitfall 1 / Open Question 1, but the UAT test exercises exactly the scenario that acceptance leaves uncovered."
    - path: "server/src/application/stack-service.ts"
      issue: "deployStack() (lines 444-518) is confirmed NOT hard-blocking — docker.up() runs unconditionally after runPreflight(). The 'error' the user saw is Docker's own real port-bind failure for that service (caught at lines 467-470, surfaced as an ERROR-status deployment with the raw stderr message), not an application-level block. This is expected behavior once a real port collision exists; the defect is entirely in the missing advance warning (fact 1), not in deployStack's never-block logic."
  missing:
    - "Decide and implement a real fix for socket-tier visibility, since the current design (RESEARCH.md Open Question 1) explicitly declined a host-namespace helper container as 'materially bigger': either (a) run the ss/lsof probe via a short-lived container started through the already-mounted Docker socket with `--network host --pid host`, giving it real host visibility, or (b) replace/augment the probe with an actual port-bind attempt made through the host's Docker daemon (e.g. a throwaway container publish of the requested port) since dockerd itself runs in the host namespace and will fail exactly the way the real `docker compose up` eventually does — surfacing the same information before the real deploy attempt."
    - "Until a real visibility fix lands, close the silent-failure half of the gap explicitly: either relax/reword the UAT truth and UI copy to state plainly that tier-3 cannot see host-level sockets from inside Docktor's standard containerized deployment (so 'no banner' is not mistaken for 'port is free'), or add a distinguishable 'could not verify — port may already be in use' notice whenever a requested port has zero coverage from all three tiers in a non-dev deployment, rather than staying silent."
    - "Make server/src/infrastructure/socket-inspector.ts's header comment match actual behavior (or make resolveListenerHolder's behavior match the comment's claim) — today the comment promises an 'unknown process' degradation that the domain code structurally cannot produce when no listener entry exists for the port at all."
    - "Re-verify against the exact UAT reproduction once a fix is chosen: bind a host port with a non-Docker process (e.g. `nc -l`) outside the Docktor container, deploy a stack requesting that port, and confirm a banner appears (named process/PID, or an explicit fallback) before/while Docker's own bind failure occurs for that service."
  debug_session: ""
