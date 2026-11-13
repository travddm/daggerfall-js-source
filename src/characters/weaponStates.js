// DFU-verbatim weapon state machine + timing data. Sources:
//   Game/WeaponManager.cs, Game/FPSWeapon.cs,
//   Game/Formulas/FormulaHelper.cs (Interkarma/daggerfall-unity master)
// Attack patterns and hold states match Daggerfall 1:1: the rig's
// clips are the VISUAL for these frames - all timing, hit moments,
// hold/draw/cooldown behavior comes from this module. 2D-sprite
// fields (Alignment/Offset) do not apply to a 3D rig and are the
// only WeaponBasics fields not carried.


// FPSWeapon.cs: WeaponStates (index = WeaponBasics record index)
export const WEAPON_STATES = ['Idle', 'StrikeDown', 'StrikeDownLeft', 'StrikeLeft', 'StrikeRight', 'StrikeDownRight', 'StrikeUp'];

// FormulaHelper.cs verbatim
export const CLASSIC_FRAME_UPDATE = 980;           // const int classicFrameUpdate
export const CLASSIC_UPDATE_INTERVAL = 0.0625;     // GameManager.classicUpdateInterval (classic 16Hz); bow anim tick
export function getMeleeWeaponAnimTime(liveSpeed, ctx = null) {
  const o = _animTimeOverride?.(liveSpeed, ctx, CLASSIC_FRAME_UPDATE);   // TryGetOverride("GetMeleeWeaponAnimTime") - weaponBalance registers one
  // The swing's PACE, over whichever law answered - the port's own, or a mod's
  if (o != null) return paced(o, ctx, null);
  // A wielder the port knows (`ctx.entity` - the player's machine, the Weapon Widget's clone, the third-person
  // body) swings on the port's own law; one it does not (a foe's machine, a peer's walker at PEER_SWING_SPEED, the
  // viewers) keeps DFU's line - which DFU never asks for a foe at all (characters/enemy/enemyAttack.js).
  if (ctx?.entity) {
    const w = _swingReader?.(ctx) ?? null;
    return paced(swingFrameSeconds(liveSpeed, {
      heft: w ? swingHeft(w.weight, w.strength) : 1,
      handling: swingHandling(ctx.weaponType, !!w?.twoHanded, !!w?.shortBlade),   // a short blade handles as a dagger
    }), ctx, w);
  }
  return (3 * (115 - liveSpeed)) / CLASSIC_FRAME_UPDATE;   // seconds per anim frame
}

// ── THE PLAYER'S SWING IS DFU'S SPEED LINE, PLUS THE WEAPON'S HEFT. ──────────────────────────
// The swing time a frame is DFU's own, `3 * (115 - Speed) / 980`, with Speed held to 0..100. The port's
// earlier law flattened the line (1.4 at Speed 0 to 0.6 at 100 on a pivot at 50) and put a heft of up to +35% and
// handling of up to +12% on top: a Speed-100 build swung at 0.42 of DFU's rate and a heavy weapon cost a third more. A
// fast build now loses at most 15% of DFU's swing rate, all of it to the weapon in the hand:
//   time a frame = DFU's frame at Speed x HEFT(weight, Strength) x HANDLING(weapon, hands),
// bounded to [SWING_FRAME_MIN, SWING_FRAME_MAX]. Speed past 100 reads as 100: DFU's line is 0 at 115, a frame that is
// never 0 (the machine's loop then never ended - Online-Arc "Recorded, not paid"). Roleplay & Realism's weaponSpeed and
// Items' weaponBalance keep their own weight-and-Strength arithmetic as the Speed they read, and answer through this
// curve and this handling (systems/roleplayRealism/rrRealism.js, systems/roleplayRealismItems/rriRealism.js). A declared
// departure: Ledger A, for the heft and the handling; the Speed line is DFU's.
/** DFU's frame at Speed 50 - the middle of the line, and the reference `swingTempo` divides by. */
export const SWING_BASE_FRAME = (3 * (115 - 50)) / CLASSIC_FRAME_UPDATE;
/** DFU's frame at a Speed over the frame at Speed 50 (held to 0..100; a Speed that is no number reads as 50): 1.69 at Speed 0,
 *  0.23 at 100. */
