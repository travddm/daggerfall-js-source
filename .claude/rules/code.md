---
paths:
  - '**/*.{js,mjs,cjs,ts,mts,cts,glsl,vert,frag}'
---

# Writing code

`docs/coding-standards.md` holds the standards for new and touched code. This page adds what it leaves open.

## File names

A new file is named in kebab-case for what it holds (`changed-paths.ts`), and its test is `<module>.test.ts`
(`changed-paths.test.ts`). Existing files keep their names until a later rename pass renames them all at once; do not
rename one in passing, because a scattered rename breaks every open pull request that touches it.

## Move what you touch out of a big module

When a change edits code in a big module (about 1,000 lines) or a big function (about 150 lines), move the code you
touch, and its natural neighbours, into a small module of its own, named for what it holds. Move it as it is, with
behaviour unchanged; a behaviour change goes in a separate commit after the move. Move the tests, docs and references
that name the code with it. Leave the rest of the big module alone. The tests that run for a change are picked by the
import graph, so code in a small module is checked by its own tests instead of most of the suite. If the move is out of
proportion to the task, say so in the pull request instead of doing it or skipping it silently.

## Readable code

New code is plainly readable, whatever the surrounding code does: one statement a line, real names instead of
abbreviations, a comment for each why the code cannot show (`.claude/rules/comments.md`), and declared shapes (a
TypeScript type or a JSDoc `@typedef`) for the objects it passes around.

## Tests run the code

A test imports the code and runs it, then asserts on the result. It never reads a source file's text to look for a
line, except a tree-wide sweep that enforces a rule across many files (`docs/testing/writing-tests.md`). A text pin
breaks on every harmless edit and passes when the behaviour is wrong.

## Out-of-scope findings

Work you find that the task does not need is not done silently. Leave a short `TODO` for a small item, or a future-work
note in the pull request for a larger one, and say so in the description. Scope that grows unannounced makes a pull
request hard to review and hard to revert.

## Shaders

Shader text lives in JavaScript template strings today (`docs/rendering/renderer.md`, "Shaders and GLSL modules"). Once
the shader loader lands, a new shader goes in its own `.vert` or `.frag` file, so editors and linters read it as GLSL.
Until then, follow the page.
