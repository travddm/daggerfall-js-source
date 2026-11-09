# Contributing

This page is for anyone who changes the repository by hand, or runs a server of their own from it; there is no
official live service. The rules are the same for people and for coding agents:
they live in [CLAUDE.md](CLAUDE.md) and in [.claude/rules/](.claude/rules/), and the documentation starts at
[docs/README.md](docs/README.md). This page points at them; it does not repeat them.

## Set up

[docs/getting-started.md](docs/getting-started.md) has the full steps. In short:

1. Install Node 22.18 or later and Git. On Windows, use Git Bash for the shell commands.
2. `npm ci` at the root. Run `npm ci` in `server/` or `app/` only when you work on them.
3. `sh tools/fetch-vendor.sh` fetches the vendored mods' files. `npm test` and `npm run dev` run it for you.
4. `sh tools/fetch-data.sh <dir>` fetches Daggerfall's game data, which is freeware, to `<dir>/arena2` (about 150 MB,
   never committed). Set `ARENA2_PATH` to that folder before work that reads the map, the game files or the running
   game.

### Windows

- Check the repository out with LF line endings: `git config core.autocrlf false` before the checkout, or
  `git -c core.autocrlf=false clone ...`. Some tests compare text that a CRLF checkout breaks. Some files are CRLF
  in the repository itself, and that is correct.
- Some tests fail on Windows on a clean checkout too: symlink creation (`EPERM`), a doubled drive letter (`E:\E:\`)
  from `URL.pathname`, backslash path comparisons, and spawned `git`. Compare against a clean checkout of the base
  branch before you blame your change, and let CI, which runs on Linux, decide.
- `npm run build` can fail with `EMFILE` when Vite opens too many files at once.

## Check your change

Before a push ([docs/testing/running-tests.md](docs/testing/running-tests.md)):

```bash
npm run lint
npm run types
npm run test:changed
```

`npm run test:changed` runs the tests your change can reach. For the files you changed, also run
`npm run format:check`, `npm run markdown` and `npm run spell`. CI runs lint, types, every test in eight shards and the
build on every pull request. A pull request is done when that run is green on its head.

## Open a pull request

Pull requests target `feat/tamriel-review` and use the template in
[.github/pull_request_template.md](.github/pull_request_template.md).

- Name the branch `<type>/<topic>`, keep commits short, and search the open pull requests for overlap first
  ([git-and-prs.md](.claude/rules/git-and-prs.md)).
- Write an owner decision as "decision 104", never "#104": GitHub links `#N` to pull request N. Only a real pull request
  or issue gets a number, as a full link or `travddm/daggerfall-js-source#N`
  ([git-and-prs.md](.claude/rules/git-and-prs.md)).
- One concern per pull request. A refactor never shares one with a visible change.
- A change a player can see or feel stays a draft until it was checked in the running game and the check is recorded
  with the commit it checked ([verification-and-ui.md](.claude/rules/verification-and-ui.md)).
- Patch notes go in the description, in ASD-STE100 Simplified Technical English
  ([docs/operations/desktop-release.md](docs/operations/desktop-release.md)). The `ste-notes` check
  reads the description each time it changes, so run `node scripts/steNotes.mjs <file>` on it before you post it.
- A new file is named in kebab-case, and its test is `<module>.test.ts`. Existing files keep their names until a later
  rename pass ([code.md](.claude/rules/code.md)).

## The rules

| File                                                                         | What it covers                                                                                    |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [docs/coding-standards.md](docs/coding-standards.md)                         | Formatting, naming, TypeScript, the changed-files checks                                          |
| [.claude/rules/code.md](.claude/rules/code.md)                               | Moving touched code out of big modules, readable code, tests that run the code, out-of-scope work |
| [.claude/rules/comments.md](.claude/rules/comments.md)                       | Comments say why; no codes, dates, history, quotes, banners or `bible/` cites                     |
| [.claude/rules/docs.md](.claude/rules/docs.md)                               | What a `docs/` page holds and how it stays true                                                   |
| [.claude/rules/git-and-prs.md](.claude/rules/git-and-prs.md)                 | Branches, commits, descriptions, numbers, drafts, relay version races, patch notes                |
| [.claude/rules/verification-and-ui.md](.claude/rules/verification-and-ui.md) | Checking in the running game, before and after images, touch and phones                           |
| [.claude/rules/design-rules.md](.claude/rules/design-rules.md)               | No graphics regressions, departures as mods, no payments, private mods, host splits               |
