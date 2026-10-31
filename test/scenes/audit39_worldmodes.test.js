// AUDIT 39 - the MODAL host (src/scenes/worldModes.js) and the arrow
// flight the three non-dungeon hosts share.
//
// The shape the audit found here twice over: one arm of a pair wired
// and the other not. The dungeon arm gated its movers under an open
// window and the interior arm did not; the enemy arrow hunted and the
// player arrow flew through everything; the exterior transitions
// notified the talk session and the dungeon entry notified nothing;
// three hosts told the HUD the cursor was free and the fourth stayed
// silent. Each pin below is the missing half.
import '../modsOff.js';   // MO1: this suite pins Daggerfall Unity's own numbers - the game without its mods
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ArrowFlight, playerArrowHitFoe } from '../../src/combat/arrowFlight.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (f) => readFileSync(join(ROOT, f), 'utf8');

// ---------------------------------------------------------------
// #28 - the outer host's window pauses the modal frame
// ---------------------------------------------------------------

// ---------------------------------------------------------------
// #29 - an aborted dungeon transition must leave nothing behind
// ---------------------------------------------------------------

// ---------------------------------------------------------------
// #31 - the sixth TalkManager subscription
// ---------------------------------------------------------------

// ---------------------------------------------------------------
// #32 - the scene cache carries a door's POSE and lock, not a word
// ---------------------------------------------------------------

// ---------------------------------------------------------------
// #33 / #34 - a paused game advances no movers and no swing
// ---------------------------------------------------------------

// ---------------------------------------------------------------
// #36 - PlayerDeath's camera sink in a world-hosted dungeon
// ---------------------------------------------------------------

// ---------------------------------------------------------------
// #39 - the interior foe pool gets its spells
// ---------------------------------------------------------------

// ---------------------------------------------------------------
// #64 / #65 - the arrow that LANDS
// ---------------------------------------------------------------

test('AUDIT39 #64: a PLAYER arrow now hunts the foe list, through its own impact seam', () => {
  const f = new ArrowFlight({ getGpuMesh: () => null, collider: null });
  f.fire([0, 0.9, 0], [0, 0, 1], { fromPlayer: true, weapon: { name: 'Long Bow' } });
  const hits = [];
  f.update(0.05, {
    foeTargets: [{ feet: [0, 0, 1.5], ref: { id: 'bear' } }],
    onFoeHit: () => hits.push('ENEMY ARM'),
    onPlayerArrowHitFoe: (m, t) => hits.push([m.weapon.name, t.id]),
  });
  assert.deepEqual(hits, [['Long Bow', 'bear']], 'the shooter decides the arm, not a flag on one side of it');
  assert.equal(f.arrows[0].dead, true, 'the landed arrow is spent');
});

test('AUDIT39 #64: a player arrow still cannot hit the PLAYER, and an unmarked shaft lands nothing', () => {
  const f = new ArrowFlight({ getGpuMesh: () => null, collider: null });
  f.fire([0, 0.9, 0], [0, 0, 1], { fromPlayer: true, weapon: {} });
  f.fire([0, 0.9, 0], [0, 0, 1], {});   // neither marker
  const log = [];
  f.update(0.05, {
    playerFeet: [0, 0, 1.5],
    onPlayerHit: () => log.push('player'),
    foeTargets: [{ feet: [0, 0, 1.5], ref: { id: 'bear' } }],
    onFoeHit: () => log.push('enemyArm'),
    onPlayerArrowHitFoe: () => log.push('playerArm'),
  });
  assert.deepEqual(log, ['playerArm'], 'the player arm is the only one a player shaft can take');
});

test('AUDIT39 #64: the impact recovers the arrow whatever the damage, and never writes health itself', () => {
  // A too-low weapon material is CalculateAttackDamage's deterministic
  // zero (FormulaHelper.cs:576-583), so this exercises BowDamage's
  // recoverable-arrow line without rolling dice.
  const foe = { entity: { minMetalToHit: 5, items: [] }, ai: { feet: [0, 0, 0], yaw: 0 } };
  const dealt = [];
  const said = [];
  const dmg = playerArrowHitFoe(
    { weapon: { material: 0 }, pos: [0, 1, 0], dir: [0, 0, 1] }, foe,
    { playerEntity: { isPlayer: true }, playerFeet: [0, 0, -1], dealDamage: (f, d) => dealt.push(d), say: (l) => said.push(l), rolls: () => 0 });   // PIN MOVED (ARROW-LODGE): the shaft survives its strike - under ARROW_LODGE_CHANCE
  assert.equal(dmg, 0);
  assert.deepEqual(dealt, [], 'no damage, no door - the pool owns the death chain');
  assert.equal(foe.entity.items.length, 1, 'the arrow is recoverable from the TARGET, damage or not');
  assert.equal(foe.entity.items[0].templateIndex, 131);
  assert.ok(said.length, 'and the player is told the material was ineffective');
  // a dead foe is no target
  assert.equal(playerArrowHitFoe({ pos: [0, 0, 0], dir: [0, 0, 1] }, { dead: true }, {}), 0);
});

