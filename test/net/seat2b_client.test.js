// SEAT2b: THE WORKS ON THE SEAT TAB - each work the seat may raise, its tier and what it does, the Marks of its next tier,
// and the holder's lever a work (7.5, 7.9;
// src/ui/seatWorks.js, src/net/fortLaw.js fortWorkLine). SEAT2b.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { byClass } from '../chargenDom.mjs';
import { drawSeatWorks, drawSeatCamp, fortLeverText, SEAT_WORKS_WORDS } from '../../src/ui/seatWorks.js';
import { fortWorkLine, FORT_EFFECT_WORDS } from '../../src/net/fortLaw.js';

test('SEAT2b THE WORKS\' WORDS: a tier and what it does, and the Marks of the next tier; every work\'s effect said at its tiers (mutants: the next tier\'s Marks; each effect\'s words)', () => {
  assert.equal(fortWorkLine('walls', { tier: 0 }), 'Walls: none raised. Tier 1: 700 Marks.');
  assert.equal(fortWorkLine('walls', { tier: 1 }), 'Walls: tier 1 - the defenders\' wave 3 s faster. Tier 2: 2,000 Marks.');
  assert.equal(fortWorkLine('shrine', { tier: 2 }), 'Shrine: tier 2 - Standing +2 a week, +100 influence for each gate felled in the region.', 'no next tier at the last');
  assert.equal(fortWorkLine('nope', { tier: 1 }), '');
  assert.deepEqual(Object.entries(FORT_EFFECT_WORDS).map(([id, f]) => `${id}: ${f(2)}`), [
    'walls: the defenders\' wave 6 s faster',
    'gatehouse: its vitality 40,000',
    'watchtowers: the holder is warned when a challenger gets past a quarter of its defense',
    'barracks: 4 town guards fight for the holder',
    'market: the town\'s boards list 50% more, the Tithe\'s cap 2 points higher',
    'shrine: Standing +2 a week, +100 influence for each gate felled in the region',
    'forge: members smithing here 2 quality steps better',
    'workshop: members\' carpentry, outfitting and masonry here 2 quality steps better',
    'apothecary: members\' jewelry here 2 quality steps better, their dishes twice the XP, their brews +20% Potent chance',
    'harbour: a port for the holder\'s members',
  ]);
  assert.deepEqual([FORT_EFFECT_WORDS.watchtowers(1), FORT_EFFECT_WORDS.forge(1), FORT_EFFECT_WORDS.market(1)],
    ['the holder is warned when a challenger gets past half of its defense', 'members smithing here a quality step better', 'the town\'s boards list 25% more, the Tithe\'s cap 1 point higher']);
});

test('SEAT2b THE WORKS PANEL: the works a palace may raise (no Gatehouse below tier-3 Walls, no Harbour inland), each line; the holder\'s lever a work at its next tier, none for one at its last, none for a reader without the rank; the lever\'s press raises that work (mutants: which works; the lever\'s rules; its words; the press)', () => {
  const forts = { works: { walls: { tier: 1 }, shrine: { tier: 2 }, market: { tier: 0 } } };
  const begun = [];
  const host = document.createElement('div');
  const buttons = drawSeatWorks(host, { forts, seat: { tier: 'palace' }, lever: true, onBegin: (w) => begun.push(w) });
  const lines = byClass(host, 'notice-seat-works-line').map((n) => n.textContent);
  assert.deepEqual(lines.map((l) => l.split(':')[0]), ['Walls', 'Watchtowers', 'Barracks', 'Market Hall', 'Shrine', 'Forge', 'Workshop', 'Apothecary'], 'no Gatehouse, no Harbour; the Apothecary now its stations stand (AUDIT SEATS-2 L5; PIN MOVED (PROF12))');
  assert.equal(lines[3], 'Market Hall: none raised. Tier 1: 700 Marks.');
  assert.deepEqual(Object.keys(buttons), ['walls', 'watchtowers', 'barracks', 'market', 'forge', 'workshop', 'apothecary'], 'none for the Shrine (at its last tier); the Apothecary\'s now its stations stand (AUDIT SEATS-2 L5; PIN MOVED (PROF12))');
  assert.equal(buttons.walls.textContent, 'Raise the Walls to tier 2 (2,000 Marks)');
  buttons.forge.click();
  assert.deepEqual(begun, ['forge']);
  // a port and tier-3 Walls: the Harbour and a gate of its own
  const h2 = document.createElement('div');
  const b2 = drawSeatWorks(h2, { forts: { works: { walls: { tier: 3 } } }, seat: { tier: 'palace' }, port: true, lever: true });
  assert.ok(b2.gatehouse && b2.harbour && !b2.walls);
  // no rank: the lines, no lever; reading: the words
  const h3 = document.createElement('div');
  assert.deepEqual(Object.keys(drawSeatWorks(h3, { forts, seat: { tier: 'crown' }, lever: false })), []);
  assert.ok(byClass(h3, 'notice-seat-works-line').some((n) => n.textContent.startsWith('Gatehouse')), 'a crown\'s gate');
  const h4 = document.createElement('div');
  drawSeatWorks(h4, { forts: null, seat: { tier: 'palace' } });
  assert.equal(h4.textContent, `${SEAT_WORKS_WORDS.head}${SEAT_WORKS_WORDS.reading}`);
  assert.equal(fortLeverText('shrine', 3), '', 'no such tier');
});

