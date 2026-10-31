# The wire protocol

This page covers the frames between the game client and the relay, the shared module that defines them, and how to
change the protocol safely.

## One module, both ends

`src/net/wire.js` holds the protocol: frame limits, rate limits, validators, room-key helpers, close codes and the
relay version. The client imports it directly. The relay imports it through `server/src/relay.js`
(`export * from '../../src/net/wire.js'`). What the relay refuses, the client never sends, because both ends run the
same checks.

Other shared protocol modules in `src/net/` are bundled into the relay the same way: `identityToken.js`,
`hubShards.js`, `cellTree.js`, `instanceRoom.js`, `roomLease.js`, and the per-mode `*Law.js`, `*Receipt.js` and
`*Brain.js` files (gates, arena, Super Dungeons, Elite Gates, wild, duel, raid, serpent).

## Frames

Frames are JSON text with a type field `t`. There is no binary encoding.

- Some frames are recognised before parsing by their text prefix (`WORLD_PREFIX` `{"t":"world"`, `FOES_PREFIX`,
  `OWN_PREFIX`, `QUEST_PREFIX`). `frameCap(text)` picks the byte cap by prefix.
- Size caps: `MAX_FRAME_BYTES` (16 KiB) for ordinary frames, `FOES_FRAME_MAX` (64 KiB), `WORLD_FRAME_MAX` (512 KiB, or
  `WORLD_FRAME_MAX_INTERIOR` 64 KiB indoors), `QUEST_FRAME_MAX`.
- `wire2Batch` packs several frames into one batch frame. Chat channel sessions use it (`wire2: true`).

### Main frame types

| Area | Types |
| --- | --- |
| Session | `hello` (client), `welcome`, `ping`, `error`, `hub` (go to your shard), `muted`, `banned`, `slowed` |
| Presence | `pose`, `roster`, `world` (room snapshot published by the host), `own` |
| Combat | `foes` (host's foe state), hits and acts (`HIT_HZ_MAX`, `ACT_HZ_MAX`), `quest` |
| Social | `chat`, `dm`, `emote`, `roll`, party and guild frames, `trade`, `duel`, `wed`, `trav`, `caravan`, `park` |
| Group content | `gate`, `sd`, `eg`, `arena`, `wild`/`wref`, `raid`, `serpent`, `star`, `siege`, `rite`, `ow` |
| Leases | `lease` (see [group-instances.md](group-instances.md)) |

Each content area has a validator pair in `wire.js` (`validSdIn`/`validSdOut`, `validEgIn`/`validEgOut`,
`validRaidIn`/`validRaidOut`, ...). The relay runs the `In` check on what a client sends and the client runs the `Out`
check on what it receives.

### Pose

A pose is a JSON object with short keys: position, `ts` (a stamp modulo `POSE_TS_MOD`, 2^24), movement and animation
fields (`POSE_DEFAULTS`: `mv`, `wd`, `an`, `as`, `am`, `sr`, `cn`, `cr`, `ce`, `ar`, `fk`), hand flags, dead flag
`dd`, riding mode. `validPose` and `slimPose` define the accepted shape. The client sends up to `POSE_HZ` (10/s,
fewer in a crowd, `POSE_CROWD`); the relay allows `POSE_HZ_MAX` (20/s) and batches fan-out every `POSE_BATCH_MS`.

### Limits worth knowing

| Constant | Value | Meaning |
| --- | --- | --- |
| `NAME_MAX` / `CHAT_MAX` | 24 / 240 | Name and chat line length |
| `CHAT_HZ_MAX` / `CHAT_ROOM_HZ_MAX` | 2 / 20 | Chat lines per socket / per room per second |
| `SOCKETS_MAX` | 256 | Sockets per room |
| `PARTY_MAX` / `FRIENDS_MAX` | 8 / 64 | Party and friends list size |
| `HEARTBEAT_MS` / `PING_MS` | 20 000 / 5 000 | Pose heartbeat; idle ping |

### Close codes

| Code | Name | Client reaction |
| --- | --- | --- |
| 1008 | `CLOSE_POLICY` | Refused (bad frame, rate abuse, old build, bad token). Sent after an `error` frame. |
| 1013 | `CLOSE_BUSY` | Room full; back off longer |
| 4000 | `CLOSE_REPLACED` | Same identity connected elsewhere |
| 4002 | `CLOSE_SAME_ROOM` | The page already holds this node |
| 4003 | `CLOSE_REPARTITION` | The cell tree changed; reconnect soon |

## The relay version

```js
export const RELAY_VERSION = 'world276';   // src/net/wire.js
```

The format is `world<N>` (checked by `relayVersionOf` and by `test/net/relayversion.test.js`). It is read by:

- the relay's `/health` and its `welcome` frame (`v`);
- `.github/workflows/relay-deploy.yml`, which deploys when the source version differs from the live one;
- `.github/workflows/account-deploy.yml`, which waits until the relay at the client's `DEFAULT_SERVER` serves this
  version (or a later one) before deploying the service, so the service never signs what the live relay refuses;
- the client, which turns `v` into feature flags.

### Feature gates

The client and the relay deploy at different times: the client with the site, the relay only when its version
changes. The client must work with an older relay for a while. Each feature that needs relay support has a minimum:

```js
export const BAN_RELAY_MIN = 215;
export function relaySupportsBan(v) { /* parses world<N> and compares */ }
```

On `welcome`, `src/net/online.js` reads `v` and sets flags (for example `instanceOk`, `starOk`). A flag is false until
a welcome arrives. Sends of a gated frame check the flag. An older relay closes a socket that sends a frame it does
not know.

In the other direction, the hello carries law numbers (`GROUND_LAW`, `GRANT_HELLO_LAW`, `LOOT_HELLO_LAW`, the cell
tree's `of`). The relay refuses an older client build with `CLOSE_POLICY` and a reason such as `old ground`.

### The version hash test

`test/net/relayversion.test.js` walks the relay's import graph from `server/src/index.js` (`RELAY_GRAPH`), hashes
the bytes of every file in it, and compares the hash to a table of `version -> sha256`. It also asserts the exact
list of files in the graph. So:

- **Any change to a file the relay bundles** (including client files under `src/net/` and the few `src/systems/` and
  `src/assets/` files it reaches) fails the test until `RELAY_VERSION` moves and a new row is added.
- A change that adds or removes an import in the relay graph must also update the expected file list.
- Old rows are never edited. Two versions cannot name the same bytes.

## Making a protocol change

1. Change the shared module (`src/net/wire.js` or the mode's `*Law.js`) and the relay handler in
   `server/src/index.js` or a module it calls.
2. Bump `RELAY_VERSION` to the next `world<N>`.
3. If the client sends something new, add `<NAME>_RELAY_MIN = N` and `relaySupports<Name>(v)` in `wire.js`, and gate
   the client's sends on the flag set from the welcome.
4. If the relay must refuse old clients, raise the matching hello law number and its refusal reason.
5. Add the row `world<N>: '<sha256>'` to `test/net/relayversion.test.js` (add the row with a placeholder; the failing equality assertion shows the actual hash) and update
   the expected graph if imports changed. Update tests that assert `*_RELAY_MIN` values.
6. Merge. The relay deploys on the push to `main`, and every player reconnects.

Two open pull requests that both bump the version conflict: when one merges, the other takes the next number and
recomputes its hash.
