// AUDIT SEATS-2: THE SEATS ARC AUDITED AGAIN - the shared law's part that outlived the seat extras' cut (the Tithe's cap
// and the Bounty's words). `06-Systems/Online-Arc.md` AUDIT SEATS-2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { titheStanding, seatTitheCap, seatHoldingLines, TITHE_CAP, EDICT_WORDS, STANDING_CHANGES } from '../../src/net/townSeatLaw.js';

test('AUDIT SEATS-2 L1: THE TITHE CAP is the tier\'s own (palace 10%, crown 15%) in the cap the Seat tab offers, its words say and Standing is judged on (7.3: "at or below half its cap ... above three quarters of its cap") (mutants: the cap unpassed; the tab\'s base cap; the words\' base cap)', () => {
  assert.equal(titheStanding('palace', 6), 0, 'the base cap: 6 is over half of 10');
  assert.equal(titheStanding('palace', 6, 13), STANDING_CHANGES.titheLow, 'under half of a cap of 13');
  assert.equal(titheStanding('palace', 8, 12), 0, '8 is under three quarters of 12');
  assert.equal(titheStanding('palace', 8), STANDING_CHANGES.titheHigh);
  const seat = { tier: 'palace' };
  assert.equal(seatTitheCap(seat), TITHE_CAP.palace);
  assert.equal(seatTitheCap({ tier: 'crown' }), TITHE_CAP.crown);
  assert.match(seatHoldingLines({ ...seat, name: 'Anticlere' }, { upkeep: 2500, standing: 50 }).join(' '), /the Tithe at most 10%/);
});

test('AUDIT SEATS-2 L4: the Bounty\'s camps are the town\'s bailiwick\'s, said so', () => {
  assert.match(EDICT_WORDS.bounty, /^Camps near the town yield double/);
});
