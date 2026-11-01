# Multiplayer

The online game: the relay (`server/`), the wire protocol, the client's net layer, the account service
(`server-account/`), moderation and staff tools, and group content.

- [relay.md](relay.md) - the Cloudflare Worker and its `Room` Durable Object: routes, room kinds, hello, storage,
  alarms, deploy, tests.
- [relay-scaling-and-cost.md](relay-scaling-and-cost.md) - the cell tree, hub shards and the hub poll, and what keeps
  Durable Objects awake and billed.
- [wire-protocol.md](wire-protocol.md) - `src/net/wire.js`, frame types and limits, `RELAY_VERSION` and the one-version rule,
  and how to make a protocol change.
- [client-net.md](client-net.md) - `OnlineSession`, reconnects, remote players, the account client, cloud saves.
- [account-service.md](account-service.md) - the `daggerfall-accounts` Worker: bindings, routing, API surface, auth
  and identity tokens, AdmitGate, crons, deploy.
- [account-data.md](account-data.md) - D1 migrations and tables, saves and realm characters, the Marks ledger,
  market, homes and decor, integrity checks.
- [chat-safety.md](chat-safety.md) - a chat line's path, reports, sanctions, the AI reviewer, the Discord bot.
- [staff-tools.md](staff-tools.md) - roles, the staff panel's service side, in-game commands, follow, freeze, hidden
  mode, staff events, monitoring feeds.
- [group-instances.md](group-instances.md) - how instances, Super Dungeons, the arena and the wild zone run on the
  relay: hosts, leases, receipts and claims.
