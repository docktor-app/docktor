---
created: 2026-08-28T12:01:53.982Z
title: Add a sophisticated compose YAML editor and env editor
area: ui
severity: minor
files:

  - client/src/routes/app/stacks/[id].tsx
  - client/src/routes/app/stacks/create.tsx

audit_acknowledged:
  milestone: v1.0
  at: 2026-09-20
completed: 2026-09-30
status: completed
---

## Problem

User feedback: wants "a sophisticated yaml editor as well as env editor"
for the Compose and Environment tabs on the stack detail page (currently
plain text areas — see the `composeContent`/env handling in `[id].tsx` and
`create.tsx`). Split out from a larger UI redesign request — see also
[[2026-08-28-redesign-ui-ux-service-colors-mobile]].

## Solution

TBD. Likely a syntax-highlighting code editor (e.g. CodeMirror or Monaco)
with YAML-aware linting/validation for the compose editor, and a
structured key=value editor (with add/remove rows, secret masking) for the
env editor rather than raw text. Check CDN/bundle-size constraints before
picking a library.

## Resolution

Closed by **D-18**/**D-19** (**11-09**: CodeMirror-based `CodeEditor`/
`ComposeEditor` with YAML-aware syntax highlighting and linting, replacing
the plain compose textarea — package legitimacy for the four new
CodeMirror/yaml dependencies was checkpoint-approved by the developer) and
**D-20**/**D-21**/**D-22** (**11-12**: structured table/raw-mode `EnvEditor`
with add/remove rows, wired into both the Config tab and the Create Stack
page, replacing the raw `.env` textarea). Secret masking was not part of
D-20/D-21/D-22's scope and is not implemented.
