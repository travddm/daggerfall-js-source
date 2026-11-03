// F1 TAME-AI - what the Enhanced AI keeps and what it gives up. Kept: the brain, the strike tokens. Dropped: every damage
// multiplier on a foe's own blow (the telegraph shapes, the revenant signature, the aimed shot), and the flight of beasts.
// Driven on the real motor, the real attack component and the real brain, on the brain's own clock.
import '../modsOff.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setPref } from '../../src/systems/uiPrefs.js';
import { Collider } from '../../src/player/collider.js';
import { EnemyAI } from '../../src/characters/enemy/enemyMotor.js';
import { EnemyAttack } from '../../src/characters/enemy/enemyAttack.js';
import { MOBILE_TYPES } from '../../src/characters/mobile/mobileTypes.js';
import {
  TACT, setTacticsClock, resetTactics, tokensOut, LOCAL_TARGET, isCoward, noteLocalPlayer,
} from '../../src/ai/tactics.js';
import { BLOW, makeBlow, liveBlows, resetBlows } from '../../src/ai/foeBlows.js';
import * as foeBlows from '../../src/ai/foeBlows.js';
import { blowTakenScale } from '../../src/systems/blowTaken.js';
import { signatureStamp, pyreSpell, SIG } from '../../src/systems/revenant/revenantFeud.js';

const DT = 1 / 60;
let T = 0;
setTacticsClock(() => T);
beforeEach(() => { resetTactics(); resetBlows(); T = 0; setPref('enhancedAI', true); });

function crowd(n, { r = 10, mobileType = MOBILE_TYPES.Orc, health = 50, level = 5 } = {}) {
  const c = new Collider(() => 0);
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const feet = [Math.sin(a) * r, 0, Math.cos(a) * r];
    const body = { health, maxHealth: health, mobileType, level };
    const ai = new EnemyAI(c, feet, Math.atan2(-feet[0], -feet[2]), { vitals: () => body });
    const atk = new EnemyAttack({ liveSpeed: () => 50, playerLevel: () => 5, reflexes: 2 });
    out.push({ ai, atk, body, swings: 0 });
  }
  return out;
}
function run(foes, secs, { player = [0, 0, 0], each = null } = {}) {
  for (let s = 0; s < Math.round(secs / DT); s++) {
    T += DT;
    noteLocalPlayer(player, [0, 0, 1]);
    for (const f of foes) {
      f.ai.update(DT, player);
      const before = f.atk.swingSeq;
      f.atk.update(DT, f.ai, player);
      if (f.atk.swingSeq !== before) f.swings++;
    }
    each?.(s);
  }
}

test('F1: a humanoid coward near death runs; a beast, an undead and a daedra fight on', () => {
  for (const [name, runs] of [['Thief', true], ['Mage', true], ['Rat', false], ['GrizzlyBear', false], ['SabertoothTiger', false], ['Zombie', false], ['FireDaedra', false]]) {
    resetTactics();
    const foes = crowd(1, { mobileType: MOBILE_TYPES[name] });
    run(foes, 2);
    foes[0].body.health = foes[0].body.maxHealth * 0.1;
    run(foes, 0.5);
    assert.equal(foes[0].ai.fleeLeft > 0, runs, name);
    assert.equal(isCoward(MOBILE_TYPES[name]), runs, `${name}: isCoward`);
  }
});

test('F1: strike tokens still limit the foes that swing at once', () => {
  const foes = crowd(6, { r: 6 });
  let mostMelee = 0;
  run(foes, 10, { each: () => { mostMelee = Math.max(mostMelee, tokensOut(LOCAL_TARGET, 'melee')); } });
  assert.ok(mostMelee >= 1, 'somebody held a token');
  assert.ok(mostMelee <= TACT.MELEE_TOKENS, `${mostMelee} melee tokens out, at most ${TACT.MELEE_TOKENS}`);
  assert.ok(foes.filter((f) => f.swings > 0).length >= 3, 'and the foes took turns: each of several got to swing');
});

test('F1: a telegraphed blow carries no damage multiplier - the shapes, the signature, the aimed shot', () => {
  for (const [kind, shape] of Object.entries(BLOW)) {
    assert.equal('mult' in shape, false, `${kind} has no multiplier`);
    assert.equal('mult' in makeBlow(kind, [0, 0, 0], 0, 10), false, `${kind}'s blow carries none`);
  }
  assert.equal(foeBlows.blowScaled, undefined, 'nothing scales the roll the formulas made');
  const stamp = signatureStamp({ rank: 3, sig: 'slam', mobileType: MOBILE_TYPES.Orc, id: 1 });
  assert.ok(stamp, 'a rank 3 revenant has a signature');
  assert.equal('mult' in stamp, false);
  assert.equal(SIG.MULT, undefined);
  const arrow = blowTakenScale({ level: 20 }, { level: 20 }, null, { kind: 'arrow', aimed: true });
  assert.equal(arrow, 1, 'an aimed arrow weighs what the arrow weighs');
});

test('F1: a landed telegraphed blow leaves the formula roll alone, and the pyre is the base spell', () => {
  const c = new Collider(() => 0);
  const ent = { health: 80, maxHealth: 80, mobileType: MOBILE_TYPES.Orc, level: 12 };
  const ai = new EnemyAI(c, [0, 0, 8], Math.PI, { vitals: () => ent });
  const atk = new EnemyAttack({ liveSpeed: () => 50, playerLevel: () => 5, reflexes: 2 });
  const f = { ai, atk };
  let blow = null, verdict = null;
  run([f], 60, {
    each: () => {
      if (!blow && ai._tac?.state === 'windup') blow = liveBlows().get(ai);
      if (blow && verdict == null && ai._blowVerdict != null) verdict = ai._blowVerdict;
    },
  });
  assert.ok(blow, 'a level 12 foe wound a blow up');
  assert.equal(verdict, true, 'and it landed on the player standing in it');
  const [lo, hi] = SIG.PYRE_BASE;
  const effect = pyreSpell('Pyre', 4).effects[0];
  assert.deepEqual([effect.magnitudeBaseLow, effect.magnitudeBaseHigh, effect.magnitudeLevelBase], [lo, hi, SIG.PYRE_PER]);
});