test('SEAT2b THE WORKS ON THE SEAT TAB: read with the standings and drawn under a held seat; the holder\'s Officer raises a work through the book with the town\'s port, and the board is read again; another guild\'s reader sees the works without a lever; an unheld seat draws none (mutants: the read; the holder gate; the lever\'s rank and guild; the port; the reload)', async () => {
  const { createSeatTab } = await import('../../src/ui/seatTab.js');
  const { GUILD_RANK_MASTER } = await import('../../src/net/guild/guildLaw.js');
  const SEAT = { key: 3021, name: 'Anticlere', region: 17, tier: 'palace' };
  const SH = { id: 'g1', name: 'The Silver Hand', tag: 'SH', heraldry: null };
  const settle = async (n = 8) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
  const FORTS = { works: { walls: { tier: 1 } } };
  const rig = ({ holder = SH, guild = 'g1', rank = GUILD_RANK_MASTER, port = false } = {}) => {
    const t = { reads: 0, forced: 0, funded: [] };
    const data = { seat: SEAT, week: 6, phase: 'muster', reckoningAt: 1_800_003_600, turningAt: 1_800_086_400, defence: 4500, holder: holder ? { guild: holder, since: 3, standing: 55, tithe: 6, edict: null } : null,
      battle: null, standings: [], chronicle: [], mine: { guild, rank, seasoned: true, bound: guild, pledges: [], influence: 0, tributeRoom: 0 } };
    const book = {
      zero: null,
      standings: async (k, o) => { t.reads++; if (o?.force) t.forced++; return { data, error: null }; },
      forts: async (k) => { assert.equal(k, 3021); return { data: FORTS, error: null }; },
      fortFund: async (seat, work, p) => { t.funded.push([seat.key, work, p]); return { ok: true, text: 'begun' }; },
    };
    const ui = { busy: () => false, run: (start) => start(), rerender: () => {}, nowS: () => 1_800_000_000, alive: () => true };
    t.tab = createSeatTab({ seat: SEAT, book, port, countName: (k) => k }, ui);
    return t;
  };
  const t = rig({ port: true });
  await t.tab.open(); await settle();
  let body = t.tab.body();
  assert.equal(byClass(body, 'notice-seat-works').length, 1, 'the panel, under a held seat');
  const lever = byClass(body, 'notice-seat-fort-walls')[0];
  assert.equal(lever?.textContent, fortLeverText('walls', 2));
  assert.equal(byClass(body, 'notice-seat-fort-harbour').length, 1, 'a port\'s Harbour offered');
  const before = t.forced;
  await lever.onclick({}); await settle();
  assert.deepEqual(t.funded, [[3021, 'walls', true]], 'the book asked for that work, with the town\'s port');
  assert.equal(t.forced, before + 1, 'and the board read afresh after');
  // AUDIT DOMAINS C1 (the record's own gap: an inland board was read only by a reader with no lever): the holder's
  // Guildmaster at an inland town is offered every work but the Harbour
  const inland = rig();
  await inland.tab.open(); await settle();
  assert.equal(byClass(inland.tab.body(), 'notice-seat-fort-walls').length, 1, 'the lever is there');
  assert.equal(byClass(inland.tab.body(), 'notice-seat-fort-harbour').length, 0, 'an inland town raises no Harbour');
  // a reader of another guild: the works, no lever
  const o = rig({ guild: 'g2' });
  await o.tab.open(); await settle();
  body = o.tab.body();
  assert.equal(byClass(body, 'notice-seat-works').length, 1);
  assert.equal(byClass(body, 'act').filter((b) => /notice-seat-fort-/.test(b.className)).length, 0, 'no lever for another guild');
  assert.equal(byClass(body, 'notice-seat-fort-harbour').length, 0, 'an inland town offers no Harbour');
  // the holder's member below an Officer: no lever
  const m = rig({ rank: 3 });
  await m.tab.open(); await settle();
  assert.equal(byClass(m.tab.body(), 'notice-seat-fort-walls').length, 0, 'no lever below an Officer');
  assert.ok(!m.tab.body().textContent.includes('Harbour'), 'an inland town shows no Harbour');
  // an unheld seat: no panel
  const u = rig({ holder: null });
  await u.tab.open(); await settle();
  assert.equal(byClass(u.tab.body(), 'notice-seat-works').length, 0, 'none at an unheld seat');
});

