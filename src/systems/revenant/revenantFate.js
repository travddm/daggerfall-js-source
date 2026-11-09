// @ts-check
// REVENANT-FATE.
//
// BEATEN, A REVENANT YIELDS. The blow that would kill one of the player's revenants instead leaves it at the edge of
// death, on its knees - its fight done, untouchable, its plea said in its own voice (REVENANT-VOICE) - and its fate
// is the player's:
//  - THE CHOICE is the loot menu's (ui/enhanced/enhancedInventory.js, the loot window's FATE side; the classic skin a keyed
//    box): activate the kneeling foe as a body is searched, and the window shows its name, its plea, and two rows -
//    KILL, with the very weapon it will drop (pre-rolled at the yield: revenantTrophy.js), and SPARE, with where it
//    will stand (at the player's side, or away when the companion slots are full).
//  - KILL: an EXECUTION plays where it knelt - its last words, the blow, a burst of blood and a flash, and the body
//    burning away from the feet up in embers (systems/dissolve.js) - and where it stood lies a pile: everything it
//    carried and its TROPHY. Its record closes for good (executed).
//  - SPARE: it rises, steps into a portal, and is SWORN (systems/revenant/revenantCompanions.js) - a companion from then on,
//    or, as the row says, leaves for good.
//  - HESITATE (REVENANT_YIELD_MS kneeling, or walk REVENANT_YIELD_REACH away) and it SLIPS AWAY - an escape, its rank
//    up, its words about your hesitation.
// Online the choice is its owner's (a revenant is its character's memory): a peer sees it kneel, and burn.
//
// PURE but for the clock and the records it is handed - the pools (scenes/exteriorFoes.js, scenes/dungeonContext.js)
// call in, and draw what it answers.
import { revenantById, revenantOn, revenantYielded, revenantExecuted, revenantSpared, revenantCompanionUpdate, revenantMomentEvent, revenantPortrait, revenantRankNumeral } from './revenant.js';
import { revenantTrophy, trophyKindWords } from './revenantTrophy.js';
import { PERSONALITIES } from './revenantPersonality.js';
import { revenantSpareJoins } from './revenantsOn.js';
import { t } from '../textManager.js';
import { retinueHasRoom, swornPlace, REVENANT_RETINUE_MAX, setRetinuePlayer, holdSworn } from './revenantCompanions.js';
import { companionsWithYou, COMPANION_SLOTS } from '../companionSlots.js';
import { enemyDisplayName } from '../../characters/enemy/enemyBasics.js';
import { DISSOLVE_EMBER, DISSOLVE_ARCANE } from '../dissolve.js';
import { clearPlayerHarm } from '../harmMark.js';   // AUDIT: a beaten one's harm is no one's death
import { noteAct } from '../questlines/qlActs.js';   // QL11: the features' acts, heard by the running quests

/** How long a beaten revenant kneels before it slips away (ms). */
export const REVENANT_YIELD_MS = 90000;
/** ...or how far the player may walk from it (metres, on the ground's plane). */
export const REVENANT_YIELD_REACH = 60;
/** The execution's beats (ms from the choice): the blow lands at once, the body bursts, and it has burnt away. */
export const EXECUTION_MS = Object.freeze({ burst: 480, end: 1500 });
/** The sworn one's step into its portal where it knelt (ms): it gathers light, then is gone. */
export const SPARING_MS = 900;

/** May this foe record yield rather than die? One of the player's own revenants (never a puppet, a companion, one
 *  already judged), the arc on. */
export function revenantMayYield(f) {
  const id = f?.entity?.revenant?.id;
  if (!id || f.puppet || f.companion != null || f.yielded || f.executing || f.sparing || !revenantOn()) return false;
  const r = revenantById(id);
  return !!r && !r.defeated && !r.sworn;
}

/** IT YIELDS: held at 1, its fight and its run over, its trophy rolled; answers the event its plea is said by. */
export function beginYield(player, f, { now = Date.now(), rolls = Math.random } = {}) {
  f.yielded = { at: now };
  f.fleeing = false;
  f._fleeRolled = true;
  if (f.entity) f.entity.health = 1;
  if (f.ai) { f.ai.target = null; f.ai.fleeLeft = 0; }
  clearPlayerHarm(f.entity);   // its poison still ticking in the player names no one when it kills now
  setRetinuePlayer(player);
  const r = revenantYielded(player, f.entity);
  if (!r) return null;
  noteAct('revenant-knelt');   // QL11: a revenant made to kneel - one of mine, beaten (revenantMayYield: never a puppet, never twice)
  f.trophy = revenantTrophy(r, { entity: f.entity, level: player?.level ?? 1, rolls });
  const ev = revenantMomentEvent('yield', r, player?.name, { body: 'Beaten, it awaits your judgment. Go to it to kill it or spare it.', archive: f.archive, rolls });
  f.yieldEvent = ev;
  return ev;
}
/** A kneeling one this frame (`dtMs` the frame's - the world's own time: a window that pauses the game stops its wait):
 *  'slip' when it has waited too long or the player walked off, else null. */