export function swingTempo(speed) {
  const s = Math.max(0, Math.min(100, Number.isFinite(speed) ? speed : 50));
  return (3 * (115 - s)) / CLASSIC_FRAME_UPDATE / SWING_BASE_FRAME;
}
/** THE HEFT: a weapon's base weight as the arm feels it - `(150 - Strength)%` of it (Items' weaponBalance scaling: all
 *  of it at 50, half at 100, half again at 0) - costs SWING_HEFT_PER_KG of the swing a kilogram past the
 *  SWING_HEFT_FREE_KG any arm carries lightly, to at most SWING_HEFT_MAX. A shortsword costs an average arm nothing; a
 *  claymore (7.5 kg) the whole 8% at Strength 50 and 4% at 90. */
export const SWING_HEFT_FREE_KG = 2.5;
export const SWING_HEFT_PER_KG = 0.02;
export const SWING_HEFT_MAX = 0.08;
export function swingHeft(weightKg, strength) {
  const w = Math.max(0, Number.isFinite(weightKg) ? weightKg : 0);
  const str = Math.max(0, Math.min(100, Number.isFinite(strength) ? strength : 50));
  const load = (w * (150 - str)) / 100;
  return 1 + Math.min(SWING_HEFT_MAX, Math.max(0, (load - SWING_HEFT_FREE_KG) * SWING_HEFT_PER_KG));
}
/** The weight-and-Strength term of Roleplay & Realism's weaponSpeed and Items' weaponBalance, as a heft. Each mod turns the
 *  live Speed into a slower effective Speed (a blend with Strength, or a cut by the weapon's weight). Read through DFU's
 *  hyperbolic line a few points of Speed at the top cost a half of the swing rate, so the mods' effective Speed is not fed
 *  to the law. Their meaning (weight and Strength matter a little) is kept as a share of the time they would cost, at most
 *  SWING_HEFT_MAX, the same bound as the port's own heft. A mod that would speed the swing adds nothing. */
export const MOD_HEFT_SHARE = 0.25;
export function modHeft(liveSpeed, modSpeed) {
  const clamp = (v) => Math.max(0, Math.min(100, Number.isFinite(v) ? v : 50));
  const ratio = (115 - clamp(modSpeed)) / (115 - clamp(liveSpeed));
  return 1 + Math.min(SWING_HEFT_MAX, Math.max(0, (ratio - 1) * MOD_HEFT_SHARE));
}
/** THE HANDLING: each weapon's own tempo apart from its weight, by DFU's WeaponTypes (combat/fpsWeapon.js WEAPON_TYPES -
 *  pinned equal; this module is a leaf): a dagger, bare hands and a beast's claws are quick; a sword is the measure; a
 *  mace, a flail, an axe and a warhammer come round a little slower; a staff sweeps quicker than the other two-handers
 *  (every staff takes both hands: 0.97 x 1.03, against a claymore's 1.03 and a warhammer's 1.04 x 1.03 - a sword's
 *  1.0 is still quicker). A two-handed weapon takes SWING_TWO_HANDED on top of its kind. Anything else (the bow's draw,
 *  which keeps its own clock) reads 1. */
export const SWING_HANDLING = Object.freeze({
  0: 1, 1: 1,           // LongBlade (every sword the sprites draw as one: the tanto and the shortsword to the dai-katana - but a short blade takes the Dagger's row, SWING_SHORT_BLADE)
  2: 0.97, 3: 0.97,     // Staff
  4: 0.9, 5: 0.9,       // Dagger
  6: 1.02, 7: 1.02,     // Mace
  8: 1.03, 9: 1.03,     // Flail
  10: 1.04, 11: 1.04,   // Warhammer
  12: 1.03, 13: 1.03,   // Battleaxe (every axe)
  15: 0.9,              // Melee - bare hands
  16: 0.9,              // Werecreature - the beast's claws
});
export const SWING_TWO_HANDED = 1.03;
/** EVERY SHORT BLADE HANDLES
 *  AS A DAGGER. The table keys DFU's WeaponTypes - the SPRITE a weapon is drawn with - and DFU draws the Tanto, the
 *  Shortsword and the Wakizashi as long blades, so only the Dagger came round quickly: the family that fights by speed was
 *  the slowest per second of the six (a Shortsword 8.7 a second to a Longsword's 12.6 at Strength 80, Speed 70). A weapon
 *  that swings with Short Blade (`shortBlade`, the swing reader's word - combat/swingLaw.js) takes the Dagger's row,
 *  whatever draws it; one-handed all, so no two-handed term meets it. */
