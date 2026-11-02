// @ts-check
// The animation sources of a Morrowind character: which .kf files a first-person or third-person actor or a creature
// plays from, and the searches over them. Moved out of mwFirstPerson.js unchanged; that module re-exports it.
import { ACCUM_ROOT_NAMES } from './mwSkin.js';
import { getTextKeyTime, animVelocity } from './mwAnim.js';

/**
 * MW-D14 / RULE 6 + 18 + the SOURCE LIST, which is not one file.
 *
 * NpcAnimation::updateNpcBase (npcanimation.cpp:499-537) adds TWO
 * animation sources for a first-person actor, in this order:
 *
 *   base            = Settings::models().mXbaseanim1st  ("meshes/xbase_anim.1st.nif")
 *   defaultSkeleton = correctActorModelPath(getActorSkeleton(...))
 *
 *   addAnimSource(base, smodel);
 *   if (defaultSkeleton != base) addAnimSource(defaultSkeleton, smodel);
 *
 * and addAnimSource swaps a .nif extension for .kf and DROPS the source
 * silently when that file is not in the archive
 * (animation.cpp:646-671). For a MALE the two are the same string, so
 * there is one source and the port's single .kf was right; for a FEMALE
 * or a BEAST they differ, and the second one - when the archive carries
 * it - is the LAST inserted and therefore the one that wins
 * (`Look in reverse; last-inserted source has priority`,
 * animation.cpp:918-923).
 *
 * `use additional anim sources` is deliberately absent: it is an OpenMW
 * setting, default false, that scans an `animations/` folder Morrowind
 * does not ship.
 */
export const FP_BASE_MODEL = 'meshes/xbase_anim.1st.nif';

/** The .kf a model name names (animation.cpp:648-654): swap ONLY when
 *  the extension is exactly "nif". */
export function animSourceName(model) {
  const p = String(model || '').toLowerCase();
  return p.endsWith('.nif') ? `${p.slice(0, -4)}.kf` : p;
}

/**
 * The ordered source list, in PUSH order - the caller searches it in
 * REVERSE. `exists` is the archive probe; a source the archive lacks is
 * dropped here rather than refused, exactly as addSingleAnimSource does.
 */
export function fpAnimSources(skeletonPath, exists, { werewolf = false } = {}) {
  return animSourcesFor(werewolf ? null : FP_BASE_MODEL, skeletonPath, exists);
}

/** MW-D24: the reference's own unit bridge - constants.hpp:10,
 *  UnitsPerMeter. The camera's distances and the body's world scale
 *  both cross it, so it lives here in the format layer, once. */
export const MW_UNITS_PER_METER = 69.99125109;

/** MW-D24: the THIRD-PERSON base animation model (settings-default.cfg
 *  [Models] xbaseanim, updateNpcBase's `base` for every non-werewolf -
 *  npcanimation.cpp:506-508). Its .kf sibling is the file that carries
 *  idle/walk/attack for the whole visible body. */
export const TP_BASE_MODEL = 'meshes/xbase_anim.nif';

/** The third-person source list, same push order and existence filter as
 *  the first-person one: base first (npcanimation.cpp:529-530), then the
 *  actor's own skeleton when it differs (npcanimation.cpp:532-533). The
 *  kf name is the model with its extension swapped and NOTHING else -
 *  no "x" is inserted (animation.cpp:651-654). */
export function tpAnimSources(skeletonPath, exists, { werewolf = false } = {}) {
  return animSourcesFor(werewolf ? null : TP_BASE_MODEL, skeletonPath, exists);
}

/** MWNPC9: A CREATURE'S SOURCES (creatureanimation.cpp, CreatureAnimation's constructor): xbase_anim first for a
 *  BIPEDAL one (`mFlags & Bipedal`), then the model's own .kf - the model being the actor path rule 18 corrected,
 *  the "x" variant, so `xrat.nif` sources `xrat.kf`. Same push order and existence filter as the NPC's. */
export function creatureAnimSources(modelPath, exists, { bipedal = false } = {}) {
  return animSourcesFor(bipedal ? TP_BASE_MODEL : null, modelPath, exists);
}

