// The blend mask and the shape filter (src/formats/morrowind/mw-bone-rules.ts) were rewritten from the NIF layout
// (nif.xml) and the retail skeletons, without the third-party source they had been ported from. These tests run the
// current code over the inputs of mw-first-person-rest-sweep.mjs and compare with a recording of the implementation it
// replaced (test/fixtures/mw/mw-first-person-rest-parity.json): the bones of the mask under each of nine root names
// for four retail skeletons and for seeded random node trees, and every shape name of every retail body-part mesh
// against every bone name of the retail skeletons.
//
// The recording came from src/formats/morrowind/mwFirstPerson.js at commit 1694f2b8c7: run readInputs and
// recordBoneAnswers from mw-first-person-rest-sweep.mjs over the retail files and that module. No third-party engine
// source was read for the new code.
//
// One difference from the old walk is accepted: a node deeper than 256 parents below the root is now in the mask. No
// skeleton is that deep, and the old limit existed only to stop a walk that looped.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { blendMaskBones, shapeMatchesBone } from '../../../src/formats/morrowind/mw-bone-rules.ts';
import { bodyParts } from '../../../src/formats/morrowind/mwFirstPerson.js';
import { MwBsaFile } from '../../../src/formats/morrowind/mwBsaFile.js';
import { parseNif } from '../../../src/formats/morrowind/mwNifFile.js';
import { flattenNif } from '../../../src/formats/morrowind/mwNifMesh.js';
import { buildSkeleton } from '../../../src/formats/morrowind/mwSkin.js';
import { readInputs, recordBoneAnswers } from './mw-first-person-rest-sweep.mjs';

const { inputs, recorded } = JSON.parse(
  readFileSync(new URL('../../fixtures/mw/mw-first-person-rest-parity.json', import.meta.url), 'utf8'),
);
const now = JSON.parse(JSON.stringify(recordBoneAnswers({ blendMaskBones, shapeMatchesBone }, inputs)));

test('blend mask bones: the retail skeletons match the recording', () => {
  for (const id of Object.keys(inputs.skeletons)) assert.deepEqual(now.trees[id], recorded.trees[id], id);
});

test('blend mask bones: seeded random trees and the argument shapes match the recording', () => {
  assert.deepEqual(now.trees.synthetic, recorded.trees.synthetic);
  assert.deepEqual(now.trees.edge, recorded.trees.edge);
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
  assert.deepEqual([...blendMaskBones(skeleton)].sort(), ['bip01 l clavicle', 'bip01 l upperarm', 'loop']);
});

test('shape filter: every retail shape name against every retail bone name matches the recording', () => {
  assert.deepEqual(now.shapes.retail, recorded.shapes.retail);
});

test('shape filter: the hand-written names match the recording', () => {
  assert.deepEqual(now.shapes.hand, recorded.shapes.hand);
  assert.deepEqual(now.shapes.noBone, recorded.shapes.noBone);
});

const dataPath = process.env.MW_DATA_PATH;
const files = ['Morrowind', 'Tribunal', 'Bloodmoon'].flatMap((name) => [`${name}.bsa`, `${name}.esm`]);
const present = !!dataPath && files.every((name) => existsSync(join(dataPath, name)));

test('the recorded inputs are the retail records, skeletons and shape names', { skip: !present }, () => {
  const live = readInputs({
    dataPath,
    fs: { readFileSync },
    path: { join },
    modules: { MwBsaFile, parseNif, flattenNif, buildSkeleton, bodyParts },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(live)), inputs);
});
