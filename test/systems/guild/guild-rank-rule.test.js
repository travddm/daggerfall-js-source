// Guild ranks online (systems/guild/guild-rank-rule.ts, net/profile/profileKeys.ts guild.promoteNow, guild.seatRanks):
// DFU's 28-day wait and ranks 8 and 9 earned by default; the older online rules as the server profile's options.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookRankMax, promotesWithoutWait, seatsHoldTopRanks, GUILD_TOP_RANK, SEAT_BOOK_RANK_MAX } from '../../../src/systems/guild/guild-rank-rule.ts';
import { GUILDS, joinGuild, membershipOf, activeMemberships, DAYS_BETWEEN_RANK_CHANGES } from '../../../src/systems/guild/guilds.js';
import { serviceAccess, INSUFFICIENT_RANK_ID } from '../../../src/systems/guild/guildServiceFlow.js';
import { rollPaceOf } from '../../../src/net/npcRollTracker.js';
import { rollPromoteCeiling, rollBookCap, ROLL_BOOK_RANK_MAX } from '../../../src/net/npcChapterLaw.js';
import { playByRules } from '../../profileRules.mjs';

const DAY_S = 86_400;
const NOW_S = 400 * DAY_S;
/** A Roll that has paid a member for a long time: no pace holds a rank. */
const tracker = { stopped: null, standing: () => ({ rep: 200, since: NOW_S - 100 * DAY_S }) };
const memberAt = (g, rank) => {
  const entity = {};
  Object.assign(joinGuild(activeMemberships(entity), g, 1), { rank });
  return activeMemberships(entity);
};

test("online by default a member's book holds DFU's ranks to 9, and a review waits DFU's 28 days", () => {
  assert.equal(seatsHoldTopRanks(), false);
  assert.equal(bookRankMax(), GUILD_TOP_RANK);
  assert.equal(promotesWithoutWait(), false);
  assert.equal(DAYS_BETWEEN_RANK_CHANGES, 28);
  const pace = rollPaceOf(tracker, 40, NOW_S);
  assert.equal(pace?.book, 9);
  assert.equal(pace?.ceiling, 9, 'the Roll still paces the reputation, and 200 of it pays rank 9');
  assert.equal(pace?.promoteNow, false, 'the hall waits the 28 days, on the character\'s own clock');
});

test("with the server profile's options, the book stops at 7 for the chairs and a review promotes at once", (t) => {
  playByRules(t, { 'guild.seatRanks': true, 'guild.promoteNow': true });
  assert.equal(bookRankMax(), SEAT_BOOK_RANK_MAX);
  const pace = rollPaceOf(tracker, 40, NOW_S);
  assert.deepEqual([pace?.book, pace?.ceiling, pace?.promoteNow], [7, 7, true]);
});

test("the Roll's pace still bounds a new member, up to the book's top", () => {
  const fresh = { rep: 200, since: NOW_S };
  assert.equal(rollPromoteCeiling(fresh, NOW_S, 9), 1, 'one day at 15 a day pays rank 1');
  assert.equal(rollPromoteCeiling({ rep: 200, since: NOW_S - 30 * DAY_S }, NOW_S, 9), 9);
  assert.equal(rollPromoteCeiling({ rep: 200, since: NOW_S - 30 * DAY_S }, NOW_S), ROLL_BOOK_RANK_MAX, "the law's own default is the chairs' 7");
});

test("a book is held at 7 only where the chairs hold 8 and 9; DFU's book keeps 8 and 9", () => {
  const store = () => ({ mortal: { 1: { guild: 'MagesGuild', rank: 9 } }, vampire: {} });
  const dfu = store();
  assert.deepEqual(rollBookCap(dfu, GUILD_TOP_RANK), []);
  assert.equal(dfu.mortal[1].rank, 9);
  const seats = store();
  assert.equal(rollBookCap(seats, SEAT_BOOK_RANK_MAX).length, 1);
  assert.equal(seats.mortal[1].rank, 7);
});

test("a rank-8 service follows the rank (MagesGuild.CanAccessService): a rank-8 member teleports; a rank-7 one hears DFU's 3100, not the chairs' words", () => {
  const g = GUILDS.MagesGuild;
  const ctx = { rankCeiling: bookRankMax() };
  assert.deepEqual(serviceAccess(g, membershipOf(memberAt(g, 8), g), 'Teleport', ctx), { allowed: true });
  assert.deepEqual(serviceAccess(g, membershipOf(memberAt(g, 7), g), 'Teleport', ctx), { allowed: false, textId: INSUFFICIENT_RANK_ID });
});
