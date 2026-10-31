# The relay

The relay is the real-time half of the online game: a Cloudflare Worker named `daggerfall-online` with one Durable
Object class, `Room`. This page covers its entry point, its room kinds, the `Room` object, storage and alarms, and how
to deploy and test it. Scaling, the chat hub and cost are in [relay-scaling-and-cost.md](relay-scaling-and-cost.md).

## Where it lives

| Path | What it holds |
| --- | --- |
| `server/wrangler.toml` | Worker config: `ROOMS` binding to class `Room` (SQLite-backed), `METRICS` Analytics Engine dataset `daggerfall_relay`, `ACCOUNTS` service binding to `daggerfall-accounts`, `[vars]` |
| `server/src/index.js` | The Worker `fetch` handler and the `Room` class (about 12,800 lines) |
| `server/src/relay.js` | One line: `export * from '../../src/net/wire.js'`. The relay's protocol rules are the client's own module |
| `server/src/relayScale.js` | Scale constants, `askRoom`, `layerWalk`, `RoomMetrics`, `roomKindOf`, `ROOM_CALL_MS` |
| `server/src/cell*.js` | Cell tree: `cellNodes.js` (Worker door), `cellMoves.js` (directory), `cellHandover.js` (row moves) |
| `server/src/foesHold.js` | Holds oversized first `foes` frames and releases them one sender at a time |
| `server/src/drainWindows.js` | `flushAtDrain(room)`: posts open feed windows and clears timers when the last socket leaves |
| `server/src/sdCopy.js` | Super Dungeon copy rooms and per-account Super Dungeon state on the hub |
| `server/src/staff*.js` | Staff features on the relay; see [staff-tools.md](staff-tools.md) |

The relay imports a large part of `src/net/` (wire rules, receipts, boss brains, arena and Elite Gate law). Wrangler
bundles those relative imports. A change to any file in that import graph is a relay change; see
[wire-protocol.md](wire-protocol.md).

## The Worker entry

`export default { fetch }` in `server/src/index.js` matches in this order:

| Path | Handler |
| --- | --- |
| `/health` | JSON `{ ok, service: 'daggerfall-online', version: RELAY_VERSION, t }` |
| `SD_OPEN_PATH` | `sdOpenDoor` (Super Dungeon open check) |
| `/v1/eg/live` (`EG_LIVE_PATH`) | `egLiveAsk`: live Elite Breach rooms, read by the deploy workflow |
| `/v1/law` (`SAFE_LAW_PATH`) | `lawDoor`: signed orders from the account service (bans, mutes, staff orders) |
| `/room/<key>` | A WebSocket to the Room named `<key>` |

`roomOf` (`src/net/wire.js`) accepts only `/room/<key>` with a key of `[A-Za-z0-9_.,:+-]{1,80}`. Before any object is
created, the Worker refuses unknown or closed keys with 404 (`isChatRoom`, `isGateRoom`/`gateHolds`, `isSdRoom` plus
`sdLiveAsk`, `isEgRoom`, `isArenaRoom`, private-interior and coarse cell-node checks). A request without
`Upgrade: websocket` gets 426.

Dispatch after the guards:

- `isCellRoom(key)`: `cellDoor` resolves the cell to the node that holds it.
- `isLayered(key)` or `isGateRoom(key)`: `layerWalk` picks a layer (`<key>#<ly>`, up to `LAYERS_MAX` layers).
- Otherwise: `askRoom(env.ROOMS, key, request)`, which uses `ROOMS.idFromName`.

## Room kinds

Clients build keys; the Worker only validates them. Key builders live in `src/net/`.

| Kind | Key shape | Builder |
| --- | --- | --- |
| Exterior cell | `world:<x>,<y>` (16 map pixels a side) | `worldRoom` in `wire.js`; halo via `cellHaloFor` |
| Cell node (split area) | `cell:<level>:<x>,<y>` | `src/net/cellTree.js` (never a client room) |
| Dungeon / interior | `dungeon:m<id>...`, `interior:m<id>.<n>` | `roomKeyFor` in `src/net/online.js` |
| Private instance | `dungeon:m<id>.i<owner16hex>.<epoch8hex>` | `instanceRoomOf` in `src/net/instanceRoom.js` |
| Owned interior / boat | `owned:...` | `src/net/privateInterior.js` |
| Chat hub and channels | `chat:world`, `chat:region.<n>`, `chat:lang.<code>`, `chat:trade`, `chat:lfg`, shard keys | `wire.js`, `src/net/hubShards.js` |
| Gate courts | `gate:<day>[.<court>]`, copies `#<k>` | `src/net/gate/gateLaw.js` |
| Siege / royal | `siege:<seat>:<week>`, `royal:<seat>:<week>` | `src/net/siege/siegeRef.js` |
| Arena | `arena:hall`, `arena:b<16hex>`, `arena:p<code>`, `arena:x<hour>` | `src/net/arena/arenaLaw.js` |
| Super Dungeon | `sd:<slot>.<owner>` | `src/net/superDungeon/sdLaw.js` |
| Elite Breach | `eg:<16hex>` | `src/net/eliteGates/egLaw.js` |
| Park registry | `parkreg:<owner>` | `parkRegistryRoom` in `wire.js` |

