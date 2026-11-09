# Verification and UI changes

## Check it in the running game

A change a player can see or feel is checked in the running game, end to end, on the commit that will merge. Reproduce
the problem on the base commit when that is practical, show the fix on the head, try the edge cases the change implies,
and check the neighbouring behaviour it could break. Tests and CI do not show that the game works.

Check every surface the change reaches: the browser on a desktop, a phone layout, and the desktop app (`app/`). Choose
by risk: shared logic with nothing new on screen needs one surface; a change to a shell, to saves or to what is drawn
needs each surface that differs there. Say which surfaces were emulated. The probes are in `docs/testing/probes.md`
and `docs/testing/game-probes.md`.

## Before and after images

A substantial UI change (something visible added, removed, moved or resized, a control reached or touched differently,
or more than one element restyled) gets before and after images: "before" from the base commit and "after" from the
head, at the same viewport, in the same state, with the same data. Keep them out of git; images in the history make
every clone larger forever. A reviewer adds them to the pull request by hand when they belong there.

## Touch and phones

- A touch control is at least 44 by 44 CSS px under `(pointer: coarse)`. Grow the hit area before the drawn size.
- Size for touch by input type (`(pointer: coarse)`), not by width alone: a tablet in landscape is wide and touch.
- Keep controls and text inside `env(safe-area-inset-*)`, clear of notches, rounded corners and the home indicator.
- Measure in the running game, not in the stylesheet: `tools/enhancedTapProbe.mjs`, `tools/chargenPhoneProbe.mjs` and
  `tools/shortTouchProbe.mjs` measure targets on a phone viewport.

## The repository's own conventions win

Where the repository already decided, its rule stands over general practice:

- The 44px rule's home is the `(max-width: 860px), (pointer: coarse)` block in `src/ui/enhanced/enhancedStyle.js`. A new
  element inherits nothing from it: put its coarse sizing there, or it draws at desktop size on a phone.
- `user-scalable=no` on the game page is deliberate: the touch layer owns pinch and drag, and in-game text size is the
  way to larger text.
- The touch layer (`src/ui/touch/`, `docs/systems/ui.md`) has no Daggerfall Unity reference, so industry practice is
  its reference. Name a departure from that practice in the pull request.
