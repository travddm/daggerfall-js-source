# Operations

How DFO Online is built, deployed, released and administered: the GitHub Actions workflows, the Cloudflare Workers
and their configuration, the desktop app release, and the manual workflows that repair or read production data.

- [workflows.md](workflows.md) - every workflow in `.github/workflows/`: trigger, purpose and secrets, and the
  conventions they share.
- [deploying.md](deploying.md) - the site, relay and account service deploys, their order, D1 migrations,
  `wrangler.toml` configuration, secrets and keys.
- [desktop-release.md](desktop-release.md) - the Electron app, the release workflow, version numbers, how the app
  updates, and patch notes.
- [admin-workflows.md](admin-workflows.md) - restore, revive, rollback, guild grants, recovery codes, server post,
  and the load readings.
