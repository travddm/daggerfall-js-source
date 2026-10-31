// ROAD-H TAIL (2026-09-07) - the three items Wave H's missiles lane
// recorded and left: the enemy shaft's contact with the player is the
// player's CAPSULE (DaggerfallMissile.cs:339's SphereCast into the
// CharacterController), not a point 0.9 up; the flight raycast reaches
// `displacement.magnitude + ColliderRadius` (:333 builds it, :337-339
// cast it) along the
// normalised direction, so a crouch-dipped, non-unit direction (:583-585)
// lengthens the reach with it; and the dungeon archer takes BowDamage's
// two-arm split (EnemyAttack.cs:136-143) - it aims at its SELECTED target
// and the missile remembers that foe, as the exterior pool's has since
// MT-ii. Every pin here dies under the mutation that reverts its law.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ArrowFlight } from '../../src/combat/arrowFlight.js';
import { ARROW_FLIGHT_SPEED, MISSILE_COLLIDER_RADIUS, BODY_CAPSULE_RADIUS, PLAYER_BODY_RADIUS, missileReach, missileHitsCapsule } from '../../src/systems/spellcast.js';
import { CAPSULE_HEIGHT } from '../../src/player/motor.js';
import { createPlayerMagic } from '../../src/scenes/hostMagic.js';

const src = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const open = (raycast = () => Infinity) => new ArrowFlight({ getGpuMesh: () => null, collider: { raycast, heightAt: () => -100 } });
/** One step of a shaft's flight that is 1.25 units long. PIN MOVED (BAL-ARCHERY, bible/05-Combat/Balance-Arc.md
 *  section 18): a shaft flies at ARROW_FLIGHT_SPEED, so the fixtures' 0.05 s step (MISSILE_SPEED's 1.25) is read
 *  off the shaft's own speed - the geometry below stays as it was written. A spell (the magic hosts) is still MISSILE_SPEED. */
const STEP = 1.25 / ARROW_FLIGHT_SPEED;

test('ROAD-H tail: an enemy shaft meets the player CAPSULE at its LIVE height - a crouched player is a shorter target', () => {
  // The old law tested a point at feet + 0.9 against 0.45 + 0.45: a shaft
  // flying at y = 1.6 over a CROUCHED player (0.9 controller,
  // PlayerHeightChanger.cs:54-57) was 0.7 from that point and HIT. The
  // capsule of height 0.9 has its axis inset by the PLAYER's own radius
  // (AUDIT 65 CV-2: 0.35, PlayerAdvanced.prefab:82), so it runs
  // feet+0.35..feet+0.55 and the shaft is 1.05 above its crown against a
  // 0.45 + 0.35 reach - a MISS in DFU.
  const crouched = open();
  const hits = [];
  crouched.fire([0, 1.6, 0], [0, 0, 1], { enemy: true, shooterFoe: { id: 1 }, weapon: {} });
  for (let i = 0; i < 4; i++) crouched.update(STEP, { playerFeet: [0, 0, 5], playerHeight: 0.9, onPlayerHit: (m) => hits.push(m) });
  assert.equal(hits.length, 0, 'over a crouched player the shaft sails through (the capsule is 0.9 tall)');
  // the same shaft at a STANDING player (1.8): the axis runs 0.35..1.45,
  // the shaft at 1.6 is 0.15 from its top - a hit
  const standing = open();
  standing.fire([0, 1.6, 0], [0, 0, 1], { enemy: true, shooterFoe: { id: 1 }, weapon: {} });
  for (let i = 0; i < 4; i++) standing.update(STEP, { playerFeet: [0, 0, 5], playerHeight: 1.8, onPlayerHit: (m) => hits.push(m) });
  assert.equal(hits.length, 1, 'at a standing player the same shaft lands');
  // ...and the default height is the standing capsule for the bare
  // callers. REVIEW: a shaft at 1.6 only proves "tall enough to be
  // hit" - every default from about 1.6 up passes it, so it restated
  // the hit rather than pinning CAPSULE_HEIGHT's value. The default is
  // BRACKETED instead, at the exact height where a 1.8 capsule's reach
  // ends: the axis tops out at `h - r` and the contact band is
  // `MISSILE_COLLIDER_RADIUS + PLAYER_BODY_RADIUS`, so 1.8 reaches
  // 2.2500 and not a micron further. A shaft a tenth of a millimetre
  // UNDER that lands and one a tenth OVER it sails - which no other
  // default satisfies, in either direction.
  assert.equal(CAPSULE_HEIGHT, 1.8, 'the standing controller (PlayerMotor.controller.height)');
  const rim = CAPSULE_HEIGHT - PLAYER_BODY_RADIUS + MISSILE_COLLIDER_RADIUS + PLAYER_BODY_RADIUS;   // 2.25 - AUDIT 65 CV-2: the r cancels, but it is the PLAYER's r that does
  const bare = open();
  bare.fire([0, rim - 1e-4, 0], [0, 0, 1], { enemy: true, shooterFoe: { id: 1 }, weapon: {} });
  for (let i = 0; i < 4; i++) bare.update(STEP, { playerFeet: [0, 0, 5], onPlayerHit: (m) => hits.push(m) });
  assert.equal(hits.length, 2, 'no playerHeight given: the standing capsule reaches the rim');
  const over = open();
  over.fire([0, rim + 1e-4, 0], [0, 0, 1], { enemy: true, shooterFoe: { id: 1 }, weapon: {} });
  for (let i = 0; i < 4; i++) over.update(STEP, { playerFeet: [0, 0, 5], onPlayerHit: (m) => hits.push(m) });
  assert.equal(hits.length, 2, '...and not past it - the default is 1.8 itself, not merely "tall enough"');
});

