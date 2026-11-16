// The tangents of a TCB key group (nif.xml, KeyGroup with the "TBC" interpolation): the slopes at which a Hermite
// segment leaves one key and arrives at the next. Nothing here touches GL or reads a file.
//
// Each key of a TCB group carries a tension, a continuity and a bias. The tangents follow Kochanek and Bartels,
// "Interpolating Splines with Local Tension, Continuity, and Bias Control" (1984): the slope into a key and the slope
// out of it are each a weighted sum of the step from the key before and the step to the key after, and the weights
// come from the three numbers. Keys that are not evenly spaced in time get the usual correction, so that a short
// segment next to a long one does not overshoot. The recorded answers of the earlier code
// (test/formats/morrowind/nif-key-tangents.test.ts) pin the choices the paper leaves open: what a first or last key
// does, and what a segment of length zero does.
//
// mwKeys.js picks the segment, finds these tangents and draws the Hermite curve.

/** One key of a key group: its time, its value (one number, or one per component) and, in a TCB group, its three numbers. */
export interface TcbKey {
  time: number;
  value: number | ArrayLike<number>;
  /** Tension, continuity and bias; a key without them takes zero for each. */
  tbc?: readonly [number, number, number];
}

const NO_TCB = [0, 0, 0] as const;

/**
 * The tangent into key `index` and the tangent out of it, for one component of the value (`component` is 0 for a
 * group of single numbers).
 *
 * With `stepBefore` the change from the key before, `stepAfter` the change to the key after, and tension t,
 * continuity c and bias b:
 *
 *   into = (1-t)/2 * ((1-c)(1+b) * stepBefore + (1+c)(1-b) * stepAfter)
 *   out  = (1-t)/2 * ((1+c)(1+b) * stepBefore + (1-c)(1-b) * stepAfter)
 *
 * and, between two neighbours, `into` is scaled by 2 * timeBefore / (timeBefore + timeAfter) and `out` by
 * 2 * timeAfter / (timeBefore + timeAfter), where `timeBefore` and `timeAfter` are the gaps to the key before and the
 * key after. The first key and the last key have one neighbour only: that one step takes both places, and no time
 * scale applies. A key whose two neighbours share one time has no time to scale by and leaves both tangents zero, as
 * does a group of one key.
 */
export function tcbTangents(keys: readonly TcbKey[], index: number, component: number): [number, number] {
  if (keys.length <= 1) return [0, 0];
  const [tension, continuity, bias] = keys[index].tbc ?? NO_TCB;
  // The paper's factor of one half and the time scale's factor of two cancel between two neighbours, so the weights
  // below carry (1 - tension) alone and the time scale is timeBefore / timeTotal. At an end the half stays.
  const slack = 1 - tension;
  const intoBefore = slack * (1 - continuity) * (1 + bias);
  const intoAfter = slack * (1 + continuity) * (1 - bias);
  const outBefore = slack * (1 + continuity) * (1 + bias);
  const outAfter = slack * (1 - continuity) * (1 - bias);
  const at = (position: number): number => componentOf(keys[position], component);

  if (index === 0 || index === keys.length - 1) {
    const step = index === 0 ? at(1) - at(0) : at(index) - at(index - 1);
    return [step * ((intoBefore + intoAfter) * 0.5), step * ((outBefore + outAfter) * 0.5)];
  }

  const timeBefore = keys[index].time - keys[index - 1].time;
  const timeTotal = keys[index + 1].time - keys[index - 1].time;
  if (timeTotal === 0) return [0, 0];
  const timeAfter = keys[index + 1].time - keys[index].time;
  const stepBefore = at(index) - at(index - 1);
  const stepAfter = at(index + 1) - at(index);
  return [
    (stepBefore * intoBefore + stepAfter * intoAfter) * (timeBefore / timeTotal),
    (stepBefore * outBefore + stepAfter * outAfter) * (timeAfter / timeTotal),
  ];
}

/** One component of a key's value. */
function componentOf(key: TcbKey, component: number): number {
  return typeof key.value === 'number' ? key.value : key.value[component];
}
