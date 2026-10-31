// HEARTH1 (2026-09-19, Mac: "Does this version of C&C not let you use
// braziers as extra campfires to cook from?") - THE WORLD'S OWN FIRES
// ARE FIRES.
//
// SURV3 gave the survival law one fire: a camp somebody PLACED. Every
// brazier, fire bowl and tavern hearth in Daggerfall was a sprite and a
// point light, so a player standing over a roaring brazier was as cold,
// as wet and as roughly rested as one standing in a field, and had to
// burn a Campfire Kit two feet from it to cook a fish.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HEARTH_ARCHIVE, HEARTH_RECORDS, HEARTH_NEAR, isHearthFlat, collectHearths, nearestHearth, hearthNear, hearthAabb } from '../../../src/systems/survival/hearth.js';
import { BY_FIRE_REACH, FIRE_FLAT, CAMP_REACH, CAMP_TEXT } from '../../../src/systems/survival/camp.js';
import { interiorLightProperties } from '../../../src/world/interior/interiorLights.js';
import { hostText } from '../../hostText.mjs';   // HOST-SPLIT 2: the world host whole

const read = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');

test('HEARTH1: the law is the lights archive, and the three records that are a fire you can stand over', () => {
  assert.equal(HEARTH_ARCHIVE, FIRE_FLAT.archive, 'the same archive a camp’s own fire comes from');
  assert.deepEqual([...HEARTH_RECORDS], [0, 1, 20], 'bowl with fire, the flame itself, the brazier torch');
  // THE FLAME ITSELF: record 1 is what camp.js stands, so a block that
  // places one is placing a campfire and the law must agree with itself.
  assert.ok(isHearthFlat(HEARTH_ARCHIVE, FIRE_FLAT.record), 'a camp’s own flat is a hearth wherever it stands');
  // THE EXCLUSIONS, and they are the load-bearing half. Every candle,
  // lantern and chandelier in the archive is OUT - and so are the two
  // WALL TORCHES, which are a real flame bracketed at head height:
  // counting them would make every lit corridor a kitchen.
  for (const r of [2, 3, 4, 5, 8, 9, 11, 13, 21, 22, 24, 25, 26, 27]) {
    assert.equal(isHearthFlat(HEARTH_ARCHIVE, r), false, `record ${r} is a candle, lantern or chandelier - not a cooking fire`);
  }
  for (const r of [6, 17]) {
    assert.equal(isHearthFlat(HEARTH_ARCHIVE, r), false, `record ${r} is a WALL torch - a flame you cannot stand over`);
  }
  // the records DFU's own switch leaves unnamed stay out with them
  for (const r of [7, 10, 12, 14, 15, 16, 18, 19, 23, 28, 29]) {
    assert.equal(isHearthFlat(HEARTH_ARCHIVE, r), false, `record ${r} is one of AddLight's unnamed "todo" arms - not evidence of a fire`);
  }
  // and no other archive is a hearth, whatever its record
  for (const a of [87, 199, 201, 210 + 1, 253]) {
    if (a === HEARTH_ARCHIVE) continue;
    for (const r of HEARTH_RECORDS) assert.equal(isHearthFlat(a, r), false, `archive ${a} is not the lights archive`);
  }
  // the three really are records AddLight knows - a hearth the light
  // switch has never heard of would be a record picked out of the air
  for (const r of HEARTH_RECORDS) assert.ok(interiorLightProperties(r), `record ${r} resolves a light`);
});

