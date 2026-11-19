// @ts-check
// GRANT2: THE SPAWN GRANTS'
// MEASURE, KEPT AND READ. The relay's cells post their windows of grant asks (src/net/grantMeasure.js), signed with the
// relay's receipt key, to POST /v1/mod/grant-feed - a door proven by that signature, never a session (the chat feed's,
// safety.js takeFeed). A developer reads them with /v1/mod/realm-grants (review.js; tools/realmReview.mjs grants):
// per kind, an account's asks an hour - its quantiles and most - what the buckets standing would have refused, and the
// cells' most live granted members. GRANT5 sets the buckets and the ceiling from it after seven days (the owner, question 3):
// each kind's rate and the ceiling come back suggested beside the standing ones (grantRateSuggested, grantCeilingSuggested).
// GRANT7 (section 15): readers' tallies against one sender, from enough accounts at once, open the moderators' case.
// FOE-BOUNDS and GRANT-ASKS: so does the relay's OWN count - a
// record of a sender's it stripped because no builder could give it, and an account's own asks far past its budget.
import { openGrantMeasure, GRANT_RELAY_READER } from '../../src/net/grantMeasure.js';
import { GRANT_KINDS, GRANT_CELL_CEILING, GRANT_CASE_REASONS } from '../../src/net/grantLaw.js';
import { gatePublicKey } from './signing.js';
import { openCaseFor, keepCaseLines, credibleReporter } from './safety.js';
import { displayName, overRate } from './accounts.js';
import { sql } from 'kysely';
import { sqlOf, chunksOf, BOUND_VALUES_MAX } from './database-seam.ts';

/** The door's path - the relay's GRANT_FEED_URL names it (server/wrangler.toml). */
export const GRANT_FEED_PATH = '/v1/mod/grant-feed';
/** The shortest window an account's rate is read over, s - a cell that slept a minute after one ask is not sixty an hour. */
export const GRANT_RATE_SPAN_MIN_S = 600;
/** GRANT7: how many readers' accounts, each one that counts
 *  (safety.js credibleReporter: registered, not muted, no sprout), tallying a case's reasons against one sender inside
 *  GRANT_CASE_WINDOW_S open its moderators' case. */
export const GRANT_CASE_READERS = 3;
export const GRANT_CASE_WINDOW_S = 10 * 60;
/** The most senders one batch's tallies are weighed for (a batch holds GRANT_MEASURE_ROWS rows at most). */
export const GRANT_CASE_SENDERS_MAX = 32;
/** The tab a grant case's line is kept under (mod_case_lines.tab; the staff panel prints it). */
export const GRANT_CASE_TAB = 'grant';
/** GRANT-ASKS (Spawn-Grants section 21): an account's own asks of a kind in one cell's window open its case at this many
 *  times the most its budget lets honest play ask in that window (the kind's `cap` and its `rate` over the window, never
 *  under GRANT_RATE_SPAN_MIN_S) - and at least GRANT_ASK_CASE_OVER_MIN asks past it, so a kind whose budget is a handful
 *  is not a case at its fourth. The buckets are GRANT5's to set; both numbers ride with them. */
export const GRANT_ASK_CASE_TIMES = 4;
export const GRANT_ASK_CASE_OVER_MIN = 16;
/** FOE-BOUNDS and GRANT-ASKS: the most cases the relay's own count may OPEN an hour (a case already open takes its line
 *  whatever this says) - a flood of fresh guest accounts never floods #mod-queue (safety.js UNCOUNTED_CASES_HOUR's way). */
export const GRANT_OWN_CASES_HOUR = 30;

/**
 * A POSTED WINDOW: kept when the relay's signature holds over a batch young enough, once - `{ ok, read }` (`read` false
 * for a batch already kept), or `{ error }` (grant-closed: the service holds no relay key; grant-shape; grant-signature;
 * grant-stale).
 * @param {{ db: any, nowS: number, subtle: SubtleCrypto, rand: (b: Uint8Array) => void }} ctx @param {any} env @param {Uint8Array} bytes @param {unknown} sig
 * GRANT7: a batch whose tallies name a sender for a case's reason weighs its case (grantCases) - `cases` the ones touched.
 */
