# Group content on the relay

This page summarises how group content runs as rooms on the relay: private instances, Super Dungeons (the Abyss),
and the arena. It covers the shared mechanism and the files for each mode, not their content or tuning.

## The shared mechanism

### A client hosts, the relay referees

The game is client-simulated. In a world or dungeon room the relay names one socket the **host** and that client
runs the room's foes and bosses.

- `_hostOf` / `_hostWalk` in `server/src/index.js` pick the eldest live socket (a socket silent past
  `FOES_STALE_MS` is skipped when a live one exists). `_sayHost` tells the room.
- The host sends `foes` frames (full and delta) and the room's `world` snapshot. Others apply them.
- When the host leaves, the next eldest becomes host. The leaving host's last frames hand its foes on
  (`foesFrameHandsOn`); `server/src/foesHold.js` never drops a handover frame.
- A non-host player's blow is sent as a hit frame to the host, which applies it (`hitOwnerOf` in `wire.js`). On the
  client, `makeHitPend` (`src/net/hitPend.js`) queues a hit the session could not send yet and retries it, bounded by
  count and age; a room change empties the queue.
- Per-mode **brains** and laws (`src/net/<mode>/*Brain.js`, `*Law.js`) and the shared boss body
  (`src/net/bossBody.js`, `bossRef.js`, `bossSeam.js`) are pure modules with no browser imports. The relay bundles
  them and draws the same values from the same seed as every client, so the relay can judge what clients report.

### Room leases

`src/net/roomLease.js`. In non-social rooms a socket must hold a lease before most of its frames are heard. The
client asks its hub for a lease every `LEASE_MS` (2 minutes); a lease lives `LEASE_LIFE_S` (5 minutes). The key is
derived from the relay's `GATE_SIGNING_KEY` by HKDF (`leaseKeyOf`). A room accepts a lease only for the socket's own
account, and a newer lease wins. The client side is `_leased` in `src/net/online.js`.

### Receipts and claims

Rewards are not taken on the client's word.

1. When a fight ends, the relay (or the hub) issues a **receipt** signed with `GATE_SIGNING_KEY`
   (`importReceiptKey`). Receipt formats: `src/net/gate/gateReceipt.js`, `superDungeon/sdReceipt.js`,
   `arena/arenaReceipt.js`, `duel/duelReceipt.js`. Pending receipts
   are kept in hub storage under per-mode prefixes and swept by `_sweepHub`.
2. The client posts it to the account service (`/v1/gate/claim`, `/v1/sd/claim`,
   `/v1/arena/claim`, `/v1/duel/claim`). The service verifies it with `GATE_PUBLIC_KEY`
   (`server-account/src/signing.js`).
3. The service inserts the kill or result with `INSERT OR IGNORE` on a key that includes the receipt's nonce, so a
   receipt pays once, then pays the reward.

Unclaimed rewards of a player who left go to their mail as "Lost and Found" (`server-account/src/lostSpoils.js`,
`src/net/lostLaw.js`).

### Gating entry

The Worker refuses a key with 404 before an object exists when the mode says the room is not open (`gateHolds`,
`sdLiveAsk`, `exhibitionAdmits`). Inside, the room checks party membership through the hub
(`partyHoldsOwner`, `_instanceKinOf`).

## Private instances

`src/net/instanceRoom.js`. Key `dungeon:m<mapId>.i<owner16hex>.<epoch8hex>` (or the `interior:` form). The owner
part is a digest of the owner's account (`instanceOwnerOf`; guild castles use `instanceGuildOwnerOf`). The epoch
makes a fresh copy. Only the owner's party is admitted. Entry from the world goes through `src/scenes/instanceDoor.js`.

## Super Dungeons (the Abyss)

- Copy rooms `sd:<slot>.<owner>` (`sdRoomKey`, `src/net/superDungeon/sdLaw.js`; `server/src/sdCopy.js`). A public
  copy admits anyone up to a seat cap; a party copy admits the owner, the party and staff (`sdCopyRight`).
- The dungeon's record (open, phases, fall) lives on the hub and is validated by `validSdRecord`. The hub keeps each
  account's deaths and wins across copies (`sdac:<sub>`, `/internal/sd/acct`). The Worker refuses a copy key once the
  dungeon has closed (`sdLiveAsk`).
- Account side: `server-account/src/sds.js`, table `sd_kills` (one row per slot, account and nonce).
  `.github/workflows/sd-clears.yml` is a manual read-only listing of who cleared each slot.

## Arena

- Rooms (`src/net/arena/arenaLaw.js`): `arena:hall` (the lobby), `arena:b<16hex>` (a bout), `arena:p<code>` (a
  private bout), `arena:x<hour>` (an exhibition).
- Before a run the client takes a ticket (`/v1/arena/attempt`, `arenaAttempt`, table `arena_attempts`); a claim needs
  an open ticket (`claimArena`, `server-account/src/arena.js`). Results go to `arena_pve` and `arena_pvp`; the champion is
  settled by the `arena-champion` minute job.
- Bout logic: `src/net/arena/arenaBrain.js`, `src/systems/arena/arenaBout.js`.

## Changing a mode

Most changes touch, in order: the mode's `src/net/<mode>/*Law.js` (shared rules), its brain or referee, the handler
in `server/src/index.js` (or the module it calls), the receipt, and the claim route in `server-account/src/`. Every
file under `src/net/` that the relay imports is part of the relay version; see
[wire-protocol.md](wire-protocol.md).
