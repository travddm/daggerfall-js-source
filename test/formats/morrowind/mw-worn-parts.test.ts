// The worn-body rules (src/formats/morrowind/mw-worn-parts.ts and their use in mwItemMap.js) were rewritten from the
// ARMO and CLOT record format and the retail skeleton's part names, without the third-party source they had been ported
// from. These tests run the current code over the inputs of mw-worn-sweep.mjs and compare with a recording of the
// implementation it replaced (test/fixtures/mw/mw-worn-parity.json): the armour, clothing and body-part records of the
// three master files, every piece a figure can wear alone and in seeded sets, dressed as a man and as a woman with a
// beast race's switches in four positions, and hand-written records for every state of the shield ladder.
//
// The recording came from src/formats/morrowind/mwItemMap.js at commit 1686848e2a: run readRecords, piecesOf,
// recordCompositions, recordGroups and recordHandWritten from mw-worn-sweep.mjs over the retail files and that module.
// No third-party engine source was read for the new code.
//
// Three notes were reworded to drop the name of the engine function they quoted. They are put back into the old words
// before comparing (`oldWording`), so that a change anywhere else in a note still fails.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as parts from '../../../src/formats/morrowind/mw-worn-parts.ts';
import {
  compositionsOf,
  exactJson,
  piecesOf,
  readRecords,
  recordCompositions,
  recordGroups,
  recordHandWritten,
  recordTables,
} from './mw-worn-sweep.mjs';

// Loaded by a computed path: mwItemMap.js reaches src/net, whose crypto types the Node type pass does not have.
const load = (path: string) => import(new URL(`../../../src/${path}`, import.meta.url).href);
const itemMap = await load('formats/morrowind/mwItemMap.js');
const firstPerson = await load('formats/morrowind/mwFirstPerson.js');
const { ARMOR_MATERIAL } = await load('systems/armorMaterials.js');
const { TOWNSFOLK_OUTFITS } = await load('characters/ownModels/ownClothingModels.js');

const { inputs, recorded } = JSON.parse(
  readFileSync(new URL('../../fixtures/mw/mw-worn-parity.json', import.meta.url), 'utf8'),
);
const tables = { ...itemMap, ARMOR_MATERIAL, TOWNSFOLK_OUTFITS };

/** The old wording of the three reworded notes, so that the recording still applies. */
function oldWording(value: unknown): unknown {
  if (typeof value === 'string') {
    return value
      .replace(/ - ground mesh, no shield body part named/g, " - ground mesh, the reference's own fallback")
      .replace(
        /(shield body "[^"]*" (?:is in no BODY record|is not armor-kind)) - the slot is held empty/g,
        "$1 - the slot reserves EMPTY (getShieldMesh's own refusal)",
      )
      .replace(/ - the slot is held empty$/, ' - the slot is held empty (reserveIndividualPart)');
  }
  if (Array.isArray(value)) return value.map(oldWording);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, oldWording(inner)]));
  }
  return value;
}

test('worn parts: the part table, the reserve lists and the beast switches are as recorded', () => {
  assert.deepEqual(JSON.parse(exactJson(recordTables(itemMap))), recorded.tables);
});

test('worn parts: every composition of the retail records answers as recorded', () => {
  const pieces = piecesOf(inputs, tables);
  const compositions = compositionsOf(pieces);
  const digests = recordCompositions(itemMap, inputs, compositions, oldWording);
  assert.equal(digests.length, recorded.digests.length);
  const first = digests.findIndex((row: string[], at: number) =>
    row.some((digest, dressing) => digest !== recorded.digests[at][dressing]),
  );
  assert.equal(
    first,
    -1,
    first < 0
      ? ''
      : `composition ${first}: ${exactJson(compositions[first].map((piece: { name?: string; id?: string; templateIndex?: number }) => piece.name ?? piece.id ?? piece.templateIndex))}`,
  );
});

test('worn parts: the first person and the modest shirt answer as recorded', () => {
  assert.deepEqual(recordGroups(itemMap, inputs), recorded.groups);
});

test('worn parts: the hand-written records answer as recorded, every state of the shield ladder included', () => {
  const now = JSON.parse(exactJson(oldWording(recordHandWritten(itemMap))));
  assert.deepEqual(Object.keys(now), Object.keys(recorded.handWritten));
  for (const name of Object.keys(recorded.handWritten)) assert.deepEqual(now[name], recorded.handWritten[name], name);
});

test('the part table names every enum entry once, and the reserve lists name parts of it', () => {
  assert.equal(parts.ARMO_PART.length, 27);
  assert.equal(new Set(parts.ARMO_PART.map((row) => row.name)).size, 27);
  assert.deepEqual(
    parts.RESERVES.skirt.map((index) => parts.ARMO_PART[index].name),
    ['groin', 'right upper leg', 'left upper leg'],
  );
  assert.equal(parts.RESERVES.robe.length, 11);
  assert.equal(parts.ARMO_PART[parts.SHIELD_PART].name, 'shield');
  assert.equal(itemMap.ARMO_PART, parts.ARMO_PART);
});

