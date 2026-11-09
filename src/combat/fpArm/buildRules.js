// @ts-check
// Two rules the arm's builds share: the race's body scale and the one accumulation root every animation source of a
// rig uses. Moved out of fpArm.js unchanged.

/** The race scale from the race's records in load order (null where a master has none). */
export function raceScaleOf(raceRecordsInOrder, female) {
  let raceScale = { weight: 1, height: 1 };
  for (const rrec of raceRecordsInOrder) {
    if (rrec && rrec.radt) {
      raceScale = { weight: rrec.weight[female ? 1 : 0], height: rrec.height[female ? 1 : 0] };
    }
  }
  return raceScale;
}

/** The rig's accum root from its sources, written onto each source. */
export function stickyAccumRoot(sources) {
  const accumRoot = sources.reduce((acc, so) => acc ?? so.wouldAccumRoot, null) ?? null;
  for (const so of sources) so.accumRoot = accumRoot;
  return accumRoot;
}
