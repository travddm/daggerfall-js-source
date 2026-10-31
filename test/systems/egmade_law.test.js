// EG-H2: THE
// MADE LEVEL'S RULES - one law (systems/madeLevel.js) for the Burning Court and the Shattered Hour: `madeLevelOf` over
// each made location's own producer, MADE_LEVEL_RULES and their words as data; the Burning Court and the Hour re-plugged
// UNCHANGED (every door's old decision and words, rule by rule), with the one Levitate ward; and THE SWEEP - every rule's
// door reads the law and asks no level itself.
import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { madeLevelOf, madeLevelRule, madeLevelSays, madeLevelHere, madeRuleHere, madeSaysHere, registerMadeLevelHere, MADE_LEVELS, MADE_LEVEL_RULES, MADE_LEVEL_RULE_KEYS, MADE_LEVEL_TEXT } from '../../src/systems/madeLevel.js';
import { gateArenaLocation, COURT_TEXT } from '../../src/world/gate/gateArena.js';
import { sdRealmLocation, SD_REALM_TEXT } from '../../src/world/superDungeon/sdRealm.js';
import { registerLevitateWard, levitateWarded } from '../../src/characters/playerEntity.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
/** The world host's word, for a test: the made level under the player is `lv`. */
const here = (lv) => registerMadeLevelHere(() => lv);

test('EG-H2 THE LAW (section 24): madeLevelOf names each made location by its own producer - the Burning Court and the Shattered Hour - and nothing else; MADE_LEVEL_RULES is the page\'s table as the doors read it, every rule named in every row; each level refuses in its own home\'s words; a rule of no level is the game\'s own (null, or no forgiveness); the world host\'s word answers where the player stands, and a word that throws or names no level is none (mutants: a level misnamed; a row changed; a word not its home\'s; the throw believed)', () => {
  assert.equal(madeLevelOf(gateArenaLocation({ day: 0 })), 'court', 'the court of day zero is a court');
  assert.equal(madeLevelOf(gateArenaLocation({ day: 12 })), 'court');
  assert.equal(madeLevelOf(sdRealmLocation({ s: 3 })), 'hour');
  assert.equal(madeLevelOf(sdRealmLocation({ s: 0 })), 'hour', 'any slot is an Hour - slot zero too');
  for (const loc of [null, undefined, {}, { name: 'Old Maze', dungeon: { recordElement: { header: { locationId: 99 } } } }, { ...sdRealmLocation({ s: 3 }), sdRealm: null }]) assert.equal(madeLevelOf(loc), null);
  assert.deepEqual([...MADE_LEVELS], ['court', 'hour']);
  const none = Object.fromEntries(MADE_LEVEL_RULE_KEYS.map((k) => [k, k === 'jumpBuffer' || k === 'latePress' ? 0 : null]));
  // test/player/egperfect_runleap.test.js runs it on the real motor)
  // held, not off (systems/courtRules.js); no row refuses Resurrect (the Hour's one life kept by its realm's window - SD-REZ)
  assert.deepEqual(MADE_LEVEL_RULES, {
    court: { ...none, save: 'refused', rest: 'refused', automap: 'off', mark: 'refused', portalStone: 'refused', companions: 'out', regen: 'held', death: 'castOut', unstuck: 'refused', says: 'mid' },
    hour: { ...none, save: 'refused', rest: 'refused', automap: 'off', mark: 'refused', recall: 'refused', portalStone: 'refused', companions: 'out', regen: 'held', levitate: 'banned', runLeap: 'refused', death: 'final', unstuck: 'wayHome', says: 'hour' },
  });
  for (const lv of MADE_LEVELS) { assert.ok(Object.isFrozen(MADE_LEVEL_RULES[lv])); assert.deepEqual(Object.keys(MADE_LEVEL_RULES[lv]), [...MADE_LEVEL_RULE_KEYS], lv); }
  assert.deepEqual(MADE_LEVEL_TEXT, {
    court: { save: COURT_TEXT.noSave, rest: COURT_TEXT.noRest, automap: COURT_TEXT.noMap, mark: COURT_TEXT.noMark, unstuck: COURT_TEXT.noUnstuck },
    hour: { save: SD_REALM_TEXT.noSave, rest: SD_REALM_TEXT.noRest, automap: SD_REALM_TEXT.noMap, mark: SD_REALM_TEXT.noMark, recall: SD_REALM_TEXT.noRecall },
  });
  assert.deepEqual([madeLevelRule(null, 'save'), madeLevelRule('arena', 'save'), madeLevelRule('hour', 'nope'), madeLevelRule(null, 'jumpBuffer'), madeLevelRule('court', 'latePress')], [null, null, null, 0, 0]);
  assert.deepEqual([madeLevelSays(null, 'save'), madeLevelSays('court', 'recall'), madeLevelSays('hour', 'regen')], ['', '', '']);
  try {
    here('hour');
    assert.deepEqual([madeLevelHere(), madeRuleHere('levitate'), madeSaysHere('save')], ['hour', 'banned', SD_REALM_TEXT.noSave]);
    registerMadeLevelHere(() => 'arena');
    assert.equal(madeLevelHere(), null, 'a word that names no made level is none');
    registerMadeLevelHere(() => { throw new Error('x'); });
    assert.deepEqual([madeLevelHere(), madeRuleHere('save')], [null, null], 'a word that throws is none');
  } finally { registerMadeLevelHere(null); }
  assert.equal(madeLevelHere(), null);
});


