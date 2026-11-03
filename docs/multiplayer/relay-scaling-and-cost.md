# Relay scaling, the chat hub, and cost

This page covers how the relay spreads load over many Durable Objects (the cell tree, hub shards, region shards), how
traffic crosses rooms, and what keeps objects awake and billed. Read [relay.md](relay.md) first.

## The cell tree (open country)

The exterior is a grid of 16-pixel cells (`WORLD_CELL`). Each cell is a room key `world:<x>,<y>`. A quadtree groups
cells into nodes, and each node is one Durable Object.

- `src/net/cellTree.js` defines the tree: `cellNodeKey` (`world:<x>,<y>` at level 0, `cell:<L>:<x>,<y>` above),
  `nodeAt`, `parentNode`, `childNodes`, `partitionRows`, `readTree`, `leafOf`. `CELL_LEVEL_MAX` is 4. The page, the
  relay and the account service all bundle this file.
- `server/src/cellNodes.js` is the Worker's door: `cellDoor` looks up which node holds a cell (`cellNodeOf`) from a
  cached copy of the tree (`CELL_TREE_KEEP_MS`, 30 s). The tree itself lives in the directory object `#cells`. If the
  directory does not answer, the Worker uses its last-seen tree.
- `server/src/cellMoves.js` is the directory. Nodes report socket counts (`cellTell`). A node past `CELL_SPLIT_AT`
  named sockets for `CELL_SPLIT_DWELL_MS` splits into four; four siblings under `CELL_MERGE_AT` together for
  `CELL_MERGE_DWELL_MS` merge back. The gap between the two thresholds stops a split from merging straight back.
  `cellLawOf(env)` reads the vars; `CELL_LAW_DEFAULT` holds the defaults.
- `server/src/cellHandover.js` moves stored rows to the new owners before the old node's sockets close
  (`handOver`, `takeHandover`). Each storage key has a class (`KEY_CLASSES`): **part** (split by pixel), **copy**
  (to every receiver), **drop** (swept), or **block**. An unknown key blocks the move.
- Sockets keep their fine 16-pixel key while sharing the node's object. A client that holds a node through a halo
  socket and asks for the same node again gets `CLOSE_SAME_ROOM` (4002). A tree change closes sockets with
  `CLOSE_REPARTITION` (4003); the client reconnects quickly.

### Halo

A player in the open country holds sockets to its own cell and to neighbouring cells (`setHalo` in
`src/net/online.js`, `RANGE_PIXELS`). Crossing into a cell already held as a halo promotes that socket without a
reconnect. Poses fan out only to peers in range (`inRange`, `poseFan`).

### Layers

A crowded room (gate courts, some layered rooms) can split into layers `<key>#<ly>` (`layerName`, `LAYERS_MAX` 8).
`layerWalk` in `server/src/relayScale.js` places a new socket in a layer with room.

## The chat hub and the bus

`chat:world` is the hub bus. It is split into 16 shard objects, `chat:world.<k>` (`HUB_SHARDS`, `chatHubRoom`).
`hubOfSubject` hashes an account to its shard. Region channels (`chat:region.<r>`) can also be split into shards
(`regionShardRoom`); the `REGION_SHARDS` var lists the regions that stay split (comma-separated, or `all`).
Gate court copies (`gate:...#<k>`) use the same mechanism.

How it works (`src/net/hubShards.js`, `server/src/index.js`):

- A socket that connects to the bus is told `{ t: 'hub', key }` and closed with reason `hub`. The client reconnects
  to its shard.
- **Up**: a shard batches its sockets' hellos, frames and closes and POSTs them to the bus at
  `/internal/hub/up` (`_hubUpFlush`, batch window `HUB_BATCH_MS`).
- **Down (the hub poll)**: the bus never calls a shard. Each shard that holds a socket runs one poll loop
  (`_hubPollEnsure`, `_hubPollLoop`, `_hubPoll`). It POSTs `/internal/hub/poll` with acknowledgements; the bus answers
  with every undelivered frame, or holds the request up to `HUB_POLL_MS` (20 s) and answers empty.
