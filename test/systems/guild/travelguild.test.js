// TP1 - THE FAST-TRAVEL GUILD DISCOUNT + RAISESKILLS ON ARRIVAL
// (2026-08-29).
//
// travelPopUp.js flagged four things as "idling loudly". Two of them
// were not idling on anything any more:
//
//   GuildManager.FastTravel (:284) - "no guild perk seam". The seam is
//     activeMemberships, which G2 shipped, and the perk is one guild's:
//     Temple.FastTravel (Temple.cs:430-436) returns
//     `(int)(((95f - rank) / 100) * duration)` for AKATOSH, god of
//     time, and Guild.FastTravel is the identity for everyone else
//     (:241-244). GuildManager folds every membership through it.
//   RaiseSkills on arrival (:380). AUDIT 23 established that
//     PlayerEntity.Update runs NO advancement and that DFU calls
//     RaiseSkills from exactly two window-closings - rest, which
//     shipped, and this one. shared.js's own doc named this site as
//     "the other site, unported".
//
// The discount lands BETWEEN CalculateTravelTime and CalculateTripCost
// (:281-296), so Akatosh's blessing cuts the FARE as well as the days.
// That ordering is the whole reason the port's flag sat on the line it
// did, and it is the first pin below.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { guildFastTravel, templeOf, AKATOSH_DIVINE } from '../../../src/systems/guild/guildVariants.js';

const HERE = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
/** The membership book shape activeMemberships answers: keyed by
 *  guildGroup, each `{ guild: <name>, rank }`. */
const book = (guild, rank) => ({ HolyOrder: { guild, rank } });

test('TP1: only AKATOSH shortens a journey - every other guild is the identity', () => {
  const akatosh = templeOf(AKATOSH_DIVINE).name;
  assert.equal(akatosh, 'Temple:Akatosh', 'the name comes from the Temple, not a literal here');
  // Guild.FastTravel is `return duration` (:241-244), so a member of
  // anything else travels at full length - pinned on a temple, because
  // the wrong fix is "any HolyOrder membership discounts".
  assert.equal(guildFastTravel(null, 1000, { memberships: book('Temple:Arkay', 9) }), 1000);
  assert.equal(guildFastTravel(null, 1000, { memberships: book('Temple:Julianos', 9) }), 1000);
  assert.equal(guildFastTravel(null, 1000, { memberships: {} }), 1000, 'and a guildless traveller too');
  assert.equal(guildFastTravel(null, 1000, { memberships: book(akatosh, 0) }), 950);
});

test('TP1: the discount is (95 - rank)% and TRUNCATES, per rank', () => {
  const akatosh = templeOf(AKATOSH_DIVINE).name;
  // rank 0 travels in 95%, rank 9 in 86% - the literals, not a
  // re-derivation of the formula the code runs.
  assert.equal(guildFastTravel(null, 1000, { memberships: book(akatosh, 0) }), 950);
  assert.equal(guildFastTravel(null, 1000, { memberships: book(akatosh, 5) }), 900);
  assert.equal(guildFastTravel(null, 1000, { memberships: book(akatosh, 9) }), 860);
  // C#'s (int) cast truncates toward zero and the divide is a FLOAT
  // divide (`95f`), so 7 minutes at rank 0 is 6.65 -> 6, not 7.
  assert.equal(guildFastTravel(null, 7, { memberships: book(akatosh, 0) }), 6,
    '6.65 minutes truncates to 6 - rounding would give 7');
  assert.equal(guildFastTravel(null, 3, { memberships: book(akatosh, 0) }), 2, '2.85 -> 2');
  // a missing rank is rank 0, not NaN
  assert.equal(guildFastTravel(null, 1000, { memberships: { HolyOrder: { guild: akatosh } } }), 950);
});

test('TP1: it is a FOLD over memberships, as GuildManager.FastTravel is', () => {
  // GuildManager walks Memberships.Values and threads the duration
  // through each (:380-386). Written as the fold rather than a lookup
  // for Akatosh, so the day a second guild gains the perk it slots in
  // - and so a player in two guilds gets both, which a lookup cannot.
  const akatosh = templeOf(AKATOSH_DIVINE).name;
  const two = { HolyOrder: { guild: akatosh, rank: 0 }, FightersGuild: { guild: 'Fighters Guild', rank: 9 } };
  assert.equal(guildFastTravel(null, 1000, { memberships: two }), 950,
    'the non-perk guild threads the value through unchanged');
});