test('ROAD-H tail: a shaft meets a FOE at its capsule, not at its centre - a tall foe is hit near its head', () => {
  // A 3.2 sprite (a giant) has its capsule centre at 1.6; the old law
  // MISSED a shaft at y = 2.9 (1.3 from the centre). DFU's SphereCast
  // meets the capsule's inner axis, which tops out at 3.2 - 0.45 = 2.75:
  // the shaft is 0.15 from it - a hit.
  const f = open();
  const landed = [];
  const giant = { ai: { feet: [0, 0, 5], height: 3.2 }, dead: false };
  f.fire([0, 2.9, 0], [0, 0, 1], { enemy: true, shooterFoe: { id: 9 }, weapon: {}, aimFoe: giant });   // loosed AT the giant (the :669 gate, below)
  for (let i = 0; i < 4; i++) f.update(STEP, { foeTargets: [{ feet: giant.ai.feet, ref: giant }], onFoeHit: (m, t) => landed.push(t) });
  assert.equal(landed.length, 1, 'the giant is struck near its head');
  assert.equal(landed[0], giant);
  // a RAT (1.0) under the same shaft: axis 0.45..0.55, the shaft 2.35 up - nothing
  const r = open();
  const rat = { ai: { feet: [0, 0, 5], height: 1.0 }, dead: false };
  r.fire([0, 2.9, 0], [0, 0, 1], { enemy: true, shooterFoe: { id: 9 }, weapon: {}, aimFoe: rat });
  for (let i = 0; i < 4; i++) r.update(STEP, { foeTargets: [{ feet: rat.ai.feet, ref: rat }], onFoeHit: (m, t) => landed.push(t) });
  assert.equal(landed.length, 1, 'and sails over a rat');
  // the one body: the flight's test IS spellcast's capsule test
  assert.equal(missileHitsCapsule([0, 2.9, 5], [0, 0, 5], 3.2), true);
  assert.equal(missileHitsCapsule([0, 2.9, 5], [0, 0, 5], 1.0), false);
});