test('HEARTH1: collectHearths takes the fires out of a lantern list and leaves the lanterns', () => {
  const lights = [
    { record: 22, x: 0, y: 2, z: 0 },   // round lantern
    { record: 20, x: 5, y: 1, z: 0, foot: -0.6, w: 0.5, h: 1.6 },   // BRAZIER, with its sprite (FIX-D)
    { record: 3, x: 6, y: 1, z: 0 },    // candle
    { record: 0, x: 9, y: 1, z: 2 },    // bowl with fire
    { x: 1, y: 1, z: 1 },               // a dungeon RDB Light resource: NO record at all
  ];
  assert.deepEqual(collectHearths(lights), [
    { x: 5, y: 1, z: 0, foot: -0.6, w: 0.5, h: 1.6 },   // FIX-D: the sprite rides through...
    { x: 9, y: 1, z: 2, foot: undefined, w: undefined, h: undefined },   // ...and a light nobody measured stays unmeasured, never guessed
  ]);
  assert.deepEqual(collectHearths(null), [], 'no list is no fires, not a throw');
  assert.deepEqual(collectHearths([null, undefined]), [], 'and neither is a hole in one');
});

test('HEARTH1: nearestHearth answers by distance and stops at the reach it is given', () => {
  const hearths = [{ x: 10, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 0, y: 0, z: 3.9 }];
  assert.deepEqual(nearestHearth(hearths, [0, 0, 0], BY_FIRE_REACH), { x: 2, y: 0, z: 0 }, 'the nearer of the two in reach');
  assert.equal(nearestHearth(hearths, [0, 0, 0], 1), null, 'nothing inside a metre');
  assert.equal(nearestHearth([], [0, 0, 0], BY_FIRE_REACH), null);
  assert.equal(nearestHearth(null, [0, 0, 0], BY_FIRE_REACH), null);
  // the y axis counts: a brazier on the floor below is not one you are at
  assert.equal(nearestHearth([{ x: 0, y: -8, z: 0 }], [0, 0, 0], BY_FIRE_REACH), null, 'a fire a storey down is not a fire you are standing at');
  // exactly AT the reach is in - the same closed bound nearestFire uses
  assert.ok(nearestHearth([{ x: BY_FIRE_REACH, y: 0, z: 0 }], [0, 0, 0], BY_FIRE_REACH), 'the bound is closed, as a camp’s is');
});

test('HEARTH1: the streaming cut-off clears every question the pool is asked', () => {
  // HEARTH_NEAR cuts the streaming host's walk. It has to clear BOTH
  // the warmth reach and the activation ray's, or the cut would answer
  // a question before the law did.
  assert.ok(HEARTH_NEAR > BY_FIRE_REACH, `${HEARTH_NEAR} must clear the warmth reach ${BY_FIRE_REACH}`);
  assert.ok(HEARTH_NEAR > CAMP_REACH, `${HEARTH_NEAR} must clear the ray's reach ${CAMP_REACH}`);
});

test('HEARTH1: a world fire is nobody’s - it opens the cooking list and nothing else', () => {
  assert.ok(CAMP_TEXT.seeHearth && CAMP_TEXT.seeHearth !== CAMP_TEXT.seeFire, 'and it says it is not your campfire');
});

test('HEARTH1: the pool really does answer byFire and cook off a bare hearth list', async () => {
  const { createCamps } = await import('../../../src/scenes/camps.js');
  const hearths = [{ x: 10, y: 0, z: 10, foot: -1.6, w: 0.8, h: 1.6 }];
  const said = [];
  const pool = createCamps({ hearths: () => hearths, say: (l) => said.push(l), entity: { items: [] } });
  assert.equal(pool.byFire([10, 0, 10]), true, 'standing in it');
  assert.equal(pool.byFire([10, 0, 10 + BY_FIRE_REACH - 0.01]), true, 'within the reach');
  assert.equal(pool.byFire([10, 0, 10 + BY_FIRE_REACH + 1]), false, 'and out of it');
  assert.deepEqual([pool.own(), pool.wireRecords(), pool.camps.length], [[], [], 0], 'but it is not a CAMP - nothing to pack, stoke or publish');
  // the ray sees it, at a camp's own reach
  const t = pool.targets();
  assert.equal(t.length, 1, 'one target for one fire');
  assert.equal(t[0].key, 'hearth:0');
  assert.equal(t[0].reach, CAMP_REACH);
  assert.deepEqual(t[0].aabb, hearthAabb(hearths[0]), 'FIX-D: the box is the SPRITE its collector measured, standing on its foot');
  // Info names it; a cook with nothing raw says so rather than throwing
  assert.equal(pool.activate('hearth:0', 'info'), true);
  assert.equal(said.at(-1), CAMP_TEXT.seeHearth);
  assert.equal(pool.activate('hearth:0', 'grab'), true);
  assert.equal(said.at(-1), CAMP_TEXT.nothingToCook);
  assert.equal(pool.activate('hearth:9', 'grab'), true, 'a stale index still resolves to the cooking list, never a throw');
  // and a pool with NO door is exactly what it was before
  const bare = createCamps({ entity: { items: [] } });
  assert.equal(bare.byFire([0, 0, 0]), false);
  assert.deepEqual(bare.targets(), []);
});

