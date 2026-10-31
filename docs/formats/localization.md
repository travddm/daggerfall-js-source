# Localization

This page covers how player-visible text is translated: the text core (`src/systems/textManager.js`), the `t()` call
for the game's own strings, how Daggerfall's text is routed, the `locales/` tree, and the tools that keep the catalog
and translations in step. `locales/README.md` is the translator-facing guide; this page is for code changes.

## The model

- **English lives in the code.** Every string is written in English at the place it is used, with a key. English is
  never loaded from a file, so it cannot drift from what the game shows.
- **Other languages are string tables** in DFU's CSV format (`Key,Value`), one set per language, loaded on demand.
- **Lookup walks a locale chain**: the tag, then each shorter tag, then English (`pt-BR` → `pt` → `en`). A missing row
  shows the English.

## Two kinds of text

| Text | Call | Table |
|---|---|---|
| The game's own words (menus, enhanced UI, online, anything DFU lacks) | `t(key, en, args)` | `Port_Strings` |
| Daggerfall's and DFU's words (DFU interface strings, `TEXT.RSC`, locations, spells, items, factions) | `localizedText(key, en, collection)`, `localizedTextList`, `localizedStrings({...})`, `localizedTable({...})` | DFU's collections: `Internal_Strings`, `Internal_RSC`, `Internal_Flats`, `Internal_Quests`, `Internal_Locations`, `Internal_Settings`, `Internal_Spells`, `Internal_Items`, `Internal_MagicItems`, `Internal_Factions` |

### `t()` for the game's own strings

```js
import { t } from '../systems/textManager.js';

t('menu.rail.new', 'New Game');
t('example.itemCount', '{n, plural, one {# item} other {# items}}', { n });
```

Rules the extractor enforces (`tools/l10nExtract.mjs`):

- The key is a dotted name: a lower-case first segment and at least one more (`PORT_KEY`).
- The English is a literal: a string, a template with no expressions, a `+` of those, or a module-level `const` holding
  one. A translator must see the words, so a computed English is refused.
- One key has one English everywhere.
- The pattern parses in the supported ICU subset: `{name}`, `{n, number}`, `{n, plural, ...}`,
  `{n, selectordinal, ...}`, `{x, select, ...}`. Plural categories come from `Intl.PluralRules`. A lone apostrophe is
  text; `'{'` is a literal brace.

Call `t()` when the text is shown, not at module load: the language can change in play. For a table of words, use a
getter (`get label() { return t(...); }`) or the lazy helpers in `modSettings.js`. `tIn(code, key, en, args)` formats
in a language other than the current one (the language picker shows each language in itself).

### DFU text

DFU resolves its interface words by key (`TextManager.GetLocalizedText`). The port holds DFU's English as constants and
reads each through `localizedText(key, en)`, so English is byte-identical and a translation's row wins when present.
`localizedStrings` and `localizedTable` wrap a constant table so every property read goes through the lookup.
Name helpers: `getLocalizedRegionName`, `getLocalizedLocationName`, `getLocalizedSpellName`, `getLocalizedItemName`,
`getLocalizedMagicItemName`, `getLocalizedFactionName`, `getLocalizedEnemyName`. `formatText` handles DFU's
`string.Format` patterns (`{0}`, `{0:00}`).

`textManager.js` also ports DFU's `StringTableCSVParser` quirks (an unquoted value ends at its first comma; a header
row is dropped only when it is exactly `Key,Value`), `StringTablePatcher`, and the grammar processor (`Grammar.cs`; a
language can register rules, as `systems/grammar/frenchGrammar.js` does). The module imports nothing: callers hand it
any game fact it needs.

### Pseudo-locale

`?lang=qps-ploc` shows every routed string accented and lengthened. Text that stays plain English was never routed;
text that overflows its box has no room to grow. Use it to check a UI change.

## The `locales/` tree

