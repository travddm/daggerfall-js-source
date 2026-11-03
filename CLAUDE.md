# CLAUDE.md

The docs are in `docs/`. Start at `docs/README.md`, and read `docs/architecture/` before you change code.

- **Scope**: Daggerfall Unity (DFU) is the baseline. A departure from it is allowed only when online play needs it, or
  when it is a written, agreed design that is better for play. Name each departure where you make it, and say which of
  the two it is. A departure that makes play or progression feel worse than DFU is a defect: revert it
  (`docs/README.md`, "Scope").
- **Coding standards**: naming, tests, TypeScript, formatting and the changed-files checks are in
  `docs/coding-standards.md`. They apply to new and touched files only. New files are `.ts`; run `npm run format:fix`,
  `npm run markdown` and `npm run spell` on what you changed.
- **Comments and tests**: a comment says why, in plain sentences. A test imports the code and runs it
  (`docs/README.md`, "Code comments"; `docs/testing/writing-tests.md`).
- **ARENA2 is freeware**: `sh tools/fetch-data.sh <dir>` puts Daggerfall's own data at `<dir>/arena2` (~150 MB, never
  in the repo). Fetch it before work that reads the map, the game's files or the running game, and set `ARENA2_PATH`
  to it.
- **Before a push**: run `npm run lint`, `npm run types` and `npm run test:changed` (the tests a change can reach).
  When that selects most of the suite, run the change's own test files and leave the rest to CI. CI's `verify` runs
  lint, types, every test file in eight shards and the build on every pull request and before every deploy. A pull
  request is done when `verify` is green on its head. A pull request that conflicts with its base runs no workflow, so
  merge the base in before the push you want verified.
- **Docs follow the code**: a change that makes a page in `docs/` wrong updates that page. Docs hold no history:
  git does.
- **The loot level gate is not published**: patch notes, release notes and Discord posts never give the levels,
  factors or drop chances in `src/systems/loot/lootLevelGate.js`. Say only that Rare and Legendary gear is rarer early
  on and more common as a character grows.
- **Patch notes go in the pull request's description**, under `## Patch notes: <title>`
  (`.github/pull_request_template.md`). The desktop release reads them there, so editing a merged pull request's
  description rewrites its release notes (`release-notes.yml`). Never commit a patch-notes file
  (`test/tooling/rel4_release.test.js` fails on one).
- **Patch notes are written in ASD-STE100 Simplified Technical English** (`docs/operations/desktop-release.md`). The
  `ste-notes` check reads the description each time it changes: write it to a file and run
  `node scripts/steNotes.mjs <file>` before you post it.
- **Discord is code**: the bot's commands are in `server-account/src/discordCommands.js`, its cards and answers in
  `server-account/src/discord.js`, its channel and moderators in `server-account/wrangler.toml`. The account deploy
  (`account-deploy.yml`) writes them to Discord. Change Discord by changing those files. A person still invites the
  bot, grants its roles and rotates its token (the `DISCORD_BOT_TOKEN` secret).
- **The hosts do not grow** (`docs/architecture/hosts-and-modules.md`): new behaviour goes into a module the host
  wires (`src/scenes/merchantYardsHost.js` is the shape), never into `bootWorld`, `createWorldModes`,
  `buildDungeonContext`, `bootExterior`, `createNavalHost` or `createComeSailAwayRuntime` themselves, and on the relay
  into a `Room` method of its own, never into `_message`. No test enforces this.
