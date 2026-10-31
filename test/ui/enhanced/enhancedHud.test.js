// PX30 - THE GAMEPLAY HUD, in the pixel language.
//
// Mac's reference is ESO's Clean UI: a compass across the top, the
// target named beneath it, three vitals along the bottom and the
// effects under those.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compassPlace, COMPASS_POINTS, COMPASS_SPAN } from '../../../src/ui/enhanced/enhancedHud.js';
import { markFoeStruck, foeTarget, foeTargetRef, tickFoeTarget, clearFoeTarget, FOE_TARGET_SECONDS } from '../../../src/ui/hud/hudFoeTarget.js';

const read = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');

test('PX30 compass: the shortest way round, and off the strip is HIDDEN', () => {
  // A point at 0.98 is just LEFT of a player facing 0.02, not most of
  // a turn to the right - the wrap is the whole geometry here.
  assert.ok(Math.abs(compassPlace(0, 0.02) - 0.42) < 0.01, 'north sits just left of centre');
  assert.equal(compassPlace(0.02, 0.02), 0.5, 'dead ahead is the middle');
  assert.ok(Math.abs(compassPlace(0.98, 0.02) - 0.34) < 0.01, 'and 0.98 is LEFT, not right');
  // Off the visible span is NULL, never clamped: a marker pinned to the
  // rim says "north is exactly there", which is a lie.
  assert.equal(compassPlace(0.5, 0.02), null, 'south is behind you and not drawn');
  assert.equal(compassPlace(0.25, 0), null, 'east, a quarter turn away, is off a quarter-turn strip');
  // The edges are inclusive and symmetric.
  assert.equal(compassPlace(COMPASS_SPAN / 2, 0), 1);
  assert.equal(compassPlace(-COMPASS_SPAN / 2, 0), 0);
  assert.equal(COMPASS_POINTS.length, 8, 'eight points, the circle a player turns through');
  assert.deepEqual(COMPASS_POINTS.map(([l]) => l), ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']);
});

test('PX30 target: the blow you landed, and it FADES', () => {
  // Daggerfall tells you nothing about a foe's health, ever - this is a
  // DEPARTURE, and its source is the strike rather than the reticle,
  // because a reticle target wants a foe raycast every frame for an
  // answer the player only wants while fighting.
  clearFoeTarget();
  assert.equal(foeTarget(), null);
  const foe = { entity: { name: 'Grizzly Bear', health: 30, maxHealth: 50 } };
  markFoeStruck(foe, { fromPlayer: false });
  assert.equal(foeTarget(), null, 'a foe hitting ANOTHER foe is not your target');
  markFoeStruck(foe, { fromPlayer: true });
  // PIN MOVED (TELL9: the poise track rides the read - null for a foe with no brain, none drawn)
  assert.deepEqual({ ...foeTarget(), fade: 1 }, { name: 'Grizzly Bear', health: 30, maxHealth: 50, fade: 1, poise: null, traits: [], rules: [], ward: 0 });   // PIN MOVED - AUDIT WORLD-EVENTS L5-6: the traits' rules beside their words   // BOSS-TRAITS (PIN MOVED): its traits' words and its ward - none here
  // It goes. A bar that never leaves is furniture.
  tickFoeTarget(FOE_TARGET_SECONDS - 1);
  assert.ok(foeTarget(), 'still there a second before its time');
  assert.ok(foeTarget().fade < 1, 'and fading');
  tickFoeTarget(2);
  assert.equal(foeTarget(), null);
  // A dead thing has no health to report.
  markFoeStruck(foe, { fromPlayer: true });
  foe.dead = true;
  assert.equal(foeTarget(), null);
  clearFoeTarget();
});

test('AUDIT 39: every host that draws a HUD fills the two hands', () => {
  // "A host that knows neither passes neither" was true of all FOUR of
  // them: PX30b built the plaques, hud.js forwarded the keys, and no
  // drawHud call site ever supplied one - so both were permanently
  // display:none in the played game, which is a drawn door with a
  // stylesheet block behind it. Every host had both values one
  // argument over from the weaponSheathed it already passed.
  // PIN MOVED (TWO-HANDS AUDIT): the plaque reads the rig's RESTING weapon - the lead's in a pair, never the off hand's
  // item for the length of its blow (playerWeapon.js restingWeapon); one hand's is its weapon, as before
  const hosts = {
    'src/scenes/world.js': 'weaponRig.playerWeapon.restingWeapon',
    'src/scenes/exterior.js': 'weaponRig.playerWeapon.restingWeapon',
    'src/scenes/worldModes.js': 'interiorWeapon.playerWeapon.restingWeapon',
    'src/scenes/dungeonContext.js': 'playerWeapon.restingWeapon',
  };
  for (const [f, rig] of Object.entries(hosts)) {
    const src = read(f);
    const at = src.indexOf('drawHud(renderer, canvas, hudArt');
    assert.ok(at > 0, `${f} draws no HUD`);
    // the bag ends at the call's own closing brace
    const bag = src.slice(at, src.indexOf('});', at));
    assert.match(bag, /readied: magic[?.]*\.readied[?.]*\(\) \?\? null,/, `${f} hands over no readied spell`);
    assert.ok(bag.includes(`weapon: ${rig} ?? null,`), `${f} hands over no held weapon`);
    // and the rig it reads is the SAME one weaponSheathed comes off,
    // which is what stops a host reading two different weapons.
    assert.ok(bag.includes(`${rig.replace(/\.restingWeapon$/, '')}.sheathed`), `${f} reads two rigs`);
  }
});

test('VB2: the lost chunk holds, then drains to the bar - and a gain snaps it', async () => {
  const { stepGhost, GHOST_HOLD, GHOST_RATE } = await import('../../../src/ui/enhanced/enhancedHud.js');
  let g = stepGhost(null, 80, 0);
  assert.deepEqual([g.at, g.pct], [80, 80], 'the first frame has nothing lost');
  g = stepGhost(g, 50, 0.016);
  assert.equal(g.at, 80, 'a hit leaves the chunk where the bar was');
  assert.equal(g.hold, GHOST_HOLD);
  g = stepGhost(g, 50, GHOST_HOLD + 0.01);
  g = stepGhost(g, 50, 0.1);
  assert.equal(g.at, 80 - GHOST_RATE * 0.1, 'then it drains');
  for (let i = 0; i < 100; i++) g = stepGhost(g, 50, 0.1);
  assert.equal(g.at, 50, 'and never past the bar');
  g = stepGhost(g, 90, 0.016);
  assert.equal(g.at, 90, 'a gain snaps it - nothing was lost');
});

test('FRAME1b: the foe bar knows WHICH foe, not just its name - two rats are two foes', () => {
  clearFoeTarget();
  assert.equal(foeTargetRef(), null);
  const a = { entity: { name: 'Rat', health: 40, maxHealth: 100 } };
  const b = { entity: { name: 'Rat', health: 85, maxHealth: 100 } };
  markFoeStruck(a, { fromPlayer: true });
  assert.equal(foeTargetRef(), a.entity);
  markFoeStruck(b, { fromPlayer: true });
  assert.equal(foeTarget().name, 'Rat');
  assert.equal(foeTargetRef(), b.entity, 'same name, different foe');
  b.dead = true;
  assert.equal(foeTargetRef(), null);
  clearFoeTarget();
});
