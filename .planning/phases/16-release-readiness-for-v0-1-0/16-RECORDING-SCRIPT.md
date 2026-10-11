# Phase 16: README Recording Script (Recordly)

Shot list for the README screenshots and the ~30 s GIF (#54, D-18). Record at 1440×900, hide bookmarks/notifications, use a fresh instance with sample stacks.

## Before recording
1. Start a clean instance (`docker compose up -d`), complete the setup wizard with instance name "Docktor Demo".
2. Create three stacks from templates (e.g. Vaultwarden, Gitea, Nextcloud); deploy two, leave one stopped. Let one show "update available".
3. Configure a local backup repository and run one manual backup so the Backups tab has history.
4. Check light mode first, then repeat the screenshots in dark mode.

## Screenshots (PNG, save to `docs/assets/`)
| # | File | View | Notes |
|---|------|------|-------|
| 1 | `dashboard.png` | Dashboard | stack counts, status mix, recent stacks |
| 2 | `stack-detail.png` | Stack detail → Overview | services table + activity timeline |
| 3 | `compose-editor.png` | Stack detail → Config | compose editor with a diff-before-apply view if shown |
| 4 | `backups.png` | Stack detail → Backups | schedule + snapshot history |
| 5 | `health.png` | Health / uptime view | probe history and disk usage |

Add `-dark` variants for each.

## GIF (~30 s, no audio, loop)
| Time | Action |
|------|--------|
| 0–4 s | Dashboard: pause so the overview reads |
| 4–10 s | Click "Create stack" → pick a template → review compose |
| 10–16 s | Deploy; status goes DEPLOYING → RUNNING live (SSE) |
| 16–22 s | Open stack detail; scroll services table; open a live log stream |
| 22–27 s | Backups tab → trigger a backup, snapshot appears |
| 27–30 s | Back to dashboard |

## Export
- GIF under ~5 MB (2–3 MB ideal): 960 px wide, 12–15 fps; or MP4/WebM fallback for the docs site.
- Name it `docs/assets/docktor-demo.gif` and reference it above the fold in the README (D-17).
