// WOD4 - WORLD OF DAGGERFALL: THE CAMP AT PRIVATEER'S HOLD.
//
// DungeonExterior finds "DaggerfallBlock [CUSTAA30.RMB]" every frame and
// PrivateersHold.Start builds the camp in the block's frame. The table in
// world/worldOfDaggerfall/wodPrivateersHold.js is that Start as data, so the first pins
// READ THE VENDORED C# - every live CreateDaggerfallMeshGameObject, its
// localPosition and its Rotate; every billboard and its FireLight; every
// foe - and hold the table to it, in order, as floats. Then the rolls
// against a scripted stream, the matrix in Unity's frame, and the two
// hosts by source.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PRIVATEERS_HOLD_BLOCK, HOLD_MODELS, HOLD_FLATS, HOLD_FIRE_LIGHT, HOLD_FOES,
  holdModelMatrix, holdFireLights, rollHoldFoes,
} from '../../../src/world/worldOfDaggerfall/wodPrivateersHold.js';
import { FOE_MALE_CHANCE } from '../../../src/world/worldOfDaggerfall/wodSpawner.js';
import { MOBILE_TYPES } from '../../../src/characters/mobile/mobileTypes.js';
import { hostText } from '../../hostText.mjs';   // HOST-SPLIT 2: the world host whole

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const rd = (p) => hostText(p);

/** The C#'s own numbers: `-89.99001f`, `3.099442e-06f`, `-210`. */
const num = (t) => Math.fround(parseFloat(t.trim().replace(/f$/, '')));
const vec = (s) => s.split(',').map(num);

/** PrivateersHold.cs, read the way the compiler reads it: comments out. */
function readStart() {
  const lines = rd('vendor/world-of-daggerfall/Scripts/PrivateersHold.cs').replace(/\r/g, '').split('\n')
    .map((l) => l.trim()).filter((l) => l && !l.startsWith('//'));
  const models = [], flats = [], foes = [], lights = [];
  let chances = 0, chanceTests = 0;
  for (const l of lines) {
    let m;
    if ((m = l.match(/CreateDaggerfallMeshGameObject\((\d+), ExtraDetail\.transform\)/))) models.push({ modelId: +m[1], pos: null, yawDeg: 0 });
    else if ((m = l.match(/^AreaDetail\.transform\.localPosition = new Vector3\((.*)\);$/))) models.at(-1).pos = vec(m[1]);
    else if ((m = l.match(/^AreaDetail\.transform\.Rotate\((.*)\);$/))) {
      const [x, y, z] = vec(m[1]);
      assert.deepEqual([x, z], [0, 0], 'every live Rotate turns about y alone');
      models.at(-1).yawDeg = y;
    } else if ((m = l.match(/CreateDaggerfallBillboardGameObject\((\d+), (\d+), ExtraDetail\.transform\)/))) flats.push({ archive: +m[1], record: +m[2], pos: null, fireLight: false });
    else if ((m = l.match(/^BillboardDetail\.transform\.localPosition = new Vector3\((.*)\);$/))) flats.at(-1).pos = vec(m[1]);
    else if (l === 'lightObject.transform.parent = BillboardDetail.transform;') flats.at(-1).fireLight = true;
    else if ((m = l.match(/^lightObject\.transform\.localPosition = new Vector3\((.*)\);$/))) lights.push({ lift: vec(m[1]) });
    else if ((m = l.match(/^light\.(range|intensity) = (.*);$/))) lights.at(-1)[m[1]] = num(m[2]);
    else if ((m = l.match(/^light\.color = new Color\((.*)\);$/))) lights.at(-1).color = vec(m[1]);
    else if ((m = l.match(/CreateFoeGameObjects\(ExtraDetail\.transform\.position, MobileTypes\.(\w+), 1, MobileReactions\.Hostile, null, false\)/))) foes.push({ type: m[1], pos: null });
    else if ((m = l.match(/^enemy\[0\]\.transform\.localPosition = new Vector3\((.*)\);$/))) foes.at(-1).pos = vec(m[1]);
    else if (/enemyChance = UnityEngine\.Random\.Range\(0, 30\);$/.test(l)) chances++;
    else if (l === 'if (enemyChance > 20)') chanceTests++;
  }
  return { models, flats, foes, lights, chances, chanceTests, lines };
}

test('WOD4: the models are Start\'s, in its order - id, local position and Rotate(0, deg, 0), as floats', () => {
  const { models } = readStart();
  assert.equal(models.length, 33);
  assert.deepEqual(HOLD_MODELS.map((m) => ({ modelId: m.modelId, pos: [...m.pos], yawDeg: m.yawDeg })), models);
  assert.equal(HOLD_MODELS[5].yawDeg, 0, 'the one Rotate commented out (:92) stands unturned');
});

