// The act_counts rows that the Marks ledger's triggers write (the act_counts migration) equal
// the sums the daily cap guards read from the ledger, and a retry or a failed statement never moves them.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { DatabaseSync } from 'node:sqlite';

// Loaded by computed paths: Node's type pass would otherwise follow them into the account service, which it cannot type.
const accountDbModule = '../accountDb.mjs';
const marksLawModule = '../../src/net/marksLaw.js';
const { d1 } = await import(accountDbModule);
const { MARKS_COMBAT } = await import(marksLawModule);

type Line = {
  srcKind: 'mint' | 'account';
  srcId: string | null;
  dstKind: 'account' | 'guild' | 'burn';
  dstId: string | null;
  kind: string;
  amount: number;
  day: number;
  rid: string;
};

const ACCOUNTS = ['acct-a', 'acct-b'];
const GUILDS = ['guild-a', 'guild-b'];
const DAYS = [20_000, 20_001];
const COMBAT_KINDS: string[] = MARKS_COMBAT.kinds;
const STARTING_BALANCE = 1_000_000;

function freshDatabase(): { database: ReturnType<typeof d1>; raw: DatabaseSync } {
  const database = d1();
  const raw: DatabaseSync = database._raw;
  for (const account of ACCOUNTS) {
    raw
      .prepare('INSERT INTO players (id, guest_name, created_at, last_seen) VALUES (?, ?, 1, 1)')
      .run(account, account);
  }
  for (const guild of GUILDS) {
    raw
      .prepare("INSERT INTO guilds (id, name, name_key, tag, ranks, founded_at) VALUES (?, ?, ?, ?, '[]', 1)")
      .run(guild, guild, guild, guild.slice(-1).toUpperCase());
  }
  return { database, raw };
}

const INSERT_LINE_SQL = `INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
  VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, NULL, ?)`;

function insertLine(raw: DatabaseSync, line: Line): void {
  const actor = line.srcId ?? line.dstId ?? 'service';
  raw
    .prepare(INSERT_LINE_SQL)
    .run(line.srcKind, line.srcId, line.dstKind, line.dstId, line.kind, line.amount, line.day, actor, line.rid);
}

/** The counter a guard reads, 0 when no act has written it. */
function counter(raw: DatabaseSync, subject: string, kind: string, period: number): number {
  const row = raw
    .prepare('SELECT n FROM act_counts WHERE subject = ? AND kind = ? AND period = ?')
    .get(subject, kind, period);
  return Number(row?.n ?? 0);
}

const sumOf = (raw: DatabaseSync, sql: string, ...args: (string | number)[]): number =>
  Number(raw.prepare(sql).get(...args)?.s ?? 0);

/** The ledger sums the cap guards read before the counters, for one subject and day. */
function ledgerSums(raw: DatabaseSync, account: string, guild: string, day: number) {
  const combatKinds = COMBAT_KINDS.map((kind) => `'${kind}'`).join(', ');
  const faucetSum = (kind: string) =>
    sumOf(
      raw,
      "SELECT SUM(amount) AS s FROM marks_ledger WHERE dst_kind = 'account' AND dst_id = ? AND kind = ? AND day = ?",
      account,
      kind,
      day,
    );
  return {
    combat: sumOf(
      raw,
      `SELECT SUM(amount) AS s FROM marks_ledger WHERE dst_kind = 'account' AND dst_id = ? AND kind IN (${combatKinds}) AND day = ?`,
      account,
      day,
    ),
    gather: faucetSum('gather'),
    find: faucetSum('find'),
    exchange: sumOf(
      raw,
      "SELECT SUM(amount) AS s FROM marks_ledger WHERE src_id = ? AND kind = 'exchange' AND day = ?",
      account,
      day,
    ),
    guildDeeds: sumOf(
      raw,
      "SELECT COUNT(*) AS s FROM marks_ledger WHERE dst_kind = 'guild' AND dst_id = ? AND kind = 'guild-deed' AND day = ?",
      guild,
      day,
    ),
  };
}

function counters(raw: DatabaseSync, account: string, guild: string, day: number) {
  return {
    combat: counter(raw, account, 'marks-combat', day),
    gather: counter(raw, account, 'marks-gather', day),
    find: counter(raw, account, 'marks-find', day),
    exchange: counter(raw, account, 'marks-exchange', day),
    guildDeeds: counter(raw, guild, 'marks-guild-deed', day),
  };
}

