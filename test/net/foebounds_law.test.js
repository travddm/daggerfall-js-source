// FOE-BOUNDS: THE MOST HEALTH A STREAMED
// FOE CAN LEGALLY HAVE (net/foeBounds.js), held to the builders it copies - each constant equal to its home, each row to
// the most of DFU's row and the Enemy Expansion's (with MUDEX and the stat pass), and each bound EQUAL to what the game's own builders make of a foe at its worst (the spec's
// "exact legal max and max+1": the maximum stands, one more is refused).
import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FOE_BOUND, FOE_BOUND_ROWS, FOE_HERO_HEALTH_MAX, foeHealthBound, foeStatsRefusal } from '../../src/net/foeBounds.js';
import { ENEMY_BASICS } from '../../src/characters/enemy/enemyBasics.js';
import { rollEnemyClassMaxHealth, applyHeroThreat } from '../../src/characters/enemy/enemyEntity.js';
import { dexClassicRow } from '../../src/systems/enemyExpansion/dexInstall.js';   // DEX1: the enemy mod's classic lines, its switch aside
import { HP_MAX } from '../../src/systems/customClass.js';
import { PROMOTION } from '../../src/systems/foe-promotion.ts';
import { ELITE_FOE_SUPER_DUNGEON_HEALTH_MULT, promoteEliteFoe } from '../../src/systems/eliteFoes.js';
import { SUPER_HEALTH_SCALE, scaleSuperFoe } from '../../src/world/superDungeon/sdDungeon.js';
import { CHAMPION_TRAITS, CHAMPION_MIN_LEVEL, applyChampion, _resetStreetChampionsForTests } from '../../src/systems/champions.js';
import { REVENANT_HEALTH_PER_RANK, REVENANT_MAX_RANK, applyRevenant } from '../../src/systems/revenant/revenant.js';
import { FESTER, WRATH_MAX } from '../../src/systems/revenant/revenantFeud.js';
import { DREAD } from '../../src/systems/revenant/revenantUnquiet.js';
import { RITE_SUMMONER_HEALTH } from '../../src/net/gate/gateRite.js';
import { STAR_FOE_HEALTH } from '../../src/net/starfall/starfallLaw.js';
import { KNIGHT_CITY_WATCH } from '../../src/characters/mobile/mobileTypes.js';
import { HERO_THREAT, heroThreat } from '../../src/systems/heroThreat.js';
import { setPref, _resetForTests } from '../../src/systems/uiPrefs.js';

const ladder = () => { _resetForTests(); setPref('lootRarity', true); _resetStreetChampionsForTests(); };
const MONSTERS = [...FOE_BOUND_ROWS.keys()];
const isClass = (t) => t >= 128;
/** A foe at its worst roll, as the builders hold it. */
const entityOf = (t, l) => {
  const max = isClass(t) ? rollEnemyClassMaxHealth(l, HP_MAX, () => 0.999999) : FOE_BOUND_ROWS.get(t)[0];
  return { mobileType: t, level: isClass(t) ? l : FOE_BOUND_ROWS.get(t)[1], maxHealth: max, health: max };
};
/** The hero's threat at his worst, through the game's own writer. */
const hero = (e) => applyHeroThreat(e, heroThreat(HERO_THREAT.to));
const revenantAt = (e) => applyRevenant(e, { id: 'rvn-bound', name: 'Grak', mobileType: e.mobileType, rank: REVENANT_MAX_RANK, wrath: WRATH_MAX, dread: true, wounds: [], learned: [], history: [], returns: 0 });

test('FOE-BOUNDS EACH MULTIPLIER IS ITS HOME\'S: the class roll, the elite, the Super dungeon, the champion and its traits, the revenant\'s rank, wrath and Dread, the Rite\'s Summoner, a star\'s coven, the City Watch and the hero - copied because the relay cannot import their homes, equal to each (mutants: each copy off its home)', () => {
  assert.equal(rollEnemyClassMaxHealth(7, 1, () => 0), FOE_BOUND.classBase + 7, 'DFU\'s class roll: 10 and a die a level');
  assert.deepEqual([FOE_BOUND.classHpPerLevel, FOE_BOUND.elite, FOE_BOUND.superFoe, FOE_BOUND.champion, FOE_BOUND.championMinLevel], [HP_MAX, PROMOTION.elite.health, SUPER_HEALTH_SCALE, PROMOTION.champion.health, CHAMPION_MIN_LEVEL]);
  assert.equal(FOE_BOUND.superElite, ELITE_FOE_SUPER_DUNGEON_HEALTH_MULT, "the Super dungeon's elite");
  assert.deepEqual(FOE_BOUND.championTraits, CHAMPION_TRAITS.map((t) => t.health ?? 1));
  assert.deepEqual([FOE_BOUND.revenantPerRank, FOE_BOUND.revenantRankMax, FOE_BOUND.festerHealth, FOE_BOUND.wrathMax, FOE_BOUND.dread], [REVENANT_HEALTH_PER_RANK, REVENANT_MAX_RANK, FESTER.HEALTH, WRATH_MAX, DREAD.HEALTH]);
  for (const gone of ['wild', 'wildRingTop', 'giant', 'giantType', 'zoneWatch']) assert.equal(gone in FOE_BOUND, false, `${gone}: the open zone's stages are gone`);
  assert.deepEqual([FOE_BOUND.rite, FOE_BOUND.star, FOE_BOUND.watch], [RITE_SUMMONER_HEALTH, STAR_FOE_HEALTH, KNIGHT_CITY_WATCH]);
  assert.deepEqual(FOE_BOUND.hero, { from: HERO_THREAT.from, to: HERO_THREAT.to, health: HERO_THREAT.health });
  assert.equal(FOE_HERO_HEALTH_MAX, heroThreat(1000).health, 'the hero at its worst');
  assert.equal(FOE_HERO_HEALTH_MAX, HERO_THREAT.health ** 15, 'fifteen levels past 30');
});

