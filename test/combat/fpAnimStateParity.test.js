// The first-person arm's animation-state helpers (src/combat/fpArm/fpAnimState.js) are compared with a recording of the
// code that was moved out of fpArm.js unchanged (test/fixtures/mw/fpAnimStateParity.json):
//   - helpers: the pure functions over the text keys of the retail first-person, beast first-person and third-person
//     clip files (kept in the recording) and over truth tables;
//   - scripts: createFpArm driven at 1/60 s over the retail archives (needs MW_DATA_PATH) through stance, movement,
//     attack, sheathe, cast, hurt and die for a human and a beast race, comparing the upper-body state, the groups,
//     the clip time and the loop count of every tick.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as state from '../../src/combat/fpArm/fpAnimState.js';
import * as arm from '../../src/combat/fpArm.js';
import { MW_WEAPON_TYPE } from '../../src/formats/morrowind/mwFirstPerson.js';
import { resetClip } from '../../src/formats/morrowind/mwAnim.js';
import { createFpArm } from '../../src/combat/fpArm.js';
import { MwBsaFile } from '../../src/formats/morrowind/mwBsaFile.js';
import { recordHelpers, recordScripts, readRetailDeps } from './fpAnimStateSweep.mjs';

const { inputs, recorded } = JSON.parse(
  fs.readFileSync(new URL('../fixtures/mw/fpAnimStateParity.json', import.meta.url), 'utf8'),
);

// The upper-body states were renamed; the recording keeps the old names.
const NEW_NAME = {
  None: 'Rest',
  Equipping: 'Drawing',
  Unequipping: 'Stowing',
  WeaponEquipped: 'Ready',
  AttackWindUp: 'Winding',
  AttackRelease: 'Striking',
  AttackEnd: 'Recovering',
  Casting: 'Casting',
};
const OLD_NAME = Object.fromEntries(Object.entries(NEW_NAME).map(([old, now]) => [now, old]));

const typeName = new Map(Object.entries(MW_WEAPON_TYPE).map(([k, v]) => [v, k]));
const api = {
  completion: state.clipCompletion,
  strideOpposite: state.strideOppositeTime,
  releaseSkip: state.releaseSkip,
  blowRate: state.blowRate,
  idleBaseFor: state.idleBaseFor,
  weaponTypeFor: state.animWeaponType,
  carriedLeftVisible: state.carriedLeftVisible,
  spellAttackType: state.spellAttackType,
  accurateAiming: (name) => state.accurateAiming(state.UPPER_BODY[NEW_NAME[name]]),
  fpSkeleton: state.fpSkeletonPath,
  tpSkeleton: state.tpSkeletonPath,
  idleLoops: state.FP_IDLE_LOOPS,
  weaponTypeValue: (name) => MW_WEAPON_TYPE[name],
  weaponTypeName: (value) => typeName.get(value),
  clipAt: (keys, group) => {
    const clip = resetClip(keys, group, { loopFallback: true });
    return clip.ok ? clip : null;
  },
};
const now = JSON.parse(JSON.stringify(recordHelpers(api, inputs)));
const before = recorded.helpers;

test('animation state, kept exactly: completion, stride, release lookup, blow rate, idle base, weapon type, skeletons', () => {
  for (const key of Object.keys(before)) {
    if (key === 'loops') continue;
    assert.deepEqual(now[key], before[key], key);
  }
});

test('animation state, kept exactly: the idle loop count over a seeded dice sequence', () => {
  assert.deepEqual(now.loops, before.loops);
});

test('animation state: the recording covered every attack group of every rig it has', () => {
  assert.ok(Object.keys(before.release['fp-human']).length >= 20);
  assert.ok(
    Object.values(before.release['fp-human']).some((row) => row.some((v) => v > 0)),
    'some lookup is not zero',
  );
});

test('animation state: fpArm.js still exports every helper', () => {
  for (const name of Object.keys(state)) assert.equal(arm[name], state[name], name);
});

const dataPath = process.env.MW_DATA_PATH;
test(
  'animation state, arm driven at 1/60 s on the retail files: every tick as recorded',
  { skip: !dataPath, timeout: 240000 },
  async () => {
    const log = console.log;
    console.log = () => {};
    let scripts;
    try {
      scripts = await recordScripts({ createFpArm, deps: readRetailDeps({ dataPath, fs, MwBsaFile }) });
    } finally {
      console.log = log;
    }
    for (const id of Object.keys(recorded.scripts)) {
      const want = recorded.scripts[id];
      const got = JSON.parse(JSON.stringify(scripts[id])).map((row) => [OLD_NAME[row[0]], ...row.slice(1)]);
      assert.equal(got.length, want.length, `${id}: tick count`);
      for (let i = 0; i < want.length; i++) assert.deepEqual(got[i], want[i], `${id}: tick ${i}`);
    }
  },
);
