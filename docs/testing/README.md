# Testing

How the test suite is organised and run, how to write a test here, and the browser and service probes that sit
outside the suite.

- [running-tests.md](running-tests.md) - the runner, `npm test`, shards, `test:changed`, recorded times, game data,
  and what CI runs.
- [writing-tests.md](writing-tests.md) - folder layout, shared helpers and fakes, `modsOff`, ARENA2-gated tests, and
  what makes a good test.
- [lint-ratchet.md](lint-ratchet.md) - the size, complexity, unused-code and `@ts-check` limits of production code,
  recorded as a ratchet that may only fall.
- [probes.md](probes.md) - the Playwright probes in `tools/*Probe.mjs`, the account-service probe, the load harness
  and the desktop-shell probe: what they need and how to run one.
