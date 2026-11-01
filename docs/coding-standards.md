# Coding standards

The rules for new and touched code. Tooling checks formatting, spelling, Markdown and types; review checks the rest.

These rules apply to a file when you create it or change it. Existing files keep their current names and layout until a
later mechanical pass renames and reformats them. Do not rename or reformat a file only to meet a rule here.

## Tooling

| Tool         | Config                                | Run                                           |
| ------------ | ------------------------------------- | --------------------------------------------- |
| ESLint       | `eslint.config.js`                    | `npm run lint`                                |
| TypeScript   | `tsconfig.json`, `tsconfig.node.json` | `npm run types`                               |
| Prettier     | `.prettierrc`, `.prettierignore`      | `npm run format:check` / `npm run format:fix` |
| markdownlint | `.markdownlint.json`                  | `npm run markdown`                            |
| cspell       | `cspell.json`, `cspell.words.json`    | `npm run spell`                               |

`format:check`, `format:fix`, `markdown` and `spell` run on the files that your branch changed against its base branch
(`origin/feat/tamriel-review`, or `BASE_REF`), including uncommitted and untracked files
(`tools/check-changed.mjs`). They never touch a file you did not change. CI runs the same three checks on a pull
request's changed files (the `standards` job in `.github/workflows/check.yml`).

The lint size ratchet (limits on file size, complexity and unused code that may only go down) is described in the
lint-ratchet page of [testing/](testing/README.md) once that page has merged.

## Formatting

Prettier owns formatting. Do not format by hand and do not argue with its output.

- Two spaces, no tabs. Most of the code already uses two spaces, so touching a file does not re-indent it. Surge uses
  tabs; this repository does not, to keep the later reformat small.
- Print width 120, single quotes, semicolons, trailing commas everywhere.
- Import order is not enforced. A sorting plugin would reorder the imports of every file you touch.
- Markdown prose is not re-wrapped (`proseWrap: preserve`); markdownlint holds a line to 120 columns outside tables and
  code blocks.

`npm run format:fix` formats a file whole. On an old file that makes the diff larger than your change, so do it in a
commit of its own and say so in the pull request.

## Naming

- A file is named for its concept, in `kebab-case` (`changed-paths.ts`). Do not name a file for a ticket, a slice or an
  audit.
- `PascalCase` for types and classes; `camelCase` for functions and variables; `UPPER_SNAKE_CASE` for constants that
  are tables or sentinel values.
- A module has one responsibility, and a name that says what it is without an "and". A file past about 150 lines is a
  prompt to ask what else it has taken on, not a limit.
- Group a concern in a directory, with an `index` file where siblings collect.
- Entry modules stay thin: they wire modules that can be tested alone. The hosts rule in
  [architecture/hosts-and-modules.md](architecture/hosts-and-modules.md) applies.
- Factor out the third copy, not the second.
- Splitting a module is a refactor: move the code as it is, keep its exports working, and keep the move in a commit of
  its own.
- Do not use a generic name (`utils`, `helpers`); the test selector and search match it everywhere.

## Tests

- A test file is named for the module it tests and mirrors the source tree: `test/<path>/<module>.test.ts` (or `.js`
  for a module that is still `.js`) tests `<path>/<module>`. Do not name a test for a ticket.
- A test imports the code and runs it, then asserts on the result. It does not read source text, except a tree-wide
  sweep that enforces a rule across many files ([testing/writing-tests.md](testing/writing-tests.md)). The `any` ban
  below is such a sweep.
- Shared non-test code for tests goes in a `.mjs` or `.ts` file without `.test.` in its name.

## Comments

