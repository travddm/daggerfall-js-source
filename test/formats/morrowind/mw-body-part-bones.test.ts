// The skeleton node that an unskinned body part hangs on (src/formats/morrowind/mw-body-part-bones.ts) was rewritten
// as a rule over the BODY part names of the file format and the node names of the retail base skeleton, without the
// third-party table it had been taken from. These tests compare the table, and the NPC assembler that reads it, with a
// recording of the implementation it replaced (test/fixtures/mw/npc-bones-parity.json), and check every node it names
// against the retail skeletons.
//
// The recording came from mwNpc.js at commit 79861dd196: run tableRows and recordNpcs from npc-bones-sweep.mjs over that
// file. No third-party engine source was read for the new code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bodyPartBones } from '../../../src/formats/morrowind/mw-body-part-bones.ts';
import { recordNpcs, tableRows } from './npc-bones-sweep.mjs';

// Loaded by a computed path: these modules reach src/net, whose crypto types the Node type pass does not have.
const load = (path: string) => import(new URL(`../../../src/${path}`, import.meta.url).href);
const npc = await load('formats/morrowind/mwNpc.js');
const { MW_BODY_PARTS, parseEsm } = await load('formats/morrowind/mwEsmFile.js');
const { MwBsaFile } = await load('formats/morrowind/mwBsaFile.js');
const { parseNif } = await load('formats/morrowind/mwNifFile.js');
const { buildSkeleton } = await load('formats/morrowind/mwSkin.js');

const { recorded } = JSON.parse(
  readFileSync(new URL('../../fixtures/mw/npc-bones-parity.json', import.meta.url), 'utf8'),
);

test('the table answers as recorded: the same slots, the same nodes, the left node first', () => {
  const now = tableRows(npc.PART_BONES);
  assert.deepEqual(Object.fromEntries(now), Object.fromEntries(recorded.partBones));
  assert.deepEqual(now.map(([slot]: [string]) => slot).sort(), [...MW_BODY_PARTS].sort());
});

test('a single part is its own node, hair hangs on the head, and a sided part has a left and a right node', () => {
  const table = bodyPartBones(['head', 'hair', 'chest', 'upperarm', 'upperleg', 'knee', 'tail']);
  assert.deepEqual(table.head, ['head']);
  assert.deepEqual(table.hair, ['head']);
  assert.deepEqual(table.chest, ['chest']);
  assert.deepEqual(table.tail, ['tail']);
  assert.deepEqual(table.upperarm, ['left upper arm', 'right upper arm']);
  assert.deepEqual(table.upperleg, ['left upper leg', 'right upper leg']);
  assert.deepEqual(table.knee, ['left knee', 'right knee']);
});

test('a slot the skeleton has no node for is left out, and the table cannot be changed', () => {
  const table = bodyPartBones(['head', 'cuirass', 'weapon', '']);
  assert.deepEqual(Object.keys(table), ['head']);
  assert.ok(Object.isFrozen(table));
  assert.deepEqual(Object.keys(bodyPartBones([])), []);
});

const dataPath = process.env.MW_DATA_PATH;
const archives = ['Morrowind', 'Tribunal', 'Bloodmoon'].map((name) => `${name}.bsa`);
const esms = ['Morrowind', 'Tribunal', 'Bloodmoon'].map((name) => `${name}.esm`);
const present = !!dataPath && [...archives, ...esms].every((name) => existsSync(join(dataPath, name)));

test('every node the table names is in the retail skeletons', { skip: !present }, () => {
  const archive = new MwBsaFile(new Uint8Array(readFileSync(join(dataPath as string, 'Morrowind.bsa'))));
  for (const file of ['meshes/base_anim.nif', 'meshes/base_anim_female.nif', 'meshes/base_animkna.nif']) {
    const names = buildSkeleton(parseNif(archive.get(file).slice())).byName;
    for (const [slot, bones] of tableRows(npc.PART_BONES)) {
      // Only the beast skeleton carries a tail.
      if (slot === 'tail' && !file.endsWith('kna.nif')) continue;
      for (const bone of bones) assert.ok(names.has(bone), `${file}: no node "${bone}" for ${slot}`);
    }
  }
});

test('every NPC_ of the retail ESMs assembles as recorded', { skip: !present }, () => {
  const now = recordNpcs({
    dataPath,
    fs: { readFileSync },
    path: { join },
    modules: { ...npc, parseEsm },
  });
  assert.equal(now.ids.length, recorded.ids.length, 'NPC_ count');
  assert.deepEqual(now.ids, recorded.ids);
  const first = now.digests.findIndex((digest: string, at: number) => digest !== recorded.digests[at]);
  assert.equal(first, -1, first < 0 ? '' : `NPC_ ${recorded.ids[first]}`);
});
