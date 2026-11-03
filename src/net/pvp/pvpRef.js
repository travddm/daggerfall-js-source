// @ts-check
// PVP-REF CORE - the referee both the siege and the duel judge by (split out of net/siege/siegeRef.js, which re-exports
// every name below). A fighter's vitality, a blow's bucket, a cast, a harm and a step, and the ring's numbers.
//
// A LEAF: the relay bundles every byte it imports (test/net/relayversion.test.js), so DFU's damage tables are copied here
// and pinned EQUAL to characters/weapons.js and combat/formulas.js by test, not imported. Pure: no clock (every `now` an
// argument), no DOM, no network.
import { magickaRoom, spendMagicka } from './pvpCaps.js';

/** VITALITY (6.1): 300 + 2 x the Renown level, the level held to the token's own bound (1-50). */
export const SIEGE_VITALITY = Object.freeze({ base: 300, perLevel: 2, levelMax: 50 });
export const siegeVitality = (lv) =>
  SIEGE_VITALITY.base +
  SIEGE_VITALITY.perLevel * Math.max(1, Math.min(SIEGE_VITALITY.levelMax, Math.trunc(Number(lv) || 1)));

/** World units a metre in a siege's room - a town's cell (world natives, net/duel/duelSession.js NATIVES_PER_M). */
export const SIEGE_UNITS_PER_M = 40;
/** REACH (6.1): DFU's effective melee reach (WeaponManager.cs:35's 2.25 m and the sphere cast's 0.25), a shaft's 60 m,
 *  and the slack a pose's own lag earns (the gate's POSE_SLACK), in metres. */
export const SIEGE_REACH = Object.freeze({ melee: 2.5, shaft: 60, spell: 60, slack: 3 });
/** The kinds of blow on the wire: the gate's HIT_KINDS order. */
export const SIEGE_HIT = Object.freeze({ Melee: 0, Shaft: 1, Spell: 2 });
/** Blows a second a striker, one second deep (the gate's GATE_HIT_HZ_MAX). */
export const SIEGE_BLOWS_HZ = 4;
/** CASTS (6.1): damaging casts in a window, each one's damage, a heal's. A heal is bounded on a window of the same shape,
 *  its own (DECIDED here: 6.1 clamped a heal's size and named no rate, and at the frame gate's 8 a second an unbounded heal
 *  is 320 a second - a fighter nobody can fell; the referee has no unbounded verb). */
export const SIEGE_CASTS = Object.freeze({ max: 3, windowMs: 5000, damageMax: 60, healMax: 40 });
/** BAL8: ONE CEILING FOR EVERY STRIKER. INT10 bounded a caster at 3 casts of
 *  60 in 5 s - 180, 36 a second - and a striker with a blade or a bare hand at nothing past 4 blows a second and one blow's
 *  bucket, which no measured blow came near (the highest of 40,000 was 54): a kitted monk's 45.8 a second felled a
 *  fighter in 8.3 s, where the mage's ceiling takes 10.6. Every harm a fighter deals - blows and casts together, so a
 *  blade and a spell are never two ceilings - is held to the casts' own: at most `max` in any `windowMs`. */
export const SIEGE_HARM = Object.freeze({
  max: SIEGE_CASTS.max * SIEGE_CASTS.damageMax,
  windowMs: SIEGE_CASTS.windowMs,
});
/**
 * THE STEP (6.1): the fastest a fighter may move across the ground, and the slack a step earns, in metres. MEASURED (6.1:
 * "the fastest legal run the motor allows with every Speed buff ... the ceiling 25% above it"): player/motor.js runSpeed
 * at live Speed's cap (statMods.js MAX_STAT_VALUE 100 - a Fortify past it reads 100), Running at the softcap's top
 * (skillSoftcap.js EFFECTIVE_SKILL_MAX 140, a mastered 200) with the lycanthrope's +30 and an Enhances Skill item's +15 -
 * (100 + 150) / 39.5 x (1.35 + 185 / 200) = 14.4 m/s; x 1.25 = 18. The design's starting 12.5 would have pulled back
 * every mastered runner (13.0 m/s); 18 still holds a stack of eight Running items, and refuses any teleport or doubled
 * run. A horse is dismounted on entry (SEAT2a's client).
 */
export const SIEGE_SPEED = Object.freeze({ mps: 18, slackM: 0.5 });

// ─── THE BUCKET (6.1: "DFU's own damage range for that weapon at that material, doubled for a critical") ───