test('priority: armour beats clothing at one base, a robe beats a cuirass, a skirt beats trousers', () => {
  assert.equal(parts.garmentPriority(null, false), 2);
  assert.equal(parts.garmentPriority(null, true), 3);
  assert.equal(parts.garmentPriority('robe', false), 24);
  assert.equal(parts.garmentPriority('skirt', false), 8);
  assert.ok(parts.garmentPriority('robe', false) > parts.garmentPriority(null, true));
  assert.ok(parts.garmentPriority('skirt', false) > parts.garmentPriority(undefined, false));
});

test('layers: the outermost are walked first', () => {
  const order = [
    'robe',
    'skirt',
    'helm',
    'cuirass',
    'greaves',
    'left pauldron',
    'right pauldron',
    'boots',
    'gauntlets',
    'shirt',
    'clothing',
    'carried',
  ] as const;
  assert.deepEqual(
    [...order].map(parts.layerRank),
    order.map((_name, index) => index),
  );
});

test('a shield ladder: a named body wins, an unusable one hides the shield, no reference falls back to the ground model', () => {
  const bodies = new Map<string, parts.BodyRecord>([
    ['man', { id: 'man', model: 'man.nif', bodyKind: 2 }],
    ['woman', { id: 'woman', model: 'woman.nif', bodyKind: 2 }],
    ['skin', { id: 'skin', model: 'skin.nif', bodyKind: 0 }],
  ]);
  const shield = (reference: Partial<parts.PartReference> | null) => ({
    id: 'sh',
    model: 'ground.nif',
    parts: reference ? [{ part: parts.SHIELD_PART, male: 'man', ...reference }] : [],
  });
  const notes: string[] = [];
  assert.deepEqual(parts.shieldMeshOf(shield({ female: 'woman' }), true, bodies, notes), {
    model: 'woman.nif',
    recordId: 'woman',
  });
  assert.deepEqual(parts.shieldMeshOf(shield({ female: 'woman' }), false, bodies, notes), {
    model: 'man.nif',
    recordId: 'man',
  });
  assert.deepEqual(parts.shieldMeshOf(shield(null), false, bodies, notes), {
    model: 'ground.nif',
    recordId: null,
    ground: true,
  });
  assert.equal(notes.length, 0);
  assert.equal(parts.shieldMeshOf(shield({ male: 'skin' }), false, bodies, notes), null);
  assert.equal(parts.shieldMeshOf(shield({ male: 'nothing' }), false, bodies, notes), null);
  assert.equal(notes.length, 2);
});

test('the part-group ladder: a woman reads her id first, the first person looks for .1st and falls back for arm parts only', () => {
  const bodies = new Map<string, parts.BodyRecord>([
    ['hand', { id: 'hand', model: 'hand.nif', slot: 'hand' }],
    ['hand.1st', { id: 'hand.1st', model: 'hand_1st.nif', slot: 'hand' }],
    ['knee', { id: 'knee', model: 'knee.nif', slot: 'knee' }],
    ['wrist', { id: 'wrist', model: 'wrist.nif', slot: 'wrist' }],
  ]);
  const handIndex = parts.ARMO_PART.findIndex((row) => row.name === 'right hand');
  const kneeIndex = parts.ARMO_PART.findIndex((row) => row.name === 'right knee');
  const wristIndex = parts.ARMO_PART.findIndex((row) => row.name === 'right wrist');
  const record = {
    parts: [
      { part: handIndex, male: 'hand' },
      { part: kneeIndex, male: 'knee' },
      { part: wristIndex, male: 'wrist' },
      { part: 25, male: 'hand' },
    ],
  };
  const arm = new Set(['hand', 'wrist', 'forearm', 'upperarm']);
  const third = parts.partGroupPicks(record, bodies, false, false, arm);
  assert.deepEqual(
    third.map((pick) => pick.body?.model ?? null),
    ['hand.nif', 'knee.nif', 'wrist.nif'],
  );
  const first = parts.partGroupPicks(record, bodies, false, true, arm);
  assert.deepEqual(
    first.map((pick) => pick.body?.model ?? null),
    ['hand_1st.nif', null, 'wrist.nif'],
  );
});

const dataPath = process.env.MW_DATA_PATH;
const archives = ['Morrowind', 'Tribunal', 'Bloodmoon'].map((name) => `${name}.esm`);
const present = !!dataPath && archives.every((name) => existsSync(join(dataPath, name)));

test('the recorded inputs are the retail records', { skip: !present }, () => {
  const live = readRecords({ dataPath, fs: { readFileSync }, path: { join }, modules: firstPerson });
  assert.deepEqual(JSON.parse(exactJson(live)), JSON.parse(exactJson(inputs)));
});
