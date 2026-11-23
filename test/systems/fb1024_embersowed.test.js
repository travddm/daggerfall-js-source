// EMBERS-OWED and BROKER-RID (FB1024, 2026-10-24; AUDIT FB1024, 2026-10-25). The report, #bug-reports: "A few days ago, I
// tried to purchase my first battlemage piece ... the transaction never went through, the embers were not taken out and I
// didn't get the piece ... I was however locked out for the week ... I now have 52 deadlands embers on me, and it will not
// let me buy the aura, it says I have too few". A sale is two ledgers - the pack's embers and the account's purse - and a
// sale whose answer was lost AND whose question after went unheard gave the pack its embers back blind while the service had
// written it. EMBERS-OWED owed such a sale and asked after it by the week and the piece; the audit's lanes broke that (an
// honest sale answering for a press that never landed - pieces without end; the week turning; a save loaded again minting
// the piece again). So every press carries a request id, the service writes it beside the sale or FENCES it
// (server-account/src/brokerSales.js), and the owed sale is settled by that id alone (systems/sigil/sigilBroker.js).
// Record:.
import '../modsOff.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  insigniaSale, settleOwedSales, brokerOwedDoor, brokerOwed, validOwed, _resetOwed, stoneCount, spendableStonesIn,
  OWED_MAX, BROKER_OWED_VENDOR, BROKER_OWED_TEXT, brokerOwedText, insigniaUnheard,
} from '../../src/systems/sigil/sigilBroker.js';
import { modSaveRecords, restoreModSaveRecords } from '../../src/systems/modSaveData.js';
import { sigilStone } from '../../src/systems/gate/gateSpoils.js';
import { INSIGNIA, mintBrokerRid } from '../../src/net/insignia.js';
import { standService } from '../accountDb.mjs';
import { buyInsignia, settleBrokerSale } from '../../src/net/accountClient.js';
import { ARENA_SEASON_EPOCH_S, ARENA_WEEK_S } from '../../src/net/arena/arenaLaw.js';

const stack = (n) => Object.assign(sigilStone(), { stackCount: n });
const count = (pack) => stoneCount(spendableStonesIn(pack));
const AURA = INSIGNIA.find((o) => o.kind === 'aura');
const TITLE = INSIGNIA.find((o) => o.kind === 'title');
const BASE = 'https://accounts.invalid';
const NOW0 = ARENA_SEASON_EPOCH_S + 9 * ARENA_WEEK_S + 86_400;

/** The service standing, the clock at `now` (moved with `at`), an account with `embers` earned, and its doors: `io` the
 *  account's (call's), each a `down` twin whose answers are lost after the service wrote. */