/** DFU's weapon templates (characters/weapons.js WEAPONS). */
export const SIEGE_WEAPONS = Object.freeze({
  Dagger: 113,
  Tanto: 114,
  Staff: 115,
  Shortsword: 116,
  Wakazashi: 117,
  Broadsword: 118,
  Saber: 119,
  Longsword: 120,
  Katana: 121,
  Claymore: 122,
  Dai_Katana: 123,
  Mace: 124,
  Flail: 125,
  Warhammer: 126,
  Battle_Axe: 127,
  War_Axe: 128,
  Short_Bow: 129,
  Long_Bow: 130,
});
/** FormulaHelper.CalculateWeaponMaxDamage, by template (characters/weapons.js MAX_DAMAGE, pinned equal) - the bows one
 *  higher, BAL-ARCHERY's. */
export const SIEGE_WEAPON_MAX = Object.freeze({
  113: 6,
  114: 8,
  115: 8,
  116: 8,
  117: 10,
  118: 12,
  119: 12,
  120: 16,
  121: 16,
  122: 18,
  123: 21,
  124: 12,
  125: 14,
  126: 18,
  127: 12,
  128: 16,
  129: 17,
  130: 19, // BAL-ARCHERY: the bows' tops one past FormulaHelper's
});
/** DaggerfallUnityItem.GetWeaponMaterialModifier by material, Iron to Daedric (characters/weapons.js, pinned equal). */
export const SIEGE_MATERIAL_MOD = Object.freeze([-1, 0, 0, 1, 2, 3, 3, 4, 5, 6]);
/** Hand-to-hand's most at the skill's top (combat/formulas.js handToHandMaxDamage(100), pinned equal). */
export const SIEGE_FIST_MAX = 21;
/**
 * THE ATTACKER'S BONUSES AT THE GAME'S CAPS (combat/formulas.js weaponAttackDamage): Strength 100's damage modifier
 * (floor((100 - 50) / 5)), the heaviest swing (playerWeapon.js SWING_MODS' StrikeDown), an expert's proficiency and a
 * racial bonus at level 30 (trunc(30 / 3) + 1, trunc(30 / 3)) - DECIDED here: a siege fighter's character level is not on
 * the wire, so the bucket takes the game's level 30 for the two that grow with it.
 */
export const SIEGE_BONUS = Object.freeze({ strength: 10, swing: 4, proficiency: 11, racial: 10 });
export const SIEGE_BONUS_MAX = SIEGE_BONUS.strength + SIEGE_BONUS.swing + SIEGE_BONUS.proficiency + SIEGE_BONUS.racial;
/** A critical's most (PCAAO's criticalStrikesIncreaseDamage ceiling - classic DFU's critical adds to-hit alone). */
export const SIEGE_CRIT_MAX = 2;

/**
 * THE MOST ONE BLOW MAY DEAL: (the weapon's top + its material + the attacker's bonuses at their caps) x a critical's
 * most. `w` a weapon template (null or -1 hand-to-hand), `m` its material (0 Iron to 9 Daedric). 0 for a template this
 * table does not name. INT7: a weapon's top and material never past the striker's SIGNED arms (`wa`, armsOk - the most
 * any weapon its judged record holds reaches); a fist is every character's, its own most.
 */
export function siegeBlowMax(w, m, wa = null) {
  if (w == null || w === -1) return (SIEGE_FIST_MAX + SIEGE_BONUS_MAX) * SIEGE_CRIT_MAX;
  const reach = armsTop(w, m);
  if (reach == null) return 0;
  return Math.max(0, (armsOk(wa) ? Math.min(reach, wa[0]) : reach) + SIEGE_BONUS_MAX) * SIEGE_CRIT_MAX;
}

// ─── INT7: THE ARMS SIGNED (, lane 2) ───

/** A weapon's REACH: its top (SIEGE_WEAPON_MAX) plus its material's modifier (Iron's -1 to
 *  Daedric's 6) - the one number both referees' caps grow with (arenaLaw.js arenaBlowCap's table is this one, pinned
 *  equal). Null for a template neither names. */
export function armsTop(w, m) {
  const top = SIEGE_WEAPON_MAX[/** @type {any} */ (w)];
  if (!top) return null;
  return top + (Number.isInteger(m) && m >= 0 && m < SIEGE_MATERIAL_MOD.length ? SIEGE_MATERIAL_MOD[m] : 0);
}
/** The most reach a weapon has: a Daedric Dai-Katana's (21 + 6) - net/identityToken.js TOKEN_ARMS_TOP_MAX, pinned equal. */
export const ARMS_TOP_MAX =
  Math.max(...Object.values(SIEGE_WEAPON_MAX)) + SIEGE_MATERIAL_MOD[SIEGE_MATERIAL_MOD.length - 1];
