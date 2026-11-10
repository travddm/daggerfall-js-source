# Operations

How DFO Online is built, deployed, released and administered: the GitHub Actions workflows, the Cloudflare Workers
and their configuration, the desktop app release, and the manual workflows that repair or read production data.

- [workflows.md](workflows.md) - every workflow in `.github/workflows/`: trigger, purpose and secrets, and the
  conventions they share.
- [deploying.md](deploying.md) - the site, relay and account service deploys, their order, D1 migrations,
  `wrangler.toml` configuration, secrets and keys.
- [desktop-release.md](desktop-release.md) - the Electron app, the release workflow, version numbers, how the app
  updates, and patch notes.
- [tools-index.md](tools-index.md) - hand-run tools in `tools/` that no script, workflow or other page names.
- [operator-commands.md](operator-commands.md) - a self-hosted server's operator acts: staff roles, recovery codes,
  server posts and realm rollbacks.
- [staff-roles.md](staff-roles.md) - Admin, Moderator and Owner are account roles: who sets them, and how the
  operator sets the first Owner.
