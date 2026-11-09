# Lint ratchet

Unused-code and type-check limits for production code (`src/`, `server/src/`,
`server-account/src/`). Code that is already over a limit is recorded in `tools/lintRatchet.json` with its current
figure. The record may only fall. The script is `tools/lintRatchet.mjs`; `npm run lint` runs it after ESLint.

## The limits

| Check                             | Limit                                                       | Recorded figure, per            |
| --------------------------------- | ----------------------------------------------------------- | ------------------------------- |
| `no-unused-vars`                  | none (`_`-prefixed arguments and caught errors are allowed) | file: the count of reports      |
| `no-unused-private-class-members` | none                                                        | file: the count of reports      |
| `ts-check`                        | every file under `src/` starts with `// @ts-check`          | file: `1` for a file without it |

There is no limit on the size, complexity or nesting of a file or function. The owner decided on 2026-11-08 that CI
enforces none. The project instead commits, before the new repository goes public, to
break the large modules into readable modules with narrow interfaces and to rewrite the tests that read source
text. Until then, new behaviour goes into a module of its own (HOST-SPLIT in `CLAUDE.md`).

## What fails

`npm run lint` (and CI) fails when:

- a recorded figure **grows** (a file gains unused variables);
- something **not recorded** crosses a limit (a new unused variable, a new file under
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
current tree, so check that the diff of the JSON shows only the entries of the move.

The file has one entry a line, sorted by key, so two branches that lower different files merge without a conflict.
After a merge conflict in it, take either side and run `--update --allow-new` on the merged tree.

`npm run lint:ratchet -- --report` prints the count and the ten largest of each check.

## Why a ratchet

The tree has many unused variables and files without `// @ts-check`. A limit that fails on all of them would block
every change; a limit that exempts a whole file lets it keep growing. The ratchet fails only on growth, so the count
of offenders can only go down.
