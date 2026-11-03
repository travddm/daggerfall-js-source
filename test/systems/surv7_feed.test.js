import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ENV_DEFAULTS, survivalCtx, survivalFeed, restGateEnv, installSurvivalGate, survivalRecordAt } from '../../src/systems/survival/env.js';
import { REST_TEXT_SURVIVAL } from '../../src/systems/survival/rest.js';
import { newSurvival, alignSurvival, ALIGN_GRACE_MINUTES, runSurvivalMinutes, survivalOf } from '../../src/systems/survival/needs.js';
import { raceById, RACES } from '../../src/systems/races.js';
import { registerPreventRestCondition, getPreventedRestMessage, clearPreventRestConditions } from '../../src/systems/rest/restSession.js';
import { createPlayerTicker } from '../../src/scenes/shared.js';
import { setWorldMinutes } from '../../src/systems/worldTick.js';
import { setPref, _resetForTests } from '../../src/systems/uiPrefs.js';
import { SKILLS } from '../../src/systems/skills.js';
import { hostText } from '../hostText.mjs';   // HOST-SPLIT 2 (AUDIT, the second read): its negatives read the host whole

// ═══ SURV7: THE FEED, THE GATE, THE ALIGNMENT ═════════
//
// The hosts say where the player stands; survival/env.js builds the
// body's half from the entity, hands tickPlayerMinutes its `survival`
// argument, and puts the rest gate on DFU's own seam with the same
// reader. A load or an online arrival aligns the needs' markers to the
// world's clock on WORLD5's law.

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const player = (raceId = RACES.Breton) => ({
  isPlayer: true, level: 3, health: 30, maxHealth: 40, magicka: 10, maxMagicka: 20, fatigue: 20 * 64, raceId,
  stats: { strength: 50, intelligence: 50, willpower: 50, agility: 50, endurance: 50, personality: 50, speed: 50, luck: 50 },
  skills: 20, career: {}, skillUses: { [SKILLS.Medical]: 0 }, activeEffects: [], items: [],
  equip: { slots: new Array(27).fill(null) },
});
const NOON = { climateIndex: 232, month: 6, hour: 12, weather: 'sunny', inSunlight: true };

test('SURV7: the feed - null with the mod off or no env; the env over the defaults; the worn slots and the body\'s ctx off the entity; the live flags through', () => {
  _resetForTests();
  const p = player(RACES.Nord);
  assert.equal(survivalFeed(p, null), null, 'no env, no feed');
  assert.equal(survivalFeed(null, NOON), null);
  const f = survivalFeed(p, NOON, { say: () => {} });
  assert.deepEqual(f.env, { ...ENV_DEFAULTS, ...NOON }, 'the host\'s keys over the defaults');
  assert.equal(f.deps.worn, p.equip.slots, 'the equip table\'s slots are the worn items');
  assert.equal(f.deps.ctx.vampire, false);
  assert.equal(f.deps.ctx.raceId, RACES.Nord);
  assert.deepEqual(f.deps.ctx.raceTemplate, raceById(RACES.Nord), 'the race\'s own tolerance flags');
  assert.equal(raceById(RACES.Nord).resistanceFlags, 16, 'a Nord resists frost');
  assert.equal(typeof f.deps.say, 'function'); assert.equal(f.deps.rolls, undefined, 'no rolls handed, none forced');
  const g = survivalFeed(p, { ...NOON, lycanthrope: true, beastForm: true, fireResist: 30, frostResist: 10 });
  assert.deepEqual([g.deps.ctx.lycanthrope, g.deps.ctx.beastForm, g.deps.ctx.fireResist, g.deps.ctx.frostResist], [true, true, 30, 10]);
  assert.deepEqual(survivalCtx({ raceId: RACES.Breton, activeEffects: [] }).raceTemplate, raceById(RACES.Breton));
  assert.equal(survivalFeed({ ...p, equip: null }, NOON).deps.worn, null, 'no table, nothing worn');
  setPref('survival', false);
  assert.equal(survivalFeed(p, NOON), null, 'off with the switch');
  _resetForTests();
  assert.equal(ENV_DEFAULTS.climateIndex, 232); assert.equal(ENV_DEFAULTS.sleeping, null);
});

test('SURV7: the gate - the record\'s felt word, the host\'s fire and roof, on DFU\'s prevent-rest seam; too cold without either, too hot anywhere, nothing off the switch', () => {
  _resetForTests(); setPref('survival', 'hard');   // SURV-TIERS: the gate is Hard's (Casual refuses no sleep - survtiers.test.js)
  clearPreventRestConditions();
  const p = player();
  let env = { byFire: false, insideBuilding: false };
  assert.deepEqual(restGateEnv(p, env), { tempWord: 'comfortable', byFire: false, insideBuilding: false }, 'no reading yet reads comfortable');
  p.survival = newSurvival(0); p.survival.felt = -100;
  assert.equal(restGateEnv(p, { byFire: true }).byFire, true);
  const handlers = installSurvivalGate(registerPreventRestCondition, () => p, () => env);
  assert.equal(handlers.length, 2);
  assert.equal(getPreventedRestMessage(), REST_TEXT_SURVIVAL.tooCold, 'deadly cold on the ground');
  env = { byFire: true, insideBuilding: false };
  assert.equal(getPreventedRestMessage(), null, 'a fire near');
  env = { byFire: false, insideBuilding: true };
  assert.equal(getPreventedRestMessage(), null, 'a roof');
  env = { byFire: false, insideBuilding: false };
  p.survival.felt = 0;
  assert.equal(getPreventedRestMessage(), null, 'comfortable');
  p.survival.felt = 100;
  assert.equal(getPreventedRestMessage(), REST_TEXT_SURVIVAL.tooHot);
  env = { byFire: true, insideBuilding: true };
  assert.equal(getPreventedRestMessage(), REST_TEXT_SURVIVAL.tooHot, 'no fire or roof helps the heat');
  setPref('survival', false);
  assert.equal(getPreventedRestMessage(), null, 'off with the switch');
  _resetForTests();
  clearPreventRestConditions();
});

