# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| Latest 0.1.x release | Yes |
| Older releases | No, please upgrade |
| `edge` and `sha-*` images | Development builds. Fixes arrive only through the next release. |

## Reporting a vulnerability

Please do not open a public issue, discussion or pull request for a security problem.

Use GitHub private vulnerability reporting:
<https://github.com/docktor-app/docktor/security/advisories/new>

If you cannot use GitHub, email <info@docktor.dev> instead.

Please include:

- The affected Docktor version or image tag
- Your configuration (how you run Docktor, reverse proxy, `TRUST_PROXY`, and so on), without secrets
- Steps to reproduce
- The impact you expect, for example what an attacker gains

## What to expect

- We acknowledge your report within 7 days.
- We work with you on a fix and agree on a disclosure date together (coordinated disclosure).
- We credit you in the advisory if you want to be named.

## Scope

Docktor mounts the Docker socket, so it has host-root-equivalent reach by design. That design and how to harden a deployment are described on the documentation Security page, not here:
<https://github.com/docktor-app/docks/blob/main/security.md>

These reports are in scope:

- Bypassing Docktor's authentication, two-factor authentication, rate limiting or CSRF protection
- Leaking secrets, such as credentials, tokens or encryption keys, through the API, the UI, logs or backups
