# Translations

Each folder is one language, named by its BCP 47 tag (`fr`, `pt-BR`, `zh-Hant`). Its files are string tables in
Daggerfall Unity's own format, so a DFU translation pack's files work beside them.

- **`Port_Strings.csv`** holds the game's own words: menus, the online game, the enhanced interface, and everything
  Daggerfall Unity does not have.
- **`Internal_Strings.csv`, `Internal_RSC.csv`** and DFU's other tables hold Daggerfall's own text, keyed as DFU keys
  it. They arrive with the L10N3 slice.

`en/Port_Strings.csv` is the English catalog. It is generated from the source by `node tools/l10nExtract.mjs`; do not
edit it by hand, because the English the game shows is written in the code.

## The format

Each file is UTF-8 with two columns, `Key,Value`, and every value quoted with any quote doubled (`""`). Keep the key
exactly as it is.

`Port_Strings` values use a small ICU MessageFormat subset:
- `{name}` puts an argument in place.
- `{n, number}` is a number in your language's separators.
- `{n, plural, one {# item} other {# items}}` picks by your language's plural rules (`zero`, `one`, `two`, `few`,
  `many`, `other` - use the ones your language has, and always `other`).
- `{n, selectordinal, ...}` does the same for ordinals.
- `{x, select, male {...} female {...} other {...}}` picks by a word.

Keep every argument name; translate only the words around them. A lone apostrophe is plain text; write `'{'` for a
literal brace.

## Reviewed translations only

This repository ships English and translations that a person wrote or reviewed. A
language folder is added with the whole translation reviewed, and the reviewers named in `translators.json`.

## Fixing a translation

There are two ways in. Name the language in the title either way.

**A pull request.** Edit the value in `locales/<tag>/Port_Strings.csv` and send it. `Port_Strings.meta.json` records
who wrote each row, so your edit is recorded as a person's row and kept.

**The review sheet**, if you would rather work in a spreadsheet:

    node tools/l10nReview.mjs --export fr > fr-review.csv            every row
    node tools/l10nReview.mjs --import fr fr-review.csv              apply the filled fix cells

The sheet has five columns: `key`, `english`, `translation` (as it stands), `owner` (`person`, `missing`, or `machine`
for a row with no person's record) and an empty `fix`. Fill in `fix` wherever you would say it better, and leave
everything else as it is. The import holds every fix to the catalog's rules. Each `{argument}` the English names must
stay, and plurals use your language's own categories. A row whose English changed since you exported is refused as
stale, and you'll need to export again. Every applied fix is recorded as a person's row (`"by": "human"`). If you
can't run the tool, attach the filled sheet to a translation issue and a maintainer will import it.

**Credit.** Add your name to `locales/<tag>/translators.json` (a JSON list of names) in your pull request, and the
About pane will credit the language as translated by you.

## Coverage

    node tools/l10nCoverage.mjs           a Markdown table: each language's share of the catalog
    node tools/l10nCoverage.mjs --json    the same numbers as JSON

For every language it lists:
- how many of the English catalog's keys have a row;
- how many of those are the machine's and how many a person's;
- what is still owed;
- a person's rows whose English has moved since (stale: theirs to review);
- a bundled pack's tables against Daggerfall Unity's English masters.

## Bundled packs

A player installs any Daggerfall Unity translation pack from their own files: the Language row's pack button. The game
also ships a pack itself, but only when its authors' terms allow it. Such a pack lives in `locales/<tag>/pack/`, in
DFU's own layout:

    locales/<tag>/pack/PACK.json     { "name", "authors": [..], "source", "license", "terms", "version"?, "licenseFile"? }
    locales/<tag>/pack/LICENSE       the pack's own licence text, verbatim
    locales/<tag>/pack/Text/...      its string tables, Quests/ and Books/, exactly as a player would install them
    locales/<tag>/pack/Fonts/...     its fonts

`terms` records what the authors allowed, and when. The game layers the text in this order:
1. the language's own tables (`locales/<tag>/*.csv`);
2. the bundled pack, on top of them;
3. a pack the player installs, on top of both.

The credits carry the bundled pack's name, authors, licence and source. A pack's textures and videos are edits of
Bethesda's assets and are never bundled, whatever the pack's terms say. `node tools/l10nPack.mjs` checks every bundled
pack, and test/tooling/l10n6_tools.test.js holds the tree to it. No pack is bundled yet: one is added only once its authors'
permission is in hand.
