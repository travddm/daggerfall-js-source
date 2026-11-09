---
paths:
  - '**/*.md'
---

# Documentation

The docs are `docs/`. The base rules are in `docs/README.md` ("Writing these pages") and `docs/coding-standards.md`
("Documentation", "Spelling"). This page adds what they leave open.

## What a page holds

- What a maintainer needs to change the code safely: what a part does, where it lives, how it connects, its data
  formats and invariants, and its traps.
- Facts checked against the code. The code is the authority: when a page and the code disagree, fix the page.
- Files by path and functions by name. No line numbers.

## What a page never holds

- History: what a part used to do, which pull request or audit changed it, dated entries, version logs. Git holds it.
- Ticket, slice, audit or report codes, and quotes of chat or of people.
- Process diaries, plans and studies. Those live outside the repository.
- Links to `bible/`. That tree was deleted; link the `docs/` page that covers the subject, or nothing.
- Patch notes. They go in the pull request's description (`CLAUDE.md`).

## Keeping the docs true

- A change that makes a page wrong updates that page in the same pull request.
- A new page goes in its folder's `README.md` table. Keep a page under about 250 lines.
- A README beside code (`tools/parity/README.md`, a `vendor/<mod>/README.md`) follows the same rules.

## Before a push

Run `npm run markdown` and `npm run spell` on the pages you changed. Lines stay within 120 columns outside tables and
code blocks. A real word cspell does not know goes in `cspell.words.json`, in alphabetical order.

## Prose

Short sentences in the active voice, one term for one concept, `must`, `should` and `may` for required, recommended and
permitted. No em dashes, no stock phrases ("dive into", "it is important to note"), no closing line that restates the
paragraph.