The rules are in [README.md](README.md#code-comments): a comment says why, in plain sentences, and carries no quotes of
people, slice or audit tags, or dates with names. Write the prose of a comment as [technical writing](#documentation)
asks. Do not duplicate those rules here.

## TypeScript

The repository moves to TypeScript one module at a time.

- A new file is `.ts`. A module becomes `.ts` when it is extracted or substantially changed. Do not convert a file
  only for the conversion.
- Node runs `.ts` files by stripping their types (Node 22.18 or later), so a `.ts` file uses only syntax that erases to
  nothing. `erasableSyntaxOnly` makes `tsc` reject the rest: no `enum`, no `namespace`, no constructor parameter
  properties. Use a union of string literals or an `as const` object for an enum. Import with the `.ts` extension
  (`import { x } from './x.ts'`).
- `tsc` is the type check only: it emits nothing. Vite, Wrangler and the test runner all strip the types themselves.
- No `any`. Use `unknown` and narrow it. `test/tree/typescript-no-any.test.ts` fails on a use of `any` in a `.ts` file.
  ESLint cannot enforce it, because typescript-eslint supports TypeScript 6 and older and this repository checks with
  TypeScript 7.
- `strict` stays off in `tsconfig.json` until most of `src/` is `.ts`. Write a `.ts` file as if it were on: annotate
  parameters and return types of exported functions, and handle `null` and `undefined` explicitly.
- Code that runs under Node (`tools/`, `test/`) is checked by `tsconfig.node.json`, which adds Node's types. Browser
  code in `src/` is checked without them, because they redeclare browser globals such as `fetch`.
- Compiler transformers and code generation are for measured hot code with a fixed shape only. The wire protocol is the
  first candidate. Generated output is never edited by hand, and the change that adds a generator records a benchmark
  before and after. Without a measurement, write the code by hand.

## Approved libraries

A runtime dependency needs a permissive licence (MIT, Apache-2.0, BSD, ISC or zlib), first-class TypeScript types, and
a clear gain in speed or in maintained code. Any other dependency needs the owner's approval in a pull request.

A library is adopted inside the pull request that extracts or rebuilds the area it serves, never as a codebase-wide
sweep. A library that claims speed comes with a benchmark before and after.

Licences and versions were checked on npm on 2026-11-01.

| Library                                                                     | Version | Licence                       | Replaces                                                                                                                                                                        |
| --------------------------------------------------------------------------- | ------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Valibot](https://valibot.dev)                                              | 1.5     | MIT                           | Hand-written validation of wire messages, saves and account requests. One schema gives the validator and the type, shared by client and relay. No `eval`, which Workers forbid. |
| [Hono](https://hono.dev)                                                    | 4.13    | MIT                           | The account service's router and the relay's HTTP routes                                                                                                                        |
| [Drizzle ORM](https://orm.drizzle.team)                                     | 0.45    | Apache-2.0                    | Hand-written D1 queries: a typed schema, typed queries and generated migrations on top of `0001_schema.sql`                                                                     |
| [recast-navigation-js](https://github.com/isaac-mason/recast-navigation-js) | 0.44    | MIT (Recast and Detour: zlib) | The hand-written navmesh bake. Mods supply geometry before the bake.                                                                                                            |
| [ses](https://github.com/endojs/endo/tree/master/packages/ses)              | 2.3     | Apache-2.0                    | The mod sandbox                                                                                                                                                                 |
| [gl-matrix](https://glmatrix.net)                                           | 3.4     | MIT                           | Matrix and vector math, when renderer and collision code is extracted                                                                                                           |
| [Preact](https://preactjs.com)                                              | 11.1    | MIT                           | New or rebuilt UI only: the mod manager, character modes, rebuilt windows                                                                                                       |

Only when the need arises:

- [fflate](https://github.com/101arrowz/fflate) 0.8 (MIT): archive decompression.
- [msgpackr](https://github.com/kriszyp/msgpackr) 2.1 (MIT): binary wire encoding.

Not used:

- three.js and Babylon.js: they would rewrite a working renderer.
- Rapier and other physics engines: they change the movement feel against Daggerfall Unity.
- Zod: it is larger and slower than Valibot. TypeBox's compiler is out too, because it needs `eval`.
- General utility libraries: the standard library covers them.

## Documentation

Write for a maintainer who will change the code. Prefer short sentences in the active voice, one term for one
concept, and `must`, `should` and `may` used for required, recommended and permitted. Name files by path and functions
by name; do not cite line numbers.

## Spelling

cspell checks the changed Markdown, text and YAML files. A real word that it does not know, such as a Daggerfall name,
goes in `cspell.words.json`, in alphabetical order. Do not add a misspelling.
