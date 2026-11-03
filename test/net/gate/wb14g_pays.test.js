// WB14g: WHAT A PORTENT NIGHT PAYS - the kill's receipt says the night's
// portents a bit each (1 the Vanguard, 2 the Sundering, 4 the Captive freed; a Captive night whose knight stayed chained
// says none), the spoils turn one of the plain Magic-or-better pieces Rare-or-better for each (PORTENT-FOLD: no piece more;
// a receipt without portents rolls what it always rolled).
//
//   the law          net/gate/gateBrain.js receiptPortents; net/gate/gateReceipt.js `p` (RECEIPT_PORTENTS_MAX, optional, never
//                    on the rite's own receipt)
//   the relay        server/src/index.js the mint's `p`
//   the spoils       systems/gate/gateSpoils.js rollSpoils's `p`, SPOILS_PORTENT_BITS; scenes/spoilsPool.js spoilsList (the
//                    claims' `p`, the pieces' pictures last)
//
// Design:
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { newFight, receiptPortents } from '../../../src/net/gate/gateBrain.js';
import { portentBits, GATE_PORTENTS } from '../../../src/net/gate/gateMods.js';
import { receiptValid, mintReceipt, readReceipt, RECEIPT_PORTENTS_MAX, RECEIPT_TTL_S } from '../../../src/net/gate/gateReceipt.js';
import { rollSpoils, SPOILS_PORTENT_BITS, SPOILS_SOURCE } from '../../../src/systems/gate/gateSpoils.js';
import { spoilsList } from '../../../src/scenes/spoilsPool.js';

const T0 = 1_000_000;
const night = (pt, freed = 0) => Object.assign(newFight(7, T0, T0 + 3_600_000, 'ruhn', null, pt, null), freed ? { cp: { at: 1, n: 2, f: freed, w: 0, s: 0 } } : {});
const claims = (extra = {}) => ({ d: 7, b: 'ruhn', s: 'acct-1', c: 12345, x: 'dealt', i: 1000, e: 1000 + RECEIPT_TTL_S, ...extra });

test('WB14g the receipt\'s portents: the night\'s, a bit each - the Vanguard 1, the Sundering 2, the Dire Breach both, the Captive 4 only freed, a plain night none (mutants: the Captive\'s bit for a knight left chained; the night\'s bits unsaid)', () => {
  assert.deepEqual(GATE_PORTENTS.map((p) => [p.id, p.bit]), [['vanguard', 1], ['sunder', 2], ['captive', 4]]);
  assert.equal(receiptPortents(night(null)), 0);
  assert.equal(receiptPortents(night(['vanguard'])), 1);
  assert.equal(receiptPortents(night(['sunder'])), 2);
  assert.equal(receiptPortents(night(['vanguard', 'sunder'])), 3, 'the Dire Breach');
  assert.equal(receiptPortents(night(['captive'])), 0, 'his knight left chained says none');
  assert.equal(receiptPortents(night(['captive'], T0 + 60_000)), 4, 'freed');
  assert.equal(receiptPortents(null), 0);
  assert.equal(RECEIPT_PORTENTS_MAX, portentBits(GATE_PORTENTS.map((p) => p.id)));
});

test('WB14g the receipt: `p` optional - a whole number of the portents\' bits, never 0, never on the rite\'s own receipt; minted only for a portent night, and read back as minted (mutants: a `p` past every bit; one on the rite\'s ember; a `p` of 0 written)', async () => {
  assert.ok(receiptValid(claims()), 'none, as ever');
  for (const p of [1, 2, 3, 4, 7]) assert.ok(receiptValid(claims({ p })), String(p));
  for (const p of [0, 8, -1, 1.5, '1', null]) assert.ok(!receiptValid(claims({ p })), String(p));
  assert.ok(!receiptValid(claims({ x: 'rite', p: 1 })), 'the rite\'s ember is its own');
  assert.ok(receiptValid(claims({ x: 'stood', p: 4 })));
  const env = { subtle: webcrypto.subtle, nowS: 1000 };
  const with3 = readReceipt(await mintReceipt({ d: 7, b: 'ruhn', s: 'acct-1', c: 9, x: 'dealt', l: 20, p: 3 }, null, env));
  assert.equal(with3.p, 3);
  const plain = readReceipt(await mintReceipt({ d: 7, b: 'ruhn', s: 'acct-1', c: 9, x: 'dealt', l: 20, p: 0 }, null, env));
  assert.equal('p' in plain, false, 'a plain night writes none');
});

test('WB14g (PORTENT-FOLD) the spoils: a portent turns one of the two plain Magic-or-better pieces Rare-or-better for each portent (two at most), and adds no piece - the first piece, the gold and the card the same for its seed; a plain night\'s spoils what they always were (mutants: a piece added; a bit paying nothing; a third slot turned)', () => {
  assert.deepEqual(SPOILS_PORTENT_BITS, [1, 2, 4]);
  const rare = (tier) => ['rare', 'legendary', 'exalted'].includes(tier);
  for (const seed of [1, 777, 0xdeadbeef]) {
    const base = rollSpoils(seed, 20), same = rollSpoils(seed, 20, 0);
    assert.deepEqual(same.pieces.map((p) => [p.item.name, p.tier]), base.pieces.map((p) => [p.item.name, p.tier]), 'p 0 is the plain roll');
    assert.equal('portent' in base, false, 'no portent count: a portent adds no piece');
    for (const [p, turned] of [[1, 1], [2, 1], [4, 1], [3, 2], [5, 2], [7, 2]]) {
      const s = rollSpoils(seed, 20, p);
      assert.ok(s.pieces.length >= 3 && s.pieces.length <= 5, `${p}: the three plain pieces and what a plain night rolls past them`);
      assert.deepEqual([s.pieces[0].item.name, s.pieces[0].tier], [base.pieces[0].item.name, base.pieces[0].tier], `${seed}/${p}: the first piece its own`);
      assert.equal(s.gold, base.gold);
      assert.deepEqual(s.card?.name ?? null, base.card?.name ?? null);
      for (let i = 1; i <= turned; i++) assert.ok(rare(s.pieces[i].tier), `${p}: slot ${i} is ${s.pieces[i].tier}`);
    }
  }
  assert.ok(SPOILS_SOURCE.boss, 'at a boss\'s chances');
});

test('WB14g (PORTENT-FOLD) the floor: a portent receipt\'s list is a plain receipt\'s in length (a Regalia piece and the Oath aside), its first piece and its gold the same (mutants: the claims\' `p` unread; a piece added)', () => {
  for (const seed of [5, 4242]) {
    const plain = spoilsList(seed, 20, { x: 'dealt' }), rich = spoilsList(seed, 20, { x: 'dealt', p: 3 });
    assert.ok(Math.abs(rich.length - plain.length) <= 2, `${rich.length} against ${plain.length}`);
    const items = (l) => l.filter((e) => e.kind === 'item');
    assert.ok(items(rich).length <= 6);
    assert.equal(rich.find((e) => e.kind === 'gold').gold, plain.find((e) => e.kind === 'gold').gold);
    assert.equal(items(rich)[0].item.name, items(plain)[0].item.name);
  }
  assert.equal(spoilsList(5, 20, { x: 'rite', p: 3 }).length, 1, 'the rite\'s ember alone');
});