export async function takeGrantMeasure({ db, nowS, subtle, rand }, env, bytes, sig) {
  const opened = await openGrantMeasure(bytes, sig, await gatePublicKey(env, subtle), { subtle, nowMs: nowS * 1000 });
  if ('error' in opened) return opened;
  const b = opened.batch;
  const span = Math.max(1, Math.round((b.at - b.from) / 1000));
  const seam = sqlOf(db);
  const query = seam.kysely;
  const keep = query
    .insertInto('grant_batches')
    .values({ id: b.id, at: nowS, q: b.q, span_s: span, live: b.live })
    .onConflict((conflict) => conflict.doNothing());
  const kept = await seam.run(keep);
  if (!kept.changes) return { ok: true, read: false };
  const rowValues = b.rows.map((/** @type {any} */ r) => ({
    batch: b.id,
    at: nowS,
    sub: r.a,
    kind: r.k,
    asks: r.asks,
    members: r.members,
    bucket: r.bucket,
    ceiling: r.ceiling,
    span_s: span,
  }));
  const tallyValues = b.tl.map((/** @type {any} */ t) => ({
    batch: b.id,
    at: nowS,
    reader: t.a,
    sender: t.b,
    reason: t.r,
    n: t.n,
  }));
  // Many rows to a statement, each statement under D1's bound-value limit: a full window is a dozen statements, not 128
  const rowsPerInsert = (/** @type {object[]} */ values) => Math.floor(BOUND_VALUES_MAX / Object.keys(values[0]).length);
  const writes = [
    ...(rowValues.length ? chunksOf(rowValues, rowsPerInsert(rowValues)).map((chunk) => query.insertInto('grant_rows').values(chunk)) : []),
    ...(tallyValues.length ? chunksOf(tallyValues, rowsPerInsert(tallyValues)).map((chunk) => query.insertInto('grant_tallies').values(chunk)) : []),
  ];
  if (writes.length) await seam.atomic(writes);
  const ctx = { db, nowS, rand };
  /** @type {Map<string, { texts: string[], readers: boolean }>} the sender, its findings - and whether readers' accounts made one */
  const found = new Map();
  const add = (/** @type {string} */ s, /** @type {string} */ text, readers = false) => { const f = found.get(s) ?? { texts: [], readers: false }; f.texts.push(text); f.readers ||= readers; found.set(s, f); };
  const senders = [...new Set(b.tl.filter((/** @type {any} */ t) => GRANT_CASE_REASONS.includes(t.r) && t.a !== GRANT_RELAY_READER).map((/** @type {any} */ t) => String(t.b)))];
  for (const [s, text] of senders.length ? await grantCases(ctx, env, senders) : []) add(s, text, true);
  for (const t of b.tl) if (t.a === GRANT_RELAY_READER && GRANT_CASE_REASONS.includes(t.r)) add(String(t.b), grantRelayText(t));
  for (const r of b.rows) { const text = grantAskText(r, span); if (text) add(String(r.a), text); }
  const cases = found.size ? await grantCaseLines(ctx, env, found) : 0;
  return { ok: true, read: true, ...(cases ? { cases } : {}) };
}

/** FOE-BOUNDS (section 19): the relay's own word on a sender - the records of its it stripped because no builder could
 *  give them, the worst one's type, its claim and its bound (net/foeBounds.js). */
const grantRelayText = (/** @type {any} */ t) => `the relay itself dropped ${t.n} of this account's foes no builder could give${t.e ? ` - the worst a type ${t.e.t} at ${Math.round(t.e.k)} health, its most ${Math.round(t.e.mx)}` : ''} (Spawn-Grants FOE-BOUNDS)`;
/**
 * GRANT-ASKS (section 21): THE RELAY'S OWN COUNT OF AN ACCOUNT'S ASKS - row `r` (an account's asks of a kind in one cell's
 * window of `span` seconds) far past what its budget lets honest play ask there (GRANT_ASK_CASE_TIMES its most, and
 * GRANT_ASK_CASE_OVER_MIN past it): its words, or null. Its asks, not its bucket's refusals - the cell's ceiling is
 * asked first, so a flood that filled the cell is counted `ceiling` from then on, and a rule on `bucket` alone misses it.
 * Pure. @param {any} r @param {number} span
 */
