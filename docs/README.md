# DFO Online documentation

DFO Online is a browser RPG based on The Elder Scrolls II: Daggerfall, with an online world. These pages are for
the people who maintain it and for server owners, who run the relay and the account service from `selfhost/`. There
is no official live service (decision 95). The code is the authority: when a page and the code disagree, fix the page.

Start with [getting-started.md](getting-started.md), then [architecture/](architecture/README.md). The rules for new and
touched code are in [coding-standards.md](coding-standards.md).

| Folder | What it covers |
| --- | --- |
| [architecture/](architecture/README.md) | How the client boots, the scene hosts, the frame, the `src/` layout and where new code goes |
| [rendering/](rendering/README.md) | The WebGL2 renderer: frame, shaders, lighting, shadows, sky, weather, water, performance |
| [formats/](formats/README.md) | Daggerfall's ARENA2 files, Morrowind assets, Daggerfall Unity mods, `vendor/`, localization |
| [systems/](systems/README.md) | Gameplay: characters, combat, magic, items, quests, professions, the world, naval, UI, audio, AI |
| [multiplayer/](multiplayer/README.md) | The relay, the wire protocol, the client's net layer, the account service, chat safety, staff tools |
| [testing/](testing/README.md) | Running and writing tests, and the browser probes |
| [ci/](ci/self-hosted-runner.md) | The self-hosted CI runner: design, server setup, security, capacity, rollback |
| [operations/](operations/README.md) | Workflows, deploying the site and services, the desktop release, admin workflows |

## Writing these pages

- Write for a maintainer who will change the code. Say what a part does, where it lives, how it connects, and its
  traps. Leave out history: git holds it.
- Name files by path and functions by name. Do not cite line numbers.
- Keep a page under about 250 lines. Add a page to its folder's `README.md` when you add it.
- A section about a vendored port or a first-party departure that leaves core carries one line under its heading:
  `> Leaves core: <the mod it becomes> (decision N).` Add it when you touch the section, and remove it
  when the code leaves.

## Scope

Daggerfall Unity (DFU) is the core: its rules, numbers, data formats and feel are what the game does. Every departure
from DFU is an agreed mod or option (decisions 49, 102 and 103), and online rules live in the server profile. Name the
mod or option where you make a departure (in the code comment or the page that covers it). A departure that makes
play or progression feel worse than DFU is a defect, and the fix is to revert it. Read the DFU source for the
behaviour first; its MIT-licensed code is the reference ([mods-and-vendor.md](formats/mods-and-vendor.md)).

### Every departure is a mod

The core game is DFU's rules and the engine. Every departure ships as a mod or an option, with no exceptions:

- **Mods**: a system of its own that differs from DFU (new mechanics, content, UI, wire frames, tables or relay
  handlers) leaves core as a first-party mod in its own repository, once the mod API gives it the hooks it needs.
  Until then it stays in core behind its option. Other people's departures are third-party mods.
- **Options**: every tuning value that differs from DFU is a player setting, so a single-player game can be set back to
  DFU's value or anywhere between. Plain options that are cheap to support stay in core: rendering options above all,
  and small tuning values over DFU's own systems. A "Daggerfall Unity classic" preset turns every mod and setting back
  to DFU.
- **Servers**: a server pins its mods and settings in its server profile (`src/systems/online/serverProfile.ts`,
  `src/net/profile/`), and every player on it uses exactly those. Only mods and settings that are purely cosmetic,
  and change nothing in play, are left to each player.

Until the mod manifests exist, a departure is a row in `src/systems/features.js` with its values in
`src/systems/modSettings.js`. A setting that changes play online is a server profile key; do not add new
`isOnlinePage()` branches or `src/systems/online/onlineLane.js` tables. Name the mod a change belongs to in its pull
request.

## Code comments

- A comment says why: the reason, an invariant, a workaround, a constraint the code cannot show. The code says what.
- Write plain sentences. Do not write ALL-CAPS headlines, quotes of people, dates with names, version histories,
  slice or audit tags, or notes about where code used to be. Git holds history.
- Do not cite documents by line number. Name a file and a function.
- Rewrite a comment you touch if it breaks these rules. Do not reformat lines you do not otherwise change.

## Tests

A test imports the code and runs it, then asserts on the result. A test that reads a source file's text is not allowed,
except a tree-wide sweep that enforces a rule across many files ([testing/writing-tests.md](testing/writing-tests.md)).
