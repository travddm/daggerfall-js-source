# Branches, commits and pull requests

Pull requests target `feat/tamriel-review`. The pull request template is `.github/pull_request_template.md`.

## Branches

Name a branch `<type>/<topic>`: `fix`, `feat`, `refactor`, `perf`, `docs`, `test` or `chore`, then two to five
lowercase words joined by hyphens (`fix/house-storage-disappearing`). No random suffixes, no `claude/` prefix. A
reviewer reads the branch list to see what is open, and a generated name says nothing.

## Commits

A commit message is short: what changed and, when it helps, why. The diff shows the rest. No AI attribution or other
boilerplate, because the history is the project's record, not a tool's.

## Pull request descriptions

Say what changed and why, for a reviewer. When the change adds or updates a `docs/` page, link the page and summarise
it in a line instead of copying it, so the description does not become a second copy that drifts.

Before you open a pull request, search the open pull requests for the same files and topic
(`gh pr list --state open --search "<terms>"`). Name each overlap in the description and say how the two relate. An
overlap found before the work is cheaper than a conflict found at review.

## Drafts

A pull request that changes what a player sees or feels is a draft until it was checked in the running game
(`.claude/rules/verification-and-ui.md`) and the description records the check: the head commit checked, what was
driven, what was seen, and what could not be reached. It leaves draft only on an approval: a reviewer's on GitHub or the
owner's word. Tests and CI show that the code agrees with itself, not that the game works.

## One concern

One concern per pull request. A refactor never shares a pull request with a visible change: a screenshot cannot show
which of the two moved a pixel. Open the refactor first and put the visible change on top of it.

## Relay version races

Every relay change bumps `RELAY_VERSION` (`src/net/wire.js`), and tests pin the version and keep a hash row for it
(`test/net/relayversion.test.js`). When two relay pull requests race, the second to merge renumbers: merge the base,
keep the base's side inside each conflict block (never a whole file), then re-apply your own bump on top with the next
free number and the hash the test reports. Never edit an existing hash row: it records bytes that were deployed.

## Patch notes

Patch notes go in the pull request's description, under `## Patch notes: <title>`, written in ASD-STE100 Simplified
Technical English, because the desktop release prints them from there. Describe what changed for players; do not
tabulate levels, factors or chances. `docs/operations/desktop-release.md` holds the rules.
`node scripts/steNotes.mjs <file>` is an optional local check of a draft; no CI check enforces it.