export const SWING_SHORT_BLADE = SWING_HANDLING[4];
export const swingHandling = (weaponType, twoHanded = false, shortBlade = false) => (shortBlade ? SWING_SHORT_BLADE : (SWING_HANDLING[weaponType] ?? 1)) * (twoHanded ? SWING_TWO_HANDED : 1);
/** The bounds of a frame: no swing is quicker than 0.2 s (five frames) or slower than 2 s, whatever a mod reads. DFU's frame
 *  at Speed 100 is 0.046 s, so only a swing pace modifier (SWING_PACE_MOST) reaches the floor. */
export const SWING_FRAME_MIN = 0.04;
export const SWING_FRAME_MAX = 0.4;
/** Seconds a frame of a melee swing at an effective Speed, with the weapon's heft and handling (both 1 by default). */
export function swingFrameSeconds(speed, { heft = 1, handling = 1 } = {}) {
  return Math.max(SWING_FRAME_MIN, Math.min(SWING_FRAME_MAX, SWING_BASE_FRAME * swingTempo(speed) * heft * handling));
}
// ── THE SWING'S PACE ───────────────────────────────
// A Short Blade mastered past 100 swings faster (systems/weaponMastery.js), and three martial paths quicken a swing for a
// while (systems/martialPowers.js) - as the cast-speed rate quickens a cast (systems/castSpeed.js). NAMED modifiers, each
// `fn(ctx, w) -> percent` (`w` the swing reader's answer where the frame's law has read it already, else null - a
// modifier that needs the weapon reads it itself, and only once it knows it may pay: the reader is
// no free call, and the override's arm reads it again for every swing of every wielder): the frame's time is divided by 1 +
// their sum, at most SWING_PACE_MOST, and never under SWING_FRAME_MIN - no swing is quicker than 0.45 s, whatever
// quickens it (the swing law's floor). Asked only for a wielder the port knows (`ctx.entity`), every frame of a swing: a
// list, never a Map's iterator.
/** The most every pace modifier together quickens a swing (%). */
export const SWING_PACE_MOST = 50;
/** @type {Array<[string, (ctx: any, w: any) => number]>} */
let _pace = [];
/** Register a swing pace modifier by name; a non-function removes the name. */
export function registerSwingPaceMod(name, fn) {
  _pace = _pace.filter(([n]) => n !== name);
  if (typeof fn === 'function') _pace.push([name, fn]);
}
/** The percent every modifier quickens this swing by, at most SWING_PACE_MOST; one that throws or answers no number is
 *  none. */
export function swingPacePct(ctx, w = null) {
  if (!ctx?.entity || _pace.length === 0) return 0;
  let pct = 0;
  for (let i = 0; i < _pace.length; i++) {
    try { const v = _pace[i][1](ctx, w); if (Number.isFinite(v) && v > 0) pct += v; } catch { /* a modifier is not the swing's problem */ }
  }
  return Math.min(SWING_PACE_MOST, pct);
}
/** A frame's time `t`, paced (`w` the reader's answer the law already read, or null). */
function paced(t, ctx, w) {
  if (!ctx?.entity || _pace.length === 0 || !(t > 0)) return t;
  const pct = swingPacePct(ctx, w);
  return pct > 0 ? Math.max(SWING_FRAME_MIN, t / (1 + pct / 100)) : t;
}

