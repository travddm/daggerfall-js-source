// The first-person arm's carried-part resolution (src/combat/fpArm/fpArmParts.js) is compared with a recording of the
// code that was moved out of fpArm.js unchanged (test/fixtures/mw/fpArmPartsParity.json): every Daggerfall weapon
// template, material and ammunition state on every retail skeleton, every bow record with its own arrow node, the
// left hand's weapon, the held torch and the lantern at the waist. Needs MW_DATA_PATH; skips without it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as parts from '../../../src/combat/fpArm/fpArmParts.js';
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

// The held light's turn, measured: the retail torch mesh's handle-to-flame axis, turned by LIGHT_ATTITUDE and placed
// on Shield Bone in the "torch" group's pose, stands upright on every retail skeleton, and no other quarter turn
// about one axis stands it more upright.
const QUARTER_TURNS = {
  identity: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  'x -90': [1, 0, 0, 0, 0, 1, 0, -1, 0],
  'x +90': [1, 0, 0, 0, 0, -1, 0, 1, 0],
  'x 180': [1, 0, 0, 0, -1, 0, 0, 0, -1],
  'y +90': [0, 0, 1, 0, 1, 0, -1, 0, 0],
  'y -90': [0, 0, -1, 0, 1, 0, 1, 0, 0],
  'z +90': [0, -1, 0, 1, 0, 0, 0, 0, 1],
  'z -90': [0, 1, 0, -1, 0, 0, 0, 0, 1],
};

test('carried parts: LIGHT_ATTITUDE stands the retail torch upright in the hand', { skip: !dataPath }, async () => {
  const { parseNif } = await import('../../../src/formats/morrowind/mwNifFile.js');
  const { flattenNif } = await import('../../../src/formats/morrowind/mwNifMesh.js');
  const { nodeTransformOf } = await import('../../../src/formats/morrowind/mwCharacter.js');
  const skin = await import('../../../src/formats/morrowind/mwSkin.js');
  const anim = await import('../../../src/formats/morrowind/mwAnim.js');
  const { archives } = readRetailData({ dataPath, fs, MwBsaFile, weaponRecords, lightRecords });
  const get = (path) => archives.find((a) => a.has(path)).get(path);
  const mul = (a, v) => [0, 1, 2].map((r) => a[r * 3] * v[0] + a[r * 3 + 1] * v[1] + a[r * 3 + 2] * v[2]);
  const unit = (v) => v.map((x) => x / Math.hypot(...v));

  const torch = parseNif(get('meshes/l/light_torch10.nif'));
  const flame = nodeTransformOf(torch, 'AttachLight').t;
  const points = flattenNif(torch, { includeHidden: true }).flatMap((b) => {
    const pos = b.positions ?? b.mesh?.positions ?? [];
    const out = [];
    for (let i = 0; i < pos.length; i += 3) out.push([pos[i], pos[i + 1], pos[i + 2]]);
    return out;
  });
  const dist = (p) => Math.hypot(p[0] - flame[0], p[1] - flame[1], p[2] - flame[2]);
  const handle = points.reduce((far, p) => (dist(p) > dist(far) ? p : far));
  const axis = unit([flame[0] - handle[0], flame[1] - handle[1], flame[2] - handle[2]]);

  const kf = parseNif(get('meshes/xbase_anim.kf'));
  const kf1st = parseNif(get('meshes/xbase_anim.1st.kf'));
  for (const [skeletonPath, clips] of [
    ['meshes/base_anim.nif', kf],
    ['meshes/base_animkna.nif', kf],
    ['meshes/xbase_anim.1st.nif', kf1st],
  ]) {
    const skeleton = skin.buildSkeleton(parseNif(get(skeletonPath)));
    const keys = anim.normalizeTextKeys(anim.collectTextKeys(clips));
    const mid = (anim.getTextKeyTime(keys, 'torch: start') + anim.getTextKeyTime(keys, 'torch: stop')) / 2;
    const pose = skin.poseSkeleton(skeleton, anim.extractTracks(clips), anim.sampleTrack, mid);
    const bone = skin.skeletonSpaceMatrices(skeleton, pose, skin.GRAPH_ROOT).get(skeleton.byName.get('shield bone'));
    const upOf = (turn) => unit(mul(bone.a, mul(turn, axis)))[2];
    const up = upOf(parts.LIGHT_ATTITUDE.a);
    assert.ok(up > 0.95, `${skeletonPath}: the flame points up (${up.toFixed(3)})`);
    for (const [name, turn] of Object.entries(QUARTER_TURNS)) {
      assert.ok(upOf(turn) <= up + 1e-9, `${skeletonPath}: ${name} stands it more upright`);
    }
  }
});