export function grantAskText(r, span) {
  const law = GRANT_KINDS[/** @type {keyof typeof GRANT_KINDS} */ (r?.k)];
  if (!law || !Number.isFinite(r.asks)) return null;
  const allow = Math.ceil(law.cap + law.rate * Math.max(span, GRANT_RATE_SPAN_MIN_S));
  if (r.asks < GRANT_ASK_CASE_TIMES * allow || r.asks - allow < GRANT_ASK_CASE_OVER_MIN) return null;
  return `the relay's own count: this account asked ${r.asks} ${r.k} grants in ${Math.round(Math.max(span, 60) / 60)} minutes, ${Math.floor(r.asks / allow)} times the most its budget lets honest play ask (${allow}) (Spawn-Grants GRANT-ASKS)`;
}

/**
 * GRANT7 (Spawn-Grants section 15): THE MODERATORS' CASE, NEVER A BAN. For each sender a batch's tallies name for a case's
 * reason (net/grantLaw.js GRANT_CASE_REASONS - what only a changed client gives), the readers' accounts that tallied
 * against it inside GRANT_CASE_WINDOW_S; GRANT_CASE_READERS of them that count (credibleReporter - the reports' own law,
 * so a ring of fresh guests opens nothing) open its case, or add to the one open: one line under the `grant` tab - how
 * many players' games refused how many of its foes, and why - once a window. The case is the reviewer's own kind
 * (`review`): no report is filed, so the reports' automatic mute (REPORT_AUTO_MUTE) is never reached, and the AI reader
 * (chat's) is not asked. A moderator decides; nothing here sanctions anyone.
 * Answers each sender's line (grantCaseLines writes it). @param {{ db: any, nowS: number, rand: (b: Uint8Array) => void }} ctx
 * @param {any} env @param {string[]} senders
 */
export async function grantCases(ctx, env, senders) {
  const { db, nowS } = ctx;
  const since = nowS - GRANT_CASE_WINDOW_S;
  const seam = sqlOf(db);
  const query = seam.kysely;
  /** @type {Map<string, string>} */
  const out = new Map();
  const weighed = senders.slice(0, GRANT_CASE_SENDERS_MAX);
  if (!weighed.length) return out;
  // Every sender's tallies in one read, and every reader's account in one more: a read per sender and per reader
  // made a batch naming 32 senders cost dozens of statements
  const tallied = query
    .selectFrom('grant_tallies')
    .select((eb) => ['sender', 'reader', 'reason', eb.fn.sum('n').as('n')])
    .where('sender', 'in', weighed)
    .where('at', '>', since)
    .where('reason', 'in', [...GRANT_CASE_REASONS])
    .groupBy(['sender', 'reader', 'reason'])
    .orderBy(['sender', 'reader', 'reason']);
  /** @type {Map<string, any[]>} */
  const rowsBySender = new Map();
  for (const row of (await seam.run(tallied)).rows) {
    const sender = String(row.sender);
    rowsBySender.set(sender, [...(rowsBySender.get(sender) ?? []), row]);
  }
  /** @type {Map<string, string[]>} */
  const readersBySender = new Map();
  for (const sender of weighed) {
    const rows = rowsBySender.get(sender) ?? [];
    const readers = [...new Set(rows.map((r) => String(r.reader)))].filter((r) => r !== sender && r !== GRANT_RELAY_READER);
    if (readers.length >= GRANT_CASE_READERS) readersBySender.set(sender, readers);
  }
  const readerIds = [...new Set([...readersBySender.values()].flat())];
  /** @type {Map<string, any>} */
  const players = new Map();
  for (const ids of chunksOf(readerIds, BOUND_VALUES_MAX)) {
    for (const player of (await seam.run(query.selectFrom('players').selectAll().where('id', 'in', ids))).rows) players.set(String(player.id), player);
  }
  for (const [sender, readers] of readersBySender) {
    const rows = rowsBySender.get(sender) ?? [];
    const counted = readers.filter((id) => players.has(id) && credibleReporter(players.get(id), nowS));
    if (counted.length < GRANT_CASE_READERS) continue;
    const why = new Map();
    for (const r of rows) if (counted.includes(String(r.reader))) why.set(String(r.reason), (why.get(String(r.reason)) ?? 0) + Number(r.n));
    const foes = [...why.values()].reduce((a, n) => a + n, 0);
    out.set(sender, `${counted.length} players' games refused ${foes} of this account's foes in ${GRANT_CASE_WINDOW_S / 60} minutes: ${[...why].map(([r, n]) => `${r} ${n}`).join(', ')} (Spawn-Grants GRANT7)`);
  }
  return out;
}

