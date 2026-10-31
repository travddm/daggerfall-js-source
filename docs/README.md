# DFO Online documentation

DFO Online is a browser RPG inspired by The Elder Scrolls II: Daggerfall, with an online world. These pages are for
the people who maintain it. The code is the authority: when a page and the code disagree, fix the page.

Start with [getting-started.md](getting-started.md), then [architecture/](architecture/README.md).

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
