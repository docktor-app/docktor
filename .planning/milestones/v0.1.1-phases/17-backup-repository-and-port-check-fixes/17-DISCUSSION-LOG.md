# Phase 17: Backup Repository and Port-Check Fixes - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-14
**Phase:** 17-backup-repository-and-port-check-fixes
**Areas discussed:** Remote repo layout, SFTP auth & host keys, Incomplete remote config, Own-port false positive

---

## Remote repo layout

| Option | Description | Selected |
|--------|-------------|----------|
| Per-stack sub-repo | `<repoPath>/<stackId>` / `<bucket>/<stackId>`, mirrors local layout | ✓ |
| One shared repo + tags | Single repo, snapshots filtered by stack id | |
| You decide | Claude picks | |

**User's choice:** Per-stack sub-repo

## SFTP auth & host keys

| Option | Description | Selected |
|--------|-------------|----------|
| Temp key file, strict host check | 0600 temp key, `accept-new` with Docktor known_hosts | ✓ |
| Temp key file, no host check | `StrictHostKeyChecking=no` | |
| Persisted key in data dir | Decrypted key kept on disk | |

**User's choice:** Temp key file, strict host check

## Incomplete remote config

| Option | Description | Selected |
|--------|-------------|----------|
| Hard-fail with clear error | BadRequestError naming missing fields | ✓ |
| Fall back to local + warn | Back up locally with a warning | |

**User's choice:** Hard-fail with clear error

## Own-port false positive

| Option | Description | Selected |
|--------|-------------|----------|
| Match via own containers | Drop listeners matching own containers' published ports | ✓ |
| Skip tier 3 on redeploy | Skip socket check when stack is RUNNING | |
| Match docker-proxy pid | Map docker-proxy listeners to containers | |

**User's choice:** Match via own containers

## Claude's Discretion

URL/env construction placement, known_hosts and temp-key locations, where the self-port exclusion lives.

## Deferred Ideas

Docs site correction; Phase 10 findings WR-01..03.
