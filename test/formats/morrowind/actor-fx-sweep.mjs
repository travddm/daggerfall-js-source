import { seededRandom } from './mw-particle-sweep.mjs';

// A fixed set of inputs for the actor effect sizing (src/formats/morrowind/mwSpellFx.js, actorFxTransform) and the
// way its answers are recorded. actor-fx-transform.test.ts runs the current code over these inputs and compares with
// the recording in test/fixtures/mw/actor-fx-parity.json, which was made from the implementation it replaced.
//
// The inputs are a body of `height` and `radius` in metres and a number of Morrowind units to the metre:
//   - a grid of heights and radii that reaches both sides of every threshold the rule turns on (the 128-unit person,
//     the 64-unit reach, a body as wide as it is tall),
//   - the bodies at the exact thresholds, and a few other unit scales,
//   - seeded random bodies.

/** The units to the metre the game uses (mwAnimSources.js MW_UNITS_PER_METER). */
export const GAME_UNITS_PER_METRE = 69.99125109;

/** The bodies, each `[height, radius, unitsPerMetre]`. */
export function actorBodies() {
  const bodies = [];
  const heights = [0, 0.05, 0.3, 0.6, 0.9, 1.2, 1.5, 1.7, 1.8, 1.82, 1.83, 1.9, 2.4, 3, 4.5, 6, 12];
  const radii = [0, 0.05, 0.2, 0.45, 0.6, 0.9, 1.4, 2, 3.5];
  for (const height of heights) {
    for (const radius of radii) bodies.push([height, radius, GAME_UNITS_PER_METRE]);
  }
  // Heights and radii that land exactly on a threshold at a unit scale of one: z = 128, xy = 64, z = 4 radius.
  for (const [height, radius] of [
    [128, 32],
    [128, 31.99],
    [128, 32.01],
    [127.99, 32],
    [128.01, 32],
    [256, 64],
    [255, 64],
    [257, 64],
    [64, 8],
    [0.5, 16],
  ]) {
    bodies.push([height, radius, 1]);
  }
  for (const units of [1, 64, 100, 128]) bodies.push([1.8, 0.45, units], [2.4, 1.4, units], [0.4, 0.2, units]);
  const random = seededRandom(20261117);
  for (let count = 0; count < 600; count++) {
    bodies.push([random() * 7, random() * 3, GAME_UNITS_PER_METRE]);
  }
  return bodies;
}

/** What `actorFxTransform` answers for every body: `[scale, offset]` each. */
export function recordActorFx(actorFxTransform) {
  return actorBodies().map(([height, radius, units]) => {
    const { scale, offset } = actorFxTransform(height, radius, units);
    return [scale, offset];
  });
}
