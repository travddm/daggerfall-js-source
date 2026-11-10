# Documentation guide

Which kind of statement goes where, when a change must update a page, and how to write one. It applies to the pages in
`docs/`, to the `README.md` files beside code, and to code comments. The page rules for the whole tree are in
[README.md](README.md) ("Writing these pages"); this page adds what they leave open.

## What lives where

Every statement belongs to one of three kinds. The kinds have different readers and change at different rates, so a
page that mixes them is too long for the reader who needs it and never current for the one who wrote it.

- **What a maintainer needs to change the code safely.** What a part does, where it lives, how it connects, its data
  formats, invariants and traps. Short, stable, no history. This is what `docs/` holds.
- **What was measured or decided on the way.** A probe result, a study, a plan, a design choice and its alternatives.
  These live outside the repository, with the owner's plans. A page states the outcome as a rule or a guarantee, not
  the road to it.
- **What the code guarantees.** Wire formats, save formats and public module interfaces. Exact, versioned with the
  code, and pinned by a test where one can pin it.

A statement lives in one page. Every other page links to it. A second copy drifts, and the reader cannot tell which
copy is right.

## When to update

A page changes in the same commit as the code that makes it wrong. When in doubt, ask whether a reader of the page
after the change would be confused or misled: if so, the page is part of the change.

A new page goes in its folder's `README.md` table in the same commit.

## What a page never holds

- History: no "landed", "since", "used to" or "now", no dates, commit hashes, pull request numbers, or review findings.
  Git holds the history.
- Decision, pull request, audit or item tags (`decision 104`, `P7`, `AUDIT SLAM`). State the rule in words.
- Line numbers. Name the file and the function.
- A number the reader does not act on. Keep a width, a limit or a default. Leave out a measured figure, or link the
  page that owns it.

## Future work

Open work that the repository tracks lives in a short page under `docs/**/future-work/`, one file per unit of work:
the problem, why it is deferred, the affected scope, and the intended result. When the work lands, remove the page. Do
not strike it through. Before you remove it, promote what a future reader needs to the page that owns the subject: a
guarantee to its system page, a trap to the page for the part that has it.

## How to write it

- Short, direct sentences in the active voice, one idea each. A list where the content is a list.
- One term for one concept, the same as the identifier in the code.
- A condition next to the statement it qualifies. Prefer a concrete statement to "some", "various" or "usually".
- **must** is required, **should** is recommended, **may** is permitted.
- Files, functions and settings in backticks. Cross-references as Markdown links. Commands and formats in code blocks.
- A page leads with what the maintainer does or needs to know. Depth is a link, not another section.
- No em dashes, no stock phrases, no closing line that restates the paragraph.

Run `npm run markdown` and `npm run spell` on the pages you changed before a push. Lines stay within 120 columns
outside tables and code blocks. A real word that cspell does not know goes in `cspell.words.json`, in alphabetical
order.

## Comments

The same rules apply to code comments. The comment rules are in [README.md](README.md) ("Code comments") and
[coding-standards.md](coding-standards.md). In short: a comment is the exception, and it says why.
