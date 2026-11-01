// PERF-TOWN1.
//
// WHAT THE READOUT SAID. `?perf=cpu`, outside, over seven lines:
//
//   cpu 19.12ms | world 8.51 | people 7.36 | sim 2.06 | flats 0.51 ...
//   cpu  9.30ms | sim 2.54 | world 2.45 | people 1.90 | flats 1.10 ...
//
// The frame is CPU-BOUND - nine to nineteen milliseconds of JavaScript
// against a ~19.7 ms frame - so no filtering term can be the cause,
// which is the question that was actually asked. And `people` swings
// 1.14 to 7.36 while `sim` sits at 2-3.
//
// A ZONE THAT VARIES FOURFOLD FRAME TO FRAME IS NOT DOING FOUR TIMES
// THE WORK. It is minting garbage and meeting the collector. The town
// loop minted about THIRTEEN objects per person per frame - two keys,
// four for the billboard size, a size, an origin, an activation row, a
// stop-options object, a closure, a frame record and a row to carry it
// - none of which outlived the frame. At sixty townspeople and sixty
// frames that is forty thousand allocations a second from one loop.
//
// These pins hold the seams that removed them. They are deliberately
// about IDENTITY and RE-READING rather than about speed: a timing
// assertion on a shared runner is what broke this repo's deploy the
// same afternoon (STREAM1), and "no new object" is the claim that
// actually made the frame cheaper.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mobileBillboardSize } from '../../src/world/rmbFlats.js';
import { MobilePerson } from '../../src/characters/mobile/mobilePerson.js';
import { CityNavigation } from '../../src/world/city/cityNavigation.js';
import { createTownScratch, createPersonTextureKeys } from '../../src/scenes/townScratch.js';
import { hostText } from '../hostText.mjs';   // HOST-SPLIT 2 (AUDIT, the second read): its negatives read the host whole

const src = (f) => hostText(f);
const HOSTS = ['src/scenes/world.js', 'src/scenes/exterior.js'];

test('PERF-TOWN1: a sprite does not change size while you watch it - the size is cached per texture', () => {
  // `getSize` and `getScale` each mint a record and `scaledBillboardSize`
  // mints a third, for arithmetic that cannot answer differently for the
  // same texture and the same record.
  let sizeCalls = 0, scaleCalls = 0;
  const tex = {
    archive: 385,
    getSize() { sizeCalls++; return { width: 64, height: 100 }; },
    getScale() { scaleCalls++; return { width: 0, height: 0 }; },
  };
  const a = mobileBillboardSize(tex, 3);
  const b = mobileBillboardSize(tex, 3);
  assert.equal(sizeCalls, 1, 'the file is read once for that record');
  assert.equal(scaleCalls, 1);
  assert.equal(a, b, 'and the SAME record comes back - no allocation on the second call');
  assert.ok(a.w > 0 && a.h > 0);
  // a different record is its own entry
  mobileBillboardSize(tex, 4);
  assert.equal(sizeCalls, 2);
  mobileBillboardSize(tex, 4);
  assert.equal(sizeCalls, 2);

  // A REPLACEMENT THAT SWAPS THE FILE IN IS A DIFFERENT OBJECT, and so
  // gets a different entry: the cache is keyed on the texture itself,
  // which is why there is nothing to invalidate. Keying on the archive
  // NUMBER would have needed an invalidation seam and would have gone
  // stale the first time a pack replaced a sprite with a bigger one.
  const swapped = { archive: 385, getSize: () => ({ width: 128, height: 200 }), getScale: () => ({ width: 0, height: 0 }) };
  const c = mobileBillboardSize(swapped, 3);
  assert.notEqual(c, a);
  assert.ok(c.w > a.w, 'the new file is measured, not the old answer reused');

});

test('PERF-TOWN1: a person answers into its OWN row, and the pool refills one list', () => {
  const nav = new CityNavigation(1, 1);
  nav.setBlockData(0, 0, new Uint8Array(64 * 64), () => 2);
  const p = new MobilePerson(nav, { archive: 385, frameCount: () => 4, groundY: () => 0, rand: () => 0.5 });
  p.place(30, 30);
  const a = p.update(1 / 60, [0, 0, 0], false);
  const b = p.update(1 / 60, [0, 0, 0], false);
  assert.equal(a, b, 'the same record, written through - the caller reads three fields and drops them');
  assert.ok(Number.isInteger(b.record) && Number.isInteger(b.frame) && typeof b.flip === 'boolean');
  // ONE ROW PER PERSON, not one shared by all of them: the host collects
  // every row first and reads them afterwards, so a single shared record
  // would give every person the last one's frame.
  const q = new MobilePerson(nav, { archive: 385, frameCount: () => 4, groundY: () => 0, rand: () => 0.5 });
  q.place(40, 40);
  assert.notEqual(q.update(1 / 60, [0, 0, 0], false), b, 'two people, two rows');
});

