// The first-person arm's upper body: the weapon's draw, stow, wind-up, release and follow-through, and the cast.
// Moved out of createFpArm unchanged; its state is the fields of the object createUpperBody answers, and what it
// reads of the arm comes through `ctx` (live getters).
import { resetClip, getTextKeyTime } from '../../formats/morrowind/mwAnim.js';
import {
  sourcesKeyTime,
  pickAnimSource,
  composeWeaponGroup,
  EQUIP_KEYS,
  UNEQUIP_KEYS,
  calculateWindUp,
  attackKeys,
  MW_SHOOT_ATTACK,
  reloadsItself,
} from '../../formats/morrowind/mwFirstPerson.js';
import { UPPER_BODY, animWeaponType, releaseSkip, blowRate } from './fpAnimState.js';

/**
 * @param {{ built: () => any, dead: () => boolean, notes: () => string[], rig: () => any,
 *   hasGroup: (name: string) => boolean, clearAttackHand: () => void }} ctx
 * @param {any} slots the slots below the upper body (animSlots.js)
 */
export function createUpperBody(ctx, slots) {
  const ub = {
    upper: UPPER_BODY.Rest,
    actionState: null,
    actionSource: null,
    weaponGroup: null,
    attackType: null,
    attackStrength: 1,
    attackReversed: false,
    holdWindUp: false,
    blowPlan: null,
    resetIdleOnAttackEnd: false,
    weaponShown: false,
    arrowShown: false,
    shootReleased: false,
    castReleased: false,
    unreadyAfterCast: false,
    sheathed: true,
    spellReady: false,
    castRate: 1,
    castPaced: false,
    creatureCasts: 0,
    keyTime,
    playAction,
    refreshWeaponGroup,
    onActionKey,
    windUpStrength,
    beginRelease,
    beginFollow,
    endAttack,
    creatureAttack,
    blowPace,
    reloadCrossbow,
    stepUpper,
  };

  /** The file's time for a key of the CURRENT weapon group, as
   *  getTextKeyTime is always called (character.cpp:1241): the group, a
   *  colon-space, and the action. -1 when the file has no such key. */
  // MW-D29: getTextKeyTime asks EVERY source in reverse
  // (animation.cpp:840-854), not the one the idle was picked from.
  function keyTime(action) {
    return ub.weaponGroup && ctx.rig() ? sourcesKeyTime(ctx.rig().sources, `${ub.weaponGroup}: ${action}`) : -1;
  }

  /** Play a section of the weapon group. Returns FALSE and leaves the
   *  slot empty when the file has no such window - it never substitutes
   *  a different one, because a substituted attack animation is the
   *  reverted arc's whole failure mode in miniature. */
  function playAction(start, stop, startPoint = 0, reversed = false) {
    if (!ctx.rig() || !ub.weaponGroup) return false;
    const pick = pickAnimSource(ctx.rig().sources, ub.weaponGroup, resetClip, { start, stop, startPoint });
    if (!pick) {
      ub.actionState = null;
      ctx
        .notes()
        .push(`${ub.weaponGroup}: no source has "${ub.weaponGroup}: ${start}" and "${ub.weaponGroup}: ${stop}"`);
      return false;
    }
    ub.actionState = pick.state;
    ub.actionState.reversed = !!reversed; // MS1: the pose reads this window backwards
    ub.actionSource = pick.source;
    return true;
  }

  /** Rule 9's long group for the CURRENT stance, and the equip/unequip
   *  and attack sections all live in it. */
  function refreshWeaponGroup() {
    if (!ctx.built() || !ctx.built().ok) {
      ub.weaponGroup = null;
      return;
    }
    const type = animWeaponType(ctx.built().mwType, ub.sheathed, ub.spellReady);
    ub.weaponGroup = composeWeaponGroup(type, ctx.hasGroup).group;
  }

  /** ANIMATION::HANDLETEXTKEY's first-person consequences. Rule 47's
   *  group test is `mine` - a key of another group crossed by this
   *  playhead is not this animation's business. */
  function onActionKey(text, time, mine) {
    if (!mine || !ub.weaponGroup) return;
    const action = text.slice(ub.weaponGroup.length + 2);
    // showWeapons(true/false) at the attach/detach keys - the
    // listener's own branches (CharacterController::handleTextKey,
    // character.cpp:1074-1087), gated there on Equipping/Unequipping
    // exactly as the machine is here.
    if (action === EQUIP_KEYS.attach) ub.weaponShown = true;
    else if (action === UNEQUIP_KEYS.detach) ub.weaponShown = false;
    // RULE 24's ranged actions (character.cpp:1153-1165). Two keys
    // attach and one releases, and "shoot follow attach" is the second
    // attach - the round that goes on the string during the
    // follow-through, which is why a bow looks loaded again before the
    // animation has finished.
    else if (action === 'shoot attach' || action === 'shoot follow attach') ub.arrowShown = true;
    // MW-D42 (Mac: the arrow damages ON CLICK instead of following the
    // bow animation): the release is now SIGNALLED, not just drawn.
    // Rule 24's note at Morrowind-Rules.md:246-255 kept every gameplay
    // key with Daggerfall's machine so two clocks could not disagree
    // about when a blow lands, and it was right that they must not -
    // but it settled the disagreement by making the ARM follow nothing.
    // The shot left on frame 4 of the classic clock while the arm was
    // still drawing. One clock still decides, and it is still
    // Daggerfall's machine that owns damage; what changes is WHEN it is
    // allowed to say so for a bow the arm is animating.
    else if (action === 'shoot release') {
      ub.arrowShown = false;
      ub.shootReleased = true;
    }
    // MW-CAST1: THE SPELL LEAVES HERE - "<type> release" in the spellcast group, where OpenMW casts it
    // (character.cpp handleTextKey: `groupname == "spellcast" && action == mAttackType + " release"`). Signalled, as
    // MW-D42 signals the bow's; Daggerfall's engine still resolves the spell (fpsSpellCasting holds its release for it).
    else if (ub.upper === UPPER_BODY.Casting && ub.attackType && action === `${ub.attackType} release`)
      ub.castReleased = true;
  }

  /** PREPAREHIT's strength half (character.cpp:1250-1259), which is the
   *  ONLY thing that decides which of small/medium/large follow keys the
   *  blow ends on and how much of the release it skips. */
  function windUpStrength() {
    if (!ub.actionState) return 1;
    const f = calculateWindUp(
      ub.actionState.time,
      keyTime(`${ub.attackType} min attack`),
      keyTime(`${ub.attackType} max attack`),
    );
    // The sentinel is NOT zero: a group with no wind-up window gets a
    // random 0.1..1.0 blow, which is how creature attacks with no
    // min/max keys still vary.
    return f === -1 ? Math.min(1, 0.1 + Math.random()) : f;
  }

  /** UpperBodyState::AttackWindUp -> AttackRelease (:1725-1790). */
  function beginRelease() {
    ub.attackStrength = windUpStrength();
    ub.upper = UPPER_BODY.Striking;
    const k = attackKeys(ub.attackType, ub.attackStrength, { reversed: ub.attackReversed });
    const startPoint = releaseSkip(ctx.rig().keys, ub.weaponGroup, ub.attackType, ub.attackStrength);
    if (!playAction(k.release.start, k.release.stop, startPoint, k.reversed)) beginFollow();
    // MW-PACE1: the release ENDS on the blow - "<type> hit" - so it is fitted to the machine's hit, from where the
    // arm is now: a wind-up that ran a frame long is made up here, not carried into the damage.
    else if (ub.blowPlan)
      ub.blowPlan.rate = blowRate(ub.actionState.stopTime - ub.actionState.time, ub.blowPlan.hitAt - ub.blowPlan.clock);
  }

  /** AttackRelease -> AttackEnd (:1793-1812): the follow-through, whose
   *  key names carry the strength word for a melee blow and do not for a
   *  shot. */
  function beginFollow() {
    ub.upper = UPPER_BODY.Recovering;
    const k = attackKeys(ub.attackType, ub.attackStrength, { reversed: ub.attackReversed });
    if (!playAction(k.follow.start, k.follow.stop, 0, k.reversed)) endAttack();
    // MW-PACE1: and the follow-through ends where the machine's blow does, so the next blow finds the arm ready.
    else if (ub.blowPlan)
      ub.blowPlan.rate = blowRate(
        ub.actionState.stopTime - ub.actionState.time,
        ub.blowPlan.seconds - ub.blowPlan.clock,
      );
  }

  /** AttackEnd -> WeaponEquipped (:1821-1856). */
  function endAttack() {
    ub.actionState = null;
    ub.actionSource = null;
    reloadCrossbow();
    ub.upper = UPPER_BODY.Ready;
    ub.attackType = null;
    ctx.clearAttackHand(); // TWO-HANDS
    ub.blowPlan = null;
    if (ub.resetIdleOnAttackEnd) {
      ub.resetIdleOnAttackEnd = false;
      slots.resetIdle();
    }
  }

  /**
   * MWNPC9: A NON-BIPED CREATURE'S BLOW (character.cpp:1355-1363 and :1529-1532): "Randomize attacks for non-bipedal
   * creatures" - one of its attack groups by the roll (chooseRandomAttackAnimation: "attack" + chooseRandomGroup), played
   * "start" to "stop" in ONE section, its blow landing on the group's "hit" key (on its start, when it has none -
   * handleTextKey). The section stands as the follow-through (AttackEnd), so the machine's next blow cuts it as it cuts
   * a person's, and stepUpper's endAttack frees the claws at its stop. Paced to the machine's blow: the playhead reaches
   * "hit" at the hit (MW-PACE1), or - with no hit key - the stop at the blow's end.
   */
  function creatureAttack(roll, blow) {
    if (ctx.dead()) return null;
    if (ub.upper === UPPER_BODY.Recovering) endAttack();
    if (ub.upper !== UPPER_BODY.Ready) return null;
    const g = slots.chooseRandomGroup('attack', roll);
    const pick = g
      ? pickAnimSource(ctx.rig().sources, g, resetClip, { start: 'start', stop: 'stop', loopCount: 0 })
      : null;
    if (!pick) return null;
    ub.actionState = pick.state;
    ub.actionSource = pick.source;
    ub.upper = UPPER_BODY.Recovering;
    ub.attackType = g;
    ub.holdWindUp = false;
    ub.attackStrength = 1;
    ub.resetIdleOnAttackEnd = true;
    ub.blowPlan = null;
    if (blow && blow.hitAt > 0 && blow.seconds >= blow.hitAt && Number.isFinite(blow.seconds)) {
      const st = ub.actionState;
      const hit = getTextKeyTime(pick.source.keys, `${g}: hit`);
      const rate =
        hit > st.startTime
          ? blowRate(hit - st.startTime, blow.hitAt)
          : blowRate(st.stopTime - st.startTime, blow.seconds);
      ub.blowPlan = { seconds: blow.seconds, hitAt: blow.hitAt, clock: 0, rate };
    }
    slots.refreshIdle(); // a non-biped lets its idle go
    return g;
  }

  /**
   * MW-PACE1: A BLOW'S PACE, said ahead. The machine has begun a strike and `blow` says when its hit lands and when
   * it is done; the wind-up runs at the rate that brings the playhead from "<type> start" through the release to its
   * "<type> hit" by `hitAt`, and each later section is re-fitted from where the arm stands when it begins (beginRelease,
   * beginFollow). Null - the record's pace - for a shot (the bow's hit waits for the arm's own "shoot release",
   * MW-D42), a held wind-up, or a schedule that says nothing.
   */
  function blowPace(blow, k) {
    if (!blow || ub.attackType === MW_SHOOT_ATTACK || ub.holdWindUp) return null;
    if (!(blow.hitAt > 0) || !(blow.seconds >= blow.hitAt) || !Number.isFinite(blow.seconds)) return null;
    const span = (a, b) => {
      const t0 = keyTime(a);
      const t1 = keyTime(b);
      return t0 >= 0 && t1 > t0 ? t1 - t0 : 0;
    };
    const toHit =
      (ub.actionState ? ub.actionState.stopTime - ub.actionState.startTime : 0) + span(k.release.start, k.release.stop);
    if (!(toHit > 0)) return null;
    return { seconds: blow.seconds, hitAt: blow.hitAt, clock: 0, rate: blowRate(toHit, blow.hitAt) };
  }

  /** character.cpp:1827-1829 - the end of Equipping, AttackEnd or
   *  Casting. The condition is reloadsItself's; see its header for why
   *  Daggerfall can never satisfy it. */
  function reloadCrossbow() {
    if (ctx.built() && ctx.built().ok && ctx.built().arrow && reloadsItself(ctx.built().mwType)) ub.arrowShown = true;
  }

  /** UPDATEWEAPONSTATE's tail, run once per frame: every transition here
   *  is "the section that was playing has finished". */
  function stepUpper() {
    const playing = !!(ub.actionState && ub.actionState.playing);
    if (playing) return;
    switch (ub.upper) {
      case UPPER_BODY.Drawing:
        ub.actionState = null;
        ub.actionSource = null;
        // MW-D28: attachArrow runs when Equipping OR AttackEnd finishes
        // (character.cpp:1824-1828) - the crossbow comes up LOADED, not
        // empty until the first shot's follow-through.
        reloadCrossbow();
        ub.upper = UPPER_BODY.Ready;
        if (ub.resetIdleOnAttackEnd) {
          ub.resetIdleOnAttackEnd = false;
          slots.resetIdle();
        }
        break;
      case UPPER_BODY.Stowing:
        // :1857-1859 - THIS is where the weapon type becomes None, and
        // with it the stance drops to the bare "idle" of rule 10's
        // endless loop.
        ub.actionState = null;
        ub.actionSource = null;
        ub.upper = UPPER_BODY.Rest;
        ub.sheathed = true;
        refreshWeaponGroup();
        slots.refreshIdle(true);
        break;
      case UPPER_BODY.Winding:
        // THE BOW HOLDS HERE and nothing else does. The reference leaves
        // AttackWindUp when getAttackingOrSpell() goes false - the button
        // came up - so a weapon the player cannot charge leaves it the
        // instant the wind-up section ends, at full strength. Daggerfall's
        // melee swing is exactly that: uncharged, so released at max.
        if (!ub.holdWindUp) beginRelease();
        break;
      case UPPER_BODY.Striking:
        beginFollow();
        break;
      case UPPER_BODY.Recovering:
        endAttack();
        break;
      case UPPER_BODY.Casting:
        // MW-D39: the cast's section finished - back to the stance, and
        // the idle replays from its start (the reference's own
        // resetCurrentIdleState on leaving an upper-body action).
        // AUDIT WORLD C2: the stance a sheathed caster came from is None.
        ub.actionState = null;
        ub.actionSource = null;
        ub.upper = ub.sheathed ? UPPER_BODY.Rest : UPPER_BODY.Ready;
        ub.attackType = null;
        if (ub.resetIdleOnAttackEnd) {
          ub.resetIdleOnAttackEnd = false;
          slots.resetIdle();
        }
        // MW-CAST1: the spell went while the hands still cast - the stance it left drops now, not mid-motion
        if (ub.unreadyAfterCast) {
          ub.unreadyAfterCast = false;
          ub.spellReady = false;
          refreshWeaponGroup();
          slots.resetIdle();
          slots.resetMovement();
        }
        break;
      default:
        if (ub.actionState) ub.actionState = null;
        break;
    }
  }

  return ub;
}
