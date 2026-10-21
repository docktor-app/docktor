---
phase: 20-visual-consistency-dashboard-clarity-and-touch-targets
plan: 05
subsystem: client-ui
tags: [font, design-tokens, monospace, tailwind, fontsource]
requires: []
provides:
  - "Self-hosted Geist Mono (Variable) bundled by Vite"
  - "--font-mono design token in @theme inline"
  - "Mono rendering for deploy-warnings port/container name and sidebar version"
affects: [20-07, 20-09, 20-10, 20-11]
tech-stack:
  added: ["@fontsource-variable/geist-mono@5.3.0"]
  patterns: ["Font loaded via package CSS @import as first statement of index.css; family exposed through --font-mono token"]
key-files:
  created:
    - client/test/unit/styles/font-token.test.ts
  modified:
    - client/package.json
    - yarn.lock
    - client/src/index.css
    - client/src/components/domain/stack/deploy-warnings-alert.tsx
    - client/src/components/sidebar-version-block.tsx
    - client/test/unit/components/domain/stack/deploy-warnings-alert.test.tsx
    - client/test/unit/components/sidebar-version-block.test.tsx
decisions:
  - "Installed family name is 'Geist Mono Variable' (matches UI-SPEC A-04), so the token uses it unchanged"
  - "deploy-warnings uses inline <code className=\"font-mono\"> per branch (plan acceptance requires >=4 literal occurrences) instead of a shared helper"
metrics:
  tasks: 2
  files: 8
status: complete
actuals:
  tokens: 9000
  tasks: 2
  commits: 4
plan_head_before: 2909dad69e29ea901b66dc18648143da5c92c80d
plan_head_after: d457c7c2aeb2ec39ad9cfeda0a9871b39187c0dc
commits: 4
completed: 2026-10-21
---

# Phase 20 Plan 05: Geist Mono font token and non-table mono values Summary

Self-hosted Geist Mono through `@fontsource-variable/geist-mono` 5.3.0 imported first in `index.css`, exposed as `--font-mono`, with the deploy-warnings port/container name and sidebar version rendered in mono.

## Tasks

| Task | Name | Commits |
| ---- | ---- | ------- |
| 1 (tracer) | Geist Mono served from app origin through the token | c7b8d7e (test), 9918a9b (feat) |
| 2 | Technical values outside tables in mono | ae6bacc (test), d457c7c (feat) |

## What was built

- Package installed at `^5.3.0` (resolved 5.3.0, no postinstall script, lockfile +8 lines). `index.css` starts with `@import "@fontsource-variable/geist-mono";` and `@theme inline` defines `--font-mono: "Geist Mono Variable", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;`.
- `font-token.test.ts` guards import order, token value, no external URLs in `index.css`, the `^5.` dependency range, and that every `url()` in the installed package CSS is a relative `./files/` path.
- Deploy-warnings banner: port label (all four holder branches) and container holder name wrapped in `<code className="font-mono">`; copy unchanged. Sidebar version: `font-mono` on the expanded span and the collapsed `DropdownMenuLabel`.

## Tracer gate

Tracer verified at unit level (token + package + same-origin URLs). Auto-mode expansion check: the `<verify>` command passes; browser-level proof (zero third-party font requests, Geist Mono computed on a KPI) is plan 20-11 Playwright.

## Deviations from Plan

None - plan executed as written. The `font-token` family name matched the installed package, so no A-04 adjustment was needed. The Task 1 contingency (side-effect import in `main.tsx`) was not applied, as instructed.

## Deferred verifications (resource constraint: no tsc/build/Playwright locally)

- `tsc --build`, `vite build` (confirms Tailwind rebases the package's `./files/*.woff2` URLs when inlining the `@import`), Playwright font check, and `yarn install --immutable` are left to GitHub Actions CI.
- Visual check that `log-terminal` and `unified-diff-view` keep column alignment with Geist Mono (must_haves backstop).

## Requirements

UI-03 is NOT yet marked complete in REQUIREMENTS.md: remaining D-06 call sites (stat card, services, proxy, certificates) belong to plans 20-07, 20-09, 20-10.

## Known Stubs

None.

## Threat Flags

None. T-20-08 (no external font host) and T-20-SC (package legitimacy, version 5.3.x, no postinstall) mitigated and verified; T-20-09 mitigated (values rendered as React text in `code`).

## Verification run

`vitest run font-token.test.ts deploy-warnings-alert.test.tsx sidebar-version-block.test.tsx app-sidebar.test.tsx`: 4 files, 33 tests passed.

## Self-Check: PASSED

All created/modified files present; commits c7b8d7e, 9918a9b, ae6bacc, d457c7c exist on the branch.