/** The weapon in the hand as the law reads it - `(ctx) => {weaponType, weight, strength, twoHanded, shortBlade, family}` or null - from a
 *  module that can read the equip table (combat/swingLaw.js, which registers it as it loads - combat/weapon/weaponRig.js
 *  imports it); this module is a leaf. Without one the
 *  law reads no heft, and the handling off `ctx.weaponType` alone. */
let _swingReader = null;
export function registerSwingReader(fn) { _swingReader = typeof fn === 'function' ? fn : null; }
/** FormulaHelper.RegisterOverride("GetMeleeWeaponAnimTime"): the C# takes
 *  (player, weaponType, weaponHands); the port's callers pass the live
 *  speed and, where they have one, `ctx` = { entity, weaponType,
 *  usingRightHand } so an override can read the strength and the held
 *  weapon. Answers seconds per frame, or null for DFU's line. This
 *  module is a leaf, so the override is registered. */
let _animTimeOverride = null;
export function registerMeleeWeaponAnimTime(fn) { _animTimeOverride = typeof fn === 'function' ? fn : null; }
export function getBowCooldownTime(liveSpeed) {
  return (10 * (100 - liveSpeed) + 800) / CLASSIC_FRAME_UPDATE;
}

// WeaponManager.cs verbatim
export const MAX_GESTURE_SECONDS = 1.0;
export const MAX_BOW_HELD_DRAWN_SECONDS = 10;
export const BOW_SWITCH_DIVISOR = 1.7;
export const RESET_JOYSTICK_SWING_RADIUS = 0.4;
export const ATTACK_THRESHOLD = 0.05;              // gesture travel / longest screen dim
// SWING_WEAPON_FATIGUE_LOSS and
// ARROW_MOVEMENT_SPEED were duplicates of the live single sources
// (hostCombat.js's constant; spellcast.js's MISSILE_SPEED = the same
// DaggerfallMissile.MovementSpeed) - deleted per ONE DFU MEMBER, ONE
// EXPORT. ArmLength stays as the one home for its member (no live
// consumer yet - the arrow paths launch from the eye).
export const ARROW_ARM_LENGTH = 0.9;        // DaggerfallMissile.ArmLength - cast-origin distance
export const EQUIP_DELAY_TIMES = [500, 700, 1200, 900, 900, 1800, 1600, 1700, 1700, 3000, 3400, 2000, 2200, 2000, 2200, 2000, 4000, 5000];

// WeaponBasics.cs verbatim: melee strikes are 5 frames, idle 1, all
// at 10 fps native (the native rate is replaced at runtime by the
// SPD-driven tick above, exactly as FPSWeapon.GetAnimTickTime does).
export const MELEE_NUM_FRAMES = { Idle: 1, StrikeDown: 5, StrikeDownLeft: 5, StrikeLeft: 5, StrikeRight: 5, StrikeDownRight: 5, StrikeUp: 5 };
// FPSWeapon.cs verbatim hit frames: damage lands when
// currentFrame == GetHitFrame().
export const HIT_FRAME_MELEE = 2;
// The share of a melee strike its blow lands at - the hit frame of the strike's five. A
// gathering act's tool swings DFU's strike (scenes/treeHost.js axeHandFrame, scenes/mineHost.js pickHandFrame), so its
// blow lands there too (systems/chopAct.js, mineAct.js `landsIn`).
export const MELEE_HIT_SHARE = HIT_FRAME_MELEE / MELEE_NUM_FRAMES.StrikeDown;
export const HIT_FRAME_BOW = 5;
export const BOW_SOUND_FRAME = 4;                  // swing sound fires here
export const BOW_DRAWN_HOLD_FRAME = 3;             // fully drawn; drawback holds here
// WeaponBasics.cs BowWeaponAnims, read off the table: row 0 (Idle)
// NumFrames 1, rows 1-5 (every strike) 7, row 6 (StrikeUp, the draw)
// 4. StrikeDown had been RECONSTRUCTED as 6 from the
// mechanics rather than read, which cut frame 6 off every release and
// started the bow cooldown one classic tick early.
export const BOW_NUM_FRAMES = { Idle: 1, StrikeUp: 4, StrikeDown: 7 };
// FPSWeapon.cs:71 verbatim: the unarmed strike-to-the-LEFT plays its
// own eight-tick frame list - up and back down again - instead of the
// generic 5-frame increment. FPSWeapon.AnimateWeapon:500-511 takes
// this arm FIRST, for WeaponTypes.Melee and Werecreature only, and
// cannot end before the eighth tick.
export const LEFT_UNARMED_ANIMS = Object.freeze([0, 1, 2, 3, 4, 2, 1, 0]);

