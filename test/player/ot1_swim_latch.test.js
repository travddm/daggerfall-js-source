// OT1 - AUDIT 64 F0's RESIDUE, WIRED: IsPlayerSwimming
// ABOVE GROUND.
//
// F0 fixed the exterior swim SPEED through `sunk` and recorded the rest:
// `exteriorSwimLatch` modelled PlayerEnterExit.Update's else arm
// (:415-421) and "still has no production caller". The reason it had
// none is that the latch is a CLEARING rule - "don't clear swimming if
// we're outside on a water tile - MeteoricDragon" - and a clear with
// nothing to guard is a no-op: both exterior hosts wrote `player.swimming
// = false` every frame (shared.js's applyMotorEffectFlags) and nothing
// above ground ever wrote true. So a sea swim never suppressed the
// encounter roll (StreamingWorld :488-491 reads IsPlayerSwimming), never
// refused a rest (355, restSession.js:"if (swimming || !grounded)"), and a dungeon exit onto open
// water lost the dungeon branch's value on its first exterior frame.
//
// DFU has exactly two writers above ground, and the port's own motor
// note at `_beginSink` names the first: PlayerHeightChanger's DoSinking /
// DoUnsinking write IsPlayerSwimming in lockstep with controllerSink
// ("the host's half of the same edge"), and PlayerEnterExit's else arm
// clears it off tile 0. `exteriorSwimming` is both, and the two exterior
// hosts call it after the surface model, feeding the value the frame
// arrived with (read BEFORE the per-frame clear) and the sink edge.
//
// AUDIT 65 XL-1 CORRECTED THE TARGET. OT1 wrote the result into
// `player.swimming`, which is levitateMotor.IsSwimming - the member
// PlayerEnterExit.cs:421 clears outdoors with NO tile test - and whose
// setter arms PlayerMotor.CancelMovement on every transition. Two edges
// a frame, one fixed step, and the exterior swimmer travelled 0 over 600
// steps at 60 Hz. The member the readers want is the OTHER one, and the
// motor now carries it: `player.isPlayerSwimming`, a plain field. The
// host-order greps below follow it; the behaviour is pinned in
// test/scenes/audit65_swim.test.js, which drives a real motor over a real
// Collider floor because nothing here can see a motor at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exteriorSwimming, exteriorSwimLatch } from '../../src/player/exteriorSurface.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (rel) => readFileSync(join(root, rel), 'utf8');

test('OT1: the sink edge writes IsPlayerSwimming, the unsink edge clears it, the latch carries between', () => {
  // DoSinking's write: sunk is swimming, on any tile (the sink itself
  // only arms on Swimming water, so the tile is 0 when it is live).
  assert.equal(exteriorSwimming({ wasSwimming: false, sunk: true, tileIndex: 0 }), true, 'DoSinking: controllerSink true -> IsPlayerSwimming true');
  assert.equal(exteriorSwimming({ wasSwimming: false, sunk: true, tileIndex: 5 }), true, 'the sink is the writer, not the tile');
  // DoUnsinking's write beats the latch: stepping from the sea onto a
  // ship hull (StaticGeometry over tile 0) unsinks, and DFU's flag goes
  // false THAT frame even though PlayerTileMapIndex is still 0.
  assert.equal(exteriorSwimming({ wasSwimming: true, sunk: false, unsunk: true, tileIndex: 0 }), false, 'DoUnsinking clears on the edge, tile 0 or not');
  // Between edges: MeteoricDragon's latch alone - the carried value
  // survives on tile 0 and clears on every other tile.
  assert.equal(exteriorSwimming({ wasSwimming: true, sunk: false, unsunk: false, tileIndex: 0 }), true, 'a dungeon exit onto open water keeps the dungeon\'s value');
  assert.equal(exteriorSwimming({ wasSwimming: true, sunk: false, unsunk: false, tileIndex: 5 }), false, 'a shallow tile is not record 0');
  assert.equal(exteriorSwimming({ wasSwimming: true, sunk: false, unsunk: false, tileIndex: -1 }), false, 'no tilemap under the player reads as not water');
  assert.equal(exteriorSwimming({ wasSwimming: false, sunk: false, unsunk: false, tileIndex: 0 }), false, 'the latch never SETS: open water with nothing carried is dry');
  // The default arguments are the shell case shared.js already wrote.
  assert.equal(exteriorSwimming(), false);
  // The latch half is the pure function ROAD-B b3 pinned - the helper
  // composes it rather than restating it.
  for (const was of [true, false]) for (const idx of [0, 2, 5, -1]) {
    assert.equal(exteriorSwimming({ wasSwimming: was, tileIndex: idx }), exteriorSwimLatch(was, idx).swimming);
  }
});