/** A fixed pseudo-random sequence, so a failure repeats. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2 ** 31;
    return state / 2 ** 31;
  };
}

/** A line of one of the kinds the counters must count or ignore, between the fixed accounts, guilds and days. */
function randomLine(random: () => number, index: number): Line {
  const pick = <T>(list: T[]): T => list[Math.floor(random() * list.length)];
  const account = pick(ACCOUNTS);
  const guild = pick(GUILDS);
  const day = pick(DAYS);
  const amount = 1 + Math.floor(random() * 9);
  const rid = `line-${index}`;
  const shape = pick(['combat', 'gather', 'find', 'exchange', 'deed', 'writ', 'deposit', 'deed-to-account']);
  switch (shape) {
    case 'combat':
      return {
        srcKind: 'mint',
        srcId: null,
        dstKind: 'account',
        dstId: account,
        kind: pick(COMBAT_KINDS),
        amount,
        day,
        rid,
      };
    case 'gather':
    case 'find':
      return { srcKind: 'mint', srcId: null, dstKind: 'account', dstId: account, kind: shape, amount, day, rid };
    case 'exchange':
      return { srcKind: 'account', srcId: account, dstKind: 'burn', dstId: null, kind: 'exchange', amount, day, rid };
    case 'deed':
      return { srcKind: 'mint', srcId: null, dstKind: 'guild', dstId: guild, kind: 'guild-deed', amount: 25, day, rid };
    case 'writ':
      return { srcKind: 'mint', srcId: null, dstKind: 'account', dstId: account, kind: 'writ', amount, day, rid };
    case 'deposit':
      return {
        srcKind: 'account',
        srcId: account,
        dstKind: 'guild',
        dstId: guild,
        kind: 'guild-deposit',
        amount,
        day,
        rid,
      };
    default:
      // A kind a cap counts, sent where that cap does not look: it must not count.
      return {
        srcKind: 'mint',
        srcId: null,
        dstKind: 'guild',
        dstId: guild,
        kind: pick(['gate', 'find']),
        amount,
        day,
        rid,
      };
  }
}

test('after every line of a mixed day, each cap counter equals the ledger sum its guard read', () => {
  const { raw } = freshDatabase();
  for (const account of ACCOUNTS) {
    insertLine(raw, {
      srcKind: 'mint',
      srcId: null,
      dstKind: 'account',
      dstId: account,
      kind: 'test',
      amount: STARTING_BALANCE,
      day: DAYS[0],
      rid: `fund-${account}`,
    });
  }
  const random = seededRandom(7);
  for (let index = 0; index < 400; index++) {
    insertLine(raw, randomLine(random, index));
    for (const day of DAYS) {
      for (let pair = 0; pair < ACCOUNTS.length; pair++) {
        const account = ACCOUNTS[pair];
        const guild = GUILDS[pair];
        assert.deepEqual(
          counters(raw, account, guild, day),
          ledgerSums(raw, account, guild, day),
          `after line ${index}`,
        );
      }
    }
  }
  const kinds = raw
    .prepare('SELECT DISTINCT kind FROM act_counts ORDER BY kind')
    .all()
    .map((row) => row.kind);
  assert.deepEqual(kinds, ['marks-combat', 'marks-exchange', 'marks-find', 'marks-gather', 'marks-guild-deed']);
});

test('every combat kind in the Marks law is counted by the combat counter', () => {
  const { raw } = freshDatabase();
  for (const kind of COMBAT_KINDS) {
    insertLine(raw, {
      srcKind: 'mint',
      srcId: null,
      dstKind: 'account',
      dstId: 'acct-a',
      kind,
      amount: 1,
      day: DAYS[0],
      rid: `combat-${kind}`,
    });
  }
  assert.equal(counter(raw, 'acct-a', 'marks-combat', DAYS[0]), COMBAT_KINDS.length);
});

test('a retry that inserts nothing, a repeated request id and a failed batch leave the counter as it was', async () => {
  const { database, raw } = freshDatabase();
  const strike = {
    srcKind: 'mint',
    srcId: null,
    dstKind: 'account',
    dstId: 'acct-a',
    kind: 'gate',
    amount: 50,
    day: DAYS[0],
    rid: 'gate:700',
  } as const;
  insertLine(raw, strike);
  assert.equal(counter(raw, 'acct-a', 'marks-combat', DAYS[0]), 50);

  // The guards' own retry form: the line's request id already stands, so the SELECT yields no row.
  const retry = raw
    .prepare(
      `INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
       SELECT 'mint', NULL, 'account', ?1, 'gate', 50, ?2, 1, ?1, NULL, 'gate:700'
       WHERE NOT EXISTS (SELECT 1 FROM marks_ledger WHERE actor = ?1 AND rid = 'gate:700')`,
    )
    .run('acct-a', DAYS[0]);
  assert.equal(Number(retry.changes), 0);
  assert.equal(counter(raw, 'acct-a', 'marks-combat', DAYS[0]), 50, 'a retry that inserts nothing');

  assert.throws(() => insertLine(raw, strike), /UNIQUE/);
  assert.equal(counter(raw, 'acct-a', 'marks-combat', DAYS[0]), 50, 'a request racing itself into the unique key');

  const failingBatch = [
    database
      .prepare(INSERT_LINE_SQL)
      .bind('mint', null, 'account', 'acct-a', 'raid', 30, DAYS[0], 'acct-a', 'raid:17:1:1000'),
    // A line of 0 Marks breaks the ledger's CHECK, so the batch fails after its first line.
    database
      .prepare(INSERT_LINE_SQL)
      .bind('mint', null, 'account', 'acct-a', 'raid', 0, DAYS[0], 'acct-a', 'raid:17:2:1000'),
  ];
  await assert.rejects(database.batch(failingBatch));
  assert.equal(counter(raw, 'acct-a', 'marks-combat', DAYS[0]), 50, 'a batch rolled back whole');
});
