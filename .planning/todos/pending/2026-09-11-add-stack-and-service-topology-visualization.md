---
created: 2026-09-11T21:13:53.097Z
title: Add stack/service topology visualization
area: ui
severity: cosmetic
files: []
---

## Problem

There's no way to see how stacks and their services relate to each other
at a glance — which services talk to which, what's exposed externally
(ports/proxy routes), and how everything is networked together. This makes
it hard to reason about the overall system topology across all stacks.

## Solution

TBD. Likely a new page/view rendering a graph (nodes = stacks/services,
edges = inter-service links and external exposure) built from existing
stack/service/compose data — no new backend data model implied yet, though
network/link relationships may need to be derived from compose file
parsing (service `depends_on`, shared networks) plus the reverse-proxy
exposure config. Needs a design pass on graph library choice and how much
is derived vs. explicitly configured before implementation.
