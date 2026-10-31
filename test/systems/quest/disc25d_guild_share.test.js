// DISC25-D.
//
// "Guard the Guild" is N0B10Y03, a MAGES GUILD quest; the player is a member of the Temple of Julianos. QUEST1's gate
// refused them rightly and said only "not a member of the guild this quest requires" - no use to someone who IS in a
// guild. The refusal names the guild now. And the Online pane still said "the quest clocks stand still", false since
// WORLD7; the rest of the report (a quest that waits for an hour of the day, under a clock a rest cannot move) is the
// shared clock's own law, said plainly now on the pane - the fast-forward itself is Mac's call (RESTX2 decided it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canReceiveSharedQuest, shareRefusalText, shareRefusedLine, SHARE_REFUSAL_TEXT, SHARE_GUILD_NAMES } from '../../../src/systems/quest/questShare.js';
import { GUILDS } from '../../../src/systems/guild/guilds.js';
import { MEMBERSHIP_STATUS } from '../../../src/systems/quest/questLists.js';
import { hostText } from '../../hostText.mjs';   // HOST-SPLIT 2 (AUDIT, the second read): its negatives read the host whole

const rd = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const machine = { hasFinishedSharedCopy: () => false, hasFinishedSharedQuestNamed: () => false, hasActiveQuestNamed: () => false, hasSharedQuestNamed: () => false };
/** The catalog row a guild quest has: its scope, its group, its membership column (QuestList-Classic's own shape). */
const listsFor = (guild) => ({
  findQuestMeta: () => ({ scope: 'guild', group: guild.guildGroup, quest: { membership: MEMBERSHIP_STATUS.Member, oneTime: false } }),
  hasAcceptedOneTime: () => false,
});

test('DISC25-D: a guild quest refused to a non-member names the guild - a temple member is told it is the Mages Guild\'s', () => {
  // N0B10Y03's row: a Mages Guild quest. The receiver has joined the Temple of Julianos and nothing else.
  const temple = { 'Temple:Julianos': { guild: 'Temple:Julianos', rank: 0 } };
  const r = canReceiveSharedQuest(machine, listsFor(GUILDS.MagesGuild), 'N0B10Y03', { memberships: temple });
  assert.deepEqual(r, { ok: false, reason: 'guild', guild: 'MagesGuild' });
  assert.equal(shareRefusalText(r), 'are not a member of the Mages Guild, which this quest requires.');
  // every guild a catalog row can name has a name to be said by
  for (const g of Object.values(GUILDS)) assert.ok(SHARE_GUILD_NAMES[g.name], `${g.name} is said`);
  // a member passes, as before
  const mage = { [GUILDS.MagesGuild.guildGroup]: { guild: 'MagesGuild', rank: 1 } };
  assert.equal(canReceiveSharedQuest(machine, listsFor(GUILDS.MagesGuild), 'N0B10Y03', { memberships: mage }).ok, true);
  // every other refusal is the fragment it always was; a guild refusal with no guild falls back to it
  assert.equal(shareRefusalText({ reason: 'active' }), SHARE_REFUSAL_TEXT.active);
  assert.equal(shareRefusalText({ reason: 'guild' }), SHARE_REFUSAL_TEXT.guild);
  assert.equal(shareRefusalText({ reason: 'nonsense' }), null);
  assert.equal(shareRefusedLine(r, 'Ana', 'Guard the Guild'), 'Ana tried to share "Guard the Guild", but you are not a member of the Mages Guild, which this quest requires.', 'the line names the guild');
});

