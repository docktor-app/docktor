# Phase 16: README Recording Script (Recordly)

Shot list for the README screenshots and the ~30 s GIF (#54, D-18). Record at 1440x900 with a fresh instance and the sample data below. Everything on screen ends up in git history for good, so follow "Masking" before every capture.

## Environment

| Item | Value |
|------|-------|
| Build | Run the branch build: `docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build` (the image is not published yet) |
| `BETTER_AUTH_URL` | `http://localhost:3000` (throwaway, no real hostname) |
| Admin account | `admin@example.com`, any throwaway password |
| Instance name | `Docktor Demo` (setup wizard) |
| Theme | Capture light mode first, then repeat every screenshot in dark mode |

### Backup repository

No extra volume or compose override is needed: every backup is written to the stack's own `backups/` folder, which is already inside the bind-mounted stacks directory. In Settings > Backup choose repository type **Local** (the only option) and set a restic password.

## Sample data

| Step | Detail |
|------|--------|
| Stacks | Create three stacks from templates: Vaultwarden, Gitea, Nextcloud |
| Update available | Pin Gitea to an older image tag before deploying, then wait for the update check to run so the update badge shows |
| Running vs stopped | Deploy Vaultwarden and Gitea; leave Nextcloud stopped |
| Health data | Give one service an `x-docktor` health probe so uptime and incidents have data (the host must be `localhost`, `127.0.0.1` or `[::1]`): `x-docktor:` / `health-probe:` / `url: http://localhost:3000/` on the Vaultwarden service, set in Config > Compose |
| Backup history | Run one manual backup so the Backups tab has a snapshot (Settings > Backup > Local + restic password first) |
| Storage | Wait at least 60 s after boot (the first disk scan runs 60 s after start), then refresh the Storage page so sizes are measured |

## Masking

- No real hostnames, domains, emails, SMTP passwords or IP addresses on screen. Settings views show the base URL and SMTP fields, so leave SMTP unconfigured or use obvious dummy values.
- Hide bookmarks, the browser profile and any notifications before recording.
- Check every frame of the GIF and every PNG against these rules before committing; the files are permanent in git history.

## Screenshots (PNG, save to `docs/assets/`)

Each file may have an optional `-dark` variant (`dashboard-dark.png`, and so on). The README uses a `<picture>` element for the variants that exist.

| # | File | View | Notes |
|---|------|------|-------|
| 1 | `dashboard.png` | Dashboard | stack counts, status mix, recent stacks |
| 2 | `stack-detail.png` | Stack detail > Overview | services table + activity timeline |
| 3 | `compose-editor.png` | Stack detail > Config | compose editor with the diff-before-apply view if shown |
| 4 | `backups.png` | Stack detail > Backups | schedule + snapshot history |
| 5 | `stack-health.png` | Stack detail > Overview | uptime and incidents (there is no separate health page; this replaces the old health view) |
| 6 | `storage.png` | Storage page (sidebar) | disk usage per stack |

Required for the README: `dashboard.png`, `stack-detail.png`, `backups.png` and the GIF. The rest are optional.

## GIF (~30 s, no audio, loop)

Save as `docs/assets/docktor-demo.gif`.

| Time | Action |
|------|--------|
| 0-4 s | Dashboard: pause so the overview reads |
| 4-10 s | Click "Create stack" > pick a template > review compose |
| 10-16 s | Deploy; status goes DEPLOYING > RUNNING live (SSE) |
| 16-22 s | Open stack detail; scroll services table; open a live log stream |
| 22-27 s | Backups tab > trigger a backup, snapshot appears |
| 27-30 s | Back to dashboard |

## Export

- GIF under 5 MB (2-3 MB ideal): 960 px wide, 12-15 fps. An MP4/WebM fallback is fine for the docs site.
- PNG at 1440x900, run through a lossless optimiser (for example `oxipng -o 4 --strip safe`), target under 600 KB each.
- File names are fixed (see the tables); the README links them by these paths.
