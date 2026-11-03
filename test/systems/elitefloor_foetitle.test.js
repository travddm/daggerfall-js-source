// ELITE-FLOOR + FOE-TITLE.
//   - ELITE-FLOOR: an elite is never a foe under ELITE_FOE_MIN_LEVEL (LOOT7's floor), the city watch, or an ally; a
//     refused promotion leaves the foe as it was built, and the dungeon's build arm falls through to its plain path.
//   - FOE-TITLE: one home names a special foe on every surface - a revenant by its own name, a champion by its trait,
//     an elite as "Elite" - the target bar, the hover (at peace only, HOVER-PLAIN), the death line and the body's title alike.
//   - ELITE-RATES: one foe in a hundred in the open world with no gate on how many stand or how soon; an ordinary
//     dungeon marks its elites by the per-foe roll (markDungeonPromotions), none by count. The Elite Dungeon keeps its 3 or 4.

import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { foeTitle } from '../../src/systems/foeTitle.js';
import * as eliteFoes from '../../src/systems/eliteFoes.js';
import { promoteEliteFoe, eliteEligible, ELITE_FOE_MIN_LEVEL, ELITE_FOE_HEALTH_MULT, ELITE_FOE_DAMAGE_MULT, grantEliteLoot, pickDungeonElites, markDungeonPromotions, ELITE_FOE_OVERWORLD_CHANCE, ELITE_FOE_DUNGEON_MIN, ELITE_FOE_DUNGEON_MAX } from '../../src/systems/eliteFoes.js';
import { createExteriorFoes } from '../../src/scenes/exteriorFoes.js';
import { championName, rollStreetPromotion, _resetStreetChampionsForTests } from '../../src/systems/champions.js';
import { setPref } from '../../src/systems/uiPrefs.js';
import { liveEntityName } from '../../src/systems/worldTooltips.js';
import { markFoeStruck, foeTarget, clearFoeTarget } from '../../src/ui/hud/hudFoeTarget.js';
import { KNIGHT_CITY_WATCH } from '../../src/characters/mobile/mobileTypes.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const foe = (over = {}) => ({ level: 5, mobileType: 7, health: 40, maxHealth: 40, team: 'Monster', ...over });

test('ELITE-FLOOR: under level 3, the watch and an ally are never elites - the foe stands as built; a puppet takes its owner\'s word (mutants: no floor; the watch promoted; an ally promoted; the puppet refused)', () => {
  assert.equal(ELITE_FOE_MIN_LEVEL, 3, 'LOOT7\'s champion floor');
  for (const [why, e] of [['level 2', foe({ level: 2 })], ['the watch', foe({ mobileType: KNIGHT_CITY_WATCH })], ['an ally', foe({ team: 'PlayerAlly' })], ['an ally by its copy', foe({ mobileTeam: 'PlayerAlly' })]]) {
    assert.equal(eliteEligible(e), false, why);
    assert.equal(promoteEliteFoe(e), false, `${why}: refused`);
    assert.equal(e.eliteFoe, undefined, `${why}: no mark`);
    assert.equal(e.maxHealth, 40, `${why}: its health as built`);
    assert.equal(e.damageScale, undefined, `${why}: its blows as built`);
    grantEliteLoot(e, 5, () => 0.5);
    assert.equal(e.items, undefined, `${why}: no elite drop`);
  }
  const ok = foe();
  assert.equal(promoteEliteFoe(ok), true);
  assert.equal(ok.eliteFoe, true);
  assert.equal(ok.maxHealth, 40 * ELITE_FOE_HEALTH_MULT);
  assert.equal(ok.damageScale, ELITE_FOE_DAMAGE_MULT);
  assert.equal(promoteEliteFoe(ok), true, 'idempotent: already one');
  assert.equal(ok.maxHealth, 40 * ELITE_FOE_HEALTH_MULT, '...and never twice');
  const pup = foe({ level: 1 });
  assert.equal(promoteEliteFoe(pup, { own: false }), true, 'a puppet stands as its owner\'s elite - the owner asked the floor');
  assert.equal(pup.maxHealth, 40, '...its maximum the owner\'s word');
});

