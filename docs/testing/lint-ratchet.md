# Lint ratchet

Size, complexity, unused-code and type-check limits for production code (`src/`, `server/src/`,
`server-account/src/`). Code that is already over a limit is recorded in `tools/lintRatchet.json` with its current
figure. The record may only fall. The script is `tools/lintRatchet.mjs`; `npm run lint` runs it after ESLint.

## The limits

| Check                             | Limit (target)                                              | Recorded figure, per                                                                                                   |
| --------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `max-lines`                       | 1,000 lines a file                                          | file: its line count                                                                                                   |
| `max-lines-per-function`          | 150 lines a function (IIFEs included)                       | `file::Function 'name'#n`: its line count. Unnamed functions share one `file::(unnamed)` entry: the sum of their lines |
| `complexity`                      | 20                                                          | file: the summed excess over 20 of its functions                                                                       |
| `max-depth`                       | 4 nested blocks                                             | file: the count of blocks nested deeper                                                                                |
| `no-unused-vars`                  | none (`_`-prefixed arguments and caught errors are allowed) | file: the count of reports                                                                                             |
| `no-unused-private-class-members` | none                                                        | file: the count of reports                                                                                             |
| `ts-check`                        | every file under `src/` starts with `// @ts-check`          | file: `1` for a file without it                                                                                        |

The limits are in `LIMITS` in the script. Blank lines and comments count: the limits cap how much a reader must hold.

## What fails

`npm run lint` (and CI) fails when:

- a recorded figure **grows** (a file gets longer, a function longer or more complex);
- something **not recorded** crosses a limit (a new file over 1,000 lines, a new unused variable, a new file under
  `src/` without `// @ts-check`).

CI's lint job also runs `node tools/lintRatchet.mjs --strict`, which fails too when a recorded figure has **fallen**
and the file was not updated. Locally, a fallen figure is only reported.

The `ts-check` record is the list of files that do not yet carry `// @ts-check`. A file that is not in it must keep the
comment, so the checked set can only grow. Add the comment to an old file, run `npm run types`, then update the
ratchet to drop it from the list. The comment is not added to old files in bulk: each file must pass `npm run types`.

## Updating after a file shrinks

```bash
npm run lint:ratchet -- --update
```

Commit `tools/lintRatchet.json` with the change. `--update` lowers figures that fell and drops entries that reached
zero or whose file is gone. It never adds an entry and never raises one.

A moved or split file is the exception: the new path is not recorded, so it fails as a new offender. When the move
keeps the code as it was, run `npm run lint:ratchet -- --update --allow-new`. That re-baselines every entry from the
current tree, so check that the diff of the JSON shows only the entries of the move. Prefer a split whose pieces are
under the limits: they need no entry.

The file has one entry a line, sorted by key, so two branches that lower different files merge without a conflict.
After a merge conflict in it, take either side and run `--update --allow-new` on the merged tree.

`npm run lint:ratchet -- --report` prints the count and the ten largest of each check.

## Why a ratchet

The tree has functions of tens of thousands of lines. A limit that fails on all of them would block every change; a
limit that exempts a whole file lets it keep growing. The ratchet fails only on growth, so the count of offenders and
their sizes can only go down while the refactor moves code out. The new-code rule (HOST-SPLIT in `CLAUDE.md`) is the
same limit in another form: new behaviour goes into a module of its own, which starts under every limit.

Function identity is its name and its occurrence among same-named offenders in the file. Adding a same-named offender
above another shifts the numbers; update with `--allow-new` and read the diff.
