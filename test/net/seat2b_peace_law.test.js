// SEAT2b part two: THE WORKS AT PEACE, THEIR LAW - a
// Siegewright's project a day sooner; what the Watchtowers see and say; whether a town is coastal and a Harbour a port
// for its holder's members; the Shrine's Standing row; the Ram Kit as the Stores hold it (docs/systems/professions.md; net/fortLaw.js, net/townSeatLaw.js, net/professionLaw.js,
// systems/travel/travelPorts.js). SEAT2b part two.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  towersSee, towersText, watchtowerShare, coastalAt, harbourPortFor,
  shrineStanding,
} from '../../src/net/fortLaw.js';
import { standingWeek, seatStandingLine, guildWords } from '../../src/net/townSeatLaw.js';
import { hasPort, hasPortFor, setSeatHarbours } from '../../src/systems/travel/travelPorts.js';

const DAY = 86400;

test('SEAT2b part two WHAT THE WATCHTOWERS SEE: every challenger at or past half the holder\'s defence (tier 1) or a quarter (tier 2), the most dangerous first; never the holder, never without towers or a defence; the word names the seat, the guild and the share (mutants: the share; at the line; the holder; the order; the words)', () => {
  const standings = [
    { guild: 'gh', influence: 9000 }, { guild: 'ga', influence: 500 }, { guild: 'gb', influence: 499 }, { guild: 'gc', influence: 900 },
    { guild: 'gd', influence: 250 }, { guild: 'ge', influence: 900 },
  ];
  assert.deepEqual(watchtowerShare(1), 0.5);
  assert.deepEqual(towersSee(standings, { holder: 'gh', defence: 1000, t: 1 }), [
    { guild: 'gc', influence: 900, share: 0.5 }, { guild: 'ge', influence: 900, share: 0.5 }, { guild: 'ga', influence: 500, share: 0.5 },
  ], 'half of 1,000: 500 has passed it, 499 has not; level, by the guild\'s id');
  assert.deepEqual(towersSee(standings, { holder: 'gh', defence: 1000, t: 2 }).map((w) => [w.guild, w.share]),
    [['gc', 0.25], ['ge', 0.25], ['ga', 0.25], ['gb', 0.25], ['gd', 0.25]], 'a quarter: 250 and up');
  assert.deepEqual(towersSee(standings, { holder: 'gh', defence: 1000, t: 0 }), [], 'no towers');
  assert.deepEqual(towersSee(standings, { holder: 'gh', defence: 0, t: 2 }), [], 'no defence: nothing to pass');
  assert.deepEqual(towersSee(standings, { holder: 'gh', defence: null, t: 2 }), []);
  assert.deepEqual(towersSee(null, { holder: 'gh', defence: 10, t: 1 }), []);
  assert.equal(towersSee(standings, { holder: 'gc', defence: 1000, t: 1 }).some((w) => w.guild === 'gc'), false, 'the holder is never its own danger');
  assert.equal(towersText('Anticlere', guildWords({ name: 'The Iron Circle', tag: 'IC' }), 0.5), 'The Watchtowers of Anticlere see the Iron Circle <IC> past half of our defense.');
  assert.equal(towersText('Anticlere', guildWords({ name: 'Ebon Oath', tag: 'EO' }), 0.25), 'The Watchtowers of Anticlere see Ebon Oath <EO> past a quarter of our defense.');
});

test('SEAT2b part two A COAST AND A HARBOUR: a town is coastal where its own pixel or one of the eight about it is sea, or a harbour stands there already; a Harbour at tier 1 is a port for its holder\'s members alone - Travel Options\' list kept, the host\'s word added and a bad word none (mutants: the eight; the port; the holder; the tier; the seam)', () => {
  const sea = new Set(['11,10']);
  const isWater = (x, y) => sea.has(`${x},${y}`);
  assert.equal(coastalAt(10, 10, isWater), true, 'the sea east of it');
  assert.equal(coastalAt(12, 11, isWater), true, 'the sea north-west of it');
  assert.equal(coastalAt(11, 10, isWater), true, 'its own pixel');
  assert.equal(coastalAt(13, 10, isWater), false, 'two pixels from the sea');
  assert.equal(coastalAt(13, 10, isWater, true), true, 'a harbour drawn there');
  assert.equal(coastalAt(NaN, 10, isWater), false);
  assert.equal(coastalAt(10, 10, null), false);
  const seat = { key: 3021, holder: { guild: { id: 'gsh' } }, forts: { harbour: 1 } };
  assert.equal(harbourPortFor(seat, 'gsh'), true);
  assert.equal(harbourPortFor(seat, 'geo'), false, 'another guild\'s');
  assert.equal(harbourPortFor(seat, null), false, 'no guild');
  assert.equal(harbourPortFor({ ...seat, forts: { harbour: 0 } }, 'gsh'), false, 'no Harbour standing');
  assert.equal(harbourPortFor({ ...seat, forts: null }, 'gsh'), false);
  assert.equal(harbourPortFor({ ...seat, holder: null }, 'gsh'), false, 'unheld');
  assert.equal(harbourPortFor(null, 'gsh'), false);
  try {
    assert.equal(hasPortFor(199102), true, 'Travel Options\' own (Daggerfall\'s Whitecroft)');
    assert.equal(hasPortFor(3021), false, 'no word yet');
    setSeatHarbours((id) => harbourPortFor(id === 3021 ? seat : null, 'gsh'));
    assert.equal(hasPortFor(3021), true, 'the host\'s word: a members\' Harbour');
    assert.equal(hasPort(3021), false, 'the mod\'s list untouched');
    assert.equal(hasPortFor(3022), false);
    assert.equal(hasPortFor(null), false);
    setSeatHarbours(() => { throw new Error('torn'); });
    assert.equal(hasPortFor(3021), false, 'a word that throws is none');
    setSeatHarbours(() => 'yes');
    assert.equal(hasPortFor(3021), false, 'only true');
    setSeatHarbours(null);
    assert.equal(hasPortFor(3021), false, 'cleared');
    assert.equal(hasPortFor(199102), true);
  } finally { setSeatHarbours(null); }
});

test('SEAT2b part two THE SHRINE\'S STANDING: a Shrine\'s tier is its Standing row each week - +1, +2 - beside the rest, within 100; the standings line names its part of the holder\'s week (mutants: the row; the bound; the words)', () => {
  assert.deepEqual([shrineStanding(0), shrineStanding(1), shrineStanding(2)], [0, 1, 2]);
  const base = standingWeek({ tier: 'palace', standing: 50 });
  const w = standingWeek({ tier: 'palace', standing: 50, shrine: shrineStanding(2) });
  assert.deepEqual(w.changes, [...base.changes, ['shrine', 2]]);
  assert.equal(w.standing, base.standing + 2);
  assert.equal(standingWeek({ tier: 'palace', standing: 99, shrine: 2 }).standing, 100, 'within 100');
  assert.deepEqual(standingWeek({ tier: 'palace', standing: 50, shrine: -3 }).changes, base.changes, 'never a loss');
  assert.deepEqual(standingWeek({ tier: 'palace', standing: 50, shrine: 'x' }).changes, base.changes);
  assert.equal(seatStandingLine({ guild: { name: 'The Silver Hand', tag: 'SH' }, influence: 8393, shrine: 100 }, 0), '1. the Silver Hand <SH> - 8,393 influence (its Shrine\'s 100)');
  assert.equal(seatStandingLine({ guild: { name: 'The Silver Hand', tag: 'SH' }, influence: 8393 }, 0), '1. the Silver Hand <SH> - 8,393 influence');
});