// AUDIT 39r R13 ADDED THE POSITIVE-DAMAGE HALF. Every #64 pin above is
// either a stub callback or a shot engineered to return 0 at
// CalculateAttackDamage's material gate (FormulaHelper.cs:576-583),
// which returns BEFORE damageMod/toHitMod/backstabChance are read - so
// the module's actual claim was unpinned and those three arguments
// could be deleted with the suite green. DaggerfallMissile.cs:678-688
// routes a player arrow into WeaponManager.WeaponDamage(LastBowUsed,
// true, ...), the SAME CalculateAttackDamage a melee swing runs, so
// the swing modifiers and the backstab chance apply to a shot.
//
// The roll stream is the one backstab.test.js measured: [struck,
// crit(fail), hitRoll, damageRoll, backstabRoll], cycling.
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };
const shotFoe = () => ({
  entity: {
    minMetalToHit: -1, armorValues: [0, 0, 0, 0, 0, 0, 0], items: [],
    basics: { bloodIndex: 2 }, isClass: false, careerIndex: 0, skills: 0,
    maxHealth: 30, health: 30, stats: { strength: 50, agility: 50, luck: 50 },
  },
  ai: { feet: [0, 0, 0], yaw: 0 },
});
const SHOOTER = () => ({ isPlayer: true, level: 1, skills: 30, skillUses: [], stats: { strength: 50, agility: 50, luck: 50 } });
const LONG_BOW = () => ({ templateIndex: 130, material: 0, poisonType: -1 });
/** One shot; returns [damage, the ordered payload log]. */
const shoot = (opts, rolls) => {
  const foe = shotFoe(); const log = [];
  const dmg = playerArrowHitFoe({ weapon: LONG_BOW(), pos: [1, 2, 3], dir: [0, 0, 1] }, foe, {
    playerEntity: SHOOTER(),
    dealDamage: (f, d) => log.push(['deal', d]),
    audio: { play3d: () => log.push('sound') },
    hitEffects: { showBloodSplash: (b) => log.push(['blood', b]) },
    say: () => {},
    rolls, ...opts,
  });
  return [dmg, log];
};

test('AUDIT39 #64: a LANDED arrow runs the melee ladder - the swing mods and the backstab ride it', () => {
  // the plain shot, facing the foe, no screen weapon out
  const [plain, log] = shoot({ playerFeet: [0, 0, 5] }, seq(0, 0.99, 0.05, 0.999, 0.99));
  assert.equal(plain, 18, 'Long Bow max, str bonus, iron: the weapon ladder ran');   // PIN MOVED (BAL-ARCHERY, Balance-Arc.md section 18): the Long Bow's top is 19, so 17 is 18 throughout
  // and the payload rings in DFU's order - sound and splash BEFORE the
  // pool's damage door, which is the only thing that writes health
  assert.deepEqual(log, ['sound', ['blood', 2], ['deal', 18]],
    'hit sound, then the splash, then dealDamage - and nothing else touches health');

  // SWING_MODS[playerWeapon.machine.state], read live at impact:
  // StrikeUp is damage -4 / toHit +10, StrikeDown is +4 / -10. The
  // damage half moves the number; the to-hit half moves the HIT.
  assert.equal(shoot({ playerFeet: [0, 0, 5], playerWeapon: { machine: { state: 'StrikeUp' } } },
    seq(0, 0.99, 0.05, 0.999, 0.99))[0], 14, 'StrikeUp\'s -4 damageMod');
  assert.deepEqual(shoot({ playerFeet: [0, 0, 5], playerWeapon: { machine: { state: 'StrikeDown' } } },
    seq(0, 0.99, 0.05, 0.999, 0.99)), [0, []],
    'StrikeDown\'s -10 toHitMod turns the same roll into a MISS - no sound, no splash, no damage');

  // backstabChanceOf(playerEntity, isBackFacing(...)): the foe faces
  // +Z, so a shooter at -Z is behind it. The x3 rides the post-calc
  // roll (.10 against a Backstabbing skill of 30).
  assert.equal(shoot({ playerFeet: [0, 0, -5] }, seq(0, 0.99, 0.05, 0.999, 0.10))[0], 54,
    'shot in the back: 18 x3');
  assert.equal(shoot({ playerFeet: [0, 0, 5] }, seq(0, 0.99, 0.05, 0.999, 0.10))[0], 18,
    'the same roll from the FRONT never triples - backstabChance is 0 there');
  assert.equal(shoot({}, seq(0, 0.99, 0.05, 0.999, 0.10))[0], 18,
    'and a host that hands in no playerFeet cannot backstab at all');
});

