// FIELD BUGS 2026-10-16c (MAKER-KEPT) - the realm's side of Flylighter's "Grandfathered Items triggering trade lock":
// item law 6 (src/systems/item/itemLaw.js MAKER_ERA_AETHERIC) is the account service's judge (judge.js JUDGE_VERSION), so
// a checkpoint carrying a Ruhn's Regalia piece the item maker enchanted before AETHERIC-MAKER holds nothing.
import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../server-account/src/index.js';
import { standService, T0 } from '../accountDb.mjs';
import { seatRealm, freshSave } from '../realmSeat.mjs';
import { mintAetheric, REGALIA, SERPENT_SET_PIECES } from '../../src/systems/aetheric.js';
import { applyEnchantments } from '../../src/systems/enchanting.js';
import { enchantmentSettings } from '../../src/systems/enchantmentCatalogue.js';

const cleaver = () => {
  const item = mintAetheric(REGALIA.find((r) => r.id === 'ruhn-gatecleaver'));
  applyEnchantments(item, [enchantmentSettings('PotentVs', 1)]);   // the item maker's write, before its refusal
  return item;
};

async function stand() {
  const now = T0;
  const realNow = Date.now;
  Date.now = () => now * 1000;
  const s = await standService();
  const raw = s.env.DB._raw;
  const seat = async (handle) => {
    const who = await s.registered(handle);
    const R = await seatRealm(s.env, who.secret, handle);
    return { who, R };
  };
  const put = async ({ who, R }, items) => {
    const at = R.at();
    const res = await worker.fetch(new Request(`https://accounts.invalid/v1/realm/${R.id}/data`, {
      method: 'PUT', headers: { authorization: `Bearer ${who.secret}`, 'x-realm-lease': at.lease, 'x-realm-seq': String(at.seq + 1), 'x-realm-summary': JSON.stringify({ level: 1 }) },
      body: JSON.stringify(freshSave({ name: who.handle, items })),
    }), s.env);
    assert.equal(res.status, 200);
    return res.json();
  };
  const row = (id) => ({ ...raw.prepare('SELECT held, held_at, held_until, strikes, law_holds, law_at, law_sig, judge_rev FROM realm_characters WHERE id = ?').get(id) });
  const findings = (id, kind) => raw.prepare('SELECT detail FROM realm_findings WHERE char_id = ? AND kind = ? ORDER BY id').all(id, kind).map((r) => JSON.parse(r.detail));
  return { ...s, raw, seat, put, row, findings, done: () => { Date.now = realNow; } };
}

test('MAKER-KEPT judge: a checkpoint carrying a Regalia piece the maker enchanted before the refusal holds nothing and finds nothing; a later set\'s piece enchanted still holds (mutant: the law\'s keep)', async () => {
  const s = await stand();
  try {
    const A = await s.seat('kept'), B = await s.seat('late');
    assert.equal((await s.put(A, [cleaver()])).tradeHeld ?? null, null);
    assert.deepEqual([s.row(A.R.id).held, s.row(A.R.id).strikes, s.findings(A.R.id, 'law')], [null, 0, []]);
    const late = mintAetheric(SERPENT_SET_PIECES[0]);
    applyEnchantments(late, [enchantmentSettings('FeatherWeight', -1), enchantmentSettings('BadReactionsFrom', 1)]);
    await s.put(B, [late]);
    assert.equal(s.row(B.R.id).held, 'law', 'no maker ever laid a row on a Serpent piece');
  } finally { s.done(); }
});
