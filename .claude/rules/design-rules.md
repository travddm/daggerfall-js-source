# Design rules

Standing decisions about what the game and the repository may do. Each is numbered as the owner's decision record
numbers it. `docs/README.md` ("Scope") holds the Daggerfall Unity baseline they build on.

## No graphics regressions (decision 104)

A change that could make the game look worse or draw slower ships as an option, and the old look stays reachable. The
pull request names the option that keeps the old look, and measures the default path against the base. Players on weak
machines and players who like the old look must not lose it to an update.

## Departures are mods, cheap options stay in core (decisions 102 and 103)

Every departure from Daggerfall Unity is an agreed mod or option, and the rules a server plays by online live in its
server profile, not in code paths of their own.

A system of our own that differs from Daggerfall Unity (new mechanics, content, UI, wire frames, relay handlers)
leaves core as a first-party mod in its own repository, once the mod API gives it the hooks it needs. Until then it
stays in core behind its option. A plain, cheap option stays in core: rendering options above all, and small tuning
values over Daggerfall Unity's own systems. The core then stays Daggerfall Unity's game and the engine. Follow
`docs/README.md` ("Every departure is a mod") for the settings.

## No payments, credit in the mod manager (decisions 107 and 114)

Nothing in the game, the site or the repository links to a payment or donation service or takes money. A mod's author
is credited in the mod manager, on that mod's entry, with links to the author's own pages; those links appear nowhere
else in the game. Credit belongs with the work it is for, and the project takes no cut of it.

## Private mods stay private (decision 110)

A private first-party mod never ships in a release build or a release download, and is not visible to anyone without
access to its repository. Check what the build bundles before a release.

## No CI size limits, split the hosts (decision 92)

The big scene hosts are split into narrow modules before the repository goes public
(`docs/architecture/hosts-and-modules.md`), and every test that reads source text is rewritten to run the code. After
that, CI holds no limit on file or function size, length or complexity; the lint ratchet's unused-code and type limits
stay.

Until `travddm/daggerfall-js-source#115` merges after the host splits (decision 96), the lint ratchet holds every
large module's and function's size (`docs/testing/lint-ratchet.md`). A change that shrinks one lowers its figure with
`node tools/lintRatchet.mjs --update`.
