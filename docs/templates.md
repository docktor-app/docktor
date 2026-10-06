# Template repositories

Docktor can create a new stack from a **template** instead of a blank compose
file. Templates are not hosted by Docktor itself — there is no marketplace and
no registry API. Instead, Docktor clones one or more plain **git repositories**
(the default being `github.com/docktor-app/templates`) and reads a fixed
folder layout out of them. Any git host works — GitHub, GitLab, a self-hosted
Gitea instance, or a bare repo on your own server — as long as it's reachable
over `https://`, `git://`, or `ssh://` without embedded credentials (private
repositories are not supported; see [Limits and rejections](#limits-and-rejections)
below).

This document describes that folder layout — the format your own template
repository's content must follow for Docktor to read it.

## Repository layout

```
templates/
  nextcloud/
    template.yml          # shared metadata for all of this template's variants
    icon.svg               # optional, referenced by template.yml's `icon` field
    default/
      variant.yml           # this variant's metadata
      docker-compose.yml     # this variant's compose file
      .env.example            # optional — default environment values
    with-redis/
      variant.yml
      docker-compose.yml
      .env.example
  whoami/
    template.yml
    default/
      variant.yml
      docker-compose.yml
```

Everything lives under a top-level `templates/` directory. Each immediate
subdirectory of `templates/` is one **template** (e.g. `nextcloud`), and each
immediate subdirectory of a template is one **variant** of that template
(e.g. `default`, `with-redis`) — a distinct, self-contained configuration of
the same application (with/without Redis, with/without a reverse proxy
sidecar, etc.). A template with only one way to deploy it still needs exactly
one variant subdirectory (conventionally named `default`).

Directory names (both template and variant) must be lowercase alphanumeric
with internal hyphens — `^[a-z0-9][a-z0-9-]{0,62}$` — the same slug pattern
Docktor uses for stack IDs. A non-matching directory name is excluded with an
issue, not an error for the whole repository.

Any file directly under `templates/` that isn't a template directory (for
example a `README.md`) is ignored silently.

## `template.yml`

One per template, shared by all of its variants.

| Field | Type | Required | Limit | Notes |
|---|---|---|---|---|
| `schemaVersion` | number | yes | must be `1` | Lets this format evolve later without silently misreading an older repository. |
| `name` | string | yes | 1–100 chars | Display name, e.g. `Nextcloud`. |
| `description` | string | yes | 1–500 chars | Shown in the template browser. |
| `category` | string | yes | 1–50 chars | Free text, e.g. `Productivity`, `Utilities`. |
| `icon` | string | no | filename matching `*.svg` or `*.png` | A file in the same directory as `template.yml`. Embedded as an inline data URI (max 64 KiB) — never a remote URL, so browsing templates makes no third-party network request. |

```yaml
schemaVersion: 1
name: Nextcloud
description: A self-hosted file sync and collaboration platform
category: Productivity
icon: icon.svg
```

## `variant.yml`

One per variant subdirectory.

| Field | Type | Required | Limit | Notes |
|---|---|---|---|---|
| `name` | string | yes | 1–100 chars | e.g. `Default`, `With Redis`. |
| `description` | string | yes | 1–500 chars | What makes this variant different. |
| `usage` | string | no | up to 5000 chars | Free-text post-deploy instructions (first-login steps, default credentials, etc.) shown to the user after creating a stack from this variant. |

```yaml
name: With Redis
description: Adds a Redis container for Nextcloud's file-locking and caching backend
usage: |
  Default admin account is created on first container start — check the
  nextcloud-app container logs for the generated password if you didn't
  set NEXTCLOUD_ADMIN_PASSWORD in .env.
```

## `docker-compose.yml`

A normal compose file, read and validated exactly like a Docktor stack's own
compose file (same parser — must have a non-empty top-level `services:` key).

## `.env.example` (optional)

Default environment values for the variant, in the same `KEY=value` format
Docktor's own `.env` editor uses. If present, it seeds the new stack's `.env`
when a user creates a stack from this variant; the user can edit every value
before deploying.

## A complete example: Nextcloud with two variants

```
templates/nextcloud/template.yml
templates/nextcloud/icon.svg
templates/nextcloud/default/variant.yml
templates/nextcloud/default/docker-compose.yml
templates/nextcloud/default/.env.example
templates/nextcloud/with-redis/variant.yml
templates/nextcloud/with-redis/docker-compose.yml
templates/nextcloud/with-redis/.env.example
```

`templates/nextcloud/template.yml`:
```yaml
schemaVersion: 1
name: Nextcloud
description: A self-hosted file sync and collaboration platform
category: Productivity
icon: icon.svg
```

