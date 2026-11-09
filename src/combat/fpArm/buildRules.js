// @ts-check
// Two rules the arm's builds share: how big a race's body is drawn, and which node carries the motion of every
// animation source on one rig.

/**
 * @typedef {{ weight: number, height: number }} RaceScale
 * @typedef {{ radt?: boolean, weight?: number[], height?: number[] }} RaceRecord
 */

/** The scale of a race whose record gives none, and of every body before its race is known. */
const UNSCALED = Object.freeze({ weight: 1, height: 1 });

/**
 * The race's body scale for one sex. A RACE record's RADT subrecord holds a height and a weight factor for each sex
 * (male first, then female). The body is drawn `weight` times as wide and deep and `height` times as tall.
 *
 * `records` lists the race's record in each master, in load order, with null where a master has none. A later
 * master's record replaces an earlier one, as every other record does here. A record without RADT data leaves the
 * scale where it was, and with no such record at all the body is unscaled.
 * @param {(RaceRecord | null | undefined)[]} records
 * @param {boolean} female
 * @returns {RaceScale}
 */
export function raceScaleOf(records, female) {
  const sex = female ? 1 : 0;
  const last = records.filter((rec) => rec && rec.radt).at(-1);
  if (!last) return { ...UNSCALED };
  return { weight: last.weight[sex], height: last.height[sex] };
}

/**
 * The one accumulation root of a rig. In a clip file the root node of the actor's motion ("Bip01" or "Root Bone") holds
 * the travel through the world; the game moves the actor by that travel and holds the node in place. All the clip files
 * on one rig must agree on that node, or the body would shift whenever a clip from another file took over (a swing
 * that walks the body off its feet).
 *
 * Each source carries the root it would choose (`wouldAccumRoot`, from accumRootRef; null or absent when it animates
 * none). The first source in the list that has one sets the rig's root, and every source is given it as `accumRoot`.
 * Node 0 is a real node. Answers the root, or null when no source has one.
 * @param {{ wouldAccumRoot?: number | null, accumRoot?: number | null }[]} sources
 * @returns {number | null}
 */
export function stickyAccumRoot(sources) {
  const setter = sources.find((source) => source.wouldAccumRoot !== null && source.wouldAccumRoot !== undefined);
  const root = setter ? setter.wouldAccumRoot : null;
  for (const source of sources) source.accumRoot = root;
  return root;
}