export function yieldStep(f, feet, dtMs = 0) {
  if (!f?.yielded) return null;
  // AUDIT: its choice open on the screen (the host's word: the window not yet done) - the foes' clock runs
  // under a window (WINFOE1), its wait does not; nor does the walk-away, the player stands at the window
  const j = f.yielded.judging;
  if (typeof j === 'function' ? j() : j) return null;
  f.yielded.held = (f.yielded.held ?? 0) + Math.max(0, Number(dtMs) || 0);
  if (f.yielded.held > REVENANT_YIELD_MS) return 'slip';
  if (feet && f.ai?.feet && Math.hypot(feet[0] - f.ai.feet[0], feet[2] - f.ai.feet[2]) > REVENANT_YIELD_REACH) return 'slip';
  return null;
}
/** Its words as it slips away (the escape the pool makes of it). */
export function slipEvent(player, r, { archive = null, rolls = Math.random } = {}) {
  return revenantMomentEvent('slip', r, player?.name, { body: `You hesitated. ${r.given} got away, and it will remember.`, archive, rolls });
}
/** THE KNEEL: its hurt's last frame held (a breath every so often - the frame before it), facing the eye as ever. */
export function kneelPose(f, eye, now = Date.now()) {
  if (!f?.mobile?.heldPose || !f.ai) return f?._mout ?? null;
  const breath = ((now - (f.yielded?.at ?? f.executing?.at ?? 0)) % 1700) < 320;
  return f.mobile.heldPose('hurt', breath ? -2 : -1, f.ai.yaw, f.ai.feet, eye ?? f.ai.feet);
}

/** KILL chosen: the execution begins - answers its last words' event. */
export function beginExecution(player, f, { now = Date.now(), rolls = Math.random } = {}) {
  const r = revenantById(f?.entity?.revenant?.id);
  f.yielded = null;
  f.executing = { at: now, burst: false, done: false };
  if (!r) return null;
  const drops = f.trophy ? `It drops ${f.trophy.name}.` : null;
  return revenantMomentEvent('executed', r, player?.name, { body: ['Executed.', drops].filter(Boolean).join(' '), archive: f.archive, rolls });
}
/** One frame of an execution: 'burst' once (the blood and the flash), 'done' once (burnt away - take it out, drop its
 *  pile), else null. */
export function executionStep(f, now = Date.now()) {
  const x = f?.executing;
  if (!x) return null;
  const t = now - x.at;
  if (!x.burst && t >= EXECUTION_MS.burst) { x.burst = true; return 'burst'; }
  if (!x.done && t >= EXECUTION_MS.end) { x.done = true; return 'done'; }
  return null;
}
/** The execution ended: its record closed (executed); answers what falls where it stood - all it carried, and its
 *  trophy. */
export function finishExecution(player, f) {
  revenantExecuted(player, f.entity);
  const items = [...(Array.isArray(f.entity?.items) ? f.entity.items : []), ...(f.trophy ? [f.trophy] : [])];
  f.trophy = null;
  if (f.entity) f.entity.items = [];   // AUDIT (2026-10-02): handed to the pile - never a save's dead record's to carry twice
  return items;
}
/** AUDIT: HELD BY ITS FATE - kneeling, burning, gathering into its portal, or a companion stepping out
 *  through one: no swing's, no spell's, nobody's target (characters/enemy/enemyTargets.js reads the same four). */
export const fateHeld = (f) => !!(f && (f.yielded || f.executing || f.sparing || f.leaving));
/** The held taken out of a list in place (a swing's candidates) - answers the list. */
export function dropFateHeld(list) {
  for (let i = list.length - 1; i >= 0; i--) if (fateHeld(list[i])) list.splice(i, 1);
  return list;
}

/** The Spare row's detail and confirm: where a sworn one would stand, or that it leaves for good (the row's choice). */
function spareWords(r, { joins, room, free, used }) {
  if (!joins) return { detail: t('rvn.spare.leaveDetail', '{given} swears off the feud and leaves for good', { given: r.given }), confirm: t('rvn.spare.leaveConfirm', 'Spare {name}? It will leave for good.', { name: r.name }) };
  const detail = !room ? `You keep ${REVENANT_RETINUE_MAX} sworn already - release one first`
    : free ? `It joins you as a companion (${used + 1} of ${COMPANION_SLOTS})`
      : `It is sworn to you, and waits until you call it (your ${COMPANION_SLOTS} companion slots are full)`;
  return { detail, confirm: free ? `Spare ${r.name}? It will walk at your side.` : `Spare ${r.name}? It will wait, sent away, until you call it.` };
}
/** The line a spared one is sworn, or leaves, by. */
function spareBody(r, joins, state) {
  if (!joins) return t('rvn.spare.leaveBody', '{given} swears off the feud and leaves you in peace.', { given: r.given });
  return state === 'with' ? `Sworn to you. ${r.given} walks at your side now.` : `Sworn to you. Your companions are full, so ${r.given} waits until you call it.`;
}
/** SPARE chosen: sworn - at the player's side while a slot is free, else away - or, as the row says, gone for good. Answers
 *  { r, state, event }, or null when the retinue has no room (the window never offers it then). */
