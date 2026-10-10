# Phase 14: Health, Uptime and Disk Visibility - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-06
**Phase:** 14-health-uptime-and-disk-visibility
**Areas discussed:** Probe config & scope, Probe execution, Uptime semantics, Views & disk scan

---

## Probe config & scope

| Option | Description | Selected |
|--------|-------------|----------|
| Compose x-docktor ext (YAML source of truth, UI edits it) | Probe config in compose YAML; Config-tab form edits that YAML through diff-confirm | ✓ |
| DB fields on Service + UI form | Probe stored on DB Service row; breaks YAML-first invariant | |
| Compose only, no UI | Hand-edited YAML only, no form | |
| Any 2xx/3xx by default | Healthy if status 200–399, no expected-code field | ✓ |
| Explicit expected code / list | User types a specific status code or list | |
| Per-service only; stack derives | Stack health emerges via deriveStackStatus() | ✓ |
| Add stack-level probe too | Separate stack-level probe URL + ambiguous tie-break | |

**User's choice:** Compose x-docktor ext + Any 2xx/3xx + Per-service only
**Notes:** Chose the recommended options throughout the first area. The stack-level probe option was rejected to keep a single health concept and reuse `deriveStackStatus()` unchanged.

---

## Probe execution

| Option | Description | Selected |
|--------|-------------|----------|
| Node fetch to container IP (translate localhost) | Resolve localhost to the container's compose-network IP; no curl dependency | ✓ |
| docker exec curl in-container | Matches localhost semantics but requires curl in the image | |
| Host-side fetch of published port | Simplest but breaks localhost mental model + needs published port | |
| 30s per service (Docker default) | Matches Docker healthcheck default interval | ✓ |
| 15s per service | Faster detection, 2x load | |
| 60s per service | Lighter but slower incident detection | |
| Probe overrides Docker healthcheck | Probe becomes the service's sole health signal | ✓ |
| Any signal unhealthy (defensive OR) | UNHEALTHY if either probe or healthcheck fails | |
| 3 consecutive failures + startup grace | Mirrors Docker start_period + 3-fail semantics; fail-closed on probe errors | ✓ |
| Single failure = unhealthy | Fastest but flaps on blips | |

**User's choice:** Node fetch to container IP + 30s + Probe overrides + 3 consecutive failures w/ 60s grace
**Notes:** All recommended options chosen. Fail-closed on probe-execution errors was part of the chosen failure bar.

---

## Uptime semantics

| Option | Description | Selected |
|--------|-------------|----------|
| UNHEALTHY + ERROR = down; STOPPED/DRAFT excluded | Downtime = UNHEALTHY/ERROR only; stopped/draft neither up nor down | ✓ |
| UNHEALTHY only | ERROR crash-loops read as 100% uptime | |
| 30d global default, Settings-configurable | One global retention window (1–365), no per-stack override | ✓ |
| Global default + per-stack override | Per-stack window field + form surface | |
| New per-service history table + incident list | Per-service health events + StackIncident incidents; StatusLog unchanged | ✓ |
| Stack-level only (StatusLog + incidents) | Loses "visible per service" requirement of #23 | |

**User's choice:** UNHEALTHY + ERROR = down / 30d global window / new per-service history + incident list
**Notes:** The existing (unused) `StackIncident` scaffold was identified as the intended shape for the incident list and reused. Stack-level transitions stay on `StatusLog`.

---

## Views & disk scan

| Option | Description | Selected |
|--------|-------------|----------|
| du on ./volumes, daily job | du per stack + per volume subdir, daily, writing Stack.volumeSizeBytes + per-volume rows | ✓ |
| Docker API / in-container measurement | Container stats/df API — poor fit for host bind mounts | |
| Storage page + uptime on stack/dashboard | New Storage nav page; uptime % column on dashboard + Overview Uptime card/incident list; no Health page | ✓ |
| Dedicated Health + Storage pages | Separate nav pages for both | |

**User's choice:** du on ./volumes daily + Storage page & uptime on stack/dashboard
**Notes:** User chose the recommended options for both, with one explicit addition to the disk view: **backups must be shown too** — the restic repository (`DOCKTOR_BACKUP_DIR`) gets its own section/row in the Storage view and counts toward the grand total, so the view shows the full disk picture (stacks + volumes + backups), not just app data.

---

## Claude's Discretion

- Exact UI shape of per-service health-timeline markers, Storage-page layout details, prune-job mechanics (beyond the 30d window), per-volume/per-service-history row storage choice (new model vs JSON), and the probe-config form's exact fields.

## Deferred Ideas

- CPU/memory live resource stats (only the disk part of that todo is in phase-14 scope).
- `container-status-unknown-after-deploy` observability bug (belongs with the status/update-checker fixes, not #23/#24/#27).
