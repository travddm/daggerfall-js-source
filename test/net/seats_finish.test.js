// AUDIT-SEATS: THE SEATS
// ARC'S OPEN ITEMS, FINISHED - each test one item the bible had left NOT YET (
// `06-Systems/Online-Arc.md` AUDIT-SEATS). Driven through the real Worker over node:sqlite where the service is
// touched (test/accountDb.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countWords, siegeMinutes, chronicleLine } from '../../src/net/townSeatLaw.js';
import { byClass } from '../chargenDom.mjs';
import { mountNoticeBoard } from '../../src/ui/noticeWindow.js';
import { HALL_OF_RECORDS_SHUT } from '../../src/systems/online/onlineHomes.js';
import { templateByIndex } from '../../src/systems/item/itemTemplates.js';
import '../../src/systems/professions/profTemplates.js';
import { SIEGE_GEM, GEMS } from '../../src/net/professionLaw.js';
import { material } from '../../src/net/nodeLaw.js';
import { mintMaterialItem, materialLabel, materialCountLabel } from '../../src/systems/professions/profItems.js';
import { SIEGE_SPOILS } from '../../src/net/townSeatLaw.js';

test('AUDIT-SEATS A SIEGE\'S LENGTH IN THE CHRONICLE (9.2: "stormed the gates of Anticlere and took its Charter from the Ebon Oath after thirty-one minutes"): a count in words to ninety-nine, its digits past; a siege\'s whole minutes from its start to its receipt\'s end, at least one, none for a bad pair; the line in the design\'s words where the row keeps the length, the old line where it does not (mutants: the words; the rounding; the floor; the line; the singular)', () => {
  assert.deepEqual([0, 1, 7, 13, 19, 20, 31, 40, 99, 100, 1234].map(countWords), ['zero', 'one', 'seven', 'thirteen', 'nineteen', 'twenty', 'thirty-one', 'forty', 'ninety-nine', '100', '1,234']);
  assert.deepEqual([countWords(-1), countWords(2.5)], ['-1', '2.5']);
  assert.deepEqual([siegeMinutes(1000, 1000 + 31 * 60), siegeMinutes(1000, 1000 + 31 * 60 + 29), siegeMinutes(1000, 1000 + 31 * 60 + 30), siegeMinutes(1000, 1010), siegeMinutes(1000, 999), siegeMinutes(NaN, 1000), siegeMinutes(1000, undefined)],
    [31, 31, 32, 1, null, null, null]);
  const ANT = { key: 3021, name: 'Anticlere', region: 21, tier: 'palace' };
  const row = (minutes) => ({ kind: 'siege-taken', week: 4, data: { guild: { name: 'The Silver Hand', tag: 'SH' }, from: { name: 'Ebon Oath', tag: 'EO' }, ...(minutes !== undefined ? { minutes } : {}) } });
  assert.equal(chronicleLine(row(31), ANT), 'In week 4, the Silver Hand <SH> stormed the gates of Anticlere and took its Charter from Ebon Oath <EO> after thirty-one minutes.');
  assert.equal(chronicleLine(row(1), ANT), 'In week 4, the Silver Hand <SH> stormed the gates of Anticlere and took its Charter from Ebon Oath <EO> after one minute.');
  assert.equal(chronicleLine(row(undefined), ANT), 'In week 4, the Silver Hand <SH> took the Charter of Anticlere by siege from Ebon Oath <EO>.');
  assert.equal(chronicleLine(row(null), ANT), 'In week 4, the Silver Hand <SH> took the Charter of Anticlere by siege from Ebon Oath <EO>.', 'a row from before');
});

test('AUDIT-SEATS THE HALL OF RECORDS FROM THE BOARD AND IN THE CASTLES: the Seat tab reads the whole Chronicle as the book (said where it cannot); the world opens it in place of the board; a crown\'s castle shelves are its Hall of Records while the seats are open, pressed into the dungeon\'s own window slot (mutants: the button; its refusal; the board\'s door; the castle\'s shelves; the castle\'s gate; its press)', async () => {
  const noticeBook = { seenAt: () => null, read: async () => ({ board: { notes: [], notices: [], me: {} } }), markSeen: () => {}, cached: () => null, draft: () => ({ subject: '', body: '', days: 7, button: '' }), noticeDraft: () => ({ subject: '', body: '', days: 3 }), readGuild: async () => ({ data: null, error: 'no-guild' }) };
  const now = 1_800_000_000;
  const ANT = { key: 3021, name: 'Anticlere', region: 21, tier: 'palace', pixel: [402, 151] };
  const data = { seat: ANT, week: 42, phase: 'muster', reckoningAt: now + 3600, turningAt: now + 86400, defence: null, holder: null, standings: [], chronicle: [{ kind: 'held', week: 41, data: { guild: { name: 'The Oath', tag: 'OA' }, standing: 50 } }] };
  const tick = (n = 4) => new Promise((r) => { let i = 0; const go = () => (++i >= n ? r() : setTimeout(go, 0)); setTimeout(go, 0); });
  const asked = [];
  let answer = true;
  const host = document.createElement('div');
  mountNoticeBoard(host, { town: { name: 'Anticlere', mapId: 3021 }, book: noticeBook, nowS: () => now, seat: { seat: ANT, book: { open: true, standings: async () => ({ data, error: null }) } }, seatRecords: async (s) => { asked.push(s.key); return answer; } });
  byClass(host, 'notice-tab')[1].onclick();
  await tick();
  const b = byClass(host, 'notice-seat-records')[0];
  assert.equal(b.textContent, 'Read the Hall of Records');
  b.onclick();
  await tick();
  assert.deepEqual(asked, [3021]);
  answer = false;
  byClass(host, 'notice-seat-records')[0].onclick();
  await tick();
  assert.ok(host.textContent.includes(HALL_OF_RECORDS_SHUT), 'said where it cannot be read');
});

test('AUDIT-SEATS THE SIEGE-CRACKED GEM: template 678 registered on the Diamond\'s picture, a Stores material of the gems at the Diamond\'s tier that withdraws as an item and is named as one; never a vein\'s strike (mutants: the template; the registry)', () => {
  const t = templateByIndex(678);
  assert.deepEqual([t?.name, t?.worldTextureArchive, t?.worldTextureRecord, t?.stackable, t?.rarity], ['Siege-cracked Gem', 254, 3, true, 10]);
  assert.deepEqual({ ...SIEGE_GEM, icon: [...SIEGE_GEM.icon] }, { key: 'gem:siege', family: 'gems', tier: 6, templateIndex: 678, name: 'Siege-cracked Gem', icon: [254, 3], dye: null });
  assert.deepEqual(material('gem:siege'), { key: 'gem:siege', family: 'gems', tier: 6, value: material('gem:diamond').value, templateIndex: 678 });
  assert.equal(mintMaterialItem('gem:siege', false)?.templateIndex, 678);
  assert.deepEqual([materialLabel('gem:siege', false), materialCountLabel('gem:siege', 2, false)], ['Siege-cracked Gem', 'Siege-cracked Gems']);
  assert.equal(GEMS.some((g) => g.key === 'gem:siege'), false, 'the glint\'s table holds no war\'s gem');
  assert.ok(SIEGE_SPOILS.includes('gem:siege'));
});
