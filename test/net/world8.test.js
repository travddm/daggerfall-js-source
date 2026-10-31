// WORLD8 (Mac, 2026-09-14: "I would like dungeons and the world to respawn every hour", a real hour): THE HOUR'S RESPAWN.
// A dungeon's memory (WORLD1) kept its dead foes dead and its emptied containers empty for as long as the relay
// remembered the room - thirty days after it last drained. Now every death and every take carries a stamp (the
// relay's clock, a wall millisecond - the shared clock's own reading), and an hour past it the thing is DUE BACK:
//  - a layout foe dead past the hour is REBUILT fresh at its marker by the host through the one build chain
//    (retypeFoe as its own species: a new entity at full health with its own loot roll; the old record dead to
//    everything holding it, its corpse flat freed, its body's loot record forgotten) - the stream then says the index
//    is alive and every puppet stands up through WORLD2's un-death door; a memory that arrives with such a record
//    skips it whole (a fresh build stands, a live dead one is rebuilt);
//  - a container the room emptied past the hour is this client's own roll again: the memory's record is not applied,
//    the room's word about it forgotten, a treasure pile rolled afresh (one home with the build's roll);
//  - the sweep runs once a second on every client (the loot) and on the host (the foes); offline the clock answers
//    null and nothing is due - a save keeps its dead, DFU's own; a memory written before WORLD8 carries no stamp
//    and is applied as it stands.
// The country's foes are rolls (DFU's encounter law, by the world clock) and need no respawn; a building's shelves
// restock by the day, DFU's own, unchanged. The relay is untouched: the memory is bytes to it.
import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RESPAWN_MS, respawnDue, WORLD_TTL_MS } from '../../src/net/wire.js';
import * as relay from '../../server/src/relay.js';

const rd = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

test('WORLD8: the wire - the hour, and what is due: a stamp an hour or more before now; not a missing stamp, not without a clock, not a stamp ahead, not a minute short; one home at both ends; the memory\'s thirty days stand above it', () => {
  assert.equal(RESPAWN_MS, 30 * 60 * 1000, 'half a real hour');   // PIN MOVED (RESPAWN-30, Mac 2026-10-14: "Reduce dungeon cooldown from 1 hour to 30 minutes" - "I meant the chest and foe respawn"): a real hour
  const t = 1_789_400_000_000;
  assert.equal(respawnDue(t, t + RESPAWN_MS), true); assert.equal(respawnDue(t, t + RESPAWN_MS * 30), true);
  assert.equal(respawnDue(t, t + RESPAWN_MS - 1), false, 'a millisecond short');
  assert.equal(respawnDue(t + 5, t), false, 'a stamp ahead');
  for (const s of [null, undefined, NaN, '1789400000000', Infinity]) assert.equal(respawnDue(s, t + RESPAWN_MS * 2), false, `no stamp: ${String(s)}`);
  for (const n of [null, undefined, NaN]) assert.equal(respawnDue(t, n), false, `no clock: ${String(n)}`);
  assert.equal(relay.RESPAWN_MS, RESPAWN_MS); assert.equal(relay.respawnDue, respawnDue);
  assert.ok(WORLD_TTL_MS > RESPAWN_MS, 'a memory forgotten after thirty days empty has long since respawned whole - the sweep stands');
});