test("FOE-BOUNDS EACH MONSTER'S ROW AT ITS MOST: the most health and the most level of DFU's row and of the Enemy Expansion's classic line with MUDEX and the stat pass over it (the mod loaded writes the row into the table) - all 42 monsters, never the horse; a class foe has no row (mutants: a row one off; one profile left out)", () => {
  const want = Object.entries(ENEMY_BASICS).filter(([t, b]) => +t < 128 && b.maxHealth != null).map(([ts, b]) => {
    const t = +ts, dx = dexClassicRow(t, b, { mudex: true });
    return [t, [Math.max(b.maxHealth, dx.maxHealth), Math.max(b.level, dx.level)]];
  });
  assert.deepEqual([...FOE_BOUND_ROWS], want);
  assert.equal(FOE_BOUND_ROWS.size, 42);
  assert.equal(foeHealthBound({ t: 39, k: 1e5 }), null, 'the horse: unverified');
  assert.equal(foeHealthBound({ t: 200, k: 1e5 }), null, 'an unknown type: unverified');
  assert.equal(foeHealthBound({ t: 256, k: 1e5 }), null, 'DEX1: a mod\'s own kind (the Goblin): unverified - the relay holds no career of it');
  assert.equal(foeStatsRefusal({ t: 34, k: 55, h: 55 }), null, 'the Dragonling at its row with the stat pass (55) stands');
});

test('FOE-BOUNDS THE STREET\'S BOUND IS ITS BUILDERS\' WORST, EXACTLY: every monster and a class foe at three levels, built through the game\'s own stages in spawnFoe\'s order - its row, an elite (`z`), one of an elite, a Stalwart champion (`cp`) or the hero at his worst, a revenant at rank 5 with full wrath and the Dread (`nm`), a Rite\'s Summoner or a star\'s coven - stand at their bound, and one more is refused (mutants: a stage left out; the order or the rounding changed)', () => {
  ladder();
  const cases = [...MONSTERS.map((t) => [t, null]), [135, 1], [135, 37], [KNIGHT_CITY_WATCH, 100]];
  for (const [t, l] of cases) {
    for (const flags of [{}, { z: 1 }, { cp: 1 }, { nm: 'Grak' }, { z: 1, nm: 'Grak' }, { cp: 1, camp: true }]) {
      if (t === KNIGHT_CITY_WATCH && (flags.z || Number.isInteger(flags.cp))) continue;   // never the watch's
      const e = entityOf(t, l);
      if (flags.z) assert.ok(promoteEliteFoe(e) || e.level < 3, `${t} elite`);
      if (flags.z && !e.eliteFoe) continue;   // ELITE-FLOOR: not this kind
      if (Number.isInteger(flags.cp)) { if (!applyChampion(e, flags.cp)) continue; }   // under its level
      else if (!flags.z) hero(e);   // a promoted foe takes no hero's threat (spawnFoe)
      if (flags.nm) revenantAt(e);
      if (flags.camp) e.maxHealth = Math.max(1, Math.round(e.maxHealth * (isClass(t) ? Math.max(RITE_SUMMONER_HEALTH, STAR_FOE_HEALTH) : STAR_FOE_HEALTH)));   // scenes/riteHost.js riteFoe's own line; STAR-TUNE: a star's coven (scenes/starfall/starfallHost.js toughen), any kind
      const r = { t, ...(l != null ? { l } : {}), ...(flags.z ? { z: 1 } : {}), ...(Number.isInteger(flags.cp) ? { cp: flags.cp } : {}), ...(flags.nm ? { nm: flags.nm } : {}) };
      const o = { camp: !!flags.camp };
      assert.equal(foeHealthBound(r, o), e.maxHealth, `${t}/${l} ${JSON.stringify(flags)}`);
      assert.equal(foeStatsRefusal({ ...r, k: e.maxHealth, h: e.maxHealth }, o), null, 'the maximum stands');
      assert.deepEqual(foeStatsRefusal({ ...r, k: e.maxHealth + 1 }, o), { t, k: e.maxHealth + 1, mx: e.maxHealth }, 'one more is refused');
    }
  }
  // the City Watch: its class roll (scenes/cityGuards.js) - under its encounter's chain
  const w = entityOf(KNIGHT_CITY_WATCH, 40);
  assert.ok(foeHealthBound({ t: KNIGHT_CITY_WATCH, l: 40 }, { camp: false }) >= w.maxHealth);
});