test('HEARTH1: a hearth makes a rest a CAMP rest, which is the whole of SURV4 reading byFire', async () => {
  const { restKind, REST_KIND } = await import('../../../src/systems/survival/rest.js');
  assert.equal(restKind({ byFire: true }), REST_KIND.Camp, 'a fire is a camp’s rest, wherever the fire came from');
  assert.equal(restKind({ byFire: false }), REST_KIND.Rough);
  // ...and the three hosts that own a camp pool read it through the
  // same `camps.byFire`, so none of them needed a second wire
  for (const [f, what] of [['src/scenes/world.js', 'the streaming host'], ['src/scenes/exterior.js', 'the fixed city'], ['src/scenes/dungeonContext.js', 'the dungeon']]) {
    assert.match(read(f), /camps\.byFire\(/, `${what} reads the pool`);
  }
});

// ---- AUDIT HEARTH1 (2026-09-19) - four findings over the slice ------------

test('AUDIT HEARTH1 F2: byFire takes the FIRST fire in reach, because it runs every frame', () => {
  // `nearestHearth` cannot stop - it has to see every entry to know
  // which is nearest - and byFire does not want the nearest, it wants a
  // yes. The player ticker calls its host's survivalEnv on EVERY frame
  // (the ticker decides whether a minute rolled, not the caller), so a
  // city's lantern list was being walked end to end sixty times a second
  // for a question whose answer was in the first entry.
  let seen = 0;
  const list = [];
  for (let i = 0; i < 500; i++) list.push({ get x() { seen++; return i === 0 ? 0 : 900; }, y: 0, z: 0 });
  assert.equal(hearthNear(list, [0, 0, 0], BY_FIRE_REACH), true);
  assert.equal(seen, 1, `stopped at the first fire in reach, after ${seen} reads`);
  // ...and it agrees with nearestHearth everywhere it is asked
  const fires = [{ x: 9, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }, { x: 0, y: 0, z: 30 }];
  for (const p of [[0, 0, 0], [3, 0, 0], [6, 0, 0], [50, 0, 50], [0, 0, 26]]) {
    assert.equal(hearthNear(fires, p, BY_FIRE_REACH), !!nearestHearth(fires, p, BY_FIRE_REACH), `the two agree at ${p}`);
  }
  // the live-count argument, for a caller that refills a pool
  const pooled = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }];
  assert.equal(hearthNear(pooled, [0, 0, 0], BY_FIRE_REACH, 0), false, 'nothing live is no fire, whatever the pool still holds');
  assert.equal(nearestHearth(pooled, [0, 0, 0], BY_FIRE_REACH, 0), null);
});

test('AUDIT HEARTH1 F4: the law\u2019s collection is used, not exported for its own test', () => {
  assert.equal(collectHearths([{ record: 20, x: 1, y: 2, z: 3 }, { record: 22, x: 0, y: 0, z: 0 }]).length, 1);
});
