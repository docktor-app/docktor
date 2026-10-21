/**
 * 44px touch target below `md` for icon-only controls (A11Y-01, D-11).
 *
 * Apply with `cn()` next to the Button's own size (`size-9` for `icon`,
 * `size-8` for `icon-sm`): the `max-md:` variant only takes effect below the
 * md breakpoint, so md and up keep the compact size. One source for every call
 * site instead of per-file literals.
 */
export const TOUCH_TARGET = "max-md:size-11";