`chat:world` is also the **hub**: the object that holds cross-room state (parties, guild outboxes, relay settings,
event records, receipts).

## The Room object

- **Hibernation API.** `Room.fetch` creates a `WebSocketPair`, checks the seat cap (`SOCKETS_MAX`, or
  `CHAT_SOCKETS_MAX` for chat rooms) and calls `state.acceptWebSocket`. The runtime calls `webSocketMessage`,
  `webSocketClose` and `webSocketError`. The object finds its sockets with `state.getWebSockets()`.
- **Per-socket state** is the socket attachment (`_attach(ws)`): room key, peer id, account, subject, layer, hidden
  flag, shard id. The runtime limits an attachment to 2 KiB. In-memory indexes (`_idx`, `_vidIdx`, `_looks`) are
  rebuilt after a wake.
- **Message dispatch.** `webSocketMessage` calls `_message(ws, message)`, then `_reap()` and `_metricsTick()`.
  `_message` is not a `switch`. It runs pre-parse fast paths (frames recognised by prefix: `WORLD_PREFIX`,
  `FOES_PREFIX`, `OWN_PREFIX`, `QUEST_PREFIX`), then parses JSON and tests `m.t` in a chain. New behaviour goes into
  a method of its own, called from that chain.
- **Rate limits.** Every frame kind has a token bucket from `wire.js` (`poseGate`, `chatGate`, `foesGate`, `actGate`,
  and so on). A sender that overspends gets strikes (`DROP_STRIKES_MAX`, `CHAT_STRIKES_MAX`) and is closed with
  `CLOSE_POLICY` (1008).

### The hello

The first frame is `{ t: 'hello', id, secret, name, look, pose, tok, ... }`.

1. The room imports `IDENTITY_PUBLIC_KEY` (a `[vars]` entry; a public key is not a secret). If the key is missing or
   does not import, every hello is refused: the relay fails closed.
2. `verifyToken` (`src/net/identityToken.js`) checks the Ed25519 identity token. The TTL ceiling is
   `min(IDENTITY_MAX_TTL_S, MAX_TTL_S)`, 300 s.
3. The hello's law numbers (`GROUND_LAW`, `GRANT_HELLO_LAW`, `LOOT_HELLO_LAW`, the cell-tree `of` field) are checked.
   An older build is refused with `CLOSE_POLICY` and a reason such as `old ground` or `old cells`.
4. Ban and freeze checks run (`_bannedHello`, `frozenHello`).
5. The room answers `{ t: 'welcome', id, peers, host, world, now, v }`. `v` is `RELAY_VERSION`.

The hello carries no relay version. The client reads `v` from the welcome to decide which features the relay
supports, and to show an update notice (`src/net/updateNotice.js`).

## Durable storage

Each Room has its own SQLite-backed storage (`state.storage`). Main keys:

| Key | Meaning |
| --- | --- |
| `hub` | Marks the hub object; `alarm()` branches on it |
| `relaycfg` | Relay settings set in game with `/relay` (`src/net/relayCfg.js`) |
| `WORLD_META`, `worldChunkKey(i)` | The stored world snapshot of a room (published by a client host) |
| `BANS_KEY`, `EVENT_KEY`, `HOME_WORDS_KEY`, `GUILD_OUTS_KEY` | Bans, live event, home notes, guild outbox |
| `look:`, `acct:`, `party:`, `park:` | Per-peer looks, accounts, parties, parked caravans |
| `*_RC_PREFIX` (`raid`, `sd`, `egrc:`, `star`, ...) | Reward receipts held for claim |
| `sweep:<kind>` | Cursors for the paged sweeps in `_sweepHub` |
| `reg` | Park registry record |

The cell tree moves stored rows between nodes when it splits or merges. `cellHandover.js` classifies every key
(`KEY_CLASSES`: part, copy, drop, block). An unknown key class blocks the move, so a **new storage key needs a class
in `cellHandover.js`**.