/**
 * GRANT7 and FOE-BOUNDS / GRANT-ASKS: THE CASES WRITTEN - each sender's findings of one batch as ONE line under the
 * `grant` tab (a line is keyed by its case, second and account: two of one batch's would keep the first alone), once a
 * window: its case opened, or the one open added to. The relay's own count opens no
 * new case past GRANT_OWN_CASES_HOUR an hour (readers' cases are GRANT7's own law, three accounts that count). Answers
 * how many cases it touched. @param {{ db: any, nowS: number, rand: (b: Uint8Array) => void }} ctx @param {any} env
 * @param {Map<string, { texts: string[], readers: boolean }>} found
 */
export async function grantCaseLines(ctx, env, found) {
  const { db, nowS } = ctx;
  const since = nowS - GRANT_CASE_WINDOW_S;
  const seam = sqlOf(db);
  const query = seam.kysely;
  let touched = 0;
  for (const [sender, f] of [...found].slice(0, GRANT_CASE_SENDERS_MAX)) {
    const target = (await seam.run(query.selectFrom('players').selectAll().where('id', '=', sender).limit(1))).rows[0];
    if (!target) continue;
    const openCase = query
      .selectFrom('mod_cases')
      .select(sql`1`.as('y'))
      .where('target', '=', sender)
      .where('kind', '=', 'spawn')
      .where('status', '=', 'open')
      .limit(1);
    if (!f.readers && !(await seam.run(openCase)).rows.length && await overRate(ctx, 'grant-own-cases', GRANT_OWN_CASES_HOUR, 3600)) continue;
    const caseId = await openCaseFor(ctx, env, sender, 'review', 'spawn');   // a spawn case, never a chat report's
    const lineThisWindow = query
      .selectFrom('mod_case_lines')
      .select(sql`1`.as('y'))
      .where('case_id', '=', caseId)
      .where('tab', '=', GRANT_CASE_TAB)
      .where('at', '>', since)
      .limit(1);
    if ((await seam.run(lineThisWindow)).rows.length) continue;   // one line a window
    await keepCaseLines(db, caseId, [{ tab: GRANT_CASE_TAB, sub: sender, name: displayName(target), at: nowS, text: f.texts.join('; ') }], sender);
    await seam.run(query.updateTable('mod_cases').set({ updated_at: nowS }).where('id', '=', caseId));
    touched++;
  }
  return touched;
}

/**
 * THE MEASURE over the last `days`: per kind, every account-window's asks an hour (its window at least
 * GRANT_RATE_SPAN_MIN_S long) - their count, quantiles and most, by `ranked` - with the asks, members and what the
 * bucket and the ceiling would have refused in all; and the cells' most live granted members, ranked the same, beside
 * the ceiling standing. `ranked` is review.js's (the database asked a rank at a time).
 * @param {any} db @param {number} nowS @param {number} days
 * @param {(n: number, at: (rank: number) => Promise<any>) => Promise<{ quantiles: any[], most: any }>} ranked
 */