/** A signed arms claim's shape (identityToken.js `wa`): `[reach, bow]` - the reach a whole number 0..ARMS_TOP_MAX (0: no
 *  weapon), the bow 0 or 1. */
export const armsOk = (wa) =>
  Array.isArray(wa) &&
  wa.length === 2 &&
  Number.isInteger(wa[0]) &&
  wa[0] >= 0 &&
  wa[0] <= ARMS_TOP_MAX &&
  (wa[1] === 0 || wa[1] === 1);
/**
 * A CHARACTER'S ARMS, off its pack (`items` - the save's own list: every weapon it can take in hand without a trip
 * elsewhere, worn or carried): `[reach, bow]` - the most reach any LAWFUL weapon there has (armsTop; 0 for none), and 1
 * where a lawful bow is among them (siegeIsBow - a shaft is a bow's). `lawful(item)` is the item law's word on one piece
 * (server-account/src/judge.js - a piece the law refuses arms nobody). DECIDED: the pack, never the one in hand - a
 * fighter swaps weapons mid-fight, and the signature is minted once a room; the cap is the honest most of what it
 * carries, never what one swing claimed.
 * @param {unknown} items @param {(it: any) => boolean} lawful
 * @returns {[number, 0|1]}
 */
export function armsOf(items, lawful) {
  let reach = 0,
    bow = /** @type {0|1} */ (0);
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || typeof it !== 'object' || it.group !== 'Weapons') continue;
    const r = armsTop(it.templateIndex, it.material ?? 0);
    if (r == null || !lawful(it)) continue;
    reach = Math.max(reach, Math.max(0, r));
    if (siegeIsBow(it.templateIndex)) bow = 1;
  }
  return [reach, bow];
}
/** Whether a template is a bow (its blow a shaft's). */
export const siegeIsBow = (w) => w === SIEGE_WEAPONS.Short_Bow || w === SIEGE_WEAPONS.Long_Bow;
/** AUDIT-SEATS R8: THE HANDS - the look's two slots a weapon is wielded from (DFU's EquipSlots RightHand 19 and LeftHand
 *  21: characters/paperdoll/paperdoll.js EQUIP_SLOTS, pinned equal - this leaf imports nothing; net/remotePlayers.js composeLook
 *  writes each item's `equipSlot` off the equip table's own index). */
export const SIEGE_HAND_SLOTS = Object.freeze([19, 21]);
/**
 * THE WEAPON A STRIKER HOLDS, off its look (net/wire.js validLook's items): the claimed template and material where a
 * `Weapons` item of the look carries them IN A HAND, else null - hand-to-hand (`w` -1) is always held. AUDIT-SEATS R8: in
 * a hand - any Weapons item anywhere in the look was taken as held, so a Daedric Dai-Katana in an amulet's slot (a look
 * the wire admits: validLookItem bounds the slot, never its kind) struck as one.
 */
export function siegeHeld(look, w, m) {
  if (w === -1 || w == null) return { w: -1, m: 0 };
  const it = (look?.items ?? []).find(
    (i) =>
      i?.group === 'Weapons' &&
      SIEGE_HAND_SLOTS.includes(i.equipSlot) &&
      i.templateIndex === w &&
      (i.material ?? 0) === m,
  );
  return it ? { w, m } : null;
}

// ─── THE REFEREE ─────────────────────────────────────────────────────

/** A fighter's state as the room keeps it. */
export const newFighter = (lv, now) => {
  const max = siegeVitality(lv);
  return {
    lv: Math.max(1, Math.min(SIEGE_VITALITY.levelMax, Math.trunc(Number(lv) || 1))),
    hp: max,
    max,
    down: false,
    upAt: 0,
    safeTo: 0,
    rate: SIEGE_BLOWS_HZ,
    rateAt: now,
    casts: [],
    heals: [],
    harm: [],
    dealt: 0,
    clipped: 0,
  };
};
export const metres = (a, b) =>
  Math.hypot((a.x - b.x) / SIEGE_UNITS_PER_M, (a.y - b.y) / SIEGE_UNITS_PER_M, (a.z - b.z) / SIEGE_UNITS_PER_M);
/** The striker's rate bucket, refilled to `now` (one second deep) - true where a blow may be spent. */
export function spend(f, now) {
  f.rate = Math.min(SIEGE_BLOWS_HZ, f.rate + ((now - f.rateAt) / 1000) * SIEGE_BLOWS_HZ);
  f.rateAt = now;
  if (f.rate < 1) return false;
  f.rate -= 1;
  return true;
}
/** BAL8: the harm the striker may still deal inside SIEGE_HARM's window (its record of `[at, dealt]` pruned to it). */
export function harmRoom(f, now) {
  f.harm = (f.harm ?? []).filter((h) => Array.isArray(h) && now - h[0] < SIEGE_HARM.windowMs);
  return Math.max(0, SIEGE_HARM.max - f.harm.reduce((n, h) => n + h[1], 0));
}
export const spendHarm = (f, now, n) => {
  if (n > 0) f.harm.push([now, n]);
};