/** WeaponManager.cs:343 - Random.Range((int)UpRight, (int)DownRight + 1)
 *  over MouseDirections {None, UpLeft, Up, UpRight, Left, Right,
 *  DownLeft, Down, DownRight}: indices 3..8. The swing-mode click's draw (combat/playerWeapon.js, which re-exports
 *  it) and the touch Attack button's (ui/touch/touchButtons.js attackStroke) - one table. */
export const CLICK_ATTACK_DIRECTIONS = Object.freeze(['UpRight', 'Left', 'Right', 'DownLeft', 'Down', 'DownRight']);

// WeaponManager.TrackMouseAttack verbatim: 15deg radial sections.
// Note gesture tracking emits only SIX directions (UpLeft/UpRight
// exist solely for the click-attack random roll).
export function gestureDirection(angleDeg) {
  let a = angleDeg % 360; if (a < 0) a += 360;
  const s = Math.ceil(a / 15);
  if (s <= 1 || s === 24 || s === 0) return 'Right';       // 345-15
  if (s <= 11) return 'Up';                                 // 15-165 (diagonal-up folds into Up)
  if (s <= 13) return 'Left';                               // 165-195
  if (s <= 17) return 'DownLeft';                           // 195-255
  if (s <= 19) return 'Down';                               // 255-285
  return 'DownRight';                                       // 285-345
}

// FPSWeapon.OnAttackDirection verbatim interrupt rule: a one-shot in
// progress cannot be replaced, EXCEPT the bow release (StrikeUp ->
// StrikeDown while drawn).
export function canChangeState(isBow, currentState, nextState) {
  if (currentState === 'Idle') return true;
  return isBow && currentState === 'StrikeUp' && nextState === 'StrikeDown';
}

// The frame engine, distilled from FPSWeapon.AnimateWeapon +
// WeaponManager's bow block. step(machine, dt) advances ticks;
// events collect hit/sound/loose moments for the caller.
/** `isUnarmed` = the FPSWeapon.AnimateWeapon gate WeaponType ==
 *  Melee || Werecreature. It is the PLAYER's screen weapon only, and
 *  the caller must re-read it every step - a sheathed sword flips the
 *  rig between armed and bare-handed while the machine lives on. */
export function createWeaponMachine(isBow, isUnarmed = false) {
  return { isBow, isUnarmed, state: 'Idle', frame: 0, ticks: 0, acc: 0, cooldownUntil: 0, now: 0, bowIdleDrawn: false, animIndex: 0, damageDone: false, hold: 0 };
}

export function machineAttack(m, strikeState) {
  if (m.now < m.cooldownUntil) return false;
  if (!canChangeState(m.isBow, m.state, strikeState)) return false;
  m.state = strikeState;
  // ChangeWeaponState verbatim: bows keep frames unless going Idle
  if (!m.isBow || strikeState === 'Idle') { m.frame = 0; m.ticks = 0; }
  m.acc = 0;
  m.animIndex = 0; m.damageDone = false;   // leftUnarmedAnimIndex / isDamageFinished
  m.hold = 0;   // ticks held at the swing's end - set by its caller for an off-hand blow, else none
  return true;
}

/** ActivateCenterObject / the hold cap: un-draw WITHOUT releasing an
 *  arrow (WeaponManager.cs:355-357). The un-draw
 *  leaves isAttacking TRUE, so the very next Update takes the
 *  not-attacking reset block and charges the FULL bow cooldown -
 *  `if (WeaponType == Bow && isAttacking) cooldownTime = Time.time +
 *  GetBowCooldownTime(playerEntity)` (:220-222). A cancelled draw
 *  costs exactly what a loosed arrow costs; the port let the next draw
 *  start on the following frame. */
