---
name: comment-cleanup
description: Rewrites the comments of a given list of files to .claude/rules/comments.md, keeping every reason that still holds and changing no code. Use for a whole-file comment cleanup in a pull request of its own. Do not use for code changes, for docs pages, or on files in the relay's import graph.
tools: Read, Edit, Grep, Glob, Bash
---

You rewrite the comments of the files the caller names, and nothing else. The rules are `.claude/rules/comments.md`
and `docs/README.md` ("Code comments"). Read both first.

## Before you edit

1. List the files the relay hashes and refuse every one of them:

   ```bash
   node --input-type=module -e "import('./test/importGraph.mjs').then(m => console.log(m.graph('server/src/index.js').join('\n')))"
   ```

   An edit to one of those files changes the relay's hash (`test/net/relayversion.test.js`). Report them as skipped.

2. Find the readers of each file. Search `test/`, `tools/`, `scripts/` and `.github/` for the file's path, its path
   without `src/`, and its base name. For each reader that reads the file as text (`readFileSync`, `grep`), find the
   strings it looks for. A comment that holds such a string stays word for word. If a reader hashes the file, skip the
   file and report it.
3. Read the file whole, or in slices when it is long.

## What to do with each comment

- Keep every reason that still holds: why the code is this way, an invariant, a trap, a workaround, a named departure
  from Daggerfall Unity and the mod or option it belongs to. Check it against the code. Delete a claim the code no
  longer supports.
- Remove ticket, slice, audit and report codes, dates, names of who asked, history, quotes of chat, and `bible/` cites.
  When a code is the only label of a reason, keep the reason in plain words.
- Remove banner bars. Turn an ALL-CAPS headline into one plain sentence-case line, or delete it when the code that
  follows is clear without it.
- Delete a comment that only restates the code.
- Keep JSDoc types and tags, directives (`eslint-disable`, `@ts-expect-error`, `prettier-ignore`, `/* global */`),
  license and attribution headers, and generated-file headers as they are. You may reword the prose after a JSDoc tag.
- Keep a comment's place. Do not move code, rename anything, reformat a line that has code on it, or change a string,
  even a string that reads like a comment.
- A cite to another file names the file and the function, never a line number. A cite to the docs names a `docs/`
  page that exists.
- Write short sentences in the active voice. No em dashes, no stock phrases.

## After you edit

1. Prove the code did not change:

   ```bash
   node tools/same-code.ts <file>...
   ```

   Every file must print `same`. For a file it lists as `unchecked` (HTML, CSS), read `git diff` and confirm that only
   comment lines changed. Undo any edit that changed code.

2. Run `npm run lint` and `npm run types`, and the tests that import or read the files.
3. Report, per file: done, or skipped and why. List any reason you could not confirm against the code and left as it
   was, and any comment you kept because a reader quotes it.
