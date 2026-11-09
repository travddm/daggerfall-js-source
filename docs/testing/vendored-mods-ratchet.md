# Vendored-mods ratchet

Every outside author's mod leaves the core repository, one pull request at a time, and goes to a private repository
of its own (decisions #77, #91 and #99). The ratchet makes sure that a removed mod does not come back, and that no
change adds to a mod that is still waiting for its removal.

`tools/vendored-mods.json` lists each mod: its folder, title, authors and links, its paths, the words that name it,
and two counts:

- `paths`: the tracked files under its paths (its `vendor/` and `public/art/` folders, its home files in `src/`, and
  the tools that serve only it);
- `lines`: the lines of every other tracked text file that name it.

Author handles that more than one mod shares are counted in the `shared` bucket, not per mod. The words of a mod are
chosen to name that mod only: a mod's count must reach zero when its removal lands, while the other mods remain.

`test/tooling/vendored-mods.test.ts` measures the tree and fails when a count grows. A count that falls passes.

## Commands

```bash
node tools/vendored-mods.ts                  # check: fail when a count grows
node tools/vendored-mods.ts --update         # lower the counts to the measurement; never raises one
node tools/vendored-mods.ts --report <folder>   # every hit of one mod, or of "shared"
```

`--update --allow-growth` sets every count to the measurement, rises included. Use it only for a change that moves a
mod's lines without adding any, such as a host split, and say so in the pull request.

## In a removal pull request

1. Remove the mod and cut its callers.
2. Run `node tools/vendored-mods.ts --report <folder>` and remove or re-aim what is left.
3. Run `node tools/vendored-mods.ts --update`, and check that the mod's counts are zero.
4. Leave the mod's entry in the manifest at zero. The last pull request of the series removes the manifest and this
   page.

A word added to a mod's entry after the first measurement raises its count, so it needs `--allow-growth` and a
reviewer's look at the rise. Prefer to choose the words once.
