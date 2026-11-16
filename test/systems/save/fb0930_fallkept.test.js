// FIELD BUGS 2026-09-30 (FALL-KEPT) - the report "saves dont save player velocity": "you can negate all fall damage by
// saving while falling right before you hit ground. once you load your save, you will land safely. as your velocity
// will be reset". DFU's own behaviour - SerializablePlayer keeps the position, the yaw, the pitch and the crouch
// (:204-226) and LoadGame cancels the movement - and
//
// A DECLARED DEPARTURE. The save carries the fall in the pose (PlayerMotor.fallSnapshot): how far above the feet it
// began and the speed the body had. A load that lands the player where the save stood lands the fall with them
// (restoreFall, after the placement's spawn) - the street, the building re-entered, the dungeon's saved position; a
// load that lands anywhere else (the door's reposition, the start-marker warp) carries none. A save in the air is never
// refused: the quiet saves (the realm's checkpoint, the page-hide save, the exit autosave) would lose their progress,
// and online the exploit is the closed tab, whose save is that checkpoint. The re-skin hold keeps a fall across its
// re-anchor, so a rebuild in the frames after a load cannot wipe it.
//
// Every pin here runs the REAL PlayerMotor on a flat floor at y = 0, through the real snapshotPlayer/restorePlayer
// and a JSON round trip, with each host's composer and landing lifted from the live source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as MOTOR from '../../../src/player/motor.js';   // the namespace: FALL_CARRY_MAX is the fix's, so the file loads without it
import { Collider } from '../../../src/player/collider.js';
import { snapshotPlayer, restorePlayer } from '../../../src/systems/save/save.js';
import { createBankAccounts, createHouses, SHIP_TYPES } from '../../../src/systems/banking.js';
import { MAX_TERRAIN_HEIGHT, STREAMING_TERRAIN_SCALE } from '../../../src/world/terrain/terrainSampler.js';
import { hostText } from '../../hostText.mjs';   // HOST-SPLIT (at the merge of main into TESA): the world host read whole - its save is scenes/worldQuickSave.js's

const { PlayerMotor, FALL_DAMAGE_THRESHOLD, FALL_HP_PER_METRE, GRAVITY } = MOTOR;
const rd = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');

// dialload.test.js's live-source runner: the text AS WRITTEN, run in a scope whose unknown names are inert stubs
function literalBody(text, opener) {
  const i = text.indexOf(opener);
  assert.ok(i >= 0, `could not find ${opener}`);
  const open = text.indexOf('{', i + opener.length);
  let depth = 0;
  for (let k = open; k < text.length; k++) {
    const c = text[k];
    if (c === '/' && text[k + 1] === '/') { k = text.indexOf('\n', k); continue; }
    if (c === '/' && text[k + 1] === '*') { k = text.indexOf('*/', k) + 1; continue; }
    if (c === '\'' || c === '"' || c === '`') {
      const q = c;
      for (k++; k < text.length; k++) { if (text[k] === '\\') k++; else if (text[k] === q) break; }
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return text.slice(open, k + 1);
  }
  throw new Error(`unbalanced literal after ${opener}`);
}
const STUB = new Proxy(function stub() {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => 'STUB' : STUB), apply: () => STUB });
// over `env` itself, so what the text assigns (`_seasonHoldKey = null`) is read back off it; `undefined` is a name too
const scopeOf = (env) => new Proxy(env, {
  has: () => true,
  get: (t, k) => (k === Symbol.unscopables || k === 'undefined' ? undefined : (k in t ? t[k] : STUB)),
});
// eslint-disable-next-line no-new-func
const run = (expr, env) => new Function('__scope', `with (__scope) { return (${expr}); }`)(scopeOf(env));
// eslint-disable-next-line no-new-func
const exec = (stmts, env) => new Function('__scope', `with (__scope) { ${stmts} }`)(scopeOf(env));
const between = (text, from, to) => {
  const a = text.indexOf(from);
  const b = text.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `could not find ${from}`);
  return text.slice(a, b);
};

