// CURSE-PERSIST1.
//
// Driven through the real doors: the curse is made by its own constructor, saved by snapshotPlayer, carried through
// JSON as the slot stores it, loaded by restorePlayer and ticked by runMagicRoundsFor - the path that pruned it.
import '../modsOff.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createLycanthropyCurse, liveLycanthropy } from '../../src/systems/lycanthropy.js';
import { createVampirismCurse, liveVampirism, VAMPIRE_CLAN_SPELLS, VAMPIRE_BASE_SPELLS } from '../../src/systems/vampirism.js';
import { LYCANTHROPY_TYPES, VAMPIRE_CLANS, INFECTION, createInfection, liveInfection } from '../../src/systems/infection.js';
import { tickActiveEffects } from '../../src/systems/effects.js';
import { snapshotPlayer, restorePlayer } from '../../src/systems/save/save.js';
import { setSpellRecordsByIndex } from '../../src/systems/loot/loot.js';
import { runMagicRoundsFor } from '../../src/systems/worldTick.js';

const records = new Map();
for (const i of [92, ...VAMPIRE_BASE_SPELLS, ...Object.values(VAMPIRE_CLAN_SPELLS).flat()]) records.set(i, { index: i, name: `!Spell${i}`, effects: [] });
beforeEach(() => setSpellRecordsByIndex(records));
const P = () => ({ isPlayer: true, level: 5, activeEffects: [], health: 60, maxHealth: 60, items: [], spells: [], stats: {}, skills: {} });
const NOW = 500000;
const TODAY = Math.floor(NOW / 1440);   // an infection caught today - hours from turning, so the rounds below keep it an infection
/** save, carry through JSON as the slot does, load into a fresh entity */
const reload = (p, at = NOW) => { const q = { isPlayer: true }; restorePlayer(q, JSON.parse(JSON.stringify(snapshotPlayer(p, { classicMinutes: at })))); return q; };

test('CURSE-PERSIST1: a curse and an infection survive a save, a load and the magic rounds after it - they are lifelong, flagged `permanent` as a disease and a poison already are (mutants: the flag dropped from either curse or the infection)', () => {
  const wolf = P(); createLycanthropyCurse(wolf, LYCANTHROPY_TYPES.Werewolf, { now: NOW });
  const vamp = P(); createVampirismCurse(vamp, VAMPIRE_CLANS.Selenu, { now: NOW });
  const sick = P(); sick.activeEffects.push(createInfection(INFECTION.Werewolf, { day: TODAY }));
  for (const p of [wolf, vamp, sick]) assert.equal(p.activeEffects.at(-1).permanent, true, 'made lifelong');
  for (const [name, p, live] of [['werewolf', wolf, liveLycanthropy], ['vampire', vamp, liveVampirism], ['infection', sick, liveInfection]]) {
    tickActiveEffects(p, {});   // a round in the session that caught it
    let q = reload(p);
    runMagicRoundsFor(q, NOW, NOW + 30, { sinks: {} });   // the rounds after the load - the prune ran on the first
    assert.ok(live(q), `${name}: still there after a load and thirty minutes`);
    q = reload(q, NOW + 30);
    runMagicRoundsFor(q, NOW + 30, NOW + 60, { sinks: {} });
    assert.ok(live(q), `${name}: and after a second one`);
  }
});