```text
locales/
  README.md                     translator guide
  en/Port_Strings.csv           the English catalog: GENERATED, never edited by hand
  <tag>/Port_Strings.csv        a language's rows
  <tag>/Port_Strings.meta.json  per key: hash of the English read, hash of the text written, and who wrote it ("by")
  <tag>/glossary.json           { "English": "translation" }, names kept consistent across a run
  <tag>/translators.json        names credited in the About pane (optional)
  <tag>/pack/                   a bundled DFU translation pack (none yet): PACK.json, LICENSE, Text/, Fonts/
```

- `src/systems/localeCatalog.js` `LOCALE_CATALOG` lists the offered languages: tag, native and English name, script.
  `drafting: true` means the drafts are incomplete, so the drafts alone do not offer the language (an installed pack
  does). `hidden` keeps a locale out of the picker. Right-to-left and complex scripts are not offered yet.
- `src/scenes/localeData.js` globs `locales/*/*.csv` as lazy chunks and loads only the chosen language's chain. Text is
  layered: machine drafts, then a bundled pack, then a pack the player installed. Boot picks `?lang=` for one visit,
  else the saved pref `language`. A language that fails to load leaves English.
- A player installs any DFU translation pack (folder or zip) from the Language row. `src/systems/translationPacks.js`
  classifies its files (`Text/<Table>.csv`, `Text/Quests/*-LOC.txt`, `Text/Books/*-LOC.txt`, `Text/NameGen.txt`,
  `Fonts/FONT000N-SDF.*`); `src/scenes/translationStore.js` keeps them.
- `vendor/dfu-text/Internal_*.csv` are DFU's English masters for its collections. Drafts are made from them and tests
  hold the port's English constants to them. The game does not load them.

### Who owns a row

`<table>.meta.json` records what a machine wrote. A row whose text no longer matches the recorded hash was edited by a
person and is theirs: no tool overwrites it. A row whose English changed is redrafted only if a machine owns it;
otherwise it is reported as stale for review. The Language row and About pane say which languages are machine drafts.

## Workflow for a code change

1. Write new player-visible text through `t()` (or `localizedText` for a DFU string). Do not add bare English literals
   to UI code.
2. Run `node tools/l10nExtract.mjs` to regenerate `locales/en/Port_Strings.csv`, and commit it with the change.
   `--check` exits 1 when the file on disk differs from the source; the suite runs the same check
   (`test/systems/l10n1b.test.js`, `test/tooling/l10n4_routing.test.js`).
3. New or changed keys need rows in the other languages: draft them with `tools/translate.mjs` (Claude API; needs
   `ANTHROPIC_API_KEY`) or bring drafts in through `tools/l10nInSession.mjs`, which writes the rows and their
   `meta.json` entries. Every non-drafting language must cover the English catalog exactly
   (`test/systems/l10n1b.test.js`).
4. `test/systems/l10n4_hardcoded.test.js` holds a per-file count of English literals that look like prose
   (`tools/l10nHardcoded.mjs`). A file's count may fall, never rise.

Other tools:

| Command | Does |
|---|---|
| `node tools/translate.mjs --lang fr --table Port_Strings [--dry-run]` | Drafts missing and changed rows. Options `--model`, `--batch`, `--jobs`, `--limit`, `--retranslate`. |
| `node tools/l10nReview.mjs --export fr` / `--import fr file.csv` | A review sheet for translators; imports apply as a person's rows. |
| `node tools/l10nCoverage.mjs [--json]` | Each language's coverage, machine versus person, stale rows. |
| `node tools/l10nPack.mjs` | Checks every bundled pack under `locales/<tag>/pack/`. |
| `node tools/l10nRouted.mjs` | Lists DFU words routed through `localizedText` and the tables. |

## Traps

- A string built by concatenating translated pieces cannot be reordered by a translator. Use one pattern with
  arguments.
- An English plural by ternary (`n === 1 ? 'item' : 'items'`) is wrong in most languages. Use `{n, plural, ...}`.
- Keep every argument name in a translation; the pipeline refuses a draft that loses one.
- Quest and book text come from DFU packs as `-LOC` files, not from `Port_Strings`.
- Fonts: the classic bitmap fonts lack most scripts. `ui/localeFaces.js` and a pack's own `Fonts/` supply faces for a
  language.