// ── the motor, the fall and its bill ────────────────────────────────────────────────────────────────────────────
const idle = { forward: 0, strafe: 0 };
const DT = 1 / 60;
/** PlayerHealth.ApplyPlayerFallDamage over the landed distance (shared.applyFallLanding's law) */
const hp = (d) => (d > FALL_DAMAGE_THRESHOLD ? Math.trunc(FALL_HP_PER_METRE * (d - FALL_DAMAGE_THRESHOLD)) : 0);
const motor = () => new PlayerMotor(new Collider(() => 0));
function motorAt(y) { const m = motor(); m.spawn(0, y, 0); return m; }
/** steps until `pred` holds; the steps it took */
function stepUntil(m, pred, input = idle) {
  for (let i = 0; i < 6000; i++) { if (pred(m)) return i; m.update(DT, input, 0, 0); }
  throw new Error('never');
}
/** steps to the landing: { d: the distance it billed (0: stood on the floor with none), steps } */
function land(m) {
  for (let i = 1; i < 6000; i++) {
    m.update(DT, idle, 0, 0);
    if (m.landedFallDistance) return { d: m.landedFallDistance, steps: i };
    if (m.grounded && !m.falling) return { d: 0, steps: i };
  }
  throw new Error('never landed');
}
const UNSAVED = land(motorAt(50));
/** the save point: in the air, the last step before the ground. A 50 m fall moves 0.73 m a step there, and the step
 *  after 1.23 m stands on the floor - that is the landing's own frame, pinned by itself below. */
const lastMetres = (b) => {
  if (b.pos[1] > 2) return false;
  assert.deepEqual([b.grounded, b.falling], [false, true], 'airborne at the save');
  return true;
};

// ── the envelope, as the slot and the realm hold it ─────────────────────────────────────────────────────────────
const character = () => ({ name: 'Gary', gender: 'male', careerIndex: 4, level: 3, reflexes: 2, health: 22, maxHealth: 400, magicka: 15, maxMagicka: 30,
  startingLevelUpSkillSum: 90, currentLevelUpSkillSum: 120, readyToLevelUp: false, pendingLevel: null, chargenDone: true,
  stats: { strength: 55, luck: 60 }, skills: [30, 28], skillUses: [100, 0], career: { name: 'Healer', hitPointsPerLevel: 8 },
  items: [], spells: [], activeEffects: [], bankAccounts: createBankAccounts(), houses: createHouses(62), ownedShip: SHIP_TYPES.None });
/** snapshotPlayer -> JSON (the slot's, the realm's checkpoint's) -> restorePlayer: the load's extras */
function roundTrip(opts) {
  const snap = JSON.parse(JSON.stringify(snapshotPlayer(character(), { classicMinutes: 0, ...opts })));
  return restorePlayer(character(), snap, new Map());
}

const RESTORE = 'restoreSaved(extras, setPlayerPos, { session = true, announce = session } = {}) ';

test('FALL-KEPT the bound: a fall carried is at most the world\'s tallest drop - terrainData.size.y, MaxTerrainHeight at the game\'s TerrainScale - at no more than that drop\'s speed from rest (mutants: the height unbounded; the speed unbounded; the bound not the world\'s)', () => {
  assert.equal(MOTOR.FALL_CARRY_MAX, MAX_TERRAIN_HEIGHT * STREAMING_TERRAIN_SCALE);
  assert.equal(MOTOR.FALL_CARRY_MAX, 1923.75);
  assert.equal(MOTOR.FALL_CARRY_MAX_SPEED, Math.sqrt(2 * GRAVITY * MOTOR.FALL_CARRY_MAX));
  const m = motorAt(3);
  m.restoreFall({ above: 1e300, velY: -1e300 });
  assert.deepEqual([m.falling, m.fallStart - 3, m.velY], [true, MOTOR.FALL_CARRY_MAX, -MOTOR.FALL_CARRY_MAX_SPEED]);
  const up = motorAt(3);
  up.restoreFall({ above: -1e300, velY: 1e300 });
  assert.deepEqual([up.fallStart - 3, up.velY], [-MOTOR.FALL_CARRY_MAX, MOTOR.FALL_CARRY_MAX_SPEED]);
  const d = land(m).d;
  assert.ok(d > MOTOR.FALL_CARRY_MAX && d <= MOTOR.FALL_CARRY_MAX + 3 + 1e-3, `billed the bound and the 3 m under it: ${d}`);
});