export function beginSpare(player, f, { now = Date.now(), rolls = Math.random } = {}) {
  const joins = revenantSpareJoins();
  if (joins && !retinueHasRoom()) return null;
  setRetinuePlayer(player);
  const state = joins ? swornPlace() : 'away';
  const r = revenantSpared(player, f.entity, { state });
  if (!r) return null;
  if (!joins) revenantCompanionUpdate(player, r.id, () => 'release');   // the row's "Leaves for good": it swears off the feud and goes
  f.yielded = null;
  f.sparing = { at: now };
  if (joins && state === 'with') holdSworn(r.id, SPARING_MS);   // AUDIT (2026-10-02): its companion steps out once the kneeling one is through
  const body = spareBody(r, joins, state);
  return { r, state, event: revenantMomentEvent('spared', r, player?.name, { body, archive: f.archive, rolls }) };
}
/** The sworn one has stepped through its portal - take its kneeling body out. */
export const spareDone = (f, now = Date.now()) => !!f?.sparing && now - f.sparing.at >= SPARING_MS;

/** WHAT ITS SPRITE SHOWS NOW: [share gone, r, g, b] for systems/dissolve.js, or null whole - an execution burning it
 *  away after the burst in ember; a sworn one gathering into its portal in arcane light; a companion's arrival
 *  (`portalIn`) or leaving (`portalOut`). */
export function fateDissolve(f, now = Date.now()) {
  if (f?.executing) {
    const t = now - f.executing.at - EXECUTION_MS.burst;
    return t > 0 ? [Math.min(1, t / (EXECUTION_MS.end - EXECUTION_MS.burst)), ...DISSOLVE_EMBER] : null;
  }
  if (f?.sparing) {
    const t = (now - f.sparing.at - 200) / (SPARING_MS - 200);
    return t > 0 ? [Math.min(1, t), ...DISSOLVE_ARCANE] : null;
  }
  const p = f?.portalFx;
  if (p) {
    const t = (now - p.at - p.delay) / p.ms;
    if (p.dir === 'in') return t >= 1 ? null : [Math.max(0.001, 1 - Math.max(0, t)), ...DISSOLVE_ARCANE];
    return t > 0 ? [Math.min(1, t), ...DISSOLVE_ARCANE] : null;
  }
  return null;
}

/**
 * THE CHOICE, as the loot menu shows it: who it is, its plea, its trophy, where a sworn one would stand, and the two
 * rows. `choose(id)` the pool's ('kill' | 'spare').
 */
export function fateModel(player, f, { choose } = /** @type {any} */ ({})) {
  const r = revenantById(f?.entity?.revenant?.id);
  if (!r) return null;
  const kind = enemyDisplayName(r.mobileType) ?? '';
  const trait = typeof r.trait === 'string' && r.trait ? r.trait.charAt(0).toUpperCase() + r.trait.slice(1) : null;
  const P = PERSONALITIES[r.personality] ?? null;
  const used = companionsWithYou();
  const joins = revenantSpareJoins();
  const room = retinueHasRoom();
  const free = used < COMPANION_SLOTS;
  const trophy = f.trophy ?? null;
  const ev = f.yieldEvent ?? null;
  return {
    kind: 'fate',
    id: r.id,
    name: r.name,
    given: r.given,
    rank: r.rank,
    sub: [`Rank ${revenantRankNumeral(r.rank)}`, kind, trait, r.elite ? 'Elite' : null].filter(Boolean).join(' · '),
    mood: P?.label ?? null,
    blurb: P?.blurb ?? null,
    plea: { speech: ev?.speech ?? null, body: ev?.speech ? null : ev?.body ?? null },
    portrait: revenantPortrait(r),
    trophy,
    slots: { used, max: COMPANION_SLOTS, free, room, retinueMax: REVENANT_RETINUE_MAX },
    options: [
      {
        id: 'kill', key: 'K', label: 'Kill', verb: 'Execute', tone: 'warn',
        title: `Kill ${r.given}`,
        detail: trophy ? `It drops ${trophy.name} - ${trophyKindWords(trophy)}` : 'It drops what it carried',
        confirm: `Destroy ${r.name}? It is gone for good${trophy ? `, and ${trophy.name} is yours` : ''}.`,
        disabled: false,
      },
      {
        id: 'spare', key: 'S', label: 'Spare', verb: 'Spare', tone: 'primary',
        title: `Spare ${r.given}`,
        ...spareWords(r, { joins, room, free, used }),
        disabled: joins && !room,
      },
    ],
    choose: (id) => choose?.(id),
    live: () => !!f.yielded && !f.dead,
  };
}
