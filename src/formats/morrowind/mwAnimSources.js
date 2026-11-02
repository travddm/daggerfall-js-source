// @ts-check
// Which animation files (.kf) a Morrowind actor plays from, and the searches over them.
//
// Evidence (the retail archives, Morrowind.bsa, Tribunal.bsa and Bloodmoon.bsa): every skeleton or creature model
// `name.nif` has its clips in `name.kf` beside it. The skeletons that actors share carry the clips for everyone:
// `xbase_anim.kf` (all humanoids, third person), `xbase_anim.1st.kf` (the first-person arms), and
// `xbase_anim_female.kf` and `xbase_animkna.kf` with their `.1st` forms, which hold the groups in which the female
// and the beast bodies differ. A creature has one `.kf` of its own, and a bipedal creature also uses the shared
// humanoid file. The `x` forms are the files the archives ship; mwTexture.js `correctActorModelPath` chooses them
// before a path reaches this module.
//
// A list of sources is ordered from the most general (the shared file) to the most specific (the actor's own file).
// A search takes the most specific source that can answer, so the actor's own file overrides the shared one for the
// groups that it defines and every other group falls through to the shared file.
import { ACCUM_ROOT_NAMES } from './mwSkin.js';
import { getTextKeyTime, animVelocity } from './mwAnim.js';

/** The shared first-person humanoid animation model. Its `.kf` is in all the retail archives. */
export const FP_BASE_MODEL = 'meshes/xbase_anim.1st.nif';

/** The shared third-person humanoid animation model. */
export const TP_BASE_MODEL = 'meshes/xbase_anim.nif';

// Units per metre: how many Morrowind units make one metre. It converts camera distances and body scale.
//
// Derivation: a character of height 1.0 is about 6 feet tall (UESP, Morrowind Mod Maker's Manual). Measured on
// Morrowind.bsa, the `base_anim.nif` skeleton stands on z = 0 and puts the head bone at z = 119.2, and the imperial
// male head mesh reaches 7.7 units above that bone, so the figure is about 127 units tall (error about one unit).
// A standard figure is taken as 128 units, which agrees with the 21.3 units to the foot that UESP gives:
// 128 units / (6 ft x 0.3048 m/ft) = 69.99125109 units per metre.
const STANDARD_HEIGHT_UNITS = 128;
const STANDARD_HEIGHT_METERS = 6 * 0.3048;
export const MW_UNITS_PER_METER = STANDARD_HEIGHT_UNITS / STANDARD_HEIGHT_METERS;

/** The `.kf` file that holds the clips of a model: the `.nif` extension becomes `.kf`. Any other name is kept. */
export function animSourceName(model) {
  const name = String(model || '').toLowerCase();
  return name.endsWith('.nif') ? `${name.slice(0, -4)}.kf` : name;
}

/**
 * The sources of an actor, general first. A source that the archive does not carry (`exists` answers false) is left
 * out. The actor's own file is left out when it is the shared file.
 * @param {string | null} sharedModel the shared animation model, or null when the actor has none (a werewolf)
 * @param {string} ownModel the actor's skeleton or creature model
 * @param {(path: string) => boolean} exists
 * @returns {string[]}
 */
function sourcesOf(sharedModel, ownModel, exists) {
  const shared = sharedModel ? animSourceName(sharedModel) : null;
  const own = animSourceName(ownModel);
  const wanted = shared === own ? [shared] : [shared, own];
  return wanted.filter((path) => path !== null && exists(path));
}

/** First-person sources. A werewolf (`werewolf: true`) uses only its own file. */
export function fpAnimSources(skeletonPath, exists, { werewolf = false } = {}) {
  return sourcesOf(werewolf ? null : FP_BASE_MODEL, skeletonPath, exists);
}

/** Third-person sources, built as the first-person ones are. */
export function tpAnimSources(skeletonPath, exists, { werewolf = false } = {}) {
  return sourcesOf(werewolf ? null : TP_BASE_MODEL, skeletonPath, exists);
}

/** A creature's sources: its model's own file, behind the shared humanoid file when the creature is bipedal. */
export function creatureAnimSources(modelPath, exists, { bipedal = false } = {}) {
  return sourcesOf(bipedal ? TP_BASE_MODEL : null, modelPath, exists);
}

/**
 * The first source, from the most specific, whose clip can be set up for the group. `resetClip` (mwAnim.js) says
 * whether it can: a source that has only part of a group's keys (a start key with no stop key) is skipped.
 * @returns {{index:number, source:object, state:object}|null}
 */
export function pickAnimSource(sources, group, resetClip, opts = {}) {
  for (let index = (sources?.length ?? 0) - 1; index >= 0; index--) {
    const state = resetClip(sources[index].keys, group, opts);
    if (state.ok) return { index, source: sources[index], state };
  }
  return null;
}

/** The time of the first text key that begins with `textKey`, from the most specific source; -1 when none does. */
export function sourcesKeyTime(sources, textKey) {
  for (let index = (sources?.length ?? 0) - 1; index >= 0; index--) {
    const time = getTextKeyTime(sources[index].keys, textKey);
    if (time >= 0) return time;
  }
  return -1;
}

/** Horizontal distance per second that one source's root bone travels over a group; 0 when it has no such root. */
export function sourceVelocityOf(source, group) {
  if (!source) return 0;
  const rootName = ACCUM_ROOT_NAMES.find((name) => source.trackMap?.has?.(name));
  return rootName ? animVelocity(source.keys, source.trackMap.get(rootName), group) : 0;
}

/**
 * The speed of a group over a whole list. The most specific source that has the group's start key answers. When its
 * root does not travel (1 unit per second or less), the next more general source is asked, and so on. The retail
 * female and beast files name the death groups but hold them in place, and the shared file holds the travel.
 */
export function sourcesVelocity(sources, group) {
  const list = sources ?? [];
  const startsGroup = (source) =>
    getTextKeyTime(source.keys, `${group}: start`) >= 0 || getTextKeyTime(source.keys, `${group}: loop start`) >= 0;
  let index = list.length - 1;
  while (index >= 0 && !startsGroup(list[index])) index--;
  if (index < 0) return 0;
  let speed = sourceVelocityOf(list[index], group);
  for (index--; index >= 0 && !(speed > 1); index--) speed = sourceVelocityOf(list[index], group);
  return speed;
}

/** True when any source names the group. */
export function anySourceHasGroup(sources, group) {
  return (sources ?? []).some((source) => source.groupSet.has(group));
}
