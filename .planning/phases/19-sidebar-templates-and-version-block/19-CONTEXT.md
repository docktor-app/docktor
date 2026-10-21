# Phase 19: Sidebar, Templates and Version Block - Context

**Gathered:** 2026-10-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Navigation is organised into labelled sidebar sections (UI-06), Templates becomes a standalone catalog destination whose "Use template" starts the existing create-stack flow (UI-07), and the running version plus GitHub and docs links sit above the account menu (UI-01). The three share one component tree (`app-sidebar.tsx`, `nav-user.tsx`) and are planned as a unit. Source issues #88, #93, #94 (bundle #96). `components/ui/sidebar.tsx` is shadcn-managed and is not edited.

</domain>

<decisions>
## Implementation Decisions

### Locked by the approved UI-SPEC
- **D-01:** `19-UI-SPEC.md` (approved 2026-10-18) is the design contract and its decisions D-01..D-11 stand: `collapsible="icon"` sidebar, segment-aware `isNavItemActive` in `client/src/lib/sidebar-nav.ts`, new `/templates` route mounting the same `TemplateBrowsePage`, unchanged "Use Template" behaviour, build-time `__APP_VERSION__` via Vite `define`, collapsed version block as a dropdown menu button, mobile sheet closes on internal nav, no new typography/colour tokens, 44px touch targets on new controls below `md`. Downstream agents must read it.

### Version string (UI-01)
- **D-02:** The version shown is `client/package.json` `version` only, injected at build time (UI-SPEC D-06). No dev marker, no git tag/build-arg override; Dockerfile and `publish.yml` are not touched. Phase 21 (REL-01) bumps the package version, so the block follows the release. — **Reversibility:** reversible — switching to a tag-derived build arg later only changes the `define` source.

### Docs link (UI-01)
- **D-03:** The sidebar "Documentation" link points to the hosted docs site `https://getdocktor.dev` (overrides UI-SPEC D-07, which pointed at `github.com/docktor-app/docks`). `DOCS_HOME_URL` in `client/src/lib/project-links.ts` is `https://getdocktor.dev`; `GITHUB_URL` stays `https://github.com/docktor-app/docktor`. Both open in a new tab with `rel="noopener noreferrer"`. The UI-SPEC's D-07 text and any "docs live on GitHub" wording must be treated as superseded by this.
- **D-04:** The in-app contextual docs links in `client/src/lib/docs-links.ts` (`DOCS_LINK_STYLE = "github"`) are NOT changed in this phase; only the sidebar link uses the site. Switching those is a separate decision.

### Create-flow entry point (UI-07)
- **D-05:** "Start from Template" on Create Stack keeps pointing at `/stacks/create/templates` (UI-SPEC D-04). Both `/templates` and `/stacks/create/templates` render `TemplateBrowsePage`, with title and breadcrumb derived from the path. Existing `create-stack-page.test.tsx` and `templates.spec.ts` stay valid.

### Section structure (UI-06)
- **D-06:** Two sections in order: **Platform** (Dashboard, Stacks, Templates) and **System** (Storage, Settings), as in UI-SPEC D-01.

### Claude's Discretion
- Extracting the templates-page header into `templates-page-header.tsx`, empty-state wiring and exact file layout, within the UI-SPEC file table and the ~80-line page budget.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design contract and scope
- `.planning/phases/19-sidebar-templates-and-version-block/19-UI-SPEC.md` — approved UI contract (layout, copy, a11y, test contract); D-07 docs URL superseded by D-03 above
- `.planning/ROADMAP.md` §Phase 19 — goal, success criteria, notes
- `.planning/REQUIREMENTS.md` — UI-01, UI-06, UI-07
- `CLAUDE.md` — layering, page composition, TDD, dark-mode and ToneBadge rules, no `components/ui/` edits
- GitHub issues `docktor-app/docktor#88`, `#93`, `#94` (bundle `#96`) — original reports

### Existing code touched
- `client/src/components/app-sidebar.tsx`, `client/src/components/nav-user.tsx` — sidebar tree
- `client/src/routes/app/stacks/templates.tsx`, `client/src/router.tsx` — Templates page and routes
- `client/src/lib/docs-links.ts` — in-app docs link scheme (unchanged here)
- `client/vite.config.ts`, `client/vitest.config.ts` — `define` for `__APP_VERSION__`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TemplateBrowsePage` with `TemplateGrid`, `TemplateCard`, `TemplateRepoAlerts`, `TemplateVariantDialog`: reused unchanged on both routes
- shadcn Sidebar family, `DropdownMenu`, `Tooltip`, `Button`, `EmptyState`, `ToneBadge`, `BrandLogo`
- `NavUser` dropdown: pattern for the collapsed version menu

### Established Patterns
- Pure nav model + helper in `lib/` with unit tests; components render the model
- Native `select` in the template grid is intentional (Radix Select issue in jsdom)

### Integration Points
- `app-sidebar.tsx` footer: version block above `NavUser`, below the existing `Separator`
- `router.tsx`: `/templates` beside `/stacks/create/templates`
- `app-layout.test.tsx` mocks `AppSidebar`; `nav-user.test.tsx` must stay green

</code_context>

<specifics>
## Specific Ideas

Docs site is `https://getdocktor.dev`.

</specifics>

<deferred>
## Deferred Ideas

- Pointing in-app contextual docs links (`docs-links.ts`) at the getdocktor.dev site instead of GitHub markdown: separate change, not in this phase.
- In-app "new version available" notice: out of scope per issue #88.

</deferred>

---

*Phase: 19-Sidebar, Templates and Version Block*
*Context gathered: 2026-10-18*
