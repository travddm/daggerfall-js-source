// RENOWN-ACCOUNT: ONE RENOWN AN
// ACCOUNT, AND A SLOWER GRIND - and RENOWN-CHAR took the
// first half back the next day (test/server/renown_char.test.js holds a character's track again). What
// stands here is RENOWN-ACCOUNT's own: the law (src/net/renown.js) - every source pays RENOWN_RATE_PCT, three quarters,
// of its full rate, floored once (renownRate), the hour's bound 15,000, the curve unmoved; and the relay untouched, the
// law never in its bundle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  RENOWN_RATE_PCT, renownRate, renownKillXp, renownQuestXp, renownRaidXp, renownPartyXp, renownXpFor, renownForXp,
  RENOWN_KILL_XP_PER_LEVEL, RENOWN_KILL_LEVEL_MAX, RENOWN_QUEST_XP_BASE, RENOWN_QUEST_XP_PER_LEVEL, RENOWN_QUEST_LEVEL_MAX,
  RENOWN_OVER_MAX, RENOWN_XP_HOUR_MAX, RENOWN_XP_REPORT_MAX, RENOWN_XP_MAX, RENOWN_MAX, RENOWN_RAID_QUESTS, RENOWN_TRACKS_MAX,
} from '../../src/net/renown.js';
import { graph } from '../importGraph.mjs';

const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

// ═══ THE LAW ═════════════════════════════════════════════════════════════════════════════════════

test('RENOWN-ACCOUNT the rate: every source pays RENOWN_RATE_PCT (75) of its full rate, floored ONCE (renownRate) - a kill 7.5 a foe level (7, 15, 22 ... 225), a quest 75 + 30 a level, a raid three such quests (585 at Renown 1, 1,395 at 10, 2,925 from 27), the party\'s bonus on the rated kill (383 for eight at level 30); every result whole; the curve unmoved; the hour 15,000 (mutants: the rate unread for a kill; for a quest; rounded rather than floored; the full rate kept; the hour at 20,000)', () => {
  assert.equal(RENOWN_RATE_PCT, 75);
  assert.deepEqual([0, 1, 10, 15, 30, 100, 140, 4000].map(renownRate), [0, 0, 7, 11, 22, 75, 105, 3000]);
  assert.deepEqual([renownRate(-5), renownRate(Number.NaN), renownRate(undefined), renownRate(10.9)], [0, 0, 0, 7], 'whole XP in, whole XP out');
  // THE KILL - at the cap's Renown nothing is read lower (RENOWN3's ceiling is test/net/renown3.test.js's)
  const kills = Array.from({ length: RENOWN_KILL_LEVEL_MAX }, (_, i) => renownKillXp(i + 1, RENOWN_MAX));
  assert.deepEqual(kills.slice(0, 10), [7, 15, 22, 30, 37, 45, 52, 60, 67, 75], 'a rat is 7 - it was 10');
  assert.deepEqual([renownKillXp(20, RENOWN_MAX), renownKillXp(30, RENOWN_MAX), renownKillXp(99, RENOWN_MAX), renownKillXp(0, RENOWN_MAX)], [150, 225, 225, 7], 'a lich 150, a level-30 foe 225 - they were 200 and 300');
  kills.forEach((k, i) => assert.equal(k, Math.floor((RENOWN_KILL_XP_PER_LEVEL * (i + 1) * 3) / 4), `a level-${i + 1} kill is three quarters of ${RENOWN_KILL_XP_PER_LEVEL * (i + 1)}, floored`));
  // THE QUEST - 75 and 30 a level, whole already
  for (let L = 1; L <= RENOWN_QUEST_LEVEL_MAX; L++) assert.equal(renownQuestXp(L, RENOWN_MAX), 75 + 30 * L, `a quest at character level ${L}`);
  assert.deepEqual([RENOWN_KILL_XP_PER_LEVEL, RENOWN_QUEST_XP_BASE, RENOWN_QUEST_XP_PER_LEVEL], [10, 100, 40], 'the full rates stand: the rate is taken after them, in one place');
  // EVERY SOURCE, at every Renown: at most three quarters of its full rate, and short of it by less than one XP
  for (let r = 1; r <= RENOWN_MAX; r++) {
    for (let L = 1; L <= RENOWN_KILL_LEVEL_MAX; L++) {
      const read = Math.min(L, r + RENOWN_OVER_MAX);
      const k = renownKillXp(L, r), q = renownQuestXp(L, r);
      assert.ok(Number.isSafeInteger(k) && k * 4 <= RENOWN_KILL_XP_PER_LEVEL * read * 3 && (k + 1) * 4 > RENOWN_KILL_XP_PER_LEVEL * read * 3, `a level-${L} kill at Renown ${r}: ${k}`);
      assert.equal(q * 4, (RENOWN_QUEST_XP_BASE + RENOWN_QUEST_XP_PER_LEVEL * read) * 3, `a level-${L} quest at Renown ${r}: ${q}`);
    }
  }
  // THE RAID follows the quests: three at the top quest level
  assert.equal(RENOWN_RAID_QUESTS, 3);
  assert.deepEqual([renownRaidXp(null), renownRaidXp(1), renownRaidXp(10), renownRaidXp(27), renownRaidXp(RENOWN_MAX)], [585, 585, 1395, 2925, 2925], 'they were 780, 1,860 and 3,900');
  // THE PARTY: the bonus rides on the rated kill, so its base is a quarter less too
  assert.equal(renownPartyXp(renownKillXp(30, RENOWN_MAX), 8), 383, 'eight at level 30 - it was 510');
  assert.equal(renownPartyXp(renownKillXp(20, RENOWN_MAX), 4), 195);
  // THE CURVE did not move: the grind is slower because every source pays less, never because a level costs more
  assert.deepEqual([2, 10, 20, 50].map(renownXpFor), [100, 5510, 68200, 2318660]);
  assert.equal(RENOWN_XP_MAX, 2318660);
  assert.equal(renownForXp(5510), 10);
  // THE HOUR: a quarter off, as every source
  assert.equal(RENOWN_XP_HOUR_MAX, 15_000);
  assert.equal(RENOWN_XP_REPORT_MAX, 5_000, 'one report\'s bound stands');
  assert.equal(Math.ceil(RENOWN_XP_MAX / RENOWN_XP_HOUR_MAX), 155, 'a client that lies every hour takes 155 hours to the cap - it was 116');
  assert.equal(RENOWN_TRACKS_MAX, 60, 'RENOWN-CHAR: the tracks\' bound came back with the tracks (RENOWN-ACCOUNT had taken it)');
});

test('RENOWN-ACCOUNT the relay is untouched: the law is the account Worker\'s and the page\'s, never in the relay\'s bundle (test/net/relayversion.test.js holds that bundle\'s hash); the Worker bundles it and its deploy filter names it', () => {
  assert.equal(graph('server/src/index.js').includes('src/net/renown.js'), false, 'not the relay\'s');
  assert.ok(graph('server-account/src/index.js').includes('src/net/renown.js'), 'the account Worker\'s');
  assert.match(src('.github/workflows/account-deploy.yml'), /- "src\/net\/renown\.js"/);
});
