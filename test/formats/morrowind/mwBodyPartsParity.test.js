// The body-part resolution was rewritten from the BODY record layout (UESP, Tes3Mod:File Format) and the retail data,
// without the third-party source it had been ported from. These tests run the current module over the inputs of
// mwBodyPartsSweep.mjs and compare with a recording of the implementation it replaced
// (test/fixtures/mw/mwBodyPartsParity.json): the record chosen for every slot, for every race, sex and view over the
// BODY records of Morrowind, Tribunal and Bloodmoon, then over seeded random record lists, then the argument shapes
// the callers use.
//
// The recording came from src/formats/morrowind/mwBodyParts.js as it was when the code moved out of
// mwFirstPerson.js unchanged: run recordResolution and recordEdgeCalls from mwBodyPartsSweep.mjs over that module,
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

const recording = JSON.parse(readFileSync(new URL('../../fixtures/mw/mwBodyPartsParity.json', import.meta.url), 'utf8'));
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

test('body-part resolution: the recorded records are the retail BODY records', { skip: !esms.every(existsSync) }, () => {
  const live = esms.flatMap((path) => firstPerson.bodyParts(new Uint8Array(readFileSync(path))).map(toPart));
  assert.deepEqual(live, parts);
});