test('SEAT2b THE BOOK\'S WORKS: the read is refused while the seats are shut; a tier raised carries one request id until an answer comes - the same work asked after a lost answer carries it again, a refusal or an answer lets it go - and says the work, its tier and its Marks (mutants: the gate; the id kept; the id let go; the words)', async () => {
  const { createTownSeatBook } = await import('../../src/net/townSeatBook.js');
  const SEAT = { key: 3021, name: 'Anticlere', region: 17, tier: 'palace' };
  const asks = [];
  let answer = { ok: false, error: 'offline' };
  const door = {
    list: async () => ({ ok: true, data: { seats: [] } }),
    forts: async () => ({ ok: true, data: { works: { walls: { tier: 1 } } } }),
    fortFund: async (c, key, work, rid, port) => { asks.push([c, key, work, rid, port]); return answer; },
  };
  let n = 0;
  const book = createTownSeatBook({ door: /** @type {any} */ (door), character: () => 'c1', storage: null, nowMs: () => 1_800_000_000_000, rid: () => `rid-0000-${++n}` });
  assert.deepEqual(await book.forts(3021), { data: null, error: 'seats-closed' }, 'shut before the list is read');
  await book.read();
  assert.deepEqual((await book.forts(3021)).data, { works: { walls: { tier: 1 } } });
  assert.equal((await book.fortFund(SEAT, 'walls', true)).ok, false);
  await book.fortFund(SEAT, 'walls', true);
  assert.equal(asks[0][3], asks[1][3], 'a lost answer: the same id asked again');
  assert.deepEqual(asks[0], ['c1', 3021, 'walls', 'rid-0000-1', true]);
  answer = { ok: true, data: { work: 'walls', tier: 2, marks: 2000 } };
  const r = await book.fortFund(SEAT, 'walls', true);
  assert.equal(r.text, 'Raised the Walls at Anticlere to tier 2: 2,000 Marks from the treasury.');
  await book.fortFund(SEAT, 'walls', true);
  assert.notEqual(asks[3][3], asks[2][3], 'an answer lets the id go');
  answer = { ok: false, error: 'fort-held' };
  await book.fortFund(SEAT, 'shrine');
  await book.fortFund(SEAT, 'shrine');
  assert.notEqual(asks[5][3], asks[4][3], 'a refusal lets it go');
  answer = { ok: true, data: { repeat: true, work: 'walls' } };
  assert.equal((await book.fortFund(SEAT, 'walls')).text, 'Already raised: the Walls at Anticlere.');
});

test('a pitched Siege Camp shows no pitch button, only that it stands', () => {
  const open = document.createElement('div');
  assert.ok(drawSeatCamp(open, {}), 'before a pitch the lever is drawn');
  assert.ok(open.textContent.includes('Pitch a Siege Camp'));
  const done = document.createElement('div');
  assert.equal(drawSeatCamp(done, { pitched: true }), null);
  assert.ok(!done.textContent.includes('Pitch a Siege Camp'));
  assert.ok(done.textContent.includes('has pitched a Siege Camp'));
});
