// SD-REACH (2026-10-08, the Super Dungeons arc; the Discord, of an Abyss Dungeon's Rift: "In a place with absolutely no
// connection to the other blocks... was this done on purpose?"): THE RIFT WHERE A WALK REACHES. A Super dungeon's end is
// the candidate marker farthest from its way in (world/dungeon/dungeonEnd.js dungeonEndOf, RVN7d's law), and SD4b's candidates
// counted every block's START markers - which DFU reads off the starting block alone (FindMarkers) and whose first
// carries its block's water level and castle flag (SetRDBResourceData), set down wherever its maker put the data - and
// the BORDER blocks, the caps that ring a layout, so the farthest point all but always stood in one. Now the candidates
// are the enemy markers of the layout's interior blocks first (world/superDungeon/sdDungeon.js sdEndMarks), every enemy marker
// with none there, and the start markers only with no enemy marker at all. AND SD-LAND (the same thread: "it first warped
// me in a room I ve never seen before but suddenly I am flying"): the way out of a dungeon lands before its door - and a
// Hollow's door is gone with it at its end - so with no door found it answered nothing and the player stayed at the
// dungeon's own coordinates read in the street's frame, the Hour's islands high over the Hollow's pixel; now it lands
// where the player stood outside as they went in (scenes/worldModes.js dungeonReturn.from, the arena floor's AUDIT
// PRE-MERGE 1003b C7 law). Design: bible/11-Multiplayer/Super-Dungeons.md sections 6 and 16.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { sdEndMarks, SD_BORDER_BLOCK_RE } from '../../src/world/superDungeon/sdDungeon.js';
import { dungeonEndOf } from '../../src/world/dungeon/dungeonEnd.js';
import { RDB_SIDE } from '../../src/world/rdbLayout.js';

const S = RDB_SIDE;
/** A block of the layout at grid (gx, gz), its name and its start markers (block-local). */
const block = (name, gx, gz, starts = []) => ({ name, originX: gx * S, originZ: gz * S, layout: { startMarkers: starts } });
const at = (gx, gz, lx, lz, y = 0) => ({ x: gx * S + lx, y, z: gz * S + lz });

test('SD-REACH no block\'s start markers beside the enemy markers - the starting block\'s is the way in, and another\'s is its maker\'s data, set down wherever (mutant: the start markers beside them)', () => {
  const blocks = [block('N0000001.RDB', 0, 0, [{ x: 5, y: 0, z: 5 }]), block('N0000002.RDB', 1, 0, [{ x: 50, y: 0, z: 50 }])];
  const enemies = [at(0, 0, 20, 20), at(1, 0, 10, 10)];
  assert.deepEqual(sdEndMarks(enemies, blocks), enemies, 'the enemy markers alone');
  assert.ok(!sdEndMarks(enemies, blocks).some((m) => m.x === S + 50), 'the second block\'s start marker is no end');
});

test('SD-REACH an interior block\'s markers first: a border block - its name begins B, GetRandomBlock\'s own test, case and all - is a cap of the layout, so the farthest point from the way in no longer stands in one (mutants: the border counted; the case read; a B anywhere in the name)', () => {
  assert.ok(SD_BORDER_BLOCK_RE.test('B0000004.RDB') && SD_BORDER_BLOCK_RE.test('b0000004.rdb'));
  assert.ok(!SD_BORDER_BLOCK_RE.test('N0000001.RDB') && !SD_BORDER_BLOCK_RE.test('W0000007.RDB') && !SD_BORDER_BLOCK_RE.test('S0000099.RDB'), 'every interior name holds a B in its .RDB, and is no border');
  // the screenshot's layout: the way in at the west, two interior blocks, the caps round them
  const blocks = [
    block('N0000001.RDB', 0, 0), block('N0000002.RDB', 1, 0),
    block('B0000001.RDB', -1, 0), block('B0000002.RDB', 2, 0), block('b0000003.rdb', 0, -1), block('B0000004.RDB', 1, 1),
  ];
  const deep = at(1, 0, 40, 25), near = at(0, 0, 30, 25), cap = at(2, 0, 30, 25), lowCap = at(0, -1, 25, 25);
  const marks = sdEndMarks([near, deep, cap, lowCap], blocks);
  assert.deepEqual(marks, [near, deep], 'the caps\' markers left out');
  const from = { x: 3, z: 25 };
  assert.deepEqual(dungeonEndOf(from, marks), deep, 'the end: the deepest interior marker');
  assert.deepEqual(dungeonEndOf(from, [near, deep, cap, lowCap]), cap, 'where SD4b\'s count stood it: a cap\'s pocket');
});

test('SD-REACH which block holds a marker: the block whose square holds it - its origin in, its far edge the next one\'s - across both axes (mutants: the far edge kept; the depth unasked)', () => {
  const blocks = [block('N0000001.RDB', 0, 0), block('B0000002.RDB', 1, 0), block('B0000003.RDB', 0, 1)];
  const inner = at(0, 0, 10, 10);
  assert.deepEqual(sdEndMarks([inner, at(1, 0, 0, 10)], blocks), [inner], 'a marker on the cap\'s near edge is the cap\'s');
  assert.deepEqual(sdEndMarks([inner, { x: S, y: 0, z: 10 }], blocks), [inner], 'the interior\'s far edge is the next block\'s');
  assert.deepEqual(sdEndMarks([inner, at(0, 1, 10, 10)], blocks), [inner], 'a cap south of it, by its depth');
  assert.deepEqual(sdEndMarks([inner, { x: 0, y: 0, z: 0 }], blocks), [inner, { x: 0, y: 0, z: 0 }], 'the interior\'s own origin is its own');
});

test('SD-REACH a Rift somewhere, never none: every enemy marker when the interior holds none, the start markers by their blocks\' origins when there is no enemy marker at all; an Elite copy and a placeless marker never counted (mutants: the interior alone; no fallback to the start markers; the copies counted)', () => {
  const caps = [block('B0000001.RDB', 0, 0, [{ x: 1, y: 2, z: 3 }]), block('N0000005.RDB', 1, 0, [{ x: 4, y: 5, z: 6 }])];
  const capped = [at(0, 0, 12, 12), at(0, 0, 30, 30)];
  assert.deepEqual(sdEndMarks(capped, caps), capped, 'all in caps: every enemy marker');
  assert.deepEqual(sdEndMarks([], caps), [{ x: 1, y: 2, z: 3 }, { x: S + 4, y: 5, z: 6 }], 'no enemy marker: the start markers, placed');
  assert.deepEqual(sdEndMarks(null, null), []);
  assert.deepEqual(sdEndMarks([{ ...at(1, 0, 9, 9), eliteCopy: true }, { x: NaN, y: 0, z: 1 }, at(1, 0, 8, 8)], caps), [at(1, 0, 8, 8)], 'an Elite copy and a placeless marker none');
});

// ── SD-LAND: never out in the Hour's sky ────────────────────────────────────────────────────────────────────────────

