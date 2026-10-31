# The client's net layer

This page covers the game client's side of online play: the relay session, remote players, the account client, and
cloud saves. The frames themselves are in [wire-protocol.md](wire-protocol.md).

## Files

| Path | Role |
| --- | --- |
| `src/net/online.js` | `OnlineSession`: sockets to relay rooms, hello, reconnect, peers, pose interpolation |
| `src/net/remotePlayers.js` | `RemotePlayers`: draws peers (dolls, creature bodies, corpses, name tags, sounds) |
| `src/net/accountClient.js` | HTTP client for the account service: sign-in, identity tokens, every `/v1/...` call |
| `src/net/heartbeat.js` | `createHeartbeat`: the batched `/v1/heartbeat` call (mail, board, play time) |
| `src/net/identityToken.js` | Token and order format (Ed25519), shared with both services |
| `src/net/backoff.js`, `src/net/reconnectWave.js` | Retry jitter; spreading reconnects after a relay deploy |
| `src/systems/cloudSaves.js` | Cloud save slots |
| `src/net/updateNotice.js` | "Server updated" notices from the relay version and the site build |
| `src/scenes/world.js` | Creates the sessions (`onlineStart`) and wires them into the game |

## OnlineSession

```js
new OnlineSession({ url, name, look, id, secret, presence, acct, asecret, mintToken, wave, wire2, ... })
```

- **URL.** `relayUrl` (`wire.js`) accepts `wss://` to any host, and `ws://` only for `localhost` or `127.0.0.1`. The
  default is `DEFAULT_SERVER` in `online.js`. `onlineStart` takes `?server=<url>`, then the `onlineServer`
  preference, then the default.
- **Sessions per page.** One presence session (the player's body in the world) and separate chat channel sessions
  (`presence: false`, `wire2: true`, sharing `pageWave`). Instance, Elite Gate, staff and caravan links create their
  own sessions.
- **Rooms.** `roomKeyFor({ host, mode, mapId, regionIndex, locationName, buildingKey, mapPixel, instance, ... })` builds
  the room key. `join(room, pose)` and `leave()` change room; a key change closes the old socket and opens a new one.
  In the open country `setHalo(rooms)` keeps sockets to neighbouring cells; crossing into a held halo cell promotes
  that socket without a reconnect.
- **Hello.** On socket open the session awaits `mintToken()` (raced against `TOKEN_WAIT_MS`, 8 s) and sends
  `{ t: 'hello', id, secret, name, look, pose, tok, ... }`. `mintToken` is `mintIdentity` in `accountClient.js`
  (POST `/v1/auth/token`). Sockets that open together share one mint in flight, and a token is handed to other rooms
  asked within `TOKEN_REUSE_MS` (60 s) under the same session and character, so a reconnect wave does not flood the
  service. The relay refuses a hello without a token. The name shown to others comes from the token, not from the client.
- **Welcome.** `_receive` handles `welcome`: it reads `v` with `relayVersionOf` and sets the feature flags from the
  `relaySupports*` functions, then calls `onWelcomed`.
- **Heartbeat.** The session resends its pose every `HEARTBEAT_MS` (20 s) even when still, and pings an idle socket
  every `PING_MS`. A peer silent for `PEER_TIMEOUT_MS` (4 heartbeats) is hidden, not removed. Only the room's leave
  removes a peer.
- **Reconnect.** `_scheduleRetry` uses jittered exponential backoff between `BACKOFF_MIN_MS` (1 s) and
  `BACKOFF_MAX_MS` (8 s). `CLOSE_BUSY` starts at half the maximum. `CLOSE_REPARTITION` retries almost at once.
  `CLOSE_POLICY` with a retryable token reason waits for a fresh token. `bar()` latches every room shut after a ban.
- **Deploy waves.** `reconnectWave` detects two or more drops within `WAVE_WINDOW_MS` (2 s) while the browser is
  online, and holds each socket's first retry to a shared random offset of up to `WAVE_SPREAD_MAX_MS` (40 s), scaled
  by the number of players online. This stops a relay deploy from causing a reconnect storm.

### Remote players and interpolation

`OnlineSession.peers` is a `Map` of peers per room (`_member`, `_unmember`). Interpolation lives in `online.js`:
`lerpPose`, `poseAlong(path, c)`, `cadenceOf`, `cushionOf`, `rateFor`. Playback runs behind real time by a cushion
measured from the peer's own send cadence, and the playback rate is clamped between 0.75 and 2 to catch up or wait.

`RemotePlayers` draws what the session holds: `dollFor(look)` builds a dressed character, `_mobileFor` a creature
body (shape-shifted players), with an archive cache evicted by use (`_touch`, `_evict`). It also holds corpses
(`addCorpse`, `CORPSE_MS` 60 s, `CORPSES_MAX` 32), party bodies, name tags (`drawNamePoints`) and positional sounds
(footsteps, riding, attacks).

### Who hosts the room

In a world or dungeon room, one client is the **host**: the relay names it in the welcome and in later frames
(`_sayHost`). The host publishes the room's `world` snapshot (`WORLD_PUBLISH_MS` 15 s, a full republish every
`WORLD_REPUBLISH_MS` 5 min) and its `foes` frames (`FOES_MS`, 200 ms). Other clients apply them. See
[group-instances.md](group-instances.md).

