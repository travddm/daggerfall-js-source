// The first-person arm's carried-part resolution (src/combat/fpArm/fpArmParts.js) is compared with a recording of the
// code that was moved out of fpArm.js unchanged (test/fixtures/mw/fpArmPartsParity.json): every Daggerfall weapon
// template, material and ammunition state on every retail skeleton, every bow record with its own arrow node, the
// left hand's weapon, the held torch and the lantern at the waist. Needs MW_DATA_PATH; skips without it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as parts from '../../../src/combat/fpArm/fpArmParts.js';
import * as arm from '../../../src/combat/fpArm.js';
import { WEAPONS } from '../../../src/characters/weapons.js';
import {
  MW_WEAPON_TYPE,
  dfWeaponToMw,
  weaponRecords,
  lightRecords,
} from '../../../src/formats/morrowind/mwFirstPerson.js';
import { MwBsaFile } from '../../../src/formats/morrowind/mwBsaFile.js';
import { readRetailData, recordParts } from './fpArmPartsSweep.mjs';

const FIXTURE = new URL('../../fixtures/mw/fpArmPartsParity.json', import.meta.url);
const dataPath = process.env.MW_DATA_PATH;

test('carried parts: fpArm.js still exports every resolver', () => {
  for (const name of Object.keys(parts)) {
    if (name === 'PLUMB') continue;
    assert.equal(arm[name], parts[name], name);
  }
});

test('carried parts, on the retail files: every answer as recorded', { skip: !dataPath, timeout: 240000 }, () => {
  const data = readRetailData({ dataPath, fs, MwBsaFile, weaponRecords, lightRecords });
  const now = JSON.parse(JSON.stringify(recordParts({ ...parts, WEAPONS, MW_WEAPON_TYPE, dfWeaponToMw }, data)));
  if (process.env.RECORD_PARITY === '1') {
    fs.writeFileSync(FIXTURE, JSON.stringify(now));
    return;
  }
  const before = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  assert.deepEqual(now.attitude, before.attitude, 'the held light attitude');
  for (const group of ['weapons', 'eachBow', 'offWeapons', 'torches', 'lanterns']) {
    for (const skeleton of Object.keys(before[group])) {
      for (const key of Object.keys(before[group][skeleton])) {
        assert.deepEqual(now[group][skeleton][key], before[group][skeleton][key], `${group} ${skeleton} ${key}`);
      }
      assert.deepEqual(Object.keys(now[group][skeleton]), Object.keys(before[group][skeleton]), `${group} ${skeleton}`);
    }
  }
  assert.deepEqual(now.paths, before.paths, 'the preload paths');
});