export async function grantsMeasure(db, nowS, days, ranked) {
  const since = nowS - days * 24 * 3600;
  const seam = sqlOf(db);
  const query = seam.kysely;
  // An account's asks an hour, over a window of at least GRANT_RATE_SPAN_MIN_S. A CASE, not SQLite's two-argument MAX,
  // so that Postgres runs the same text.
  const rate = sql`CAST(ROUND(asks * 3600.0 / (CASE WHEN span_s > ${GRANT_RATE_SPAN_MIN_S} THEN span_s ELSE ${GRANT_RATE_SPAN_MIN_S} END)) AS INTEGER)`;
  // Every kind's sums in one grouped read; a kind with no rows sums to nothing
  const summed = query
    .selectFrom('grant_rows')
    .select((eb) => [
      'kind',
      eb.fn.countAll().as('n'),
      eb.fn.sum('asks').as('asks'),
      eb.fn.sum('members').as('members'),
      eb.fn.sum('bucket').as('bucket'),
      eb.fn.sum('ceiling').as('ceiling'),
    ])
    .where('at', '>=', since)
    .groupBy('kind');
  const sumsByKind = new Map((await seam.run(summed)).rows.map((row) => [String(row.kind), row]));
  const kinds = [];
  for (const kind of Object.keys(GRANT_KINDS)) {
    const sums = sumsByKind.get(kind);
    const n = Number(sums?.n ?? 0);
    const at = async (/** @type {number} */ rank) => {
      const ranked = query
        .selectFrom('grant_rows')
        .select(rate.as('r'))
        .where('at', '>=', since)
        .where('kind', '=', kind)
        .orderBy('r')
        .limit(1)
        .offset(rank);
      return (await seam.run(ranked)).rows[0]?.r ?? null;
    };
    const { quantiles, most } = await ranked(n, at);
    const top = quantiles.at(-1)?.[1] ?? null;
    const standing = GRANT_KINDS[/** @type {keyof typeof GRANT_KINDS} */ (kind)];
    kinds.push({ kind, windows: n, asks: Number(sums?.asks ?? 0), members: Number(sums?.members ?? 0), bucket: Number(sums?.bucket ?? 0), ceiling: Number(sums?.ceiling ?? 0), perHour: { quantiles, most },
      rate: { standing: standing.rate, suggested: grantRateSuggested(top) } });
  }
  const cells = query.selectFrom('grant_batches').select((eb) => eb.fn.countAll().as('n')).where('at', '>=', since);
  const cellsN = Number((await seam.run(cells)).rows[0]?.n ?? 0);
  const liveAt = async (/** @type {number} */ rank) => {
    const ranked = query
      .selectFrom('grant_batches')
      .select('live as r')
      .where('at', '>=', since)
      .orderBy('live')
      .limit(1)
      .offset(rank);
    return (await seam.run(ranked)).rows[0]?.r ?? null;
  };
  const live = await ranked(cellsN, liveAt);
  return { days, kinds, cells: { windows: cellsN, live, ceiling: GRANT_CELL_CEILING, suggested: grantCeilingSuggested(live.most) } };
}

/** GRANT5: the room a suggestion leaves past what honest play reached - half again. */
export const GRANT_SUGGEST_ROOM = 1.5;
/** GRANT5: A KIND'S RATE, SUGGESTED from its 0.999 quantile of an account's asks an hour (null with no measure): asks a
 *  second, half again past it - what GRANT_KINDS' `rate` would be set to before `/relay grantMode enforce`. Pure. */
export const grantRateSuggested = (/** @type {number|null} */ perHour) => (Number.isFinite(perHour) && /** @type {number} */ (perHour) > 0 ? (/** @type {number} */ (perHour) * GRANT_SUGGEST_ROOM) / 3600 : null);
/** GRANT5: THE CELL'S CEILING, SUGGESTED from the most live granted hostile members any cell held - half again past it,
 *  whole (null with no measure). Pure. */
export const grantCeilingSuggested = (/** @type {number|null} */ most) => (Number.isFinite(most) && /** @type {number} */ (most) > 0 ? Math.ceil(/** @type {number} */ (most) * GRANT_SUGGEST_ROOM) : null);