test("FOE-BOUNDS THE DUNGEON'S BOUND IS ITS BUILDERS' WORST, EXACTLY: a layout foe - a Super dungeon's x4 then the hero at his worst or a Stalwart champion, or a Super dungeon's elite - the record carrying no marks there; a revenant's lair stand (the hero's threat, then the revenant's stages) stands under it (mutants: the Super dungeon's x4 left out; the elite's x9)", () => {
  ladder();
  const stalwart = FOE_BOUND.championTraits.indexOf(Math.max(...FOE_BOUND.championTraits));
  for (const [t, l] of [...MONSTERS.map((x) => [x, null]), [131, 20]]) {
    const a = entityOf(t, l); scaleSuperFoe(a); hero(a);
    const b = entityOf(t, l); scaleSuperFoe(b); const champion = applyChampion(b, stalwart);
    const c = entityOf(t, l); promoteEliteFoe(c, { superDungeon: true, checkLevel: false });
    const r = { t, ...(l != null ? { l } : {}) };
    assert.equal(foeHealthBound(r, { lane: 'dungeon' }), Math.max(a.maxHealth, champion ? b.maxHealth : 0, c.maxHealth), `${t}`);
    assert.ok(foeHealthBound(r, { lane: 'any' }) >= Math.max(foeHealthBound(r, { lane: 'dungeon' }), foeHealthBound(r)), "the relay's 'any': the larger");
    const lair = entityOf(t, l); hero(lair); revenantAt(lair);
    assert.ok(lair.maxHealth <= foeHealthBound(r, { lane: 'any' }), `${t}: a revenant's lair stand is under the bound`);
  }
});

test('FOE-BOUNDS WHAT A RECORD SAYS OF ITSELF ONLY RAISES ITS BOUND, AND NO BUILDER GIVES SOME MARKS: a rat with no marks is held to its own chain, a camp\'s twice it (a star\'s coven); an elite, a champion, a revenant\'s name raise it; the City Watch never an elite or a champion; no champion under level 3 (mutants: a mark read when absent; the watch\'s marks believed; the champion\'s floor)', () => {
  const plain = foeHealthBound({ t: 0 }, { camp: false });
  assert.equal(plain, Math.round(FOE_BOUND_ROWS.get(0)[0] * FOE_HERO_HEALTH_MAX), 'a rat: its row and the hero');
  // STAR-TUNE: a camp's monster may be a fallen star's coven (x2, rounded once more); unknown is a camp's, the worst
  assert.equal(foeHealthBound({ t: 0 }, { camp: true }), Math.round(plain * STAR_FOE_HEALTH), 'a rat in a camp: a star\'s coven');
  assert.equal(foeHealthBound({ t: 0 }, {}), foeHealthBound({ t: 0 }, { camp: true }), 'unknown: a camp\'s');
  for (const m of [{ z: 1 }, { cp: 1 }, { nm: 'Grak' }]) assert.ok(foeHealthBound({ t: 0, ...m }, {}) > plain, JSON.stringify(m));
  assert.ok(foeStatsRefusal({ t: 0, k: 99_999 }), 'the forged rat');
  assert.equal(foeHealthBound({ t: 16, z: 1, gg: 0 }, { camp: false }), foeHealthBound({ t: 16, z: 1 }, { camp: false }), 'no Greater Giant mark raises a bound: the open zone is gone');
  assert.ok(foeStatsRefusal({ t: KNIGHT_CITY_WATCH, l: 20, z: 1, k: 10 }), 'an elite watchman');
  assert.ok(foeStatsRefusal({ t: KNIGHT_CITY_WATCH, l: 20, cp: 0, k: 10 }), 'a champion watchman');
  assert.ok(foeStatsRefusal({ t: 1, cp: 0, k: 10 }), 'a champion of level 2');
  assert.equal(foeStatsRefusal({ t: 2, cp: 0, k: 10 }), null, 'a champion of level 3');
  assert.ok(foeStatsRefusal({ t: 0, h: plain + 1 }, { camp: false }), 'its health past the bound, too');
  assert.equal(foeStatsRefusal({ t: 39, k: 1e5 }), null, 'unverified: never refused');
});