test('ROAD-H tail: the flight reach is displacement.magnitude + ColliderRadius along the NORMALISED direction', () => {
  // DaggerfallMissile.cs:333/:337-339 - `displacement = direction * MovementSpeed
  // * fixedDeltaTime`, cast for `displacement.magnitude + ColliderRadius`
  // along `direction` (which Physics normalises). A crouch-dipped
  // direction (:583-585, +down*0.05 after the normalise) has magnitude
  // sqrt(1 + 0.0025); the reach grows with it and the ray is unit.
  const dt = 0.05, step = ARROW_FLIGHT_SPEED * dt;   // PIN MOVED (BAL-ARCHERY): a shaft's step is its own speed's
  const dipped = [0, -0.05, 1];
  const len = Math.hypot(0, -0.05, 1);
  const { unit, reach } = missileReach(dipped, step);
  assert.ok(Math.abs(reach - (step * len + MISSILE_COLLIDER_RADIUS)) < 1e-12, 'the reach carries |dir|');
  assert.ok(Math.abs(Math.hypot(...unit) - 1) < 1e-12, 'the ray is unit');
  assert.ok(Math.abs(unit[1] * len - dipped[1]) < 1e-12, 'and points where the dipped direction points');
  // a unit direction is handed back untouched (no allocation, no drift)
  const u = [0, 0, 1];
  assert.equal(missileReach(u, step).unit, u);
  assert.equal(missileReach(u, step).reach, step + MISSILE_COLLIDER_RADIUS);
  // and the three flights ask the collider for exactly that
  const asked = [];
  const a = open((pos, dir, max) => { asked.push({ dir: [...dir], max }); return Infinity; });
  a.fire([0, 1, 0], dipped, { enemy: true, shooterFoe: { id: 2 }, weapon: {} });
  a.update(dt, {});
  assert.equal(asked.length, 1);
  assert.ok(Math.abs(asked[0].max - reach) < 1e-12, 'arrowFlight casts for the scaled reach');
  assert.ok(Math.abs(Math.hypot(...asked[0].dir) - 1) < 1e-12, 'with a unit ray');
  // the position still advances by dir * step - the full, dipped vector (:293)
  assert.ok(Math.abs(a.arrows[0].pos[1] - (1 - 0.05 * step)) < 1e-12, 'the dip is flown, not renormalised away');
  for (const f of ['src/scenes/dungeonContext.js', 'src/scenes/hostMagic.js']) {
    const s = src(f);
    assert.match(s, /const \{ unit: _unit, reach \} = missileReach\(m\.dir, step\);\s*\/\/[^\n]*\n(?:\s*\/\/[^\n]*\n)?\s*const _len = [^\n]*\n\s*const _cs = flightStop\(collider, m\.pos, _unit, reach, step \* _len\);[^\n]*\n\s+const hitWall = _cs\.stop;\n\s+if \(Number\.isFinite\(hitWall\) && hitWall <= reach\) \{/,
      `${f}: the missile flight casts for the scaled reach along the unit ray`);   // AUDIT GROUND-BOLT C6: both flights take the one law, flightStop (below)
    assert.doesNotMatch(s, /raycast\(m\.pos, m\.dir, step \+ MISSILE_COLLIDER_RADIUS\)/, `${f}: no flight casts the bare step`);
    if (f === 'src/scenes/hostMagic.js') assert.match(s, /export function flightStop\(collider, pos, unit, reach, stepLen\) \{\n\s*const radius = reach - stepLen;\n\s*const cs = coverStep\(coverDistance\(collider, pos, unit, reach\), collider\.raycast\(pos, unit, reach\), reach, radius, stepLen\);/, 'flightStop: the wall at the step\'s whole reach along the unit ray, the radius the reach past the step (AUDIT GROUND-BOLT C6: the one law)');
    // REVIEW: ...and the WALL POINT is measured along the vector the
    // ray was actually cast along. The collider answers in its ray's
    // own parameter units (player/collider.js's rayTriangle returns
    // Moller-Trumbore's t for P = O + t*d, and the DDA's `walked` is
    // the same parameter), so once the ray became `_unit` the distance
    // became a WORLD distance - `m.pos + m.dir * hitWall` then
    // overshot the wall by a factor of |dir|. DFU stops the missile at
    // `direction.normalized * hitInfo.distance` (:347).
    assert.match(s, /const impact = \[m\.pos\[0\] \+ _unit\[0\] \* hitWall, m\.pos\[1\] \+ _unit\[1\] \* hitWall, m\.pos\[2\] \+ _unit\[2\] \* hitWall\]/,
      `${f}: the impact point rides the UNIT ray the collider was given`);
    assert.doesNotMatch(s, /const impact = \[m\.pos\[0\] \+ m\.dir\[0\] \* hitWall/,
      `${f}: and is not scaled a second time by |dir|`);
  }
});

// ───────────────────────────────────────────────────────────────────
// ROAD-H TAIL, THE REVIEW ROUND (2026-09-07)
//
// Four things the round's own pins did not hold: the THIRD ArrowFlight
// host never got the live height at all; the host wiring of that height
// was unpinned in the two that did; two of the four converted contact
// sites had no pin of any kind; and the dungeon's enemy shaft, once it
// could carry a foe target, became transparent to the player.
// ───────────────────────────────────────────────────────────────────

test('ROAD-H tail (review): ALL THREE ArrowFlight hosts feed the player\'s LIVE height beside its feet', () => {
  // THE FOUR-HOSTS RULE. `ArrowFlight.update` is mounted by three
  // hosts and the round wired `playerHeight` into two of them, so a
  // CROUCHING player inside a building was still a 1.8 target - the
  // very divergence the round says it closed, left standing in the
  // interior host. The flight's arithmetic was pinned; its PRODUCERS
  // were not, so deleting or constant-folding either of the two that
  // had it was green. Both halves are held here.
  for (const [f, name] of [
    ['src/scenes/world.js', 'arrows'],
    ['src/scenes/exterior.js', 'arrows'],
    ['src/scenes/worldModes.js', 'interiorArrows'],
  ]) {
    const s = src(f);
    const at = Math.max(s.indexOf(`${name}.update(dt, {`), s.indexOf(`${name}.update(foeDt, {`));   // AUDIT (pre-merge) P6: world.js's on the quest box's held clock
    assert.notEqual(at, -1, `${f}: ${name}.update is no longer the flight's tick`);
    assert.match(s.slice(at, at + 400), /playerFeet: [^\n]*\n\s*playerHeight: player\.height,/,
      `${f}: the flight is handed the LIVE capsule (player.height), not the standing constant`);
  }
});

test('ROAD-H tail (review): the player\'s OWN spell missile meets a foe at its CAPSULE, and the dungeon\'s shaft reads the same one law', () => {
  // Of the four sites the round moved onto missileHitsCapsule /
  // missileHitsFoe, only the shared flight's two were pinned by
  // behaviour: the player's shaft against a foe (dungeonContext) and
  // the player's spell against a foe (hostMagic) could both be reverted
  // in place to the pre-round capsule-CENTRE point and the suite stayed
  // green. The spell one is driven for real here.
  const player = {
    isPlayer: true, level: 1, health: 50, maxHealth: 50, magicka: 500, maxMagicka: 500,
    skills: new Array(40).fill(50), skillUses: new Array(40).fill(0),
    stats: { intelligence: 50, willpower: 50, endurance: 50 }, career: {}, activeEffects: [],
  };
  const mkFoe = (height) => ({
    dead: false, ai: { feet: [0, 0, 5], height },
    entity: {
      level: 1, health: 40, maxHealth: 40, magicka: 0, maxMagicka: 0,
      skills: new Array(40).fill(30), stats: { willpower: 30 }, career: {}, activeEffects: [],
    },
  });
  const rig = (foe) => {
    const hurt = { n: 0 };
    const magic = createPlayerMagic({
      renderer: { createBillboardBatch: () => ({ origin: null }), destroyBillboardBatch: () => {} },
      audio: { playOneShot() {}, play3d() {}, playOneShotId() {}, play3dId() {} },
      getTexture: async () => ({ getSize: () => [16, 16], getScale: () => [0, 0] }),
      uploadRecord() {}, uploadRecordFrame() {},
      collider: { raycast: () => Infinity },
      playerEntity: player,
      playerSinks: { hurt() {}, heal() {}, drainMagicka() {}, restoreMagicka() {}, drainFatigue() {}, restoreFatigue() {}, say: () => {} },
      say: () => {},
      surfacePlayer() {},
      foes: () => [foe],
      foeSinks: () => ({ hurt: (n) => { hurt.n += n; }, heal() {}, drainMagicka() {}, restoreMagicka() {}, drainFatigue() {}, restoreFatigue() {} }),
      absorbCtx: () => ({ inside: true, day: false }),
      rolls: () => 0.99,
    });
    return { magic, hurt };
  };
  const spell = {
    name: 'Bolt', index: 92, element: 0, rangeType: 2,
    effects: [{ type: 4, subType: 0, magnitudeBaseLow: 20, magnitudeBaseHigh: 20, magnitudeLevelBase: 0, magnitudeLevelHigh: 0, magnitudePerLevel: 1, durationBase: 0, durationMod: 0, durationPerLevel: 1, chanceBase: 0, chanceMod: 0, chancePerLevel: 1 }],
  };
  // A 3.2 giant, the bolt level with the player's eye at 2.9: the
  // capsule's inner axis tops out at 2.75, so the bolt is 0.15 from it
  // - a hit. Its CENTRE is 1.6, and the point law that stood here was
  // 1.3 away: a miss. Mutate hostMagic's contact back to the centre and
  // this assertion is what fails.
  const giant = rig(mkFoe(3.2));
  giant.magic.readySpell(spell);
  assert.equal(giant.magic.castInput([0, 2.9, 0], [0, 0, 1]), true, 'the bolt is loosed');
  for (let i = 0; i < 4; i++) giant.magic.update(0.05, [0, 0, 0], [0, 0, 1], CAPSULE_HEIGHT);
  assert.ok(giant.hurt.n > 0, 'the giant is struck near its head, where DFU\'s SphereCast meets its capsule');
  // ...and a RAT (1.0) under the same bolt is not: axis 0.45..0.55.
  const rat = rig(mkFoe(1.0));
  rat.magic.readySpell(spell);
  assert.equal(rat.magic.castInput([0, 2.9, 0], [0, 0, 1]), true);
  for (let i = 0; i < 4; i++) rat.magic.update(0.05, [0, 0, 0], [0, 0, 1], CAPSULE_HEIGHT);
  assert.equal(rat.hurt.n, 0, 'and the same bolt sails over a rat - the height is read, not assumed');
});

