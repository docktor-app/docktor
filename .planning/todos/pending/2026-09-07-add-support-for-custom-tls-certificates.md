---
created: 2026-09-07T11:58:51.827Z
title: Add support for custom TLS certificates
area: proxy
severity: major
files:
  - server/src/jobs/proxy-cert-poller.ts
  - server/src/lib/proxy-stack-compose.ts
  - client/src/components/domain/stack/cert-status-badge.tsx
---

## Problem

Phase 06 (proxy-configuration) only supports automatic certificate issuance via
acme-companion (Let's Encrypt, HTTP-01 challenge). There is no way for a user to
upload/provide their own TLS certificate for a proxied domain — e.g. for internal
domains without public DNS, wildcard certs issued elsewhere, or CAs other than
Let's Encrypt. COVERAGE.md for phase 06 explicitly opted out of `ACME_CA_URI` /
staging CA toggle and DNS-01, but "bring your own certificate" (bypassing ACME
entirely) wasn't considered at all.

Surfaced during Phase 06 UAT (test 7, "Certificate issuance on a real host") when
the test was skipped for lack of a real host with public DNS — prompted the
question of whether a custom-cert path exists as an alternative to the
DNS-dependent ACME flow.

## Solution

TBD. Likely shape: let a user upload a cert+key pair (or point to files) per
domain, store them where nginx-proxy's `vhost.d`/cert volume expects them
(`PROXY_CERTS_SUBPATH` in `proxy-stack-compose.ts`), and have `ProxyCertPoller`
treat a custom cert as already "issued" — skipping acme-companion for that
domain entirely rather than fighting to reissue it.