test('SURV7: composed - the ticker feeds the minute law from the host\'s env (the felt reading lands on the record, the thirst moves), puts the gate on the seam, and feeds nothing with the mod off; the alignment law', () => {
  _resetForTests(); setPref('survival', 'hard');   // SURV-TIERS: the gate below is Hard's
  clearPreventRestConditions();
  setWorldMinutes(3 * 1440 + 12 * 60);
  const p = player();
  const env = { ...NOON, byFire: false, insideBuilding: false };
  const t = createPlayerTicker(p, { say: () => {}, isInside: () => false, survivalEnv: () => env });
  assert.equal(p.survival, undefined);
  t.advance(120);
  assert.ok(Number.isFinite(p.survival?.felt), 'two hours fed: the felt reading rides the record');
  assert.ok(p.survival.thirst > 0, 'and the thirst moved');
  p.survival.felt = -100;
  assert.equal(getPreventedRestMessage(), REST_TEXT_SURVIVAL.tooCold, 'the gate stands on the seam with this ticker\'s readers');
  clearPreventRestConditions();
  // a ticker with no reader feeds nothing
  setWorldMinutes(3 * 1440 + 12 * 60);
  const q = player();
  createPlayerTicker(q, { say: () => {}, isInside: () => false }).advance(120);
  assert.equal(q.survival, undefined, 'no env, no needs');
  assert.equal(getPreventedRestMessage(), null, 'and no gate');
  // the mod off
  setPref('survival', false);
  setWorldMinutes(3 * 1440 + 12 * 60);
  const r = player();
  createPlayerTicker(r, { say: () => {}, isInside: () => false, survivalEnv: () => env }).advance(120);
  assert.equal(r.survival, undefined, 'off with the switch');
  _resetForTests();
  clearPreventRestConditions();
  // the alignment: a gap past a day resets, within it keeps, a record ahead of now resets
  const a = player(); const now = 10 * 1440;
  survivalRecordAt(a, now - 2 * 1440).lastAte = now - 2 * 1440 - 10;
  assert.equal(alignSurvival(a, now, now - ALIGN_GRACE_MINUTES - 1), true); assert.equal(a.survival.lastAte, now - 10);
  a.survival.lastAte = now - 300;
  assert.equal(alignSurvival(a, now, now - 60), false); assert.equal(a.survival.lastAte, now - 300, 'an hour away keeps its hunger');
  a.survival.lastAte = now + 500;
  assert.equal(alignSurvival(a, now, now), true, 'a record from further along than the world starts fresh');
});

// ── AUDIT-FIELD F11/F12: what `resting` actually holds ───────────────
//
// TO-FIELD sits an accelerated journey as `resting` and the record's
// strongest sentence is that this is a HARM-only knob - the days still
// pass, the traveller still arrives hungry. Nothing executed that. It is
// executed here, because the first cut of that record also got its own
// arithmetic wrong, and a sentence nobody runs is how that happens.
test('AUDIT-FIELD: `resting` holds the needs\' per-minute harms and NOT one accrual - the law TO-FIELD sits an accelerated journey on', () => {
  const env = { ...ENV_DEFAULTS, insideBuilding: false, climateIndex: 231, month: 6, weather: 'sunny', inSunlight: true };
  const run = (resting) => {
    const e = { stats: { endurance: 50, strength: 50 }, health: 50, maxHealth: 50, fatigue: 6400, items: [], raceId: 1 };   // AUDIT C&C N2: a body's pool, as every producer mints one - a jump leaves its last point
    let fatigue = 0, hurt = 0;
    const sinks = { drainFatigue: (n) => { fatigue += n; }, restoreFatigue: () => {}, hurt: (n) => { hurt += n; }, say: () => {} };
    // start hungry, thirsty and sleepless so every harm arm is LIVE -
    // a fed, watered, rested traveller would show nothing either way
    const s = survivalOf(e, 0);
    Object.assign(s, { lastAte: -100000, thirst: 101, sleepDebt: 13, awakeSince: -100000, exposure: 0, wet: 0, fed: 0, lastMinute: 0, notes: {} });
    runSurvivalMinutes(e, 0, 600, { ...env, resting }, { sinks, autoEat: false, autoDrink: false });
    const r = survivalOf(e, 600);
    return { fatigue, hurt, thirst: r.thirst, sleepDebt: r.sleepDebt, wet: r.wet, exposure: r.exposure, lastAte: r.lastAte };
  };
  const awake = run(false), sat = run(true);
  // the HARMS are held
  assert.ok(awake.fatigue > 0, 'a starving, parched, exhausted traveller pays fatigue when awake');
  assert.equal(sat.fatigue, 0, '...and pays none sat as resting - which is the whole of this fix');
  assert.ok(sat.hurt <= awake.hurt, 'AUDIT-FIELD F12: and the bare-skin HEALTH ticks go with them, which TO-FIELD did not say out loud');
  // ...and NOT ONE accrual moves. This is the sentence the record rests on.
  for (const k of ['thirst', 'sleepDebt', 'wet', 'exposure', 'lastAte']) {
    assert.equal(sat[k], awake[k], `the ${k} accrual is outside the knob - the days really pass`);
  }
  assert.ok(sat.thirst > 101 && sat.sleepDebt > 13, 'and they really did advance over the ten hours, in both runs');
  assert.ok(sat.thirst <= 150 && sat.sleepDebt <= 24, '...up to the needs\' own ceilings, which is where they stop either way');
});