/**
 * A BLOW JUDGED (6.1) - `by` and `to` the two fighters' states, `from` and `at` their last poses (null: unknown), `held`
 * the weapon the striker's look carries (siegeHeld - null: none matching the claim), `d` the damage claimed, `r` its kind
 * (SIEGE_HIT). Answers `{ ok, dealt, fell, why }` and moves the states: the striker's bucket spent first (as the gate's),
 * the target's vitality down by the clipped damage, a fall at none left. INT7: `wa` the striker's SIGNED arms (the
 * token's, armsOk - null: a token from before them): the clip never past their reach, and a shaft only where they hold
 * a bow.
 * @param {any} by @param {any} to
 * @param {{ from?: any, at?: any, held?: any, d?: number, r?: number, wa?: any }} o
 * @param {number} now
 */
export function refereeBlow(
  by,
  to,
  { from = null, at = null, held = null, d = 0, r = SIEGE_HIT.Melee, wa = null } = {},
  now,
) {
  if (!by || !to || by === to) return { ok: false, dealt: 0, fell: false, why: 'no-fighter' };
  if (by.down || to.down) return { ok: false, dealt: 0, fell: false, why: 'down' };
  if (!spend(by, now)) return { ok: false, dealt: 0, fell: false, why: 'rate' };
  if (now < to.safeTo) return { ok: false, dealt: 0, fell: false, why: 'protected' };
  if (!held) return { ok: false, dealt: 0, fell: false, why: 'weapon' };
  if (!from || !at) return { ok: false, dealt: 0, fell: false, why: 'reach' };
  const shaft = r === SIEGE_HIT.Shaft;
  if (shaft !== siegeIsBow(held.w) || (shaft && armsOk(wa) && wa[1] !== 1))
    return { ok: false, dealt: 0, fell: false, why: 'weapon' }; // INT7: a shaft a signed bow's
  const reach = (shaft ? SIEGE_REACH.shaft : SIEGE_REACH.melee) + SIEGE_REACH.slack;
  if (metres(from, at) > reach) return { ok: false, dealt: 0, fell: false, why: 'reach' };
  const want = Math.max(0, Math.trunc(Number(d) || 0));
  const got = Math.min(want, siegeBlowMax(held.w, held.m, wa), to.hp, harmRoom(by, now)); // BAL8: and the striker's harm ceiling
  spendHarm(by, now, got);
  by.clipped += want - got;
  by.dealt += got;
  to.hp -= got;
  const fell = to.hp <= 0;
  if (fell) to.down = true;
  return { ok: true, dealt: got, fell, why: null };
}

/**
 * A CAST JUDGED (6.1) - a damaging one (`heal` false) at most SIEGE_CASTS.max in a window, each to its damage's most; a
 * heal as many in a window of its own, to its own most, never past the target's whole. Reach a spell's. Answers
 * `{ ok, dealt, fell, why }`.
 * @param {any} by @param {any} to
 * @param {{ from?: any, at?: any, d?: number, heal?: boolean }} o
 * @param {number} now
 */
export function refereeCast(by, to, { from = null, at = null, d = 0, heal = false } = {}, now) {
  if (!by || !to) return { ok: false, dealt: 0, fell: false, why: 'no-fighter' };
  if (by.down || to.down) return { ok: false, dealt: 0, fell: false, why: 'down' };
  if (!from || !at || metres(from, at) > SIEGE_REACH.spell + SIEGE_REACH.slack)
    return { ok: false, dealt: 0, fell: false, why: 'reach' };
  const want = Math.max(0, Math.trunc(Number(d) || 0));
  if (heal) {
    by.heals = (by.heals ?? []).filter((t) => now - t < SIEGE_CASTS.windowMs);
    if (by.heals.length >= SIEGE_CASTS.max) return { ok: false, dealt: 0, fell: false, why: 'rate' };
    by.heals.push(now);
    const room = magickaRoom(by, now),
      wanted = Math.min(want, SIEGE_CASTS.healMax, to.max - to.hp),
      got = Math.min(wanted, room);
    spendMagicka(by, got, now);
    to.hp += got;
    return { ok: true, dealt: -got, fell: false, why: null, dry: room < wanted };
  }
  if (by === to) return { ok: false, dealt: 0, fell: false, why: 'no-fighter' };
  by.casts = by.casts.filter((t) => now - t < SIEGE_CASTS.windowMs);
  if (by.casts.length >= SIEGE_CASTS.max) return { ok: false, dealt: 0, fell: false, why: 'rate' };
  by.casts.push(now);
  if (now < to.safeTo) return { ok: false, dealt: 0, fell: false, why: 'protected' };
  const room = magickaRoom(by, now),
    wanted = Math.min(want, SIEGE_CASTS.damageMax, to.hp, harmRoom(by, now)); // BAL8: the blows' and the casts' one ceiling
  const got = Math.min(wanted, room); // and the magicka pool's
  spendMagicka(by, got, now);
  spendHarm(by, now, got);
  by.clipped += want - got;
  by.dealt += got;
  to.hp -= got;
  const fell = to.hp <= 0;
  if (fell) to.down = true;
  return { ok: true, dealt: got, fell, why: null, dry: room < wanted };
}

