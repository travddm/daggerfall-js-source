// The holster rules (src/systems/weapon-holster.ts) were rewritten from the files of the vendored
// scabbard mod (its add-on's node names, the scabbards' "Bip01 Weapon" and "Bip01 Ammo" nodes) and the weapon record format, without the third-party source they had been ported from. These tests run the current code
// over the inputs of weapon-holster-sweep.mjs and compare with a recording of the implementation it replaced
// (test/fixtures/mw/weapon-holster-parity.json): the 669 weapon records of the three master files, each with and
// without the skeleton's bones, with and without a scabbard, with matching, wrong and no ammunition and stacks from
// none to the largest safe integer, and the 71 vendored scabbards read as they are, as files that will not parse and as
// files whose weapon or ammunition node is renamed, a shape or empty.
//
// The recording came from the holster module of the third-person body at commit 78900251fa:
// run recordResolver and recordSmall from weapon-holster-sweep.mjs over the retail weapon records and the vendored files. No third-party engine source was
// read for the new code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as holster from '../../../src/systems/weapon-holster.ts';
import { exactJson, readVendored, readWeapons, recordResolver, recordSmall } from './weapon-holster-sweep.mjs';

// Loaded by a computed path: these modules reach src/net, whose crypto types the Node type pass does not have.
const load = (path: string) => import(new URL(`../../../src/${path}`, import.meta.url).href);
const firstPerson = await load('formats/morrowind/mwFirstPerson.js');
const { parseNif, deref } = await load('formats/morrowind/mwNifFile.js');
const { findNodeByName, nodeTransformOf } = await load('formats/morrowind/mwCharacter.js');

// The module under test with the node readers of the Morrowind layer, as the module that wires it passes them.
const nodeReader = { findNode: findNodeByName, transformOf: nodeTransformOf, recordAt: deref };
const sheathing = {
  ...holster,
  resolveHolsterParts: (input: Parameters<typeof holster.holsterPartsFor>[0]) =>
    holster.holsterPartsFor(input, nodeReader),
};

const { inputs, recorded } = JSON.parse(
  readFileSync(new URL('../../fixtures/mw/weapon-holster-parity.json', import.meta.url), 'utf8'),
);
const root = fileURLToPath(new URL('../../..', import.meta.url)).replace(/[\\/]$/, '');
const files = readVendored({ fs: { readFileSync, readdirSync }, path: { join }, root });
const now = recordResolver({ sheathing, modules: firstPerson, parseNif, weapons: inputs.weapons, files });
const T = firstPerson.MW_WEAPON_TYPE;

test('holster: every weapon record answers as recorded, in both spellings of its model', () => {
  assert.equal(now.perWeapon.length, recorded.resolver.perWeapon.length);
  const first = now.perWeapon.findIndex((row: string[], at: number) =>
    row.some((digest, spelling) => digest !== recorded.resolver.perWeapon[at][spelling]),
  );
  assert.equal(first, -1, first < 0 ? '' : `weapon ${exactJson(inputs.weapons[first])}`);
});

test('holster: every vendored scabbard answers as recorded, intact and damaged', () => {
  assert.deepEqual(now.perScabbard, recorded.resolver.perScabbard);
});

test('holster: the recording reaches every branch of the resolver', () => {
  assert.deepEqual(now.branches, recorded.resolver.branches);
  for (const branch of ['null', 'no bone', 'bare', 'whole', 'emptyNode', 'withNode']) {
    assert.ok(recorded.resolver.branches[branch] > 0, branch);
  }
});

test('holster: the tables and the small functions answer as recorded', () => {
  assert.deepEqual(JSON.parse(exactJson(recordSmall({ sheathing, modules: firstPerson }))), recorded.small);
});

test("the bone of each weapon kind is the add-on node of its name, with the add-on's three exceptions", () => {
  assert.equal(Object.keys(holster.SHEATHING_BONE).length, 12);
  assert.equal(holster.SHEATHING_BONE[T.ShortBladeOneHand], 'Bip01 ShortBladeOneHand');
  assert.equal(holster.SHEATHING_BONE[T.LongBladeTwoHand], 'Bip01 LongBladeTwoClose');
  assert.equal(holster.SHEATHING_BONE[T.AxeTwoHand], 'Bip01 AxeTwoClose');
  assert.equal(holster.SHEATHING_BONE[T.AxeOneHand], 'Bip01 LongBladeOneHand');
  assert.equal(holster.SHEATHING_BONE[T.MarksmanThrown], 'Bip01 MarksmanThrown');
  assert.equal(holster.SHEATHING_BONE[T.Arrow], undefined);
});

test('a thrown weapon never shows on the body, and a weapon with no bone does not holster', () => {
  assert.equal(holster.holsters(T.MarksmanThrown), false);
  assert.equal(holster.holsters(T.MarksmanBow), true);
  assert.equal(holster.holsters(T.None), false);
  assert.equal(holster.holsters(T.Arrow), false);
});