export function machineCancelBowDraw(m, liveSpeed = 50) {
  if (m.isBow && m.state === 'StrikeUp') {
    m.state = 'Idle'; m.frame = 0; m.ticks = 0; m.acc = 0;
    m.cooldownUntil = m.now + getBowCooldownTime(liveSpeed);
    return true;
  }
  return false;
}

/**
 * THE BLOW'S CLOCK, SAID AHEAD OF TIME - when the strike this machine has just begun lands its hit,
 * and when it is done, in seconds from its first frame. The Morrowind arm is a picture of this machine (rule 24's note,
 * Morrowind-Rules.md: the hit frame is FPSWeapon's, not the .kf's), and a picture paced by the WEAP record's own speed
 * drew one blow while the machine struck two - the second refused, the hit landing mid-wind-up. The caller that starts
 * the arm's wind-up reads this at the strike's first frame (combat/weapon/weaponRig.js fpAttack) and the arm fits each section
 * of its blow into it (combat/fpArm.js blowRate).
 *
 * The machine steps ONCE per frame and drops the remainder (machineStep below), so a tick lasts the whole
 * frames it takes to cover it: given the frame's `dt`, a step is ceil(tick / dt) frames. Without one, the nominal tick.
 * The unarmed strike to the left is FPSWeapon's eight-tick list, its hit the first visit to frame 2. Null for Idle and
 * for a ranged machine - the bow's hit waits for the arm's own "shoot release", and its arm keeps the record's
 * pace.
 * @returns {{ seconds: number, hitAt: number, step: number } | null}
 */
export function blowSchedule(m, liveSpeed, animCtx = null, dt = 0) {
  if (!m || m.state === 'Idle' || m.isBow) return null;
  const tick = getMeleeWeaponAnimTime(liveSpeed, animCtx);
  if (!(tick > 0) || !Number.isFinite(tick)) return null;
  const step = dt > 0 ? Math.max(1, Math.ceil(tick / dt - 1e-9)) * dt : tick;
  if (m.isUnarmed && m.state === 'StrikeLeft') {
    return { seconds: LEFT_UNARMED_ANIMS.length * step, hitAt: (LEFT_UNARMED_ANIMS.indexOf(HIT_FRAME_MELEE) + 1) * step, step };
  }
  // Timed from the frame the strike stands on - 0 for every strike DFU begins, 1 for a pair's flurry
  // (handsLaw.js DUAL.FLURRY_FROM_FRAME: the blow thrown from the raised hand) - and to the end of the ticks
  // held after its last frame (an off-hand blow's burden), the hit before them
  const at = Math.max(0, m.frame | 0);
  return { seconds: (strikeTicks(m) + holdOf(m)) * step, hitAt: Math.max(0, HIT_FRAME_MELEE - at) * step, step };
}

/** The ticks a melee strike just begun takes from the frame it stands on to its end - FPSWeapon's
 *  eight-tick list for the unarmed strike to the left, else its frames past the one it stands on - before any held at
 *  its end (`m.hold`, machineStep). What an off-hand blow's burden is reckoned on (combat/twoHands/handsLaw.js offHandHold). */
export function strikeTicks(m) {
  if (m.isUnarmed && m.state === 'StrikeLeft') return LEFT_UNARMED_ANIMS.length;
  const frames = MELEE_NUM_FRAMES[m.state] ?? 5;
  return Math.max(0, frames - Math.max(0, m.frame | 0));
}
const holdOf = (m) => (m.hold > 0 ? m.hold | 0 : 0);