/** AUDIT-SEATS R2: the longest a step's allowance runs - a second's run and the slack, however long the silence before. */
export const SIEGE_STEP_WINDOW_MS = 1000;
/**
 * A STEP JUDGED (6.1): `next` a pose `dtMs` after `last` (both in the room's units) - kept when it moved no faster than
 * SIEGE_SPEED and its slack, else refused (the relay pulls the fighter back to `last`). A first pose is always kept.
 *
 * AUDIT-SEATS R1: THE RISE IS JUDGED - a step's length is its run across the ground and its climb together
 * (+y is up: player/motor.js's gravity takes `pos[1]` down); a fall is still gravity's, never refused (it outruns any
 * run). PVP-REF judged the ground alone (its DECIDED: "a climb buys no reach") - and a climb bought everything: a
 * fighter rose 2,000 m in 50 ms to stand over a banner where no blow reached it, contesting it for ever.
 *
 * AUDIT-SEATS R2: AND THE ALLOWANCE IS CARRIED on the fighter `f` (`f.stepM`, metres): refilled at SIEGE_SPEED.mps, up
 * to SIEGE_STEP_WINDOW_MS's run and the slack ONCE, each kept step spending its length; a refused step spends nothing
 * (the relay keeps `last` and its time, so the next step earns the whole gap again). PVP-REF gave every pose its own
 * slack and every gap its whole run - 180 poses 60 ms apart took a fighter 441 m in 300 ms, and ten silent seconds let
 * one pose land 180 m away. The window is generous to the honest: a burst after a stalled link spends the second's run
 * the stall earned, never more. Without `f` (the law alone) a step earns its own gap, held to the window, and the slack.
 */
export function refereeStep(last, next, dtMs, f = null) {
  const full = (SIEGE_SPEED.mps * SIEGE_STEP_WINDOW_MS) / 1000 + SIEGE_SPEED.slackM;
  if (!last) {
    if (f) f.stepM = full;
    return true;
  }
  const earned = (SIEGE_SPEED.mps * Math.min(SIEGE_STEP_WINDOW_MS, Math.max(0, dtMs))) / 1000;
  const allowed = f
    ? Math.min(full, (Number.isFinite(f.stepM) ? f.stepM : full) + earned)
    : earned + SIEGE_SPEED.slackM;
  const rise = Math.max(0, next.y - last.y || 0); // a pose with no height climbs nothing (the relay's are all finite - validPose)
  const len = Math.hypot(
    (next.x - last.x) / SIEGE_UNITS_PER_M,
    (next.z - last.z) / SIEGE_UNITS_PER_M,
    rise / SIEGE_UNITS_PER_M,
  );
  if (len > allowed) return false;
  if (f) f.stepM = allowed - len;
  return true;
}

/** THE RING - DUEL1's (net/duel/duelSession.js DUEL_RADIUS_M, DUEL_COUNTDOWN_MS, DUEL_MAX_MS, DUEL_ASK_TTL_MS, DUEL_GONE_MS,
 *  DUEL_OUT_SLACK_M - pinned equal: this leaf imports nothing): its radius, the countdown, a bout's longest (then a draw),
 *  how long an ask stands, how long a bout's fighter may be gone from the room before it loses, the slack past the edge
 *  a step is given; and DECIDED here, each fighter's mark this far either side of the centre. */
export const ROYAL_RING = Object.freeze({
  radiusM: 12,
  countdownMs: 3000,
  boutMs: 5 * 60_000,
  askMs: 30_000,
  goneMs: 10_000,
  outSlackM: 4,
  markM: 4,
});