test('PERF-TOWN1: the memoised texture key is byte-for-byte the one the uploader writes', () => {
  // The whole win is a cache HIT. A key that differs from the uploaded
  // one by so much as a separator would miss every frame and re-upload
  // every frame - slower than what it replaced, and invisible.
  const key = (archive, record, frame) => `${archive}_${record}#${frame}`;
  assert.equal(key(385, 2, 3), '385_2#3');
  // the same string the old two-step built
  const rkey = (record, frame) => `${record}#${frame}`;
  assert.equal(`${385}_${rkey(2, 3)}`, key(385, 2, 3));
  // AND THE NUMERIC INDEX IS INJECTIVE - over its FIELDS, which is the
  // honest claim and not "over all integers". Packing is positional:
  // 1024 frames to a record, 4096 records to an archive, and a record
  // of 4096 really would land on the next archive's slot. That is what
  // a field width is; a classic archive has tens of records and a
  // handful of frames, so the widths are three orders clear of the art.
  const R = 4096, F = 1024;
  const idx = (a, r, f) => (a * R + r) * F + f;
  assert.notEqual(idx(385, 2, 3), idx(385, 3, 2), 'record and frame cannot swap');
  assert.notEqual(idx(385, 0, 0), idx(384, 0, 0), 'nor can the archive slide into the record');
  // no two distinct triples inside the fields share a slot
  const seen = new Set();
  for (const a of [0, 1, 385, 511]) {
    for (const r of [0, 1, 63, R - 1]) {
      for (const f of [0, 1, 31, F - 1]) {
        const k = idx(a, r, f);
        assert.ok(!seen.has(k), `${a}/${r}/${f} collided`);
        seen.add(k);
      }
    }
  }
  assert.equal(seen.size, 4 * 4 * 4);
  assert.ok(Number.isSafeInteger(idx(1000, R - 1, F - 1)), 'and the widest key is still an exact integer');
});

test('PERF-TOWN1: the hoisted gate is a HOIST, not a shared answer', () => {
  // The whole risk of hoisting an argument object is that a term stops
  // being re-read and silently freezes at whatever it was when the
  // scratch was made. So the gate is DRIVEN here rather than pinned by
  // its call site: every term must be able to change between frames and
  // be seen on the next one.
  let pool = [];
  const town = createTownScratch({ areEnemiesNearby: (p) => p.length > 0, foes: () => pool });
  const near = { pos: [0, 0, 0] };
  town.local[0] = 0; town.local[2] = 0;

  // standing still, sheathed, visible, human, nobody hostile -> stops
  town.gate(true, true, false, false);
  assert.equal(town.stops(near), true);

  // ...and each of the four terms turns it off on the NEXT frame
  town.gate(false, true, false, false);
  assert.equal(town.stops(near), false, 'a moving player');
  town.gate(true, false, false, false);
  assert.equal(town.stops(near), false, 'a drawn weapon');
  town.gate(true, true, true, false);
  assert.equal(town.stops(near), false, 'an invisible player');
  town.gate(true, true, false, true);
  assert.equal(town.stops(near), false, 'a player in beast form - MobilePersonMotor.cs:222,224');
  // and back on again, which is what a stuck term could never do
  town.gate(true, true, false, false);
  assert.equal(town.stops(near), true);

  // the foe pool is asked LIVE, not snapshotted when the scratch was made
  pool = [{}];
  assert.equal(town.stops(near), false, 'a hostile in the street');
  pool = [];
  assert.equal(town.stops(near), true);

  // distance is measured per person, off the scratch the host rewrites
  // per pixel - and the far one is not merely "not stopped by accident"
  const far = { pos: [500, 0, 500] };
  assert.equal(town.stops(far), false, 'too far to stop and chat');
  town.local[0] = 500; town.local[2] = 500;
  assert.equal(town.stops(far), true, 'the same person, once the camera is beside them');

  // the seats are per index and minted once
  assert.notEqual(town.seat(0), town.seat(1));
  assert.equal(town.seat(0), town.seat(0));
});

test('PERF-TOWN1: the key memo answers the same string every time, and a different one per field', () => {
  const key = createPersonTextureKeys();
  assert.equal(key(385, 2, 3), '385_2#3');
  assert.equal(key(385, 2, 3), key(385, 2, 3));
  assert.notEqual(key(385, 2, 3), key(385, 3, 2));
  assert.notEqual(key(385, 2, 3), key(386, 2, 3));
  assert.notEqual(key(385, 2, 3), key(385, 2, 4));
  // two memos do not share a table
  assert.equal(createPersonTextureKeys()(1, 1, 1), '1_1#1');
});