test('EG-H2 THE BURNING COURT AND THE HOUR, UNCHANGED (section 24): rule by rule, the law decides as each door did before it - the saves, the rest and the map refused in each level\'s own words; the Mark refused in both and the Recall in the Hour alone (the court refuses the Mark only), each in its own voice (the mid-screen line, the Hour\'s); companions out; no regeneration; Levitate warded in the Hour and never in the court; Resurrect refused in the Hour and not in the court; a death cast out of the court and final for the Hour\'s Hollow; /unstuck refused in the court in its words and the Hour\'s way home in the Hour; no forgiveness, no slowfall ban, no technique refusal, no potion count, no AvoidDeath refusal and the DEATH-PENALTY in both, as before (mutants: any of the two columns moved)', () => {
  // what each door did before the law, from the doors' own text at 4f0e71965 (each `modes?.gateArenaDay?.()`, `modes?.sdRealmSlot?.()`,
  // `isGateArena(dfLocation)`, `_sdRealm` arm), and what the law decides now
  const before = {
    court: { save: [true, COURT_TEXT.noSave], rest: [true, COURT_TEXT.noRest], automap: [true, COURT_TEXT.noMap], mark: [true, COURT_TEXT.noMark, 'mid'], recall: [false], companions: true, regen: true,
      levitate: false, resurrect: false, death: 'castOut', unstuck: ['refused', COURT_TEXT.noUnstuck], portalStone: true },   // EVENT-RULES (
    hour: { save: [true, SD_REALM_TEXT.noSave], rest: [true, SD_REALM_TEXT.noRest], automap: [true, SD_REALM_TEXT.noMap], mark: [true, SD_REALM_TEXT.noMark, 'hour'], recall: [true, SD_REALM_TEXT.noRecall, 'hour'], companions: true, regen: true,
      levitate: true, resurrect: false, death: 'final', unstuck: ['wayHome'], portalStone: true },   // EVENT-RULES (
  };
  for (const [lv, d] of Object.entries(before)) {
    for (const r of ['save', 'rest']) assert.deepEqual([madeLevelRule(lv, r) === 'refused', madeLevelSays(lv, r)], d[r], `${lv} ${r}`);
    assert.deepEqual([madeLevelRule(lv, 'automap') === 'off', madeLevelSays(lv, 'automap')], d.automap, `${lv} map`);
    assert.deepEqual([madeLevelRule(lv, 'mark') === 'refused', madeLevelSays(lv, 'mark'), madeLevelRule(lv, 'says')], d.mark, `${lv} Mark`);
    assert.deepEqual(madeLevelRule(lv, 'recall') === 'refused' ? [true, madeLevelSays(lv, 'recall'), madeLevelRule(lv, 'says')] : [false], d.recall, `${lv} Recall`);
    assert.equal(madeLevelRule(lv, 'companions') === 'out', d.companions, `${lv} companions`);
    assert.equal(madeLevelRule(lv, 'regen') === 'held', d.regen, `${lv} regeneration`);
    assert.equal(madeLevelRule(lv, 'levitate') === 'banned', d.levitate, `${lv} Levitate`);
    assert.equal(madeLevelRule(lv, 'resurrect') === 'refused', d.resurrect, `${lv} Resurrect`);
    assert.equal(madeLevelRule(lv, 'death'), d.death, `${lv} a death`);
    assert.deepEqual(madeLevelRule(lv, 'unstuck') === 'refused' ? ['refused', madeLevelSays(lv, 'unstuck')] : [madeLevelRule(lv, 'unstuck')], d.unstuck, `${lv} /unstuck`);
    assert.equal(madeLevelRule(lv, 'portalStone') === 'refused', d.portalStone, `${lv} the Portal Stone (no portal in any dungeon)`);
    for (const r of ['potions', 'slowfall', 'techFlight', 'avoidDeath', 'deathPenalty']) assert.equal(madeLevelRule(lv, r), null, `${lv} ${r}: as today`);
    assert.deepEqual([madeLevelRule(lv, 'jumpBuffer'), madeLevelRule(lv, 'latePress')], [0, 0], `${lv}: DFU's motor`);
  }
  // the one ward, run: the world host's own registration over the law
  try {
    registerLevitateWard(() => madeRuleHere('levitate') === 'banned');
    for (const [lv, warded] of [['court', false], ['hour', true], [null, false]]) { here(lv); assert.equal(levitateWarded(), warded, `${lv} warded`); }
  } finally { registerLevitateWard(null); registerMadeLevelHere(null); }
});


