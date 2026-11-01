# DFO Online documentation

DFO Online is a browser RPG based on The Elder Scrolls II: Daggerfall, with an online world. These pages are for
the people who maintain it. The code is the authority: when a page and the code disagree, fix the page.

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
| [operations/](operations/README.md) | Workflows, deploying the site and services, the desktop release, admin workflows |

## Writing these pages

- Write for a maintainer who will change the code. Say what a part does, where it lives, how it connects, and its
  traps. Leave out history: git holds it.
- Name files by path and functions by name. Do not cite line numbers.
- Keep a page under about 250 lines. Add a page to its folder's `README.md` when you add it.

## Scope

Daggerfall Unity (DFU) is the baseline: its rules, numbers, data formats and feel are what the game does unless a
reason says otherwise. A departure from DFU is allowed in two cases only:

- **Online**: online play needs it (shared state, trading, anti-cheat, many players in one place).
- **Better design**: it is a written, agreed design that is better for play.

Name each departure where you make it (in the code comment or the page that covers it) and say which of the two cases
it is. A departure that makes play or progression feel worse than DFU is a defect, and the fix is to revert it. Read
the DFU source for the behaviour first; its MIT-licensed code is the reference ([mods-and-vendor.md](formats/mods-and-vendor.md)).

## Code comments

- A comment says why: the reason, an invariant, a workaround, a constraint the code cannot show. The code says what.
- Write plain sentences. Do not write ALL-CAPS headlines, quotes of people, dates with names, version histories,
  slice or audit tags, or notes about where code used to be. Git holds history.
- Do not cite documents by line number. Name a file and a function.
- Rewrite a comment you touch if it breaks these rules. Do not reformat lines you do not otherwise change.

## Tests

A test imports the code and runs it, then asserts on the result. A test that reads a source file's text is not allowed,
except a tree-wide sweep that enforces a rule across many files ([testing/writing-tests.md](testing/writing-tests.md)).