/** WEREWOLF1: A WEREWOLF HAS ONE SOURCE, ITS OWN. updateNpcBase leaves the
 *  base empty for a werewolf (`if (!isWerewolf)`, npcanimation.cpp:503-510),
 *  so neither xbase_anim.kf nor xbase_anim.1st.kf is added - only the wolf
 *  skeleton's own .kf (:529-533), in both views. `baseModel` null is that. */
function animSourcesFor(baseModel, skeletonPath, exists) {
  const out = [];
  const base = baseModel ? animSourceName(baseModel) : null;
  if (base && exists(base)) out.push(base);
  const own = animSourceName(skeletonPath);
  if (own !== base && exists(own)) out.push(own);
  return out;
}

/**
 * play()'s source search (animation.cpp:918-935): walk mAnimSources in
 * REVERSE and take the FIRST source whose text keys give this group a
 * valid range. Not "the first source that mentions the group" - the
 * whole of reset() has to succeed, so a source carrying a start key and
 * no stop key is passed over rather than refused.
 *
 * @param sources ordered as pushed; index 0 is the base
 * @returns {{index:number, source:object, state:object}|null}
 */
/**
 * MW-D29: ANIMATION::GETTEXTKEYTIME across EVERY source
 * (animation.cpp:840-854): the sources are walked in REVERSE - the
 * last-pushed wins - and the first key that starts with the asked text
 * answers. The port had asked ONE source (the idle pick's), so an
 * equip-attach key living only in the base .kf while a female skeleton's
 * own .kf won the idle went unseen.
 */
export function sourcesKeyTime(sources, textKey) {
  for (let i = (sources ? sources.length : 0) - 1; i >= 0; i--) {
    const t = getTextKeyTime(sources[i].keys, textKey);
    if (t >= 0) return t;
  }
  return -1;
}

/**
 * MW-D29: ANIMATION::GETVELOCITY's two searches (animation.cpp:1267-1338):
 * first the sources in REVERSE for one that carries the group's start
 * key; that source's accum-root velocity answers - and "if there's no
 * velocity" (the > 1 test, :1301/:1307) the walk CONTINUES through the
 * remaining earlier sources until one yields more. The port had stopped
 * at the single source the clip was picked from.
 */
/** PX29: ONE source's own velocity for a group - the number that
 *  matches the clip actually playing, which is what the movement rate
 *  divides by after Mac's revert. sourcesVelocity (below) is the
 *  reference's multi-source walk and stays for any consumer that
 *  wants it; nothing in the movement lane does. */
export function sourceVelocityOf(source, group) {
  if (!source) return 0;
  const acc = ACCUM_ROOT_NAMES.find((n) => source.trackMap && source.trackMap.has && source.trackMap.has(n));
  return acc ? animVelocity(source.keys, source.trackMap.get(acc), group) : 0;
}

export function sourcesVelocity(sources, group) {
  const list = sources || [];
  const velOf = (so) => sourceVelocityOf(so, group); // AUDIT 68 S11-velof-dup: one source's velocity, one home
  let i = list.length - 1;
  for (; i >= 0; i--) {
    if (
      getTextKeyTime(list[i].keys, `${group}: start`) >= 0 ||
      getTextKeyTime(list[i].keys, `${group}: loop start`) >= 0
    )
      break;
  }
  if (i < 0) return 0;
  let velocity = velOf(list[i]);
  for (let j = i - 1; !(velocity > 1) && j >= 0; j--) velocity = velOf(list[j]);
  return velocity;
}

export function pickAnimSource(sources, group, resetClip, opts = {}) {
  for (let i = (sources?.length ?? 0) - 1; i >= 0; i--) {
    const state = resetClip(sources[i].keys, group, opts);
    if (state.ok) return { index: i, source: sources[i], state };
  }
  return null;
}

/** hasAnimation (animation.cpp): ANY source that names the group. */
export function anySourceHasGroup(sources, group) {
  return (sources ?? []).some((s) => s.groupSet.has(group));
}
