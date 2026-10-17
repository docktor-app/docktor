# Phase 11: UI Rework - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-24
**Phase:** 11-ui-rework
**Areas discussed:** Page structure & dialogs, Logs & status consistency, Visual polish, Mobile support scope, Compose/env editor

---

## Todo Folding (pre-discussion)

Before the gray-area discussion, 8 pending todos matching Phase 11's scope were presented. The user selected:

**Folded into scope:** Reusable-component audit, Service colors/tabs/mobile, Dashboard stat cards, Stack-level update badge, Update badge null-latestTag bug, Sophisticated YAML/env editor.
**Not folded (stay deferred):** Topology visualization, Upgrade dialog wrong message for moving tags.
**Added freeform:** Dark mode — not an existing todo, treated as a new gray area (Visual polish).

---

## Page Structure & Dialogs

| Question | Selected |
|---|---|
| Should the stack detail page keep a tab-based structure at all? | **Keep tabs, reorganize content** (over: single scrollable page; you decide) |
| With 6 tabs today (Overview/Compose/Environment/Logs/Backups/Proxy), should any be merged? | **Merge Compose + Environment into one Config tab** (over: keep all 6 separate; you decide) |
| How aggressively should Card wrapping be reduced? | **Flatten most sections, Cards only for true groupings** (over: minimal change; you decide) |
| Which add/edit flows should move into dialogs instead of inline forms? | **Proxy config, Backup schedule/restore config, Environment variable add/edit** (multi-select) — but see note below |

**Notes:** The user added a freeform note on the dialogs question: "Regarding the env variables: I'd like to switch between both." This was initially interpreted as inline-vs-dialog toggle, but clarified later in the Compose/env editor area (see below) to mean a **table-mode vs. raw-text-editor-mode** toggle, not a dialog at all. The dialog decision for env vars is superseded — env vars do not get a dialog.

---

## Logs & Status Consistency

| Question | Selected |
|---|---|
| How should the 3 separate log tables (Deployments/StatusLog/EventLog) on Overview be consolidated? | **Single unified timeline with type filter** (over: move all to Logs tab; you decide) |
| What does "consistent status-indicator sizing" mean in practice? | **You decide** — with a specific note: user wants a pulsing green dot (or similar animated indicator) for "running" status rather than a static badge |
| For the stack-level "update available" badge, where should it appear? | **Both stack list/dashboard row AND stack detail header** (matching the existing "config changed" badge exactly) |
| When a service's update badge has no latestTag (moving tag), what should it show? | **Distinct copy: "content updated" vs "update available → x.y.z"** (over: suppress badge entirely; you decide) |

---

## Visual Polish

| Question | Selected |
|---|---|
| How should per-service colors be assigned? | User was unsure; raised stack-level colors and category-based colors (media/files) as additional ideas. Category colors flagged as needing backend changes — deferred. |
| Follow-up: both stack + service colors now, auto-derived, or service only? | **Service colors only for now, stack colors later** |
| What should the redesigned dashboard stat cards show? | **Same 4 stats (Total/Running/Stopped/Errors) plus a couple more** (e.g. updates available, pending backups) |
| Dark mode: default and persistence? | **Follow system preference, manual override persisted** (next-themes standard pattern; next-themes already installed but unwired) |
| Where should the dark mode toggle live? | **Header/nav icon** (over: Settings page only; you decide) |

---

## Mobile Support Scope

| Question | Selected |
|---|---|
| How far should the mobile support pass go? | **Full responsive audit, component by component** (over: spot-fix worst breakage; you decide) |
| Any specific known mobile pain points, or fresh audit? | **Researcher should audit fresh** — no specific pain points flagged |

---

## Compose/Env Editor

| Question | Selected |
|---|---|
| Which editor library for the compose YAML editor? | **CodeMirror 6** (over: Monaco Editor; you decide) — smaller bundle, better fit for a self-hosted app |
| Should the compose editor validate/lint YAML as the user types? | **Basic YAML syntax validation only** (over: no inline validation; you decide) — no docker-compose-schema linting (separate, not-folded todo) |
| Env var editor: secret masking approach? | **Heuristic masking** — mask only values whose key looks like password/secret/key/token, not all values |
| Env var editing: dialog vs inline, clarified | User clarified they meant a **table-mode vs. raw-text-editor-mode toggle**, not a dialog. Inline editing within table mode is preferred over dialog-based editing. This supersedes the earlier "Environment variable add/edit" dialog answer from the Page Structure area. |
| Is the broader shadcn-consistency/component-architecture redesign included in this phase? | User asked for clarification — confirmed **yes**, this is the umbrella goal all 5 discussed areas feed into. Exact visual details (spacing/typography scale) are execution-time decisions for the researcher/planner, not further user gray areas. |

---

## Claude's Discretion

- Exact status-indicator sizing scheme, beyond the required pulsing-dot for "running"
- Exact additional dashboard stats beyond the required 4 + updates-available/pending-backups suggestions
- Exact mobile-audit findings and fix scope beyond "full component-by-component pass"
- Whether the merged Config tab needs internal sub-navigation or a simple stacked layout
- Whether the extracted `StatCard` belongs in `components/common/` or `components/domain/stack/`

## Deferred Ideas

- **Topology visualization** (graph view of stack/service relationships) — not folded, cosmetic severity, own future phase.
- **Upgrade dialog wrong message for moving-tag services** — not folded, correctness bug touching server code, not a structural/visual item.
- **Stack-level colors** — raised during discussion, explicitly deferred to a future phase.
- **Category-based color grouping** (media/files) — raised during discussion, needs new backend field/model, deferred.
