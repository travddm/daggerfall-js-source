// The Marks ledger refuses a line its payer cannot cover, whichever way the caller inserts it, so a route that skips its
// own balance check cannot create Marks (server-account/migrations/0010_marks_payer_guard.sql).
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Loaded by a computed path: Node's type pass would otherwise follow it into the account service, which it cannot type.
const accountDbModule = '../accountDb.mjs';
const { standService } = await import(accountDbModule);

type Account = { id: string };
type Balance = { balance: number } | undefined;

async function ledger() {
  const svc = await standService();
  const payer = (await svc.registered('Aldric')) as Account;
  const payee = (await svc.registered('Mara')) as Account;
  const raw = svc.env.DB._raw;
  let rid = 0;
  const line = (
    srcKind: string,
    srcId: string | null,
    dstKind: string,
    dstId: string | null,
    amount: number,
    orIgnore = false,
  ): void => {
    rid += 1;
    raw
      .prepare(
        `INSERT ${orIgnore ? 'OR IGNORE' : ''} INTO marks_ledger
           (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
         VALUES (?, ?, ?, ?, 'test', ?, 1, 1, 'tester', NULL, ?)`,
      )
      .run(srcKind, srcId, dstKind, dstId, amount, `r${rid}`);
  };
  const balanceOf = (who: Account): number | null =>
    (raw.prepare('SELECT balance FROM marks WHERE account = ?').get(who.id) as Balance)?.balance ?? null;
  const lines = (): number => (raw.prepare('SELECT COUNT(*) AS n FROM marks_ledger').get() as { n: number }).n;
  return { payer, payee, line, balanceOf, lines };
}

test('a payer with no balance row cannot pay, and the payee gets nothing', async () => {
  const { payer, payee, line, balanceOf, lines } = await ledger();
  assert.throws(() => line('account', payer.id, 'account', payee.id, 100));
  assert.equal(balanceOf(payee), null);
  assert.equal(lines(), 0);
});

test('a short payer is refused, under INSERT OR IGNORE too', async () => {
  const { payer, payee, line, balanceOf, lines } = await ledger();
  line('mint', null, 'account', payer.id, 10);
  assert.throws(() => line('account', payer.id, 'account', payee.id, 50));
  assert.throws(() => line('account', payer.id, 'account', payee.id, 50, true));
  assert.equal(balanceOf(payer), 10);
  assert.equal(balanceOf(payee), null);
  assert.equal(lines(), 1, 'only the mint line is written');
});

test('a credit to an account with no id is refused', async () => {
  const { line, lines } = await ledger();
  assert.throws(() => line('mint', null, 'account', null, 10));
  assert.throws(() => line('mint', null, 'guild', null, 10));
  assert.equal(lines(), 0);
});

test('a payer who holds enough still pays, down to nothing', async () => {
  const { payer, payee, line, balanceOf } = await ledger();
  line('mint', null, 'account', payer.id, 50);
  line('account', payer.id, 'account', payee.id, 50);
  assert.equal(balanceOf(payer), 0);
  assert.equal(balanceOf(payee), 50);
});