- Outboxes are bounded (`HUB_OUTBOX_MAX`, `HUB_OUTBOX_BYTES`). A shard re-syncs its count every `HUB_SYNC_MS`.

Other cross-room calls go through `askRoom` or a direct `ROOMS.get(ROOMS.idFromName(name)).fetch(...)` to an
`/internal/...` path, always with `AbortSignal.timeout(ROOM_CALL_MS)`. Examples: cell and instance rooms asking the
hub about parties (`partyHoldsOwner`), gate and Super Dungeon rooms reporting kills (`GATE_INTERNAL_FELL`,
`SD_INTERNAL_ACCT`), relay settings (`/internal/relay/cfg`).

## Other load controls

- `server/src/foesHold.js`: a room's first full `foes` frames can exceed the room's byte budget. The hold queues them
  (`FOES_HELD_PER_SENDER`, `FOES_TURN_BYTES`) and serves one sender at a time. Handover frames are never dropped.
- Pose batching: the relay batches poses per receiver (`POSE_BATCH_MS`, 50 ms) and skips poses that did not change
  (`poseChanged`), except a keepalive fan (`KEEPALIVE_FAN_MS`).
- New-voice pacing and per-room chat budgets; see [chat-safety.md](chat-safety.md).

## Cost: what keeps an object awake

On the bills seen so far, Durable Object **duration** (wall time an object is active in memory) has been the largest
line, ahead of D1 rows read and DO storage rows written. A hibernating object with idle sockets costs almost nothing. These things keep an object
awake:

| Source | Where | Effect |
| --- | --- | --- |
| **Hub poll** | `_hubPollEnsure` / `_hubPoll` | A shard with a socket always has an open subrequest to its bus (held up to 20 s, then repeated). Both the shard and the bus stay active while any player is on that shard. This is the most likely cause of always-on chat objects (hub, 16 shards, region buses and their shards). |
| Timers | `setTimeout` for pose batches, hub up/down flushes, hub counts, feed batches (`FEED_WAIT_MS` 30 s) | An object with a pending timer cannot hibernate. |
| Alarms | `_sweepHub`, hub sync (`HUB_SYNC_MS`), cell plan, mode ticks | Each alarm wakes the object. Short alarm loops are expensive. |
| Cross-room fetches | Every `/internal/...` call | Wakes the callee, and the caller waits. |
| Open feed windows | Mod feed, grant feed, reaction feed | `flushAtDrain` posts and clears them when a room empties, so a drained room can sleep. |
| Region shards | `REGION_SHARDS` | A split region keeps up to five objects awake. |

There is no `setInterval` in the relay.

Rules for new relay code:

- Do not add a timer or alarm that re-arms forever. Stop it when the room has no sockets.
- Do not add a long-poll or a held request between objects.
- Write to storage only when a value changed; storage rows written are billed.
- Prefer one batched call to the hub over one call per frame.

### Measuring

- `RoomMetrics` (`server/src/relayScale.js`) writes one Analytics Engine point per busy room per window
  (`METRICS_WINDOW_MS`, 5 min) to `METRICS`: room kind, version, sockets, hellos, frames, bytes in and out, poses,
  sends, reads, writes, refusals, foes-hold counters, cell moves. `_metricsTick` in `Room` calls it.
- `.github/workflows/relay-load.yml` is a manual read-only workflow that queries those points (Analytics Engine
  SQL).
- `.github/workflows/do-active.yml` (manual, input `days`, 1 to 7) runs `tools/doActive.mjs`, which reads each
  object's active time from Cloudflare's GraphQL dataset `durableObjectsPeriodicGroups` and writes a table to the job
  summary. Use it to find objects that never sleep. It needs the `CLOUDFLARE_API_TOKEN` secret.
