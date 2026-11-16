# CLAUDE.md

The docs are in `docs/`. Start at `docs/README.md`, and read `docs/architecture/` before you change code. The docs are
written for a maintainer and for a server owner: there is no official live service, and servers are self-hosted from
`selfhost/`.

- **Scope**: Daggerfall Unity (DFU) is the core. Every departure from it is an agreed mod or option: content or
  behaviour that differs from DFU ships as a mod, and every tuning value that differs from DFU is a player setting
  with DFU's value selectable. A server pins its mods and settings in its server profile, and every player on it uses
  them; only purely cosmetic mods and settings are left free. Name the mod or option where you make a departure. A
  departure that makes play or progression feel worse than DFU is a defect: revert it (`docs/README.md`, "Scope").
- **Online rules come from the server profile** (`src/systems/online/serverProfile.ts`, `src/net/profile/`): add a
  profile key, not a new `isOnlinePage()` branch or `onlineLane.js` table.
- **Coding standards**: naming, tests, TypeScript, formatting and the changed-files checks are in
  `docs/coding-standards.md`. They apply to new and touched files only. New files are `.ts`; run `npm run format:fix`,
  `npm run markdown` and `npm run spell` on what you changed.
- **Comments and tests**: a comment says why, in plain sentences. A test imports the code and runs it
  (`docs/README.md`, "Code comments"; `docs/testing/writing-tests.md`).
- **Comments**: `.claude/rules/comments.md`. The `comment-cleanup` agent rewrites a file's comments to it.
- **Docs**: `.claude/rules/docs.md`.
- **Code**: `.claude/rules/code.md`.
- **Git and pull requests**: `.claude/rules/git-and-prs.md`.
- **Verification and UI**: `.claude/rules/verification-and-ui.md`.
- **Design rules**: `.claude/rules/design-rules.md`.
- **For people**: `CONTRIBUTING.md` summarises setup, checks and the rules.
- **ARENA2 is freeware**: `sh tools/fetch-data.sh <dir>` puts Daggerfall's own data at `<dir>/arena2` (~150 MB, never
  in the repo). Fetch it before work that reads the map, the game's files or the running game, and set `ARENA2_PATH`
  to it.
- **Before a push**: run `npm run pre-push`. It runs lint and its ratchet, both type passes, the doc and comment
  checks, the tree-wide tests and the tests the change can reach, and it says what it left to CI
  (`docs/testing/running-tests.md`, "Before a push"). A step that cannot run here fails or names its skip; fix the
  checkout instead of skipping a step by hand. On a draft, CI runs the light run: lint, types and the near tier on
  Linux. CI's full `verify` (every test file in eight shards and the build) runs when a pull request is marked ready,
  on every push to a ready one, before every deploy and every release, and on a draft that changes a platform path
  or carries the `full-ci` label. Add that label to a draft whose change can behave differently on another platform
  (`docs/testing/running-tests.md`, "Local, draft and ready"). A pull request is done when `check` is green on its
  head; a light run never makes it green. A pull request that conflicts with its base runs no workflow, so merge the
  base in before the push you want verified.
- **Docs follow the code**: a change that makes a page in `docs/` wrong updates that page. Docs hold no history:
  git does.
- **Patch notes describe, they do not tabulate**: say what a player notices (for the loot level gate, that Rare and
  Legendary gear is rarer early on and more common as a character grows), not the levels, factors or drop chances.
- **Patch notes go in the pull request's description**, under `## Patch notes: <title>`
  (`.github/pull_request_template.md`). The desktop release reads them there, so editing a merged pull request's
  description rewrites its release notes (`release-notes.yml`). Never commit a patch-notes file
  (`test/tooling/rel4_release.test.js` fails on one).
- **Patch notes are written in ASD-STE100 Simplified Technical English** (`docs/operations/desktop-release.md`). The
  `ste-notes` check reads the description each time it changes: write it to a file and run
  `node scripts/steNotes.mjs <file>` before you post it.
- **The hosts do not grow** (`docs/architecture/hosts-and-modules.md`): new behaviour goes into a module the host
  wires (`src/scenes/merchantYardsHost.js` is the shape), never into the scene hosts themselves (`bootWorld`,
  `createWorldModes`, `buildDungeonContext`, `bootExterior`, `createNavalHost`, `createComeSailAwayRuntime`), and on the
  relay into a `Room` method of its own, never into `_message`. The hosts are split into narrow modules before the
  repository goes public (decision 92). No test enforces this.
