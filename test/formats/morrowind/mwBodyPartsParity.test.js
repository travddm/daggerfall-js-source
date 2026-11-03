// The body-part resolution was rewritten from the BODY record layout (UESP, Tes3Mod:File Format) and the retail data,
// without the third-party source it had been ported from. These tests run the current module over the inputs of
// mwBodyPartsSweep.mjs and compare with a recording of the implementation it replaced
// (test/fixtures/mw/mwBodyPartsParity.json): the record chosen for every slot, for every race, sex and view over the
// BODY records of Morrowind, Tribunal and Bloodmoon, then over seeded random record lists, then the argument shapes
// the callers use.
//
// The recording came from src/formats/morrowind/mwBodyParts.js at commit 03489b2591 (the code moved out of
// mwFirstPerson.js unchanged): run recordResolution and recordEdgeCalls from mwBodyPartsSweep.mjs over that module,
// with the BODY records of the three retail .esm files (read with bodyParts, reduced with toPart) as `parts` and
// every RACE id plus every race named by a BODY record as `races`. No third-party engine source was read for the
// new code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as bodyPartsModule from '../../../src/formats/morrowind/mwBodyParts.js';
import * as firstPerson from '../../../src/formats/morrowind/mwFirstPerson.js';
import { recordEdgeCalls, recordResolution, toPart } from './mwBodyPartsSweep.mjs';

const recording = JSON.parse(
  readFileSync(new URL('../../fixtures/mw/mwBodyPartsParity.json', import.meta.url), 'utf8'),
);
const { parts, races } = recording;
const now = JSON.parse(JSON.stringify(recordResolution(bodyPartsModule.resolveBodyParts, parts, races)));

test('body-part resolution: every race, sex and view over the retail records matches the recording', () => {
  assert.deepEqual(now.real, recording.real);
});

test('body-part resolution: seeded random record lists match the recording', () => {
  assert.equal(now.synthetic.length, recording.synthetic.length);
  assert.deepEqual(now.synthetic, recording.synthetic);
});

test('body-part resolution: the argument shapes the callers use match the recording', () => {
  const edge = JSON.parse(JSON.stringify(recordEdgeCalls(bodyPartsModule.resolveBodyParts, parts, races)));
  assert.deepEqual(edge, recording.edge);
});

test('body-part resolution: the first-person host still exports it', () => {
  for (const name of Object.keys(bodyPartsModule)) assert.equal(firstPerson[name], bodyPartsModule[name], name);
});

const dataPath = process.env.MW_DATA_PATH;
const esms = ['Morrowind.esm', 'Tribunal.esm', 'Bloodmoon.esm'].map((name) => (dataPath ? join(dataPath, name) : ''));

test(
  'body-part resolution: the recorded records are the retail BODY records',
  { skip: !esms.every(existsSync) },
  () => {
    const live = esms.flatMap((path) => firstPerson.bodyParts(new Uint8Array(readFileSync(path))).map(toPart));
    assert.deepEqual(live, parts);
  },
);

// Accepted behaviour, kept identical to the recording: for a female actor's first-person arm slot, the female
// third-person mesh and the male first-person mesh rank equally, so the later one in load order wins (a female
// first-person record beats both, and a male third-person mesh ranks below both). Nothing in the BODY layout
// explains the tie; the recording shows it in both load orders.
test('body-part resolution: a female first-person arm takes the later of her third-person and the male first-person mesh', () => {
  const part = (id, o) => ({
    id,
    slot: 'hand',
    race: 'r',
    female: false,
    skin: true,
    playable: true,
    firstPerson: false,
    ...o,
  });
  const femaleThird = part('f3', { female: true });
  const maleFirst = part('m1', { firstPerson: true });
  const pick = (list) => bodyPartsModule.resolveBodyParts(list, 'r', true, { firstPerson: true }).get('hand').id;
  assert.equal(pick([femaleThird, maleFirst]), 'm1');
  assert.equal(pick([maleFirst, femaleThird]), 'f3');
});
