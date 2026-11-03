// HE1 - A BLOW LANDED INDOORS DREW NO BLOOD.
//
// EnemyBlood.ShowBloodSplash has been ported since AUDIT 24 wave 39 and
// mounted in THREE hosts: world.js, exterior.js and dungeonContext.js
// each build a `createHitEffects` pool and hand it to their foe pool.
// worldModes' interior arm passed `hitEffects: null` and RECORDED the
// absence - which is the right shape for an absence, and the wrong
// thing to keep once nothing was blocking it.
//
// Nothing was. The factory takes `{ renderer, getTexture,
// uploadRecordFrame }`, all three of which that scope already
// destructures from the pipeline, and the frame already draws
// billboards on the same axis for foes, quest stands, dropped piles
// and the magic engine's own impact pool. So the same blow drew blood
// one step outside a shop door and none inside it.
//
// AND THE POOL OUTLIVES THE ROOM. The other three hosts mount one pool
// per host and their scene lasts as long as the host does. This host
// keeps ONE pool across every building the player walks through, so a
// splash still animating when the door closes would be drawn in the
// NEXT building, in the previous one's coordinates. `clear()` already
// existed for the world host's own teardown; HE1 is its second caller.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHitEffects } from '../../src/scenes/hitEffects.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/** The pool with a counting renderer, so a leak is observable. */
const pool = () => {
  const made = [], killed = [];
  const p = createHitEffects({
    renderer: {
      createBillboardBatch: (a, r) => { const b = { a, r }; made.push(b); return b; },
      destroyBillboardBatch: (b) => killed.push(b),
    },
    getTexture: async () => ({ recordCount: 8, getSize: () => ({ width: 8, height: 8 }), getScale: () => ({ x: 0, y: 0 }) }),
    uploadRecordFrame: () => {},
  });
  return { p, made, killed };
};

test('HE1: clear() retires every live splash and frees its batch', async () => {
  const { p, made, killed } = pool();
  p.showBloodSplash(2, [1, 0, 1]);
  p.showBloodSplash(0, [2, 0, 2]);
  await new Promise((r) => setTimeout(r, 0));   // let the texture continuations land
  await new Promise((r) => setTimeout(r, 0));
  const before = p._live.length;
  assert.ok(before > 0, 'two splashes are live');
  p.clear();
  assert.equal(p._live.length, 0, 'and none survives the room');
  assert.equal(killed.length, made.length, 'every batch that was made was freed');
});

test('HE1: clear() on an empty pool is a no-op, and a warming splash is retired too', () => {
  const { p, killed } = pool();
  p.clear();
  assert.equal(p._live.length, 0);
  assert.equal(killed.length, 0);
  // a splash whose texture has NOT resolved yet has no batch, and must
  // still leave the list - otherwise it publishes into the next room
  p.showBloodSplash(0, [0, 0, 0]);
  assert.equal(p._live.length, 1, 'live before its texture lands');
  p.clear();
  assert.equal(p._live.length, 0, 'and gone after');
});

test('HE1: all four hosts mount the pool now', () => {
  for (const p of ['src/scenes/world.js', 'src/scenes/exterior.js', 'src/scenes/dungeonContext.js', 'src/scenes/worldModes.js']) {
    assert.match(read(p), /createHitEffects\(/, `${p} mounts the blood pool`);
  }
});
