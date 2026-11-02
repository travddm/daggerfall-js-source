// The inputs that spineAimParity.test.js feeds to the spine-aim code, and how their outputs are recorded.
// test/fixtures/mw/spineAimParity.json was recorded from the implementation that the current one replaced.
import { createHash } from 'node:crypto';
import { MW_WEAPON_TYPE } from '../../src/formats/morrowind/mwFirstPerson.js';

const UPPER_STATES = [
  'None',
  'Equipping',
  'Unequipping',
  'WeaponEquipped',
  'AttackWindUp',
  'AttackRelease',
  'AttackEnd',
  'Casting',
  'Unknown',
];
const GROUPS = [null, 'bowandarrow', 'crossbow', 'throwweapon', 'attack1', 'attack2', 'swimattack3'];
const TIMES = [-1, 0, 5.7, 5.85, 5.99, 6, 6.5];
const KEY_PAIRS = [
  [-1, -1],
  [5.8, 6.0],
  [5.8, -1],
  [0, 6],
  [6, 5.9],
];
const COMPLETIONS = [0, 0.04, 0.05, 0.1, 0.3, 0.99, 1, 1.5];

/** Every argument object of the grid: all weapon types, plus values no weapon has. */
export function* pitchFactorInputs() {
  const types = [...Object.values(MW_WEAPON_TYPE), 99, -1];
  for (const upper of UPPER_STATES) {
    for (const weaponType of types) {
      for (const group of GROUPS) {
        for (const time of TIMES) {
          for (const [startTime, minAttackTime] of KEY_PAIRS) {
            for (const completion of COMPLETIONS) {
              yield { upper, weaponType, group, time, startTime, minAttackTime, completion };
            }
          }
        }
      }
    }
  }
}

/** A digest of the factor over the whole grid, so that a changed value anywhere changes it. */
export function pitchFactorDigest(spinePitchFactor) {
  const hash = createHash('sha256');
  let count = 0;
  for (const input of pitchFactorInputs()) {
    hash.update(`${Number(spinePitchFactor(input).toPrecision(12))};`);
    count++;
  }
  return { count, sha256: hash.digest('hex') };
}

export const PITCHES = Array.from({ length: 33 }, (_, i) => Number((-1.6 + i * 0.1).toFixed(2)));
export const RECORDED_BONES = [
  'bip01 pelvis',
  'bip01 spine',
  'bip01 spine1',
  'bip01 spine2',
  'bip01 neck',
  'bip01 head',
  'bip01 r hand',
];

/** For each pitch: how many bones turned, and the world rotation and position of the recorded bones. */
export function recordSpineAim(applySpineAim, skeleton, skeletonSpaceMatrices, rootRef) {
  return PITCHES.map((pitch) => {
    const pose = new Map();
    const turned = applySpineAim(skeleton, pose, rootRef, skeletonSpaceMatrices, pitch);
    const mats = skeletonSpaceMatrices(skeleton, pose, rootRef);
    const bones = RECORDED_BONES.map((name) => {
      const node = mats.get(skeleton.byName.get(name));
      return [...node.a, ...node.t].map((v) => Number(v.toPrecision(7)));
    });
    return { pitch, turned, bones };
  });
}