async function stood(t, { embers = 52, handle = 'Punch' } = {}) {
  let clock = NOW0 * 1000;
  t.mock.method(Date, 'now', () => clock);
  const S = await standService({ MARKS_OPEN: 'on' });
  const raw = S.env.DB._raw;
  const me = await S.registered(handle);
  for (let i = 0; i < embers; i++) raw.prepare('INSERT INTO serpent_kills (day, account, boss, hull, char_id, xp, nonce, at, stones) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(3001 + i, me.id, 'sethrakul', 4, me.character, 0, `e${handle}${i}`, NOW0, 1);
  const lostAfter = async (u, i) => { await S.fetch(u, i); throw new TypeError('Failed to fetch'); };
  const never = async () => { throw new TypeError('Failed to fetch'); };
  return {
    S, raw, me, at: (s) => { clock = s * 1000; },
    io: { fetch: S.fetch, base: BASE, secret: me.secret, account: me.id }, ioLost: { fetch: lostAfter, base: BASE, secret: me.secret, account: me.id },
    ioNever: { fetch: never, base: BASE, secret: me.secret, account: me.id },
    spent: () => Number(raw.prepare('SELECT insignia_spent FROM players WHERE id = ?').get(me.id).insignia_spent),
  };
}
/** The host's door (world.js) over one pack, its settles through `ioOf()`. */
const doorOf = (entity, ioOf, saved = { n: 0 }) => brokerOwedDoor(entity, { changed: () => { saved.n++; } }, ioOf, settleBrokerSale);

beforeEach(() => _resetOwed());

test('BROKER-RID AN OWED SALE IS ITS ACCOUNT\'S (lanes B11, C MED-3): settled under the account that made it alone - another signed in leaves it owed; signed out, a press is refused as the door refused it (C MED-1) (mutants: any account settles; no-session owed)', async (t) => {
  const W = await stood(t);
  const entity = { items: [stack(52)] };
  await doorOf(entity, () => W.ioLost).insignia(AURA, (id, rid) => buyInsignia(W.ioLost, id, rid));
  const other = await W.S.registered('Other');
  const otherIo = { fetch: W.S.fetch, base: BASE, secret: other.secret, account: other.id };
  await doorOf(entity, () => otherIo).settled(async () => null);
  assert.deepEqual([brokerOwed().length, count(entity.items)], [1, 52 - AURA.price], 'another account asks nothing of it');
  await doorOf(entity, () => W.io).settled(async () => null);
  assert.deepEqual([brokerOwed().length, count(entity.items), W.spent()], [0, 52 - AURA.price, AURA.price], 'its own account settles it: the stones stay spent');
  // signed out: the door sends nothing, and the press takes nothing
  _resetOwed();
  const out = { items: [stack(52)] };
  const r = await doorOf(out, () => null).insignia(AURA, async () => ({ ok: false, error: 'no-session' }));
  assert.deepEqual([r.error, count(out.items), brokerOwed()], ['no-session', 52, []]);
  assert.equal(insigniaUnheard({ ok: false, error: 'no-session' }), false, 'the door sent nothing: nothing was written');
  // a press unheard with no account to ask under (a session gone mid-sale): given back as refused, never owed unaskable
  const lone = { items: [stack(52)] };
  const r2 = await insigniaSale(AURA, { items: lone.items, buy: async () => ({ ok: false, error: 'offline' }), settle: async () => ({ ok: false, error: 'offline' }), save: () => {}, account: null });
  assert.deepEqual([r2.error, count(lone.items), brokerOwed()], ['no-session', 52, []]);
});

test('BROKER-RID THE INSIGNIA over the real Worker: a sale landed, both answers lost - owed, the next open finds it the account\'s; one never landed - fenced, the stones back; a second press while the first is owed pays once (mutants: the insignia settle never run; an owned insignia refunded)', async (t) => {
  const W = await stood(t, { embers: 120 });
  const entity = { items: [stack(120)] };
  let io = W.ioLost;
  const door = doorOf(entity, () => io);
  assert.equal((await door.insignia(AURA, (id, rid) => buyInsignia(W.ioLost, id, rid))).error, 'unheard');
  assert.equal(count(entity.items), 120 - AURA.price);
  // a second press now: the service owns it already (`owned`) - those stones straight back
  io = W.io;
  assert.deepEqual(await door.insignia(AURA, (id, rid) => buyInsignia(W.io, id, rid)), { ok: false, error: 'owned' });
  assert.equal(count(entity.items), 120 - AURA.price);
  const a = await door.settled(() => W.S.call('/v1/account', {}, W.me.secret).then((x) => ({ ok: true, data: x.body })));
  assert.ok(a.ok);
  assert.deepEqual([brokerOwed(), count(entity.items), W.spent()], [[], 120 - AURA.price, AURA.price], 'the account\'s: the stones stay spent, once');
  // a press that never landed: fenced at the next open, the stones back
  const title = INSIGNIA.find((o) => o.kind === 'title');
  io = W.ioNever;
  assert.equal((await door.insignia(title, (id, rid) => buyInsignia(W.ioNever, id, rid))).error, 'unheard');
  io = W.io;
  await door.settled(async () => null);
  assert.deepEqual([brokerOwed(), count(entity.items), W.spent()], [[], 120 - AURA.price, AURA.price]);
});

test('BROKER-RID THE PAGE\'S OWN RACES (lane B3, B8): a save loaded while a settle is asked - the answer lands in the pack and the list as they stand then; one ask a sale at once; the list full refuses a press before anything is taken (mutants: the pack read before the ask; two asks of one sale; the cap after the take)', async () => {
  const rid = mintBrokerRid();
  const row = { kind: 'insignia', id: AURA.id, embers: AURA.price, rid, account: 'acct-1' };
  restoreModSaveRecords({ [BROKER_OWED_VENDOR]: [row] });
  const before = { items: [stack(32)] }, after = { items: [stack(32)] };
  let entity = before, release;
  const gate = new Promise((res) => { release = res; });
  let asks = 0;
  const settle = async (body) => { asks++; await gate; return { ok: true, data: { held: false, by: body.nonce } }; };
  const io = { settle, account: () => 'acct-1', items: () => entity.items, save: () => {} };
  const one = settleOwedSales(io), two = settleOwedSales(io);
  entity = after;   // a save loaded while the service is asked
  restoreModSaveRecords({ [BROKER_OWED_VENDOR]: [row] });
  release();
  await Promise.all([one, two]);
  assert.deepEqual([asks, count(before.items), count(after.items), brokerOwed()], [1, 32, 32 + AURA.price, []], 'one ask; the embers back into the pack that is owed them');
  // the list full: a press refused before its price is taken
  restoreModSaveRecords({ [BROKER_OWED_VENDOR]: Array.from({ length: OWED_MAX }, () => ({ ...row, rid: mintBrokerRid() })) });
  const full = [stack(60)];
  let bought = 0;
  const r = await insigniaSale(AURA, { items: full, buy: async () => { bought++; return { ok: true }; }, settle, save: () => {}, account: 'acct-1' });
  assert.deepEqual([r, count(full), bought], [{ ok: false, error: 'unheard' }, 60, 0]);
});

test('BROKER-RID the owed list rides the save, each row whole and priced as its sale is - one a request id (lane B12) (mutants: the price unchecked; a duplicate id kept; the newest dropped)', () => {
  const rid = mintBrokerRid();
  const good = { kind: 'insignia', id: TITLE.id, embers: TITLE.price, rid, account: 'acct-1' };
  const ins = { kind: 'insignia', id: AURA.id, embers: AURA.price, rid: mintBrokerRid(), account: 'acct-1' };
  restoreModSaveRecords({ [BROKER_OWED_VENDOR]: [good, ins] });
  assert.deepEqual(modSaveRecords()[BROKER_OWED_VENDOR], [good, ins]);
  assert.deepEqual(validOwed([
    { ...good, embers: 1000 }, { ...ins, embers: AURA.price + 1 }, { ...good, kind: 'gold' }, { ...good, rid: 'x' }, { ...good, account: '' },
    { ...good, id: AURA.id }, null, good, { ...good }, ins,
  ]), [good, ins], 'priced as sold, one a request id');
  const many = Array.from({ length: OWED_MAX + 3 }, (_, i) => ({ ...good, rid: `b${String(i).padStart(15, '0')}` }));
  assert.deepEqual(validOwed(many).map((o) => o.rid), many.slice(-OWED_MAX).map((o) => o.rid), 'the newest kept');
  assert.equal(brokerOwedText(), BROKER_OWED_TEXT);
  assert.match(BROKER_OWED_TEXT, /Your embers are held/);
});