## Alarms

One alarm per object. `alarm()` runs, in order: the cell directory plan (`cellPlanAlarm`), the bus silence sweep, the
shard's hub flush and poll (`_hubUpFlush`, `_hubPollEnsure`), sea work, then:

- on the hub: `_sweepHub` (paged sweep of expired accounts, parties, looks, receipts) and the herald and event beats
  (`_heraldBeat`, `_sdBeat`, ...);
- elsewhere: park-registry and caravan-decor expiry, and the per-mode ticks (`_gateTick`, `_siegeTick`, `_arenaTick`,
  `_serpentTick`), then `_reap`.

Every `setAlarm` re-arms the object. See [relay-scaling-and-cost.md](relay-scaling-and-cost.md) for what that costs.

## Configuration

`server/wrangler.toml` `[vars]`:

| Var | Use |
| --- | --- |
| `IDENTITY_PUBLIC_KEY`, `IDENTITY_MAX_TTL_S` | Identity token check |
| `CELL_SPLIT_AT`, `CELL_SPLIT_DWELL_MS`, `CELL_MERGE_AT`, `CELL_MERGE_DWELL_MS`, `REGION_SHARDS` | Scaling; see the scaling page |
| `MOD_FEED_URL`, `GRANT_FEED_URL`, `HIDDEN_SEEN_URL`, `STAFF_NET_FEED_URL`, `REACTION_FEED_URL` | Signed feeds posted to the account service |
| `*_DISCORD_ROLE`, `*_DISCORD_THREAD` | Event announcements to Discord (webhook secret `GATE_DISCORD_WEBHOOK`) |
| `RAID_TOWNS_SHA256`, `BOSS_BODY` | Raid town list check; boss body mode |

Secrets (set by the account deploy, never in the file): `GATE_SIGNING_KEY` (signs receipts, chat stamps, room
leases, feeds) and `GATE_DISCORD_WEBHOOK`.

## Deploy

`.github/workflows/relay-deploy.yml` runs on every push to `main` and on manual dispatch.

1. Job `drift` reads `RELAY_VERSION` from `src/net/wire.js` and the live `/health` version. It deploys only when they
   differ (or on dispatch with `redeploy`, for a `wrangler.toml`-only change).
2. Job `verify` runs `verify.yml`.
3. Job `deploy` checks that `IDENTITY_PUBLIC_KEY` matches the account service's `/v1/pubkey`, waits for live sieges
   (`/v1/seats/sieges/live`) and for Elite Breaches under a retired law (`/v1/eg/live` against `EG_LAWS`), then runs
   `wrangler deploy` from `server/`. Dispatch with `force` skips the waits and voids open breaches
   (`EG_VOID_BEFORE`).
4. It polls `/health` until the new version answers; a miss fails the run.

**A deploy restarts every Durable Object and closes every socket.** All players drop and reconnect.
`src/net/reconnectWave.js` spreads the reconnects. The account service deploys separately and drops nobody.

## Running and testing

- Unit tests run the relay in Node with a fake Durable Object: `test/fakeRoom.mjs` (`fakeRoom`, `fakeRooms`,
  `roomSigner`) gives storage, alarms, 2 KiB attachments and `wake()` (a fresh `Room` over the same state, as after
  hibernation). It mints real Ed25519 tokens. `test/fakeSocket.mjs` is the socket.
- Relay tests are in `test/server/` and `test/net/` (for example `online_relay.test.js`, `cellmoves.test.js`,
  `cellhandover.test.js`, `relaydeploy.test.js`). Set `HUB_POLL=driven` to stop the hub poll loop; the test then calls
  `_hubPoll` itself.
- `npm run load` (`tools/loadHarness.mjs`) runs a bot fleet against the real relay and account service in local
  workerd (`--bots`, `--minutes`, `--scenario storm` restarts the relay half way). `tools/lib/wranglerLaunch.mjs`
  starts wrangler.
- `cd server && npx wrangler dev` runs the Worker locally. Point the client at it with `?server=ws://localhost:<port>`.

## Traps

- `server/src/index.js` is the entrypoint, so every named export is read as an entrypoint by the runtime. Put shared
  constants in `relayScale.js` or `src/net/`, not as exports of `index.js`.
- New behaviour goes into a module the Room calls, not into `_message` or `fetch` directly.
- The runtime calls no `webSocketClose` for a close the object made itself. Code that closes a socket must do the
  leave work itself (see `_dead`).
- Calls to other rooms carry `ROOM_CALL_MS` (5 s) deadlines. A Room that waits on another Room without one can hang.
