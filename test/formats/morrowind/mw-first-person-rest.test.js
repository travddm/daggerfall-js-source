// Four small rules of mwFirstPerson.js were rewritten from the BODY record layout (UESP, Tes3Mod:File Format) and the
// retail data, without the third-party source they had been ported from: the vampire's head, the werewolf's head and
// hair, the bones of a blend mask, and the shape filter that picks a mesh shape's side. These tests run the current
// code over the inputs of mw-first-person-rest-sweep.mjs and compare with a recording of the implementation it
// replaced (test/fixtures/mw/mw-first-person-rest-parity.json): the answers over the BODY records of Morrowind,
// Tribunal and Bloodmoon and over seeded random record lists; over four retail skeletons and seeded random node trees;
// and over every shape name of every retail body-part mesh against every bone name of the retail skeletons.
//
// The recording came from src/formats/morrowind/mwFirstPerson.js at commit 1694f2b8c7: run readInputs and
// recordAnswers from mw-first-person-rest-sweep.mjs over the retail files and that module. No third-party engine
// source was read for the new code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as firstPerson from '../../../src/formats/morrowind/mwFirstPerson.js';
import { MwBsaFile } from '../../../src/formats/morrowind/mwBsaFile.js';
import { parseNif } from '../../../src/formats/morrowind/mwNifFile.js';
import { flattenNif } from '../../../src/formats/morrowind/mwNifMesh.js';
import { buildSkeleton } from '../../../src/formats/morrowind/mwSkin.js';
import { readInputs, recordAnswers } from './mw-first-person-rest-sweep.mjs';

const { inputs, recorded } = JSON.parse(
  readFileSync(new URL('../../fixtures/mw/mw-first-person-rest-parity.json', import.meta.url), 'utf8'),
);
const now = JSON.parse(JSON.stringify(recordAnswers(firstPerson, inputs)));

test('vampire and werewolf heads: every race and sex over the retail records match the recording', () => {
  assert.deepEqual(now.real, recorded.real);
});

test('vampire and werewolf heads: seeded random record lists match the recording', () => {
  assert.equal(now.synthetic.lists.length, recorded.synthetic.lists.length);
  assert.deepEqual(now.synthetic, recorded.synthetic);
});

test('blend mask bones: the retail skeletons, seeded random trees and the argument shapes match the recording', () => {
  assert.deepEqual(now.trees, recorded.trees);
});

test('shape filter: every retail shape name against every retail bone name matches the recording', () => {
  assert.deepEqual(now.shapes.retail, recorded.shapes.retail);
});

test('shape filter: the hand-written names match the recording', () => {
  assert.deepEqual(now.shapes.hand, recorded.shapes.hand);
  assert.deepEqual(now.shapes.noBone, recorded.shapes.noBone);
});

test('blend mask bones: a parent chain that loops ends and answers the bones under the root', () => {
  const skeleton = {
    nodes: new Map([
      [1, { name: 'Bip01 L Clavicle', parent: 3 }],
      [2, { name: 'Bip01 L UpperArm', parent: 1 }],
      [3, { name: 'Loop', parent: 2 }],
      [4, { name: 'Bip01 Spine', parent: -1 }],
    ]),
  };
  assert.deepEqual([...firstPerson.blendMaskBones(skeleton)].sort(), ['bip01 l clavicle', 'bip01 l upperarm', 'loop']);
});

const dataPath = process.env.MW_DATA_PATH;
const files = ['Morrowind', 'Tribunal', 'Bloodmoon'].flatMap((name) => [`${name}.bsa`, `${name}.esm`]);
const present = !!dataPath && files.every((name) => existsSync(join(dataPath, name)));

test('the recorded inputs are the retail records, skeletons and shape names', { skip: !present }, () => {
  const live = readInputs({
    dataPath,
    fs: { readFileSync },
    path: { join },
    modules: { MwBsaFile, parseNif, flattenNif, buildSkeleton, bodyParts: firstPerson.bodyParts },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(live)), inputs);
});
