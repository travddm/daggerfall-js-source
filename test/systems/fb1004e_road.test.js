// FIELD BUGS 2026-10-04e - WILD-ROAD (bible/01-Overview/bugs/Field-Bugs-2026-10-04e.md, report 4; its HUNT-ROAD went with
// HUNT-OUT's text hunt, removed on main).
//
// Discord (Private Joker, "Wilderness Encounter Chances"): "perhaps encounters can be scaled with player level or some
// other metric. having to completely halt my travel because 1 rat chose today to die can be quite the interruption.
// That as well as the random hunting y/n prompts that stop you completely. If I'm going to be stopped on the road, let
// it be for something important or dangerous. a roving orc patrol, a bandit holdup ... This shouldn't be every
// encounter of course. A level 1 leaving privateers hold can take care of the rat problems lol."
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { trivialOnRoad, roadCompany, wandererCount, TRIVIAL_LEVEL_RATIO, ROAD_PARTY_MAX } from '../../src/systems/roadEncounters.js';
import { ENEMY_BASICS } from '../../src/characters/enemy/enemyBasics.js';
import { MOBILE_TYPES as M } from '../../src/characters/mobile/mobileTypes.js';
import { SOLITARY_TYPES } from '../../src/characters/mobile/mobileFactions.js';
import { amGroupRollOwner } from '../../src/systems/campEncounters.js';
import { partyExtraFoes } from '../../src/systems/party/partyScale.js';
import { FEATURES } from '../../src/systems/features.js';
import { WILD_GIANT } from '../../src/systems/wild/wildZone.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
const mount = (src, scope, tail) => { const k = Object.keys(scope); return new Function(...k, `${src}\n${tail}`)(...k.map((x) => scope[x])); };

test('WILD-ROAD law: a monster a third of the traveller\'s level or less is passed by on the road - a rat from level 3, an imp from 6, an orc from 15, a giant from 30; a class foe never (mutants: the ratio loosened; class foes trivial)', () => {
  assert.equal(TRIVIAL_LEVEL_RATIO, 3);
  assert.equal(trivialOnRoad(M.Rat, 2), false, 'a level 2 is stopped by a rat - "a level 1 ... can take care of the rat problems"');
  assert.equal(trivialOnRoad(M.Rat, 3), true);
  assert.equal(trivialOnRoad(M.Orc, 14), false);
  assert.equal(trivialOnRoad(M.Orc, 15), true);
  assert.equal(ENEMY_BASICS[130].level, undefined, 'a class foe has no level of its own - it is built at the traveller\'s');
  assert.equal(trivialOnRoad(130, 99), false, 'so it is never passed by');
  // a SOLITARY kind is solitary in company (never part of a camp, PSCALE1), not in danger: an Imp is level 2
  assert.ok(SOLITARY_TYPES.has(M.Imp));
  assert.equal(trivialOnRoad(M.Imp, 5), false);
  assert.equal(trivialOnRoad(M.Imp, 6), true, 'an imp from level 6');
  assert.equal(trivialOnRoad(M.Giant, 29), false);
  assert.equal(trivialOnRoad(M.Giant, 30), true, 'a giant from 30');
  assert.equal(trivialOnRoad(M.Lich, 59), false, 'a lich stops anyone short of 60');
  assert.equal(trivialOnRoad(-1, 40), false);
  assert.equal(trivialOnRoad(M.Rat, NaN), false);
});

test('WILD-ROAD law: company on the road - none below level 5 or for a solitary kind; a chance of level/50 (two in five at most) of one more, one more each six levels past five; never past four with the party\'s own (mutants: the chance inverted; the size unbounded; the party cap gone)', () => {
  assert.equal(roadCompany(M.Orc, 4, 0), 0, 'below level 5');
  assert.equal(roadCompany(M.Orc, 10, 0.19), 1, 'level 10: one in five, one more');
  assert.equal(roadCompany(M.Orc, 10, 0.2), 0, 'the roll past the chance');
  assert.equal(roadCompany(M.Orc, 17, 0.1), 3, 'level 17: three more');
  assert.equal(roadCompany(M.Orc, 40, 0.39), 3, 'never past three');
  assert.equal(roadCompany(M.Orc, 40, 0.4), 0, 'two in five at most');
  assert.equal(roadCompany(M.Imp, 40, 0), 0, 'a solitary kind comes alone');
  assert.equal(wandererCount(M.Orc, 0, 0), 1);
  assert.equal(wandererCount(M.Orc, 3, 3), ROAD_PARTY_MAX, 'the party\'s extras and the road\'s company together, at most four');
  assert.equal(wandererCount(M.Orc, 3, 0), 1 + 3, 'PSCALE1 unchanged off the road');
  assert.equal(wandererCount(M.Imp, 3, 3), 1);
});

test('WILD-ROAD mounted: on the road a level 10 rides past a rat and stands an orc patrol now and then; off the road, or with the switch off, DFU\'s wanderer as it was (mutants: the road never asked; the switch ignored; no company stood)', () => {
  const row = FEATURES.find((f) => f.id === 'road-encounters');
  assert.equal(row?.control.key, 'roadEncounters', 'the World switch the arm reads');
  assert.equal(row.control.initial, true, 'on by default');
  const seq = (...ids) => { let i = 0; return () => ({ mobileType: ids[i++] }); };
});

