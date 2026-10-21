# Phase 16: Release Readiness for v0.1.0 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-11
**Phase:** 16-release-readiness-for-v0-1-0
**Areas discussed:** License & CLA, Demo instance, Image publishing, Startup env validation, Documentation, README visuals, Community files

---

## License & CLA

| Option | Description | Selected |
|--------|-------------|----------|
| AGPL-3.0 | Keeps hosted-commercial option; some companies avoid AGPL | |
| MIT | Max adoption, simplest; closed hosted forks allowed | ✓ |
| Apache-2.0 | Permissive + patent grant | |

**User's choice:** MIT (after asking for a fuller explanation of the tradeoffs; Claude had recommended AGPL-3.0).
**Notes:** Copyright line "Docktor contributors"; no CLA/DCO (alternatives: personal name, org + DCO).

---

## Demo instance

| Option | Description | Selected |
|--------|-------------|----------|
| Mocked Docker backend | Safe to expose; new code behind a demo flag | |
| Real Docker, sandboxed | Real behavior, riskiest and costliest | |
| Pre-recorded only | README GIF/screenshots, no live demo | ✓ |

**User's choice:** Pre-recorded only → follow-up: defer #53 past v0.1.0 (alternatives: keep #53 as last item with mocked demo; reinterpret as interactive recording).
**Notes:** Conflicts with roadmap success criterion 5; roadmap updated.

---

## Image publishing

| Question | Selected | Alternatives |
|----------|----------|--------------|
| Registry | GHCR only | Docker Hub only; both |
| Tags | latest = release, edge = main | latest = main; release tags only |
| Platforms | amd64 + arm64 | amd64 only |
| Gate / compose | Gate on CI; compose pulls image | Gate on CI, keep build; publish in parallel |

---

## Startup env validation

| Question | Selected | Alternatives |
|----------|----------|--------------|
| Blocking vs warning | Block on core (DB, auth secret/URL, ENCRYPTION_KEY), warn on optional | Block only on crashes; block on everything incl. placeholders |
| Surface | Logs + dashboard banner | Logs only; logs + health endpoint |
| Placeholders | Warn when NODE_ENV=production | Block in production; don't detect |

---

## Documentation

| Question | Selected | Alternatives |
|----------|----------|--------------|
| Format | Docs site, user hosts it (offered: Markdown in docs/, Docusaurus/VitePress site, README only) | |
| Scope | Feature guides, security page, design.md to contributor docs, refresh deployment.md — plus Introduction and Get started pages | |
| Home | Separate repo `docks` (free-text) | |
| Framework | VitePress | Docusaurus; Starlight |
| Split | Docs move to docks, main repo keeps essentials | Docs in both; copy now, relocate later |

**Notes:** User wants the README clean and short. `docktor-app/docks` verified empty.

---

## README visuals

**User's choice:** Manual capture with Recordly (alternative: Playwright-scripted). Asked Claude for a short recording script → `16-RECORDING-SCRIPT.md`.

---

## Community files

| Option | Selected |
|--------|----------|
| GitHub private advisories + Contributor Covenant 2.1 | ✓ |
| Email only | |

---

## Claude's Discretion

Warning list wording, release workflow mechanics, VitePress structure, template field layouts, banner placement.

## Deferred Ideas

Live demo (#53), docs deploy automation, Docker Hub mirror, scripted screenshots, CLA/DCO.
