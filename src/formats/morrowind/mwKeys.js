// The key-group sampler, one home.
//
// A NIF KeyGroup - {type, keys: [{time, value, inTan?, outTan?, tbc?}]},
// readKeyGroupOf's shape (mwNifFile.js) - is sampled by one rule, whoever
// holds it: a bone's translation and scale tracks (mwAnim.js) and a particle
// system's colour ramp (mwParticles.js). nif.xml names the interpolation types:
// linear, quadratic (a Hermite segment with a tangent stored on each key),
// TBC (a Hermite segment whose tangents come from tension, continuity and
// bias: nif-key-tangents.ts) and constant. A leaf on purpose: mwAnim sits in
// mwFirstPerson's import cycle, and the particles must not.

import { KEY_TYPE } from './mwNifFile.js';
import { tcbTangents } from './nif-key-tangents.ts';

function hermite(v0, out0, v1, in1, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  const h1 = 2 * t3 - 3 * t2 + 1;
  const h2 = -2 * t3 + 3 * t2;
  const h3 = t3 - 2 * t2 + t;
  const h4 = t3 - t2;
  return h1 * v0 + h2 * v1 + h3 * out0 + h4 * in1;
}

/** Find the key segment bracketing time; returns [i0, i1, u]. */
export function segment(keys, time) {
  if (time <= keys[0].time) return [0, 0, 0];
  const last = keys.length - 1;
  if (time >= keys[last].time) return [last, last, 0];
  // Binary search for the first key at or after `time` (keys are time-sorted):
  // a walk from the first key costs every channel of every bone the whole
  // .kf timeline on every frame.
  let lo = 1;
  let hi = last;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (keys[mid].time < time) lo = mid + 1;
    else hi = mid;
  }
  const i = lo - 1;
  const span = keys[i + 1].time - keys[i].time;
  return [i, i + 1, span > 0 ? (time - keys[i].time) / span : 0];
}

/** One KeyGroup at `time`: a number for `dim` 1, else an array of `dim`
 *  components (3 for a translation, 4 for a colour). Null for no keys. */
export function sampleKeyGroup(group, dim, time) {
  const { keys, type } = group;
  if (!keys.length) return null;
  const [i0, i1, u] = segment(keys, time);
  const k0 = keys[i0];
  const k1 = keys[i1];
  const comp = (axis) => {
    const v0 = dim === 1 ? k0.value : k0.value[axis];
    const v1 = dim === 1 ? k1.value : k1.value[axis];
    if (i0 === i1) return v0;
    // A constant group steps to the next key at the middle of the segment:
    // the left key's value in the first half, the right key's in the second.
    if (type === KEY_TYPE.constant) return u > 0.5 ? v1 : v0;
    if (type === KEY_TYPE.quadratic) {
      // The segment leaves the left key along its out tangent and arrives at
      // the right key along its in tangent.
      const out0 = dim === 1 ? k0.outTan : k0.outTan[axis];
      const in1 = dim === 1 ? k1.inTan : k1.inTan[axis];
      return hermite(v0, out0, v1, in1, u);
    }
    if (type === KEY_TYPE.tbc) {
      const [, out0] = tcbTangents(keys, i0, axis);
      const [in1] = tcbTangents(keys, i1, axis);
      return hermite(v0, out0, v1, in1, u);
    }
    return v0 + (v1 - v0) * u;
  };
  if (dim === 1) return comp(0);
  const out = new Array(dim);
  for (let axis = 0; axis < dim; axis++) out[axis] = comp(axis);
  return out;
}
