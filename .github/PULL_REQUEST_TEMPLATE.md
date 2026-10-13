## Summary

<!-- What does this change do, and why? One short paragraph from the user's point of view. -->

Closes #

## How was this tested?

<!-- Commands you ran, manual steps, screenshots for UI changes. -->

## Checklist

See [CONTRIBUTING.md](https://github.com/docktor-app/docktor/blob/main/CONTRIBUTING.md) for details.

- [ ] Commits follow `type(scope): description` (`feat`, `fix`, `refactor`, `test`, `docs`, `chore`)
- [ ] Tests were added or updated first (TDD) and `yarn test` passes
- [ ] `yarn typecheck` (`tsc --build`) passes with zero errors
- [ ] No `any` and no unchecked casts
- [ ] New Zod schemas live in `@docktor/shared` and are not duplicated
- [ ] UI changes have `dark:` counterparts for light-only colors, use `ToneBadge` and `Section`, and leave `components/ui/` untouched
- [ ] A user-facing behaviour change has a matching docs PR in [docktor-app/docks](https://github.com/docktor-app/docks)
- [ ] No secrets or `.env` files in the diff