## The account client

`src/net/accountClient.js` wraps every account-service route. Shape:

```js
call(io, path, body)   // io = { fetch, base, secret }
```

- **Base URL.** `serviceBase(storage)` returns a stored `https://` override (`SERVICE_KEY`) or
  `DEFAULT_ACCOUNT_SERVICE`. Only `https` is accepted, so a local account service needs that override set to an
  https tunnel or a code change.
- **Session.** `keepSession`, `storedSession`, `forgetSession` keep `{ id, name, kind, sessionId, secret, glyphs, ... }`
  in the tab's storage (`tabStorage`, `src/systems/appStorage.js`). With no session, calls return
  `{ ok: false, error: 'no-session' }`.
- **Session pass.** `sessionPassFor`/`noteSessionPass` keep the short-lived `x-session-pass` header the service
  issues for hot routes.
- **D1 bookmarks.** `_d1Mark` keeps the `x-d1-bookmark` per secret so that reads after a write see the write;
  `forgetD1Bookmark()` runs on writes.
- **Error words.** `offline` and `server` are retried (`ASK_AGAIN_NOW`). `auth` means sign in again.
  `accountRefusalText` turns refusals into player text.
- Main calls: `openGuest`, `register`, `login`, `recover`, `logout`, `readAccount`, `changePassword`, `mintIdentity`,
  `beatPlay`, the equip calls (title, aura, icon, glyph, name), safety and moderation calls, and groups for homes,
  realm, professions, market, guilds, arena, Elite Gates, wild zone, reward claims, staff chat and duels.

## Cloud saves

`src/systems/cloudSaves.js` treats the cloud as a third place a save slot can go, beside local slots and file
export. It is not a sync engine:

- A slot is identified by `characterId|saveName` (`slotKeyOf`), not by its local number.
- `pushSlot(io, storage, key)` PUTs the slot's card to `/v1/saves/<characterId>/<saveName>`, then the data to
  `.../data` and the screenshot to `.../shot`.
- `pullSlot(io, storage, card, { replaces })` downloads a slot and imports it through `importSlots`
  (`src/systems/save/saveTransfer.js`).
- Import never overwrites another slot: it takes its own number when free, else the first free one. A slot with the
  same character, name and game minute is skipped.
- There is no merge rule and no timestamp comparison. The player pushes, restores and downloads slots by hand from
  the save menu (`runCloud` in `src/ui/enhanced/enhancedMenu.js`).
- `cloudList` (GET `/v1/saves`), `cloudOnly`, `removeCloudSlot`. Refusals: `CLOUD_REFUSALS` (`too-many-saves`, ...).

Online characters (realm characters) are different: the account service holds their truth, and the playing tab
checkpoints them under a lease. See [account-data.md](account-data.md).

## Testing locally

- Relay: run `npx wrangler dev` in `server/` and open the game with `?server=ws://localhost:<port>`.
- `npm run load` runs a bot fleet against local copies of both services (see [relay.md](relay.md)).
- Unit tests for the net layer are in `test/net/` and use `test/fakeSocket.mjs` and `test/fakeRoom.mjs`.
