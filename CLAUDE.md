# CLAUDE.md

The design docs are in `bible/`. Start at `bible/Home.md`, and read `bible/01-Overview/Port-Doctrine.md` before you
change code.

- **Scope**: DFO Online is its own game, not a 1:1 port. Daggerfall Unity (DFU) is the reference: read it first, cite
  it, and name each departure from it. It is not a target to match. Pages that say "1:1" are history.
- **ARENA2 is freeware**: `sh tools/fetch-data.sh <dir>` puts Daggerfall's own data at `<dir>/arena2` (~150 MB, never
  in the repo). Fetch it before work that reads the map, the game's files or the running game, and set `ARENA2_PATH`
  to it.
- **Before a push**: run `npm run lint`, `npm run types` and `npm run test:changed` (the tests a change can reach).
  When that selects most of the suite, run the change's own test files and leave the rest to CI. CI's `verify` runs
  lint, types, every test file in eight shards and the build on every pull request and before every deploy. A pull
  request is done when `verify` is green on its head. A pull request that conflicts with its base runs no workflow, so
  merge the base in before the push you want verified.
- **The loot level gate is not published**: patch notes, release notes and Discord posts never give the levels,
  factors or drop chances in `src/systems/loot/lootLevelGate.js`. Say only that Rare and Legendary gear is rarer early
  on and more common as a character grows.
- **Patch notes go in the pull request's description**, under `## Patch notes: <title>`
  (`.github/pull_request_template.md`). The desktop release reads them there, so editing a merged pull request's
  description rewrites its release notes (`release-notes.yml`). Never commit a patch-notes file
  (`test/tooling/rel4_release.test.js` fails on one).
- **Patch notes are written in ASD-STE100 Simplified Technical English** (`bible/01-Overview/Desktop-App.md`,
  STE-NOTES). The `ste-notes` check reads the description each time it changes: write it to a file and run
  `node scripts/steNotes.mjs <file>` before you post it.
- **Discord is code**: the bot's commands are in `server-account/src/discordCommands.js`, its cards and answers in
  `server-account/src/discord.js`, its channel and moderators in `server-account/wrangler.toml`. The account deploy
  (`account-deploy.yml`) writes them to Discord. Change Discord by changing those files. A person still invites the
  bot, grants its roles and rotates its token (the `DISCORD_BOT_TOKEN` secret).
- **The hosts do not grow** (`bible/01-Overview/Host-Split.md`): new behaviour goes into a module the host wires
  (`src/scenes/fishHost.js` is the shape), never into `bootWorld`, `createWorldModes`, `buildDungeonContext`,
  `bootExterior`, `createNavalHost` or `createComeSailAwayRuntime` themselves, and on the relay into a `Room` method
  of its own, never into `_message`. No test enforces this.
