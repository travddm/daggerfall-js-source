# Testing

How the test suite is organised and run, how to write a test here, and the browser and service probes that sit
outside the suite.

- [running-tests.md](running-tests.md) - the runner, `npm test`, shards, `test:changed`, recorded times, game data,
  and what CI runs.
- [writing-tests.md](writing-tests.md) - folder layout, shared helpers and fakes, `modsOff`, ARENA2-gated tests, and
  what makes a good test.
- [probes.md](probes.md) - the Playwright probes in `tools/*Probe.mjs`, the account-service probe, the load harness
  and the desktop-shell probe: what they need and how to run one.