test('FOE-TITLE: a revenant by its name, a champion by its trait, an elite as Elite, anyone else as it was - on the target bar, the hover, the death line and the body alike (mutants: the elite unnamed off the target bar; the revenant named by its kind)', () => {
  assert.equal(foeTitle({}, 'Orc'), 'Orc');
  assert.equal(foeTitle({ champion: 'mighty' }, 'Orc'), 'Mighty Orc');
  assert.equal(foeTitle({ eliteFoe: true }, 'Orc'), 'Elite Orc');
  assert.equal(foeTitle({ revenant: { name: 'Grushnak the Butcher' }, eliteFoe: true }, 'Orc'), 'Grushnak the Butcher', 'a revenant is its own name');
  assert.equal(foeTitle({ eliteFoe: true }, null), null, 'no name, nothing to dress');
  // every surface asks the one home
  const elite = foe({ eliteFoe: true });
  assert.equal(championName(elite, 'Orc'), 'Elite Orc', 'the death line and the body (championName)');
  assert.equal(liveEntityName({ entity: elite }, 'Orc'), 'Elite Orc', 'the hover\'s namer (HOVER-PLAIN: the plaque asks it only at peace)');
  clearFoeTarget();
  markFoeStruck({ entity: { ...elite, name: 'Orc' }, dead: false });
  assert.equal(foeTarget().name, 'Elite Orc', 'the target bar');
  clearFoeTarget();
  for (const f of ['src/ui/hud/hudFoeTarget.js', 'src/systems/worldTooltips.js', 'src/systems/champions.js']) {
    assert.match(read(f), /import \{ foeTitle \} from '[./]+(?:systems\/)?foeTitle\.js';/, `${f} asks the one home`);
  }
});

test('ELITE-RATES: the open world\'s odds - one in a hundred, and no gate left to ask', () => {
  assert.equal(ELITE_FOE_OVERWORLD_CHANCE, 0.01, 'one in a hundred');
  assert.equal(eliteFoes.rollOverworldElite, undefined, 'the elite is the street hash\'s band, not a roll of its own');
  assert.equal(eliteFoes.overworldEliteAllowed, undefined, 'the gate is gone');
  assert.equal(eliteFoes.ELITE_FOE_OVERWORLD_GAP_MINUTES, undefined, 'and its gap');
});

test('ELITE-RATES: the dungeons - an ordinary one places none by count and marks about one foe in a hundred by the per-foe roll, an Elite Dungeon still 3 or 4 (mutant: the Elite Dungeon thinned)', () => {
  setPref('lootRarity', true);
  assert.equal(eliteFoes.ELITE_FOE_NORMAL_DUNGEON_CHANCE, undefined, 'the per-dungeon chance is gone');
  assert.deepEqual([ELITE_FOE_DUNGEON_MIN, ELITE_FOE_DUNGEON_MAX], [3, 4], 'Mac\'s own "3 - 4 times in Elite Dungeons"');
  const list = () => Array.from({ length: 40 }, () => ({ mobileType: 7 }));
  let normal = 0, marked = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) {
    const records = list();
    normal += pickDungeonElites(records, `loc${i}`, { elite: false });
    markDungeonPromotions(records, `loc${i}`);
    marked += records.filter((e) => e.eliteFoe).length;
  }
  assert.equal(normal, 0, 'none placed by count');
  assert.ok(marked / (N * 40) > 0.008 && marked / (N * 40) < 0.012, `about one in a hundred (${marked}/${N * 40})`);
  for (let i = 0; i < 200; i++) {
    const n = pickDungeonElites(list(), `loc${i}`, { elite: true });
    assert.ok(n >= 3 && n <= 4, `an Elite Dungeon: ${n}`);
  }
});