// ---------------------------------------------------------------
// #108 - StartNewConversation on the static-NPC door
// ---------------------------------------------------------------

// ---------------------------------------------------------------
// #132 - the interior HUD is told the pointer is free
// ---------------------------------------------------------------

// ---------------------------------------------------------------
// #164 - a deferred building entry is not a crash
// ---------------------------------------------------------------

// ---------------------------------------------------------------
// AUDIT 39r (R16) - #64's header claimed the missile's own position
// was DFU's impactPosition, "the one place these hosts hold the real
// hit point rather than the body centre", and splashed at the arrow
// tip on that reading. AssignBowDamageToTarget passes
// `hitTransform.position` (DaggerfallMissile.cs:679-687) - the struck
// entity's transform origin; only the MELEE callers pass a contact
// point (WeaponManager.cs:1054 ClosestPoint, :1068 hit.point), and
// WeaponManager.cs:568-571 hands whichever it got to ShowBloodSplash.
// AUDIT 62 F20: and that transform origin is NOT the foe's feet - the
// DaggerfallEnemy prefab centres its controller on the transform
// (m_Center 0) and SetupDemoEnemy.cs:98-115 moves only
// controller.center, so it is the idle sprite's CENTRE, feet +
// centreOffset. This pin used to assert the bare feet with a foe that
// carried no offset to tell the two apart.
// ---------------------------------------------------------------

test('AUDIT39r R16: a player arrow bleeds its TARGET, not its own tip', () => {
  const foe = {
    entity: { isPlayer: false, level: 1, skills: 0, stats: { agility: 0, luck: 0 }, armor: 0, items: [], basics: { bloodIndex: 2 } },
    // a big flyer: idle sprite 3.2, capsule halved to 1.6, transform 1.6
    // up - an offset that is neither zero nor half the capsule, so the
    // pin dies under a revert to either.
    ai: { feet: [3, 0, 4], yaw: 0, height: 1.6, centreOffset: 1.6 },
  };
  const splashes = [];
  const dmg = playerArrowHitFoe(
    { weapon: null, pos: [0, 1, 0], dir: [0, 0, 1] }, foe,
    {
      playerEntity: { isPlayer: true, level: 20, skills: 100, stats: { strength: 100, agility: 100, luck: 100 } },
      playerFeet: [0, 0, -1], dealDamage: () => {}, rolls: () => 0.5,
      hitEffects: { showBloodSplash: (i, p) => splashes.push([i, p]) },
    });
  assert.ok(dmg > 0, 'the shot landed');
  assert.equal(splashes.length, 1);
  assert.equal(splashes[0][0], 2, 'MobileEnemy.BloodIndex');
  assert.deepEqual(splashes[0][1], [3, 1.6, 4], 'hitTransform.position - the target\'s TRANSFORM, feet + centreOffset');
  assert.notDeepEqual(splashes[0][1], [3, 0, 4], 'not its feet');
});

// ── FOE1: THE OPTS A CALL REALLY PASSES ──────────────────────────
// (2026-09-15, Mac relaying players: "during online play, certain
// enemies cant be damaged".)
//
// THE BUG WAS A COMMENT. HT1 appended `// HT1: the torch keys` to the
// end of the physical line that already carried
// `onFoeHit: (hit) => host.onFoeHit?.(hit),` in the
// buildDungeonContext opts - so the property went into the comment and
// out of the object. `opts.onFoeHit?.()` is the ONLY way a joiner's
// blow on a layout foe reaches the room's host: `damageFoe`'s
// non-authority arm sends and RETURNS, applying nothing locally. So
// every layout foe in every online dungeon absorbed every blow from
// everyone but the authority, in silence, for eight slices - which is
// exactly the report, because the foes at indices past the layout
// (quest foes, summons, rest encounters) take the local path and died
// normally beside them.
//
// WHY THIS PIN IS SHAPED LIKE THIS: a text match over the file would
// have passed throughout - the characters `onFoeHit: (hit) => ...`
// were right there on the line. The comments are STRIPPED first, so a
// property that has been commented out is a property that is gone. It
// reads the whole opts object rather than the one line, so the next
// swallowed property is caught by the same pin.
/** The source of `name(...)`'s call, comments removed. */
function callSourceStripped(text, name) {
  const at = text.indexOf(`${name}(`);
  assert.ok(at >= 0, `${name} is called`);
  let depth = 0;
  let end = at;
  for (let i = text.indexOf('(', at); i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') { depth--; if (depth === 0) { end = i; break; } }
  }
  return text.slice(at, end + 1)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');
}

