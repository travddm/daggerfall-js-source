// X3-slice: exterior enemy CASTING - the ONE cast executor
// (characters/enemy/enemyCasting.js) + the pool/engine wiring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { castEnemySpell } from '../../../src/characters/enemy/enemyCasting.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const src = (f) => readFileSync(join(root, f), 'utf8');

// AUDIT 62 F21: a DISCRIMINATING rig. Both release points the executor
// builds are the caster's TRANSFORM - feet + centreOffset - so the stub
// must carry a centreOffset that is neither the player's 0.9 nor half
// its capsule, or the pin passes over the fix AND over its revert. A
// rat: idle sprite 0.8, capsule floored to 1.6, transform 0.4 up.
const mkFoe = () => ({ entity: { level: 4, magicka: 30, health: 20, maxHealth: 20 }, ai: { feet: [10, 5, 20], height: 1.6, centreOffset: 0.4 } });
const mkDeps = (over = {}) => {
  const calls = { applied: [], exploded: [], fired: [], sounds: [] };
  const deps = {
    playerEntity: { level: 9, skills: [] },
    playerFeet: [0, 0, 0],
    applySpell: (spell, lvl, target, sinks, rolls, caster) => calls.applied.push({ spell, lvl, target, caster }),
    foeSinks: (f) => ({ tag: 'sinks-of', f }),
    calculateCastCost: (spell, who) => { calls.pricedOff = who; return { sp: 12 }; },
    silenceBlocksCast: () => false,
    playCastSound: (element, from) => calls.sounds.push({ element, from }),
    explodeAt: (...a) => calls.exploded.push(a),
    fireMissile: (...a) => calls.fired.push(a),
    ...over,
  };
  return { deps, calls };
};

test('x3 executor: the gates - silence blocks, the free rider bypasses, the cost prices off the PLAYER', () => {
  // silenced: nothing spends, nothing rings
  const f1 = mkFoe();
  const { deps: d1, calls: c1 } = mkDeps({ silenceBlocksCast: () => true });
  assert.equal(castEnemySpell(f1, { rangeType: 0, element: 4, effects: [] }, d1), false);
  assert.equal(f1.entity.magicka, 30);
  assert.equal(c1.sounds.length, 0);
  // the free rider bypasses the silence AND the cost
  const f2 = mkFoe();
  const { deps: d2, calls: c2 } = mkDeps({ silenceBlocksCast: () => true });
  assert.equal(castEnemySpell(f2, { rangeType: 0, element: 4, effects: [] }, { ...d2, noSpellPointCost: true }), true);
  assert.equal(f2.entity.magicka, 30, 'free = no spend');
  assert.equal(c2.applied.length, 1);
  // an ordinary cast prices off the PLAYER entity and floors at 0
  const f3 = mkFoe();
  f3.entity.magicka = 5;
  const { deps: d3, calls: c3 } = mkDeps();
  castEnemySpell(f3, { rangeType: 0, element: 4, effects: [] }, d3);
  assert.equal(c3.pricedOff, d3.playerEntity, 'EntityEffectManager :322-327: the null-caster cost reads the player');
  assert.equal(f3.entity.magicka, 0, '5 - 12 floors at 0 (DFU casts even past the pool)');
});

test('x3 executor: the three release arms - self, at-caster AoC excluding the caster, the missile', () => {
  // CasterOnly assigns to SELF through the caster wrapper
  const f1 = mkFoe();
  const { deps: d1, calls: c1 } = mkDeps();
  castEnemySpell(f1, { rangeType: 0, element: 2, effects: [] }, d1);
  assert.equal(c1.applied.length, 1);
  assert.equal(c1.applied[0].target, f1.entity);
  assert.equal(c1.applied[0].caster.entity, f1.entity, 'self-casts carry the caster wrapper');
  assert.equal(c1.sounds[0].element, 2, 'the element cast sound rings');
  assert.ok(f1._castPending, 'the sprite Spell one-shot arms');
  // AreaAroundCaster: instant at the caster MID-CAPSULE, caster excluded
  const f2 = mkFoe();
  const { deps: d2, calls: c2 } = mkDeps();
  castEnemySpell(f2, { rangeType: 3, element: 0, effects: [] }, d2);
  assert.equal(c2.exploded.length, 1);
  const [pos, , lvl, feet, wrapper, opts] = c2.exploded[0];
  // DaggerfallMissile.cs:280-282 `DoAreaOfEffect(caster.transform
  // .position, true)` - the CASTER's transform, feet + centreOffset
  // (0.4 here), not the player's half-capsule 0.9 and not half this
  // foe's own floored capsule (0.8).
  assert.deepEqual(pos, [10, 5.4, 20], 'AreaAroundCaster blows at caster.transform.position');
  assert.equal(lvl, 4);
  assert.deepEqual(feet, [0, 0, 0]);
  assert.equal(wrapper.entity, f2.entity);
  assert.equal(opts.excludeFoe, f2, 'DoAreaOfEffect ignoreCaster');
  assert.equal(c2.fired.length, 0, 'no flight for AoC');
  // SingleTargetAtRange looses from the caster's TRANSFORM: GetAimPosition
  // (DaggerfallMissile.cs:513-525) returns `caster.transform.position`
  // for a non-player caster and adds the forward*0.6 + height/3 offset
  // ONLY for an arrow. The port's old hardcoded feet + 1.2 was a
  // player-shaped guess.
  const f3 = mkFoe();
  const { deps: d3, calls: c3 } = mkDeps();
  castEnemySpell(f3, { rangeType: 2, element: 3, effects: [] }, d3);
  assert.equal(c3.fired.length, 1);
  assert.deepEqual(c3.fired[0][0], [10, 5.4, 20], 'the loose point is caster.transform.position');
  assert.deepEqual(c3.sounds[0].from, [10, 5.4, 20], '...and the cast sound rings there too');
  assert.equal(c3.fired[0][2], 4, 'the caster level rides the missile');
});

