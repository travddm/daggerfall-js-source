// The weapon animation rules were rewritten from the retail animation files and the WEAP record layout, without the
// third-party source they had been ported from. These tests run the current module over the inputs of
// mwWeaponAnimSweep.mjs and compare with a recording of the implementation it replaced
// (test/fixtures/mw/mwWeaponAnimParity.json): the group chosen for every weapon type, base name and set of loaded
// groups, the movement and jump states, the attack text keys, and the wind-up and release timing at the real key
// times of the retail attack groups.
//
// The recording came from src/formats/morrowind/mwWeaponAnim.js at commit edce36cee2 (the rules moved out of
// mwFirstPerson.js unchanged): run recordWeaponAnim from mwWeaponAnimSweep.mjs over that module and
// buildGroupSets(retailGroups), with the retail attack-group keys stored under `attackClips`, and write the result
// as JSON beside `retailGroups` and `attackClips`. No third-party engine source was read for the new code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as weaponAnim from '../../../src/formats/morrowind/mwWeaponAnim.js';
import * as firstPerson from '../../../src/formats/morrowind/mwFirstPerson.js';
import { MwBsaFile } from '../../../src/formats/morrowind/mwBsaFile.js';
import { parseNif } from '../../../src/formats/morrowind/mwNifFile.js';
import {
  animVelocity,
  collectTextKeys,
  extractTracks,
  normalizeTextKeys,
} from '../../../src/formats/morrowind/mwAnim.js';
import { buildGroupSets, recordWeaponAnim } from './mwWeaponAnimSweep.mjs';

const recording = JSON.parse(
  readFileSync(new URL('../../fixtures/mw/mwWeaponAnimParity.json', import.meta.url), 'utf8'),
);
const { retailGroups, attackClips, ...recorded } = recording;
const now = JSON.parse(JSON.stringify(recordWeaponAnim(weaponAnim, buildGroupSets(retailGroups), attackClips)));

for (const section of Object.keys(recorded)) {
  test(`weapon animation rules: ${section} matches the recording`, () => {
    assert.deepEqual(now[section], recorded[section]);
  });
}

test('weapon animation rules: the first-person host still exports them', () => {
  for (const name of Object.keys(weaponAnim)) assert.equal(firstPerson[name], weaponAnim[name], name);
});

const dataPath = process.env.MW_DATA_PATH;
const archive = dataPath && existsSync(join(dataPath, 'Morrowind.bsa')) ? join(dataPath, 'Morrowind.bsa') : null;

test("weapon animation rules: the fallback speeds are the retail clips' own root travel", { skip: !archive }, () => {
  const bsa = new MwBsaFile(new Uint8Array(readFileSync(archive)));
  const nif = parseNif(bsa.get('meshes/xbase_anim.kf'));
  const keys = normalizeTextKeys(collectTextKeys(nif));
  const root = extractTracks(nif).get('bip01');
  for (const gait of ['walk', 'run', 'sneak']) {
    const measured = animVelocity(keys, root, `${gait}forward`);
    assert.ok(Math.abs(measured - weaponAnim.MOVEMENT_FALLBACK_SPEED[gait]) < 1e-3, `${gait}: ${measured}`);
  }
});

test(
  'weapon animation rules: every group the rules name for a stance exists in the retail files',
  { skip: !archive },
  () => {
    const bsa = new MwBsaFile(new Uint8Array(readFileSync(archive)));
    const names = new Set(
      normalizeTextKeys(collectTextKeys(parseNif(bsa.get('meshes/xbase_anim.kf')))).map(
        (key) => key.text.split(': ')[0],
      ),
    );
    for (const type of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, -3, -2, -4]) {
      const { group } = weaponAnim.composeWeaponGroup(type, (name) => names.has(name));
      assert.ok(group, `weapon type ${type} finds an attack group in xbase_anim.kf`);
      assert.ok(weaponAnim.composeStanceGroup('idle', type, (name) => names.has(name)).group, `type ${type} idles`);
    }
  },
);