export function machineStep(m, dt, liveSpeed, animCtx = null) {   // the rig's { entity, weaponType, usingRightHand } for a registered GetMeleeWeaponAnimTime override
  m.now += dt;
  const events = [];
  if (m.state === 'Idle') {
    // FPSWeapon.AnimateWeapon's idle arm for a bow (FPSWeapon.cs:
    // 527-537): the one-frame Idle runs off its end every tick and lands
    // on frame 3 with BowDrawback off - the drawn, nocked bow the instant
    // shot looses FROM (ChangeWeaponState keeps a bow's frame, :261-262,
    // so StrikeDown steps 4 the twang, 5 the shaft) - and on frame 0 with
    // it on. The port's idle sat at 0 whatever the setting, so the
    // default instant shot played the whole draw first and loosed at +5
    // ticks where DFU looses at +2: the widget's clone, which starts at
    // 3 as the IL does, let its sprite arrow go ~170 ms before the 3D
    // shaft existed. Not while cooling: AnimateWeapon does not step a
    // bow it has hidden (:497, `ShowWeapon`).
    const rest = m.isBow && m.bowIdleDrawn ? BOW_DRAWN_HOLD_FRAME : 0;
    if (m.isBow && m.frame !== rest && m.now >= m.cooldownUntil) {
      m.acc += dt;
      if (m.acc >= CLASSIC_UPDATE_INTERVAL) { m.acc = 0; m.frame = rest; }
    }
    return events;
  }
  const frames = (m.isBow ? BOW_NUM_FRAMES : MELEE_NUM_FRAMES)[m.state] ?? 5;
  const tick = m.isBow ? CLASSIC_UPDATE_INTERVAL : getMeleeWeaponAnimTime(liveSpeed, animCtx);   // FPSWeapon's own animTickTime asks FormulaHelper's override (FormulaHelper.cs:830-838); without the ctx the two mods' arms were inert on the swing that lands
  m.acc += dt;
  while (m.acc >= tick) {
    // ONE step per resume, the remainder dropped - FPSWeapon.
    // AnimateWeapon steps once and then `yield return new WaitForSeconds
    // (animTickTime)` (:545), and a coroutine resumes on the first frame
    // past its wait, never twice in one. Carrying the remainder let the
    // machine take several ticks in a frame and run ahead of the weapon
    // widget's clone (the IL's own coroutine, weaponWidget.js), which
    // then missed the bow's hit frame and never set its cooldown; and a
    // single long frame on the release ran StrikeDown to Idle at once.
    m.acc = 0;
    if (m.isUnarmed && m.state === 'StrikeLeft') {
      // FPSWeapon.AnimateWeapon's FIRST arm: the frame comes from
      // leftUnarmedAnims, never from an increment, and the swing ends
      // only when the index runs off the end. The damageDone latch is
      // WeaponManager.cs:381's isDamageFinished - without it the
      // list's SECOND visit to frame 2 would fire a hit DFU never fires.
      m.frame = LEFT_UNARMED_ANIMS[m.animIndex++];
      if (m.frame === HIT_FRAME_MELEE && !m.damageDone) { events.push('hit'); m.damageDone = true; }
      if (m.animIndex >= LEFT_UNARMED_ANIMS.length) {
        m.state = 'Idle'; m.frame = 0; m.ticks = 0; m.animIndex = 0; m.damageDone = false;
        events.push('done');
        break;
      }
    } else if (m.isBow && m.state === 'StrikeUp') {
      if (m.frame < frames - 1) m.frame++;             // draw to the hold frame, then hold
      m.ticks++;                                        // held-time keeps counting (GetAnimTime)
      if (m.ticks * tick > MAX_BOW_HELD_DRAWN_SECONDS) { machineCancelBowDraw(m, liveSpeed); events.push('undraw'); break; }
    } else {
      // An off-hand blow's burden (combat/twoHands/handsLaw.js offHandHold) - whole ticks held on its last
      // frame, after its hit, one a resume as every tick is; the picture's clones wait out a machine still attacking
      if (m.hold > 0 && m.frame >= frames - 1) { m.hold -= 1; continue; }
      m.frame++;
      if (m.frame === (m.isBow ? BOW_SOUND_FRAME : -1)) events.push('bowSound');
      if (m.frame === (m.isBow ? HIT_FRAME_BOW : HIT_FRAME_MELEE)) events.push('hit');
      if (m.frame >= frames) {
        m.state = 'Idle'; m.frame = 0; m.ticks = 0;
        events.push('done');
        if (m.isBow) m.cooldownUntil = m.now + getBowCooldownTime(liveSpeed);
        break;
      }
    }
  }
  return events;
}