test("the suffix goes before the extension, and the add-on folder is the skeleton's name", () => {
  assert.equal(holster.sheathedMeshPath('meshes/w/w_saber.nif'), 'meshes/w/w_saber_sh.nif');
  assert.equal(holster.sheathedMeshPath('meshes/w.dir/noext'), 'meshes/w.dir/noext_sh');
  assert.equal(holster.sheathedMeshPath(''), '');
  assert.equal(holster.animationsDirOf('Meshes\\xbase_anim_female.NIF'), 'animations/xbase_anim_female/');
  assert.equal(holster.vendoredDataPath('C:\\a\\Data Files\\Meshes\\W\\Y.NIF'), 'meshes/w/y.nif');
});

test('the add-on folders are read base first, each file once', () => {
  const archives = [
    { names: ['animations/xbase_anim/a.nif', 'Animations\\xbase_anim_female\\f.nif'] },
    { list: () => ['animations/xbase_anim/a.nif', 'animations/xbase_anim/b.nif', 'animations/xbase_anim/c.txt'] },
  ];
  assert.deepEqual(holster.boneSourcesFor('meshes/xbase_anim.nif', 'meshes/xbase_anim_female.nif', archives), [
    'animations/xbase_anim/a.nif',
    'animations/xbase_anim/b.nif',
    'animations/xbase_anim_female/f.nif',
  ]);
  assert.deepEqual(holster.boneSourcesFor('meshes/xbase_anim.nif', 'meshes/xbase_anim.nif', null), []);
});

test('the hide law: the holster shows with an empty hand, the scabbard always, the quiver but its last slot on the string', () => {
  assert.equal(holster.holsterHidden('holster', true), true);
  assert.equal(holster.holsterHidden('holster', false), false);
  assert.equal(holster.holsterHidden('sheath', true), false);
  assert.equal(holster.holsterHidden('quiver', true), false);
  assert.equal(holster.holsterHidden('weapon', true), null);
  assert.equal(holster.holsterHidden('quiver', true, { arrowShown: true, tag: { i: 6, n: 7 } }), true);
  assert.equal(holster.holsterHidden('quiver', true, { arrowShown: true, tag: { i: 5, n: 7 } }), false);
  assert.equal(holster.holsterHidden('quiver', true, { arrowShown: false, tag: { i: 6, n: 7 } }), false);
});

test('the quiver holds as many rounds as there are slots and rounds', () => {
  const bow = files.get('meshes/w/w_longbow_sh.nif');
  assert.ok(bow, 'the vendored long bow scabbard');
  const quiverOf = (count: number) =>
    sheathing
      .resolveHolsterParts({
        mwType: T.MarksmanBow,
        weaponModel: 'w/w_longbow.nif',
        weaponBytes: new Uint8Array([1]),
        ammo: { bytes: new Uint8Array([2]), type: T.Arrow },
        ammoCount: count,
        find: (path: string) => (files.has(path) ? { get: (name: string) => files.get(name) } : null),
        hasBone: () => true,
        parseNif,
      })
      .parts.filter((part: { slot: string }) => part.slot === 'quiver');
  const full = quiverOf(Number.MAX_SAFE_INTEGER);
  assert.ok(full.length > 0);
  assert.deepEqual(
    full.map((part) => part.tag),
    full.map((_part: unknown, at: number) => ({ i: at, n: full.length })),
  );
  assert.equal(quiverOf(0).length, 0);
  assert.equal(quiverOf(1).length, 1);
  assert.equal(quiverOf(-4).length, 0);
});

test("the scabbard is a copy of the archive's bytes, and the scabbard and the holster pieces share it", () => {
  const archiveBytes = files.get('meshes/w/w_iron_longsword_sh.nif');
  assert.ok(archiveBytes, 'the vendored iron longsword scabbard');
  const answer = sheathing.resolveHolsterParts({
    mwType: T.LongBladeOneHand,
    weaponModel: 'w/w_iron_longsword.nif',
    weaponBytes: new Uint8Array([1]),
    find: (path: string) => (files.has(path) ? { get: (name: string) => files.get(name) } : null),
    hasBone: () => true,
    parseNif,
  });
  const [sheath, holsterPiece] = answer.parts;
  assert.equal(sheath.slot, 'sheath');
  assert.equal(holsterPiece.slot, 'holster');
  assert.equal(sheath.bytes, holsterPiece.bytes);
  assert.notEqual(sheath.bytes, archiveBytes);
  assert.deepEqual(sheath.bytes, archiveBytes);
});

const dataPath = process.env.MW_DATA_PATH;
const archives = ['Morrowind', 'Tribunal', 'Bloodmoon'].map((name) => `${name}.esm`);
const present = !!dataPath && archives.every((name) => existsSync(join(dataPath, name)));

test('the recorded weapons are the retail records', { skip: !present }, () => {
  const live = readWeapons({ dataPath, fs: { readFileSync }, path: { join }, modules: firstPerson });
  assert.deepEqual(JSON.parse(exactJson(live)), inputs.weapons);
});