`templates/nextcloud/default/variant.yml`:
```yaml
name: Default
description: A single Nextcloud container with SQLite — good for trying it out
```

`templates/nextcloud/default/docker-compose.yml`:
```yaml
services:
  nextcloud:
    image: nextcloud:28
    restart: unless-stopped
    ports:
      - "8080:80"
    environment:
      - NEXTCLOUD_ADMIN_USER=admin
      - NEXTCLOUD_ADMIN_PASSWORD=${NEXTCLOUD_ADMIN_PASSWORD}
    env_file: .env
    volumes:
      - ./volumes/html:/var/www/html
```

`templates/nextcloud/default/.env.example`:
```
NEXTCLOUD_ADMIN_PASSWORD=changeme
```

`templates/nextcloud/with-redis/variant.yml`:
```yaml
name: With Redis
description: Adds a Redis container for file-locking and caching
usage: |
  Nextcloud is pre-configured to use the redis service for file locking.
  No extra setup needed after first start.
```

`templates/nextcloud/with-redis/docker-compose.yml`:
```yaml
services:
  nextcloud:
    image: nextcloud:28
    restart: unless-stopped
    ports:
      - "8080:80"
    environment:
      - NEXTCLOUD_ADMIN_USER=admin
      - NEXTCLOUD_ADMIN_PASSWORD=${NEXTCLOUD_ADMIN_PASSWORD}
      - REDIS_HOST=redis
    env_file: .env
    volumes:
      - ./volumes/html:/var/www/html
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - ./volumes/redis:/data
```

`templates/nextcloud/with-redis/.env.example`:
```
NEXTCLOUD_ADMIN_PASSWORD=changeme
```

## Recommended conventions

Following these keeps a template from immediately triggering Docktor's own
dangerous-config / convention warnings once a user deploys from it:

- **Bind mounts under `./volumes/`** — matches Docktor's own bind-mount
  convention for managed stacks (named Docker volumes are not supported).
- **Put secrets and anything environment-specific in `.env.example`**, and
  reference them from `docker-compose.yml` with `${VAR}` — never hardcode a
  real password, API key, or domain in the compose file itself.
- **Add `env_file: .env` on every service that reads from `.env.example`** —
  without it, the values a user edits after creating the stack are never
  actually passed to the container.
- **Avoid `privileged: true` and mounting the Docker socket** unless the
  template genuinely needs it — both trigger Docktor's always-on dangerous-
  config warnings on every stack created from the template.

## Limits and rejections

Every file Docktor reads from a template repository is size-limited, and
every file and directory it opens is checked for being a symlink — a
template repository is untrusted input, so neither a huge file nor a symlink
pointing outside the checkout can affect Docktor's host filesystem.

| What | Limit |
|---|---|
| `template.yml` / `variant.yml` | 16 KiB |
| `docker-compose.yml` | 256 KiB |
| `.env.example` | 64 KiB |
| icon file | 64 KiB |
| variants per repository | 500 |

A template or variant that fails validation is **excluded, not fatal** — a
malformed sibling never stops a valid template elsewhere in the same
repository from loading. What a user sees for each case:

| Problem | Result |
|---|---|
| `template.yml` missing, unreadable, invalid YAML, or fails schema validation | The whole template is skipped. |
| A variant's `variant.yml` or `docker-compose.yml` missing, invalid, or (for compose) has no `services:` | Only that variant is skipped; valid sibling variants still load. |
| A variant's `docker-compose.yml`, `variant.yml`, `.env.example`, or the template's icon file is a symlink | Rejected as "not a regular file (symlinks are not allowed)" — never followed. |
| A template ends up with zero valid variants | The whole template is skipped ("no valid variants — template skipped"). |
| A file exceeds its size limit above | That file (and whatever depends on it) is rejected; an oversized icon only nulls the icon, the template itself is kept. |
| More than 500 variants across the repository | The first 500 (in directory order) are kept; one summary issue reports the rest were skipped. |
| A template or variant directory name isn't a valid slug | That directory is skipped. |
| Repository has no `templates/` directory at all | Not an error — zero templates, zero issues (this is the state of a brand-new, otherwise-empty template repository). |

## Template versions and updates

When a stack is created from a template variant, Docktor pins the exact
content it used: a sha256 hash over that variant's manifest, compose file,
and `.env.example` content. If the template repository is later synced again
and that variant's content hash has changed, Docktor shows a passive
"template updated" badge on the stack — informational only. Docktor never
re-applies a template automatically; an update to a template repository
never touches a stack that was already created from it.