test('EG-H2 THE SWEEP (section 24, THE ONE CONSTRUCTION SEAM): every rule\'s door in the hosts and the systems reads the made level\'s law for its rule and asks no made level itself; no line anywhere pairs a level\'s own predicate with a rule\'s act; every rule the law names is read at a door (mutants: a door asking the level again; a rule no door reads)', () => {
  const PRED = /gateArenaDay|sdRealmSlot|isGateArena\(|isSdRealm\(|\b_sdRealm\b|diedHere\(/;
  const FILES = { W: 'src/scenes/world.js', D: 'src/scenes/dungeonContext.js', M: 'src/scenes/worldModes.js', S: 'src/scenes/shared.js', P: 'src/scenes/portalStoneHost.js' };
  const src = Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, read(p)]));
  /** [file, where the door begins, where it ends, the rules it must read] */
  const DOORS = [
    ['D', 'savingPrevented: () =>', '\n', ['save']],
    ['D', 'quickSave(saveName = QUICK_SAVE_NAME', 'const snap = snapshotPlayer(', ['save']],
    ['D', 'toggleAutomap() {', '// EM3:', ['automap']],
    ['D', 'let automapRec =', 'enterDungeonAutomap(', ['automap']],
    ['D', 'toggleRest() {', '// S40:', ['rest']],
    ['D', 'get playerSlowFalling()', '\n', ['slowfall']],
    ['D', 'const _prevAvoidDeath = setAvoidDeathHook(', 'hudText.add(avoidDeathText())', ['avoidDeath']],
    ['D', 'activeOverlay = new DeathScreen(', '\n', ['deathPenalty']],
    ['W', 'function companionPlace(', 'const spotOf =', ['companions']],
    ['W', 'function partyCompanions() {', 'const party =', ['companions']],
    ['W', 'function madeSay(rule) {', '\n', ['says']],
    ['W', 'function setRecallAnchor() {', 'const inside =', ['mark']],
    ['W', 'async function recallToAnchor() {', 'const anchor = playerEntity.anchorPosition;', ['recall']],
    ['W', 'const goldLost = wildKilled', '\n', ['deathPenalty']],
    ['W', 'const diedInHour =', '\n', ['death']],
    ['W', 'if (/^\\/unstuck(\\s+cancel)?$/i.test(text.trim())) {', 'const inZone =', ['unstuck']],
    ['W', 'registerLevitateWard(() =>', '\n', ['levitate']],
    ['W', 'registerJumpForgiveness(', '\n', ['jumpBuffer', 'latePress']],
    ['W', 'arenaFrame(dt);   // ARENA2', "'held');", ['regen']],
    ['W', 'if (!_rezSeen) _rezSeen =', 'if (rez && legacyHost', ['resurrect']],
    ['P', 'const portalDoorRefusal = () => {', 'const hold = portalHoldNow();', ['portalStone']],
    ['S', 'export function parkourDeps(', '\n}\n', ['runLeap']],   // EG-PERFECT: the running leap's door, the four hosts' one parkour deps
  ];
  const readRules = new Set();
  for (const [f, from, to, rules] of DOORS) {
    const s = src[f], a = s.indexOf(from);
    assert.ok(a >= 0, `${FILES[f]}: the door at ${from}`);
    assert.equal(s.indexOf(from, a + 1), -1, `${FILES[f]}: one door at ${from}`);
    const z = s.indexOf(to, a + from.length);
    assert.ok(z > a, `${FILES[f]} ${from}: its end (${JSON.stringify(to)})`);
    const body = s.slice(a, z + to.length).split('\n').map((l) => l.replace(/\s\/\/ .*$/, '')).join('\n');
    for (const r of rules) {
      assert.match(body, new RegExp(`(madeRuleHere|madeSaysHere)\\('${r}'\\)|madeLevelRule\\(_made, '${r}'\\)`), `${FILES[f]} ${from}: reads the law's ${r}`);
      readRules.add(r);
    }
    assert.doesNotMatch(body, PRED, `${FILES[f]} ${from}: asks no level itself`);
  }
  // no line of the hosts or the systems pairs a level's own predicate with a rule's act
  const ACT = /\.no(Save|Rest|Map|Mark|Recall|Unstuck)\b|setCourtRules\(|LevitateWard\(|rezFor\(|applyDeathPenalty\(|setAvoidDeathHook|detachedAutomapRecord\(|savingPrevented|playerSlowFalling|registerJumpForgiveness|PORTAL_TEXT\.notHere|new DeathScreen\(/;
  for (const p of ['src/scenes/world.js', 'src/scenes/worldModes.js', 'src/scenes/dungeonContext.js', 'src/scenes/exterior.js', 'src/systems/useItem.js', 'src/combat/techniques.js', 'src/characters/playerEntity.js', 'src/scenes/shared.js']) {
    read(p).split('\n').forEach((line, i) => {
      const code = line.replace(/\s\/\/ .*$/, '');
      assert.ok(!(PRED.test(code) && ACT.test(code)), `${p}:${i + 1} asks a made level itself for a rule - read systems/madeLevel.js instead: ${code.trim().slice(0, 160)}`);
    });
  }
  // every rule the law names has its door
  for (const r of MADE_LEVEL_RULE_KEYS) assert.ok(readRules.has(r), `the law's ${r} is read at a door`);
});