test('ELITE-RATES: the open world\'s pool, online - a camp whose stands all roll elite stands every one elite, the next at once one too; a returning revenant stands as what it was, never a fresh roll (mutants: the one-standing gate back; the revenant rolled)', async () => {
  setPref('lootRarity', true);
  // The street roll is a hash of the spot and the pool's count of stands, so each stand is put on a spot that rolls elite at its count.
  const tierAt = (feet, count) => {
    _resetStreetChampionsForTests();
    for (let k = 1; k < count; k++) rollStreetPromotion([0, 0, 0], 0);
    return rollStreetPromotion(feet, 2)?.tier ?? null;
  };
  const eliteSpot = (count) => {
    for (let i = 0; i < 5000; i++) { const feet = [i * 3, 0, count * 1000]; if (tierAt(feet, count) === 'elite') return feet; }
    throw new Error('no elite spot for count ' + count);
  };
  const spots = [1, 2, 3, 4, 5].map(eliteSpot);
  _resetStreetChampionsForTests();
  const careers = (() => {
    const b = new Uint8Array(74); const v = new DataView(b.buffer);
    b[10] = 0x08; v.setUint16(52, 4, true);
    for (let i = 0; i < 8; i++) v.setUint16(58 + i * 2, 50, true);
    const NAME_FIELD = 14, ENTRY = 18, out = new Uint8Array(4 + b.length + ENTRY), dv = new DataView(out.buffer);
    dv.setInt16(0, 1, true); dv.setUint16(2, 0x0100, true); out.set(b, 4);
    const name = 'ENEMY002.CFG';
    for (let i = 0; i < name.length; i++) out[4 + b.length + i] = name.charCodeAt(i);
    dv.setInt32(4 + b.length + NAME_FIELD, b.length, true);
    return out;
  })();
  const stubTex = { getSize: () => ({ width: 64, height: 100 }), getScale: () => ({ width: 0, height: 0 }), recordCount: 8, getFrameCount: () => 1 };
  const minute = 1000;
  const pool = createExteriorFoes({
    renderer: { createBillboardBatch: () => ({}), destroyBillboardBatch: () => {}, destroyBatch: () => {}, textures: new Map() },
    collider: { raycast: () => Infinity, heightAt: () => 0, raycastHit: () => ({ dist: Infinity, normal: null }), sphereOverlaps: () => false },
    fetchBytes: async (n) => { if (n === 'MONSTER.BSA') return careers; throw new Error(`no ${n} here`); },
    getTexture: async () => stubTex, uploadRecordFrame: () => {},
    currentMinute: () => minute, currentPixelKey: () => '3,12', inLocation: () => false,
    playerEntity: { level: 10, reflexes: 2, skills: new Array(40).fill(20), skillUses: new Array(40).fill(0), items: [], activeEffects: [], stats: { strength: 50, agility: 50, luck: 50, speed: 50 }, crimeCommitted: 4 },
    audio: null, onPlayerHurt: () => {}, rolls: () => 0.5, rand: () => 0.9, say: () => {},
  });
  pool.setNet({ room: () => 'r' });   // online: a host in a room
  try {
    const camp = [];
    for (const feet of spots.slice(0, 4)) camp.push(await pool.spawnFoe(2, feet, { feetGiven: true, level: 5 }));
    assert.equal(camp.filter((f) => f?.entity.eliteFoe).length, 4, 'a camp of four that rolls elite: four elites, none gated by another standing');
    const soon = await pool.spawnFoe(2, spots[4], { feetGiven: true, level: 5 });
    assert.equal(soon.entity.eliteFoe, true, 'the same minute, four standing: one more - no gap');
    const nem = await pool.spawnFoe(2, [0, 0, 50], { feetGiven: true, level: 5, revenant: { id: 'n1', name: 'Grushnak the Butcher', rank: 1, elite: true, trait: null, returns: 0, history: [] } });
    assert.equal(nem.entity.eliteFoe, true, 'an elite revenant stands as one');
    const plain = await pool.spawnFoe(2, [0, 0, 60], { feetGiven: true, level: 5, revenant: { id: 'n2', name: 'Vesk the Quiet', rank: 1, elite: false, trait: null, returns: 0, history: [] } });
    assert.equal(!!plain.entity.eliteFoe, false, 'a plain revenant stays plain, the roll that would win never asked');
  } finally { pool.destroy?.(); }
});
