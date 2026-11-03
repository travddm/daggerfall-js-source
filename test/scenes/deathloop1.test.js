// DEATHLOOP1. Two Discord reports, one law:
//
//   SquidKamer: "Respawn after poison and likely disease and other
//   things can cause a deathloop. Probably should do something about
//   that. Its basically permanent death for your character."
//
//   trashBattery: "Dying while falling with guards nearby to arrest you
//   will place you in a deathloop once your jail sentence ends. You
//   cannot access a menu while in this mode. The only way to stop the
//   game now is to force-kill the process."
//
// MAC-D3 fixed the ORDER of the revival - the heal moved to the top so
// no frame could see a dead player with no death screen. This is the
// other half: the health came back and THE CAUSE DID NOT GO AWAY. A
// poisoned character wakes at half health and the poison empties it
// again in seconds.
//
// THE LOOP IS WHAT IS DRIVEN HERE, not the wiring. A pin that read
// "reviveForPlay is called" would have passed against the shipped bug
// just as happily, because the shipped bug called a heal too. So the
// pins below run the revival and then TICK, and require the player to
// still be alive on the other side.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reviveForPlay, endLethalDrains, LETHAL_DRAINS, respawnHealth } from '../../src/systems/deathRespawn.js';
import { hostText } from '../hostText.mjs';   // HOST-SPLIT 2 (AUDIT, the second read): its negatives read the host whole

const player = (over = {}) => ({ maxHealth: 40, health: 0, activeEffects: [], ...over });

test('DEATHLOOP1: a revival ends the drains that were emptying the bar', () => {
  const p = player({ activeEffects: [
    { kind: 'poison', poisonType: 3 },
    { kind: 'continuousDamage', magnitude: 5 },
    { kind: 'transferHealth', magnitude: 2 },
  ] });
  const out = reviveForPlay(p, { force: true });

  assert.equal(p.health, respawnHealth(40), 'the health comes back');
  assert.deepEqual(out.cleared.sort(), [...LETHAL_DRAINS].sort(), 'and every fast drain is named as cleared');
  assert.deepEqual(p.activeEffects, [], 'and actually gone from the entity');

  // THE LOOP ITSELF. Stand in for the round tick: every drain still on
  // the entity takes its bite. Before the fix this reached 0 and the
  // respawn would run again - for ever.
  let health = p.health;
  for (let round = 0; round < 12; round++) {
    for (const e of p.activeEffects) if (LETHAL_DRAINS.includes(e.kind)) health -= (e.magnitude ?? 5);
  }
  assert.ok(health > 0, 'and the player is still alive twelve rounds later');
});

test('DEATHLOOP1: a disease is KEPT - curing it would be the cheapest cure in the game (its stat hold is eased: DISC24-D)', () => {
  // Diseases fall once per CLASSIC DAY (systems/diseases.js, the HEA
  // column through `sinks.hurt`), so half of max health is days of
  // walking - enough to reach the temple that cures them. (Their STAT
  // damage can hold a stat at zero, which kills every 0.2 seconds -
  // that one DID loop, and the revival eases it: test/disc24d_stat_
  // zero_loop.test.js. The entry itself stays, as here.) And
  // vampirism and lycanthropy are carried as `kind: 'disease'`
  // (systems/infection.js), so a blanket cure here would let a player
  // shake an infection by dying on purpose, for free, at a graveyard.
  const p = player({ activeEffects: [
    { kind: 'disease', disease: 7 },
    { kind: 'disease', disease: 30, infection: 'vampirism' },
    { kind: 'poison', poisonType: 3 },
  ] });
  const out = reviveForPlay(p, { force: true });

  assert.deepEqual(out.cleared, ['poison'], 'only the fast drain goes');
  assert.equal(p.activeEffects.length, 2, 'both diseases stay');
  assert.ok(p.activeEffects.every((e) => e.kind === 'disease'), 'and they are the diseases');
  assert.ok(p.activeEffects.some((e) => e.infection === 'vampirism'),
    'an infection survives a death - it is a timer, not a wound');

  // Paralysis is not a DRAIN - it cannot be the thing that re-kills. It
  // is ended all the same, on its own list (FIELD BUGS 2026-10-05
  // DEATH-HOLDS, test/systems/fb1005_deathholds.test.js): it does not wear off
  // across a death, and it froze the revived beside their killer.
  assert.ok(!LETHAL_DRAINS.includes('paralyze'), 'paralysis is not a drain');
  assert.ok(!LETHAL_DRAINS.includes('disease'), 'nor is a disease');
});

