---
name: docktor-issues
description: How Docktor tracks work in GitHub Issues (docktor-app/docktor) — use when capturing an idea/bug/chore (incl. /gsd-capture, which must create a GitHub issue here instead of a .planning todo), creating or triaging issues, setting Issue Type/labels/project fields, or linking plans and PRs to issues.
---

# Issue Tracking

Docktor tracks product work in **GitHub Issues** (`docktor-app/docktor`), not in `.planning/`. This is a deliberate split:

- **GitHub Issues = what and why.** Outcome-shaped, written from the user's perspective, the public interface of the project. Granularity: one issue a contributor could pick up. This is where features, bugs, chores, and docs work live.
- **`.planning/` = how.** GSD phases, plans, and technical sequencing for whoever (human or agent) is implementing an issue. Stays an implementation detail, may be far more granular than the issue it serves, and is not mirrored 1:1 with GitHub.

## Capturing new work (`gsd-capture` / `/gsd-capture`)

**Project-specific override:** the default GSD `add-todo` workflow writes to `.planning/todos/pending/*.md`. For this project, skip that — when a session surfaces a user-facing idea, bug, or chore worth tracking, create a GitHub issue directly instead:

```bash
gh issue create --repo docktor-app/docktor --title "[TYPE] Outcome-shaped title" --body-file <file> --label "area:<area>"
```

Then set the issue's **Issue Type** field (see below). The installed `gh` CLI (2.45.0) has no flag for this yet — set it via the GitHub UI, or via the GraphQL API:

```bash
gh api graphql -f query='mutation($issueId:ID!,$issueTypeId:ID!){
  updateIssueIssueType(input:{issueId:$issueId, issueTypeId:$issueTypeId}) { issue { number } }
}' -f issueId="<issue node id>" -f issueTypeId="<type node id>"
```

Get node IDs via `gh api repos/docktor-app/docktor/issues/<n> --jq .node_id` and `gh api orgs/docktor-app/issue-types --jq '.[] | {name,node_id}'`.

Use `.planning/todos/` (or a debug session, or an inline fix) only for things that are genuinely internal GSD micro-tasks — not something a contributor would ever pick up as a standalone unit of work (e.g., "reorder these two lines in a plan file"). If in doubt, it's a GitHub issue.

Before creating: search existing open issues (`gh issue list --repo docktor-app/docktor`) and extend/comment on a near-duplicate rather than opening a new one.

## Issue Type (native GitHub field — not a label)

The org has these Issue Types configured: **Bug**, **Feature**, **Chore**, **Documentation**, **Task**. Set the native type field on every new issue — do not encode type as a `[BUG]`/`[FEATURE]` title prefix or a `type:*` label; both predate the native field and are legacy on the handful of pre-existing issues that still carry them. Don't propagate that pattern to new issues.

## Labels

Use `area:*` labels to indicate the affected subsystem: `area:server`, `area:client`, `area:proxy`, `area:backup`, `area:templates`, `area:auth`, `area:ci`. Multiple areas may apply. Meta labels `good first issue`, `help wanted`, `needs-design`, `blocked` are available for triage signals.

## Project board & fields

All issues live on the **"docktor Feature & Roadmap"** project (org-level). Relevant fields:

- **Status**: `Backlog` → `Ready` → `In progress` → `In review` → `Done`. New issues start in `Backlog`.
- **Priority**, **Size**: set during milestone/roadmap planning, not at capture time.
- **Milestone**: the target release (currently `v0.1.0 - First Release`). Milestone assignment is a deliberate scoping decision, not automatic on creation — new issues are created unassigned.
- **Parent issue / sub-issues**: use GitHub's native sub-issue relationship (`gh api repos/{owner}/{repo}/issues/{number}/sub_issues`) to link a narrower issue under a broader epic instead of duplicating the epic's scope.

## Issue body format

```markdown
## Context
Why this matters, one short paragraph, from the user's point of view.

## Acceptance criteria
- [ ] Observable, testable statements
- [ ] Each one checkable without reading the code

## Out of scope
What this issue deliberately does not cover, with a link to the follow-up if one exists.

## Notes
Technical constraints, affected workspaces, related issues.
```

Titles are imperative and outcome-shaped ("Show per-service health status on the dashboard"), not implementation-shaped ("Implement HealthCheckService").

## Linking implementation back to issues

Each `.planning/phases/*/PLAN.md` references the GitHub issue(s) it implements at the top. Each PR closes with `Closes #<n>` so the issue auto-closes on merge.