test('WOD4: the flats are Start\'s, centred where it puts them; a FireLight rides each of the five fires', () => {
  const { flats, lights } = readStart();
  assert.equal(flats.length, 17);
  assert.deepEqual(HOLD_FLATS.map((h) => ({ archive: h.archive, record: h.record, pos: [...h.pos], fireLight: h.fireLight })), flats);
  assert.equal(lights.length, 5);
  for (const l of lights) {
    assert.deepEqual(l.lift, [0, HOLD_FIRE_LIGHT.lift, 0]);
    assert.equal(l.range, HOLD_FIRE_LIGHT.range);
    assert.equal(l.intensity, HOLD_FIRE_LIGHT.intensity);
    assert.deepEqual(l.color, [...HOLD_FIRE_LIGHT.color]);
  }
  const fires = holdFireLights();
  assert.deepEqual(fires.map((l) => l.pos), HOLD_FLATS.filter((h) => h.fireLight).map((h) => [h.pos[0], h.pos[1] + 1, h.pos[2]]), 'one unit over each fire\'s CENTRE');
  assert.ok(fires.every((l) => l.range === 20 && l.color.join() === [...HOLD_FIRE_LIGHT.color].join()));
  assert.equal(PRIVATEERS_HOLD_BLOCK, 'CUSTAA30.RMB');
  assert.match(rd('vendor/world-of-daggerfall/Scripts/DungeonExterior.cs'), /PrivateHold = GameObject\.Find\("DaggerfallBlock \[CUSTAA30\.RMB\]"\);/);
});

test('WOD4: the foes are Start\'s seven, one Range(0, 30) > 20 each; the loot containers are commented out', () => {
  const { foes, chances, chanceTests, lines } = readStart();
  assert.deepEqual([chances, chanceTests], [7, 7]);
  assert.deepEqual(HOLD_FOES.map((h) => ({ type: Object.keys(MOBILE_TYPES).find((k) => MOBILE_TYPES[k] === h.mobileType), pos: [...h.pos] })), foes);
  assert.ok(!lines.some((l) => /KamerCreateLootContainer\(1, 10/.test(l)), 'no live call reaches KamerCreateLootContainer');
});

const script = (...vals) => { let i = 0; return () => { if (i >= vals.length) throw new Error('rolled more than scripted'); return vals[i++]; }; };
const pick = (n, min, max) => (n - min + 0.5) / (max - min);

test('WOD4: the rolls - 21..29 of 0..29 stand a foe, which rolls CreateFoeGameObjects\' gender and then the facing', () => {
  const none = Array(7).fill(pick(20, 0, 30));
  assert.deepEqual(rollHoldFoes(script(...none)), [], '20 stands nobody, and no gender or facing is rolled');
  const out = rollHoldFoes(script(
    pick(21, 0, 30), FOE_MALE_CHANCE - 0.01, pick(179, 0, 180),   // the Thief at (83.2, 1, 38)
    pick(20, 0, 30),                                              // no Assassin
    0.999999, FOE_MALE_CHANCE, pick(0, 0, 180),                   // the top of Range(0, 30) is 29: a Thief
    pick(0, 0, 30), pick(0, 0, 30), pick(0, 0, 30), pick(0, 0, 30)));
  assert.deepEqual(out, [
    { mobileType: MOBILE_TYPES.Thief, pos: HOLD_FOES[0].pos, gender: 'male', yawDeg: 179 },
    { mobileType: MOBILE_TYPES.Thief, pos: HOLD_FOES[2].pos, gender: 'female', yawDeg: 0 },
  ]);
});

test('WOD4: a model\'s matrix is T * Euler(0, deg, 0) in Unity\'s frame - a quarter turn takes +z to +x', () => {
  const at = (m, v) => [0, 1, 2].map((r) => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r] * v[3]);
  const close = (a, b) => a.every((x, i) => Math.abs(x - b[i]) < 1e-6);
  const q = holdModelMatrix({ pos: [1, 2, 3], yawDeg: 90 });
  assert.ok(close(at(q, [0, 0, 1, 0]), [1, 0, 0]), 'forward turns right, clockwise from above');
  assert.ok(close(at(q, [1, 0, 0, 0]), [0, 0, -1]));
  assert.ok(close(at(q, [0, 0, 0, 1]), [1, 2, 3]), 'the local position');
  const a = holdModelMatrix({ pos: [0, 0, 0], yawDeg: -210 }), b = holdModelMatrix({ pos: [0, 0, 0], yawDeg: 150 });
  assert.ok(close([...a], [...b]), '-210 is 150');
});