test('DEATHLOOP1: the floor only lifts the dead - a revival is not a free heal', () => {
  // trashBattery's release takes this arm: online a served sentence
  // refills nothing (AUDIT WORLD5 C9), and C9 was right about the free
  // heal. What it must not do is let anybody out DEAD.
  const hurt = player({ health: 3 });
  const out = reviveForPlay(hurt);
  assert.equal(hurt.health, 3, 'a living player keeps the health they walked in with');
  assert.equal(out.revived, false, 'and is not reported as revived');

  const dead = player({ health: 0 });
  assert.equal(reviveForPlay(dead).revived, true, 'a dead one is lifted');
  assert.ok(dead.health > 0, 'to a living number');

  const negative = player({ health: -25 });   // a fall does this
  reviveForPlay(negative);
  assert.ok(negative.health > 0, 'however far below zero the blow took them');

  // MAC-D3's own lesson, still held: a health no comparison can satisfy
  // is neither alive nor dead.
  const broken = player({ maxHealth: undefined, health: 0 });
  reviveForPlay(broken);
  assert.ok(Number.isFinite(broken.health) && broken.health > 0, 'and never NaN');
});

test('DEATHLOOP1: endLethalDrains reports only what it actually removed', () => {
  const clean = player({ activeEffects: [{ kind: 'shield' }, { kind: 'regenerate' }] });
  assert.deepEqual(endLethalDrains(clean), [], 'nothing to clear says nothing');
  assert.equal(clean.activeEffects.length, 2, 'and clears nothing');
  assert.deepEqual(endLethalDrains({}), [], 'an entity with no effect list is not a throw');
  assert.deepEqual(endLethalDrains(null), [], 'nor is no entity at all');
});

// ── DEATHLOOP2: THE WAILING IS THE DEATH SOUND, ONE PER LOOP ─────
//
// DragynDance on Discord: "do you know why my game keeps
// spamming a wailing sound at me?", alongside "I almost died in
// privateers hold due to freezing to death" and "as soon as I stepped
// outside my health bar started draaaaining".
//
// PlayerDeathSequence plays the character's own Pain3 in its
// CONSTRUCTOR, and every host builds a fresh DeathScreen each time
// death is raised. All four hosts are already guarded against STACKING
// one screen over another, so the repeat is not that - it is the loop
// turning, once per wail, with the survival notices behind it.
//
// DEATHLOOP1 closed the effect half and stopped there. The cold is not
// an effect: it is computed fresh each tick from climate, month, hour,
// weather, clothing, WETNESS and race, and its harm is deliberately
// lethal. That lethality stays. The loop does not.
test('DEATHLOOP2: a revival clears the exposure that would re-kill on the next tick', async () => {
  const { reviveForPlay, endLethalExposure, REVIVED_SURVIVAL_RESET } = await import('../../src/systems/deathRespawn.js');

  const frozen = { maxHealth: 40, health: 0, activeEffects: [{ kind: 'poison' }],
    survival: { exposure: 600, wet: 300, thirst: 120, sleepDebt: 400, lastAte: -900 } };
  const out = reviveForPlay(frozen, { force: true });

  assert.deepEqual(out.cleared, ['poison'], 'the effect half still runs');
  assert.deepEqual(out.exposure.sort(), ['exposure', 'wet'], 'and the exposure half is reported');
  assert.equal(frozen.survival.exposure, 0, 'the accumulated cold is off the character');
  assert.equal(frozen.survival.wet, 0, 'and so is the soaking that was defeating the clothes');

  // THE NEEDS THEMSELVES SURVIVE. This is not a free meal, a free
  // drink or a night's sleep - a revived character is still hungry,
  // thirsty and tired, and has to deal with that. Only the two fields
  // that carry the KILLING TICK across the revival are reset.
  assert.equal(frozen.survival.thirst, 120, 'still thirsty');
  assert.equal(frozen.survival.sleepDebt, 400, 'still short of sleep');
  assert.equal(frozen.survival.lastAte, -900, 'still hungry');
  assert.deepEqual(Object.keys(REVIVED_SURVIVAL_RESET).sort(), ['exposure', 'wet'],
    'and the reset list is those two and nothing else');

  // ...and it reports what it CHANGED, not what it looked at. A
  // character who was dry and unexposed when something else killed
  // them has no exposure to clear, and saying otherwise would put the
  // cold in a report it had nothing to do with.
  const dry = { maxHealth: 40, health: 0, activeEffects: [], survival: { exposure: 0, wet: 0, thirst: 10 } };
  assert.deepEqual(endLethalExposure(dry), [], 'nothing to clear reports nothing');
  const damp = { maxHealth: 40, health: 0, activeEffects: [], survival: { exposure: 0, wet: 120 } };
  assert.deepEqual(endLethalExposure(damp), ['wet'], 'and only the field that moved');
  assert.deepEqual(endLethalExposure({}), [], 'an entity with no record is not a throw');
  assert.deepEqual(endLethalExposure(null), [], 'nor is no entity');
});

