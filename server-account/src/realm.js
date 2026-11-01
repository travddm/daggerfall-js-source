// @ts-check
// ═══════════════════════════════════════════════════════════════════
// REALM P1 — THE REALM'S CHARACTERS, SERVICE SIDE. The row in D1, the
// save in R2, and the lease that says which tab may write it.
//
// and, asked where an online character's save lives: "Account service".
// The plan is, sections 1 and 2.
//
// ═══ HERE THE SERVICE IS THE TRUTH ═════════════════════════════════
//
// saves.js is a backup and says so: "THE LOCAL SAVE IS THE TRUTH". A
// realm character is the other lane. Its save lives here, the Online
// door loads it only from here, and a local copy is a cache that no
// door lists. That is what makes a copy worthless as a way in: a
// restored backup, an imported zip or an edited file can be loaded
// offline, where it is an offline character, and nowhere else. A COPY,
// never a checkpoint: what a tab sends under its lease is the save
// from then, whatever client wrote it (Integrity-Arc: "almost all of
// the game is client authoritative") - so INT2's judge reads every
// one (verdict.js), and a breach freezes the character's trade.
//
// ═══ THE LEASE AND THE SEQUENCE ════════════════════════════════════
//
// A JOIN mints a new lease and so takes the character from any tab that
// held it - ONE-SEAT's own rule, newest wins - and it frees every other
// character of the account, so one account plays one character. A
// CHECKPOINT lands only under the current lease and only at `seq + 1`.
// So an old tab, a second device or a replayed request can never write
// the character again; the tab that lost the lease is told so and goes
// offline.
//
// EVERY WRITE IS A NEW OBJECT (REALM P2.1). The row names the current
// save (`obj`) and the one before it (`prev`), and a write lands at a
// key of its own before the row moves to it - so a write that loses its
// race (a checkpoint against a trade the service is settling, a join
// between the read and the write) leaves the current save untouched,
// and the one before the last checkpoint always survives. P1 alternated
// two objects by `seq`, and a write that lost its race could land on
// the current one.
//
// ═══ EVERYTHING IS SCOPED BY THE PLAYER THE CALLER PROVED ══════════
//
// saves.js's law, kept: every statement binds the resolved player, and
// no route takes a player id from a caller.
// ═══════════════════════════════════════════════════════════════════

import { SAVE_MAX_BYTES } from './service.js';
import { GUILD_RANK_MASTER } from '../../src/net/guild/guildLaw.js';   // AUDIT REALM L1-F7: a deleted guildmaster hands the guild over first
import { homeMoved } from '../../src/net/homeLaw.js';   // QUEST-HOME: the homes a deleted character took with it
import { liquidWealthOf, REALM_BIRTH_LEVEL, REALM_BIRTH_WEALTH_MAX } from '../../src/net/realm/realmGoldLaw.js';
import { armsIssuable } from '../../src/net/identityToken.js';   // INT7: the arms' claim
import { saveTextOf, REALM_TEXT_MAX_BYTES } from '../../src/net/realm/realmSaveCodec.js';   // REALM-GZIP: a save read packed or plain
import { lineageBirthRefusal, houseOn, endUnionsOf } from './legacy.js';   // LEGACY7: a realm character born as a person of the account's own line
import { wealthOf, ledgerPieces, classicCount, WEALTH_VERSION } from './judge.js';   // INT5: what the service's own writes move, witnessed; INT4: the pieces it moves
import { seaSeasonSteps } from './seaSeason.js';   // SEA-SEASON: the sea's season figures, off a clean checkpoint
import { piecesRefusal, ledgerMoves, releaseSteps, ledgerReads, leavingKeys } from './ledger.js';   // INT4: a piece the record may give, and the ledger moved with it; SAVE-BATCH: its reads in the checkpoint's first batch
import { budgetKept, budgetRead, budgetFrom } from './budget.js';   // SAVE-BATCH: and the budget's config, where the isolate kept none
import { verdictOn } from './verdict.js';   // INT2-INT5: the verdict on every checkpoint, in the checkpoint's own batch

/** Realm characters an ACCOUNT may hold. A new one past it is refused; nothing is ever deleted to make room. */
export const REALM_CHARACTERS_MAX = 6;
/** A character's name as the Online door shows it. */
export const REALM_NAME_MAX = 32;
/** The summary's JSON, in bytes. */
export const REALM_SUMMARY_MAX = 512;
/** A lease renewed this recently is a character in play ("playing now" on the tile). Two checkpoints' span: they come every
 *  five minutes (systems/online/onlineCheckpoint.js ONLINE_CHECKPOINT_MS, CHECKPOINT-5 - AUDIT PLAN-1000 G9: at 300 a
 *  playing character's tile said "not playing" a moment each period, and RESCUE-SAVE's sweep guard reads the flag). */
export const REALM_PLAYING_S = 600;
/** The largest save a checkpoint may carry - the cloud save's own bound. REALM-GZIP: the REQUEST's bound - a tab packs
 *  its save, and the text a checkpoint opens to is REALM_TEXT_MAX_BYTES (src/net/realm/realmSaveCodec.js). */
export const REALM_MAX_BYTES = SAVE_MAX_BYTES;
/** The service's ids: `r` and twenty hex digits. Nothing a client mints looks like one. */
export const REALM_ID_RE = /^r[0-9a-f]{20}$/;
/** A lease: thirty-two hex digits, a secret the playing tab holds. */
export const LEASE_RE = /^[0-9a-f]{32}$/;

/** The R2 keys: player first, so an account is a prefix walk; a character's saves under its id, each at the sequence
 *  it lands at and a tag of its own, so no two writes ever share a key. */
export const realmPrefix = (/** @type {string} */ playerId) => `realm/${encodeURIComponent(playerId)}/`;
export const realmObjectKey = (/** @type {string} */ playerId, /** @type {string} */ id, /** @type {number} */ seq, /** @type {string} */ tag) => `${realmPrefix(playerId)}${id}/${seq}-${tag}`;

const hex = (/** @type {(b: Uint8Array) => Uint8Array} */ rand, /** @type {number} */ n) => [...rand(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');
/** A fresh key for a write of this character at `seq`. */
export const mintObjectKey = (/** @type {(b: Uint8Array) => Uint8Array} */ rand, /** @type {string} */ playerId, /** @type {string} */ id, /** @type {number} */ seq) => realmObjectKey(playerId, id, seq, hex(rand, 4));
/** Objects nothing names any more - a write that lost its race, or the save two back. Best effort: one that will not go
 *  is only bytes under the character's prefix, which its delete walks. */
export async function dropObjects(/** @type {any} */ bucket, /** @type {(string | null | undefined)[]} */ keys) {
  for (const k of keys) {
    if (!k) continue;
    try { await bucket.delete(k); } catch { /* bytes nothing names */ }
  }
}
export const mintRealmId = (/** @type {(b: Uint8Array) => Uint8Array} */ rand) => `r${hex(rand, 10)}`;
export const mintLease = (/** @type {(b: Uint8Array) => Uint8Array} */ rand) => hex(rand, 16);

/** A name the door may show: trimmed, printable, bounded - or null. */
export function realmNameOf(/** @type {unknown} */ v) {
  if (typeof v !== 'string') return null;
  const name = v.trim().slice(0, REALM_NAME_MAX);
  return name && !/[\u0000-\u001f\u007f]/.test(name) ? name : null;
}

const whole = (/** @type {unknown} */ v, /** @type {number} */ max) => (Number.isSafeInteger(v) && /** @type {number} */ (v) >= 0 && /** @type {number} */ (v) <= max ? v : null);
const text = (/** @type {unknown} */ v, /** @type {number} */ max) => (typeof v === 'string' && v && !/[\u0000-\u001f\u007f]/.test(v) ? v.slice(0, max) : null);

/**
 * THE SUMMARY A CLIENT MAY SEND, projected - what the tile shows and nothing else: level, class, race, gender, and
 * the face the tile draws. Extra keys do not exist here. Answers the JSON to store, or null.
 * @param {any} v
 */
export function realmSummaryOf(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const s = {
    level: whole(v.level, 1000),
    className: text(v.className, 40),
    race: text(v.race, 24),
    gender: text(v.gender, 8),
    face: whole(v.face, 1000),
    region: text(v.region, 40),
  };
  const json = JSON.stringify(s);
  return json.length <= REALM_SUMMARY_MAX ? json : null;
}

/** The row as the Online door sees it. The lease is never in it. */
const view = (/** @type {any} */ r, /** @type {number} */ nowS) => {
  let summary = null;
  try { summary = r.summary ? JSON.parse(r.summary) : null; } catch { summary = null; }
  return {
    id: r.id, name: r.name, summary, seq: r.seq, bytes: r.bytes,
    playing: !!r.lease && nowS - r.lease_at < REALM_PLAYING_S,
    createdAt: r.created_at, updatedAt: r.updated_at,
    lineage: r.lineage_id ?? null, person: r.person_id ?? null,   // LEGACY7: the line and the person it plays (legacy.js)
    house: r.line ? houseOn(r.line, r.person_id) : null,   // LEGACY7 part two: its house, for the tile (net/houseLaw.js)
  };
};

/** Every realm character this account holds, the one played last first. LEGACY7: the living - a tombstoned one
 *  (legacy.js realmDie) is played no more and holds no slot; its family's record keeps it (the Hall). */
export async function listRealm({ db, nowS }, /** @type {string} */ playerId) {
  const r = await db.prepare(
    'SELECT r.id, r.name, r.summary, r.seq, r.bytes, r.lease, r.lease_at, r.created_at, r.updated_at, r.lineage_id, r.person_id, l.record AS line'
    + ' FROM realm_characters r LEFT JOIN lineages l ON l.player = r.player AND l.id = r.lineage_id'
    + ' WHERE r.player = ? AND r.dead_at IS NULL ORDER BY r.updated_at DESC LIMIT ?',
  ).bind(playerId, REALM_CHARACTERS_MAX).all();
  return (r?.results ?? []).map((row) => view(row, nowS));
}

/** ARENA4b: the highest level a token's `cl` claim says - the summary's own bound (realmSummaryOf's `level`). LEVEL-45: the
 *  online cap (src/systems/levelCap.js ONLINE_LEVEL_CAP), as the judge's JUDGE_LEVEL_MAX. */
export const REALM_LEVEL_CLAIM_MAX = 45;

/** WHAT THE IDENTITY MINT SIGNS OF THE CHARACTER IT IS MINTED FOR - `{ rc, cl, wa, house, name }`, one read of its row.
 *  - `rc` REALM-DOOR: IS THIS ONE OF THE ACCOUNT'S REALM CHARACTERS? The relay's door refuses a
 *    0, so online is the realm's at the servers, not only in the new build's boot. A realm id of this account's own,
 *    standing - LEGACY7: never a tombstone - and INT9 (AUDIT): IN PLAY, a lease held (the token's `ci` is whose record a
 *    death in the zone drops from, and its `cl` and `wa` what a referee reads: a tab playing one character named a poor
 *    other, its lease freed at the join, and its deaths dropped the other's record). Anything else is 0: an offline
 *    character's id (what a build from before the realm names), another account's, one deleted, none.
 *  - `cl` ARENA4b: THE LEVEL ON ITS TILE. INT7: the level the judge trusts (`level_seen` - verdict.js trustedLevel: the
 *    save's own, never risen faster than play allows) once a checkpoint was judged; before one, its summary's `level`,
 *    the word its client's checkpoint wrote. Null outside 1..REALM_LEVEL_CLAIM_MAX, or with no summary yet.
 *  - `wa` INT7: ITS ARMS as its last judged checkpoint found them (verdict.js `arms_top` and `arms_bow`: the most reach of
 *    its pack's lawful weapons, a lawful bow), within the claim's law (identityToken.js armsIssuable). Null before its
 *    first judged checkpoint since INT7.
 *  - `house` LEGACY7 part two: ITS HOUSE (src/net/houseLaw.js) - its line's surname, the member's given name, a
 *    Bloodline's mark, the generation's numeral (legacy.js houseOn: null for a character of no line, and for a name the
 *    name filter refuses - a house is shown to every player, as an account's name is).
 *  - `name` NAME-AS: ITS OWN NAME, as its row keeps it (realmNameOf's) - the name the mint signs where the
 *    account chose its character's (accounts.js wornNameOf, which asks whether the wire can carry it). A fifth answer of
 *    the same read, never a second statement: test/server/scale4f.test.js holds it to its own read beside the four.
 *  The four are read only for a character that is the realm's (`rc` 1), as the mint signs them only then.
 *  SCALE4f: THE FOUR READS OF ONE ROW, IN ONE. These were four functions and four
 *  statements of the same realm_characters row (realmCharacterHeld, realmLevelOf, realmArmsOf, legacy.js realmHouseOf),
 *  asked by every mint - and a relay deploy's wave asks the mint of every player at once. One statement answers exactly
 *  what the four answered: test/server/scale4f.test.js holds it to them, as they stood at acct106, over every state a row can be
 *  in. */
export async function realmMintFacts({ db }, /** @type {string} */ playerId, /** @type {unknown} */ id) {
  const none = { rc: 0, cl: null, wa: null, house: null, name: null };
  if (typeof id !== 'string' || !REALM_ID_RE.test(id)) return none;
  const row = await db.prepare('SELECT r.dead_at, r.lease, r.summary, r.level_seen, r.arms_top, r.arms_bow, r.person_id AS person, r.name AS name, l.record AS record'
    + ' FROM realm_characters r LEFT JOIN lineages l ON l.player = r.player AND l.id = r.lineage_id WHERE r.id = ? AND r.player = ?').bind(id, playerId).first();
  if (!row || row.dead_at != null || row.lease == null) return none;
  let summary = null;
  try { summary = row.summary ? JSON.parse(row.summary) : null; } catch { summary = null; }
  const lv = row.level_seen ?? summary?.level;
  const arms = row.arms_top != null ? [row.arms_top, row.arms_bow === 1 ? 1 : 0] : null;
  return {
    rc: 1,
    cl: Number.isSafeInteger(lv) && lv >= 1 && lv <= REALM_LEVEL_CLAIM_MAX ? lv : null,
    wa: armsIssuable(arms) ? /** @type {[number, 0|1]} */ (arms) : null,
    house: houseOn(row.record, row.person),   // no line, no record: none (houseOn's own null)
    name: typeof row.name === 'string' && row.name ? row.name : null,   // NAME-AS: its own name, for the mint to wear where chosen
  };
}

/** ONE CHARACTER IN PLAY AN ACCOUNT: every lease of this account but `keep`'s is dropped. */
async function freeOthers({ db }, /** @type {string} */ playerId, /** @type {string} */ keep) {
  await db.prepare('UPDATE realm_characters SET lease = NULL WHERE player = ? AND id != ? AND lease IS NOT NULL').bind(playerId, keep).run();
}

/**
 * A NEW REALM CHARACTER, born online - the one way a character enters the realm. The id and the lease are minted here; the
 * character is the caller's in play from this moment, at `seq` 0 with no save yet (its first checkpoint is seq 1). The
 * bound is asked IN the write, as saves.js's putCard asks it - the living alone (LEGACY7: a tombstone holds no slot).
 * LEGACY7: `lineage` and `person` - born as that person of one of the account's own lines (legacy.js
 * lineageBirthRefusal: a living member no realm character has played), named on the row for good. Answers
 * `{ id, lease, seq }` or `{ error }`.
 * @param {any} ctx @param {string} playerId @param {{ name: unknown, summary?: unknown, lineage?: unknown, person?: unknown }} at
 */
export async function createRealm({ db, rand, nowS }, playerId, { name, summary = null, lineage = null, person = null }) {
  const n = realmNameOf(name);
  if (!playerId || !n) return { error: 'body' };
  const born = lineage != null || person != null;
  if (born && Number.isSafeInteger(person)) {
    // LEGACY7: A BIRTH WHOSE FIRST SAVE NEVER LANDED is taken up again - the same row, a new lease -
    // never refused as a person already played: the realm never held a save of them
    const had = await db.prepare('SELECT id, bytes, dead_at FROM realm_characters WHERE player = ? AND lineage_id = ? AND person_id = ?').bind(playerId, lineage, person).first();
    if (had && !(had.bytes > 0) && had.dead_at == null) {
      const joined = await joinRealm({ db, rand, nowS }, playerId, had.id);
      return joined.error ? joined : { id: joined.id, lease: joined.lease, seq: 0, resumed: true };
    }
  }
  if (born) { const refused = await lineageBirthRefusal(db, playerId, lineage, person); if (refused) return refused; }
  const id = mintRealmId(rand);
  const lease = mintLease(rand);
  let wrote;
  try {
    wrote = await db.prepare(
      'INSERT INTO realm_characters (id, player, name, summary, seq, bytes, lease, lease_at, created_at, updated_at, lineage_id, person_id)'
      + ' SELECT ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM realm_characters WHERE player = ? AND dead_at IS NULL) < ?',
    ).bind(id, playerId, n, realmSummaryOf(summary), lease, nowS, nowS, nowS, born ? lineage : null, born ? person : null, playerId, REALM_CHARACTERS_MAX).run();
  } catch (e) {
    // LEGACY7: two tabs born as one person race to the unique index - one wins
    if (born && /UNIQUE/i.test(String(/** @type {any} */ (e)?.message ?? e))) return { error: 'lineage-played' };
    throw e;
  }
  if (!wrote.meta.changes) return { error: 'too-many-characters' };
  await freeOthers({ db }, playerId, id);
  return { id, lease, seq: 0 };
}

/**
 * A JOIN: a new lease on the account's own character, taking it from any tab that held it and freeing the account's
 * others. Answers `{ id, lease, seq, bytes }` - `bytes` 0 is a character whose first save never landed - or `{ error }`.
 * @param {any} ctx @param {string} playerId @param {unknown} id
 */
export async function joinRealm({ db, rand, nowS }, playerId, id) {
  if (typeof id !== 'string' || !REALM_ID_RE.test(id)) return { error: 'body' };
  const lease = mintLease(rand);
  // INT5: and the account's played seconds as it takes the seat - the budget fills from here, never from the time the account
  // spent on another of its characters
  const took = await db.prepare('UPDATE realm_characters SET lease = ?3, lease_at = ?4, played_at = (SELECT played_s FROM players WHERE id = ?2) WHERE id = ?1 AND player = ?2 AND dead_at IS NULL')
    .bind(id, playerId, lease, nowS).run();
  // LEGACY7: a tombstone is never joined again - an older save is never played past a death
  if (!took.meta.changes) return { error: (await db.prepare('SELECT 1 FROM realm_characters WHERE id = ? AND player = ?').bind(id, playerId).first()) ? 'dead' : 'no-realm-character' };
  await freeOthers({ db }, playerId, id);
  const row = await db.prepare('SELECT seq, bytes FROM realm_characters WHERE id = ? AND player = ?').bind(id, playerId).first();
  return { id, lease, seq: row?.seq ?? 0, bytes: row?.bytes ?? 0 };
}

/** REALM-GZIP: AN R2 OBJECT'S BYTES - the platform's reader when it has one (R2's own), its body when that is the bytes. */
export async function objectBytesOf(/** @type {any} */ object) {
  if (typeof object?.arrayBuffer === 'function') return new Uint8Array(await object.arrayBuffer());
  if (object?.body instanceof Uint8Array) return object.body;
  return new Uint8Array(await new Response(object?.body).arrayBuffer());
}

/** REALM-GZIP: A STORED SAVE'S TEXT - packed (a tab's checkpoint) or plain (one from before, or the service's own write),
 *  opened within REALM_TEXT_MAX_BYTES - or null (no object, past the bound, not whole). */
export async function realmSaveTextOf(/** @type {any} */ object) {
  return object ? saveTextOf(await objectBytesOf(object), REALM_TEXT_MAX_BYTES) : null;
}

/**
 * AUDIT REALM2 S1: THE FIRST SAVE IS READ. The service took any bytes as a character's first checkpoint, so a character
 * "born online" could be any offline save (ten million gold, level sixty) - and the first save is the start every later
 * check of the realm measures from. A character born online starts as chargen starts one: level REALM_BIRTH_LEVEL, and
 * no more liquid wealth than REALM_BIRTH_WEALTH_MAX ('realm-birth'). Wealth is the realm's one measure
 * (net/realm/realmGoldLaw.js liquidWealthOf): the purse, the banks, and every gold-piece item
 * and letter of credit wherever it lies. A save that is no JSON object is neither. Answers null, or `{ error }`.
 * REALM-GZIP: it reads the save's TEXT, opened by the checkpoint - a packed first save is measured as a plain one, and
 * one that will not open (null) is no JSON object.
 * @param {string | null} text
 */
export function firstSaveRefusal(text) {
  let save = null;
  try { save = JSON.parse(/** @type {string} */ (text)); } catch { save = null; }
  const shaped = !!save && typeof save === 'object' && !Array.isArray(save);
  return shaped && save.level === REALM_BIRTH_LEVEL && liquidWealthOf(save) <= REALM_BIRTH_WEALTH_MAX ? null : { error: 'realm-birth' };
}

/** INT2-INT6: the judge's columns on a character's row (AUTO-HOLD's timed hold; RPT1026-LEDGERLAW's
 *  `law_v`), as verdict.js reads them. */
export const JUDGE_COLUMNS = 'judged_seq, held, held_at, strikes, review, wealth, witnessed, allowance, played_at, clean_obj, clean_seq,'
  + ' dupes, judge_rev, svc_seq, level_seen, level_at, law_sig, law_excused, law_v, wealth_v, held_until, law_holds, law_at';

/**
 * INT3: THE HOLD, AS A ROUTE ASKS IT - before any act that hands a realm character's value to another player (a market
 * listing or purchase, a trade's half, a guild's vault or treasury, a rent, a card table's stake, a disenchant whose
 * Essence the market sells). Answers null, or `{ error }`: 'trade-held' (the judge holds its trade - verdict.js holdOf), or
 * 'record-unjudged' (no checkpoint read since INT2 shipped: the tab checkpoints before every act, so this is a record no tab has
 * written since, and it moves nothing until one does).
 * @param {{ held?: string | null, judged_seq?: number | null } | null} row
 */
export function holdRefusal(row) {
  if (!row) return null;
  if (row.held) return { error: 'trade-held', held: row.held };
  if (row.judged_seq == null) return { error: 'record-unjudged' };
  return null;
}

/** INT3: the hold of `character` when it is one of the account's realm characters (holdRefusal), else null - for a route
 *  that hands what a character owns at the service (a crafted piece the market lists, its Stores' units) to another
 *  player, its record untouched (AUDIT INT: a held character listed its craft for 900,000 gold). */
export async function realmHoldOf(/** @type {any} */ db, /** @type {string} */ playerId, /** @type {unknown} */ character) {
  if (typeof character !== 'string' || !REALM_ID_RE.test(character)) return null;
  return holdRefusal(await db.prepare('SELECT held, judged_seq FROM realm_characters WHERE id = ?1 AND player = ?2').bind(character, playerId).first());
}

/** AUDIT AUTO-HOLD: A HOLD STANDING on the character row aliased `a`, as a reader that cannot wait for that character's
 *  next checkpoint asks it, `now` the SQL of the time. A checkpoint is what lifts a hold - a timed one past its end with
 *  it - and the dead are refused one (LEGACY7), so a maker that died inside its week held every craft of its make for
 *  good. A law hold whose time is out, on a character that can checkpoint no more and whose last judgement found nothing
 *  that holds (`law_sig`), stands no more. */
export const holdStandsSql = (/** @type {string} */ a, /** @type {string} */ now) => `(${a}.held IS NOT NULL AND NOT (${a}.dead_at IS NOT NULL
  AND ${a}.held = 'law' AND ${a}.held_until IS NOT NULL AND ${a}.held_until <= ${now} AND ${a}.law_sig IS NULL))`;

/** CRAFT-HOLD: INT3's hold on a crafted piece follows THE PIECE - the hold of the
 *  account's realm character its maker's record names (`products.char_id`), whatever character the act names. realmHoldOf asks the acting character
 *  alone and answers null for an id that is no realm id, so a held character's craft listed, auctioned, filled a
 *  commission or was disenchanted under `char-anything` (a raw request: the realm character held for copies, its piece
 *  open on the boards for Drakes). Null for a piece no realm character of this account made. AUDIT CRAFT-HOLD: a HOLD
 *  alone, never `record-unjudged` - `char_id` stays the maker's for the piece's life (a sale moves `owner` only), so a
 *  sibling that bought its own account's piece back was refused for good once its maker lay unplayed or dead. */
export async function craftHoldOf(/** @type {any} */ db, /** @type {string} */ playerId, /** @type {unknown} */ provenance) {
  if (typeof provenance !== 'string') return null;
  const row = await db.prepare(`SELECT r.held FROM products p JOIN realm_characters r ON r.id = p.char_id AND r.player = ?2
    WHERE p.provenance = ?1 AND ${holdStandsSql('r', '?3')}`).bind(provenance, playerId, Math.floor(Date.now() / 1000)).first();
  return row?.held ? { error: 'trade-held', held: row.held } : null;
}

/**
 * A CHECKPOINT: the save, under the current lease, at `seq + 1`. The row is asked first (a stale lease or sequence is
 * refused before a byte is written), the object lands at a key of its own, and the row moves to it only if the lease
 * and sequence still hold - so a join or a trade between the two leaves the current save untouched, and the losing
 * write's object is dropped. The save two back goes; the one before stays, and (INT6) the last one judged clean.
 * INT2: AND EVERY CHECKPOINT IS READ - the judge's verdict (verdict.js verdictOn: the character law, the item law, the
 * id ledger, the budget, the hold) lands in the batch that moves the row. A verdict never refuses the save: it holds the
 * character's trade. Answers `{ ok, seq, tradeHeld }` - the hold standing (null for none), said
 * so the tab can tell its player, and (AUTO-HOLD) `locked`, the keys of the copies the record shows, locked piece by
 * piece (ledger.js), for the tab to name - `[]` for none, every answer (AUDIT AUTO-HOLD: a tab hearing none from a service
 * mid-deploy keeps the ones it has, never unbinds them) - or `{ error }`:
 * 'lease' - another tab or device has the character now; 'seq' - not the next one, with the service's `seq` beside it,
 * so a tab whose last checkpoint landed but whose answer was lost can resync; the first save's own words
 * (firstSaveRefusal).
 * @param {any} ctx @param {string} playerId
 * @param {{ id: string, lease: unknown, seq: unknown, summary?: unknown }} at @param {ArrayBuffer} body @param {number} bytes
 */
export async function checkpointRealm({ db, bucket, rand, nowS }, playerId, { id, lease, seq, summary = null, session = null }, body, bytes) {
  if (!bucket) return { error: 'no-storage' };
  if (!REALM_ID_RE.test(id) || typeof lease !== 'string' || !LEASE_RE.test(lease) || !Number.isSafeInteger(seq) || /** @type {number} */ (seq) < 1) return { error: 'body' };
  // SAVE-BATCH: the record's row, the ledger's two reads of the character's own rows and (where this isolate
  // kept none) the budget's config, in ONE batch - each was a round trip of its own, and checkpoints were a third of the
  // primary's statements. One snapshot, read before anything is judged, as the reads were
  const keptConfig = budgetKept(db);
  const [rowRes, mineRes, dupesRes, configRes] = await db.batch([
    // SESSION-SIGN (AUDIT PLAN-1000 E3): and the session the save is asked under, and the account's ban, as they stand;
    // STAFF-PANEL4-CENSUS: and the census's latest tally, so an unchanged one is written nowhere (staffCensus.js censusStep)
    db.prepare(`SELECT seq, lease, obj, prev, summary, dead_at, ${JUDGE_COLUMNS},
    (SELECT played_s FROM players p WHERE p.id = realm_characters.player) AS played_now,
    (SELECT banned_until FROM players p WHERE p.id = realm_characters.player) AS ban_until_now,
    (SELECT ban_reason FROM players p WHERE p.id = realm_characters.player) AS ban_reason_now,
    (SELECT frozen_until FROM players p WHERE p.id = realm_characters.player) AS frozen_until_now,
    (SELECT frozen_reason FROM players p WHERE p.id = realm_characters.player) AS frozen_reason_now,
    (SELECT 1 FROM sessions s WHERE s.id = ?3 AND s.player_id = realm_characters.player) AS session_alive,
    (SELECT tally FROM item_census c WHERE c.char_id = realm_characters.id) AS census_tally
    FROM realm_characters WHERE id = ?1 AND player = ?2`).bind(id, playerId, session),
    ...ledgerReads(db, id),
    ...(keptConfig ? [] : [budgetRead(db)]),
  ]);
  // PRIMARY-TRIPS audit: the config read is kept the moment it lands - kept after the save's opening and the baseline's
  // R2 read, a staff edit's forgetting in between was undone by the older row, kept a minute more
  const config = keptConfig ?? budgetFrom(db, configRes?.results?.[0] ?? null);
  const row = rowRes?.results?.[0] ?? null;
  if (!row) return { error: 'no-realm-character' };
  // SESSION-SIGN (AUDIT PLAN-1000 E3; sessionPass.js): A SAVE IS A WRITE, AND ASKS ITS OWN SESSION AND THE BAN in the read it
  // already makes - a hot route believes a pass for its reads, and a session signed out, or an account banned, since its
  // pass was minted saves nothing (a request the lookup answered knows both already; the save asks them all the same)
  if (session != null && row.session_alive == null) return { error: 'auth' };
  if (Number.isSafeInteger(row.ban_until_now) && row.ban_until_now > nowS) return { error: 'banned', player: { banned_until: row.ban_until_now, ban_reason: row.ban_reason_now } };
  // STAFF-PANEL5-FREEZE (staffFreeze.js; design doc Weak spots: "checkpoints still save"): and the freeze - a frozen player
  // only looks around, so its save moves nothing while the freeze stands
  if (Number.isSafeInteger(row.frozen_until_now) && row.frozen_until_now > nowS) return { error: 'frozen', player: { frozen_until: row.frozen_until_now, frozen_reason: row.frozen_reason_now } };
  if (row.dead_at != null) return { error: 'dead' };   // LEGACY7: the tombstone - nothing of the dead is written again
  if (row.lease !== lease) return { error: 'lease' };
  if (seq !== row.seq + 1) return { error: 'seq', seq: row.seq };   // the service's own: a client whose last answer was lost resyncs
  // REALM-GZIP: opened first, packed or not - INT2: EVERY checkpoint, never the first alone
  const text = await saveTextOf(new Uint8Array(body), REALM_TEXT_MAX_BYTES);
  if (seq === 1) {
    // AUDIT REALM2 S1: a new character's first save is read before a byte lands
    const refused = firstSaveRefusal(text);
    if (refused) return refused;
  }
  let save = null;
  try { save = JSON.parse(/** @type {string} */ (text)); } catch { save = null; }
  const said = realmSummaryOf(summary);
  // INT2: the tile's level is judged as it is CLAIMED - a checkpoint that brings no tile leaves the row's, claimed and judged
  // with an earlier save
  let summaryNow = null;
  try { summaryNow = JSON.parse(said ?? 'null'); } catch { summaryNow = null; }
  const key = mintObjectKey(rand, playerId, id, /** @type {number} */ (seq));
  // INT2-INT5: THE VERDICT, read BEFORE the object lands (AUDIT INT: a read that failed - D1's limit - after the put left
  // the object behind, a retry at a time), and written in the batch that moves the row - a checkpoint that loses its race
  // writes no verdict
  // ...over the baseline the first judgement reads - or, the wealth measure moved since the last (judge.js WEALTH_VERSION),
  // the stored record measured again under the new one
  const baseline = row.wealth == null || row.wealth_v !== WEALTH_VERSION ? await baselineOf(bucket, row) : null;
  const known = { mine: mineRes, dupes: dupesRes, config };
  const v = await verdictOn({ db, nowS }, { player: playerId, char: id, seq: /** @type {number} */ (seq), key }, row, save, summaryNow, baseline, known);
  await bucket.put(key, body);
  /** @type {any} the judge's columns as they stand after the batch - the verdict's, or (its rev moved) the row's */
  let stood = null;
  try {
    const res = await db.batch([
      db.prepare('UPDATE realm_characters SET seq = ?, bytes = ?, obj = ?, prev = obj, lease_at = ?, summary = COALESCE(?, summary), updated_at = ? WHERE id = ? AND player = ? AND lease = ? AND seq = ?')
        .bind(seq, bytes, key, nowS, said, nowS, id, playerId, lease, /** @type {number} */ (seq) - 1),
      mustChange(db),
      ...v.steps,
      // SEA-SEASON (seaSeason.js): a clean checkpoint's season figures - after the verdict's write, so a hold it lays counts
      ...(v.clean ? seaSeasonSteps(db, { player: playerId, char: id }, save, nowS) : []),
    ]);
    if (res?.[2]?.meta?.changes === 1) stood = v.set;
  } catch {
    // AUDIT REALM2 S3: a batch that threw may have landed - the object stays when the row names it
    if (!(await dropIfUnnamed(db, bucket, playerId, id, key))) {
      // AUDIT REALM2 S7: WHY IT DID NOT MOVE, read again - two checkpoints under one lease (a retry beside a slow one, the
      // page's beside the timer's) race to one sequence, and the loser was told 'lease': "another tab has the character",
      // and its tab ended the session. Its own write won; 'seq', with the service's, is the truth, and the tab resyncs.
      return (await recordMovedOf(db, playerId, { id, lease, seq: /** @type {number} */ (seq) - 1 })) ?? { error: 'lease' };
    }
  }
  // a verdict not written (staff acted between the read and the write, or the answer was lost): the row says what stands
  stood ??= await db.prepare('SELECT held, clean_obj FROM realm_characters WHERE id = ?').bind(id).first() ?? { held: row.held, clean_obj: row.clean_obj };
  // two back now: the one before the last stays - and INT6's clean one, kept for staff, whichever it is
  const keep = new Set([key, row.obj, stood.clean_obj].filter(Boolean));
  await dropObjects(bucket, [...new Set([row.prev, row.clean_obj])].filter((k) => k && !keep.has(k)));
  return { ok: true, seq, tradeHeld: stood.held ?? null, ...(stood === v.set && v.why ? { tradeHeldWhy: v.why } : {}), locked: v.locked };
}

/**
 * THE FIRST JUDGEMENT'S BASELINE (verdict.js): what the realm already held for the character - its stored record, read
 * once (INT2's cutover: a character the realm kept before the judge read a save) - or, for a record's first save, a
 * newborn's purse (REALM_BIRTH_WEALTH_MAX). `{ wealth, level }`; a stored record that
 * cannot be read is no baseline (`wealth` null - the save is its own).
 * @param {any} bucket @param {any} row
 */
async function baselineOf(bucket, row) {
  if (row.obj) {
    let stored = null;
    try { stored = JSON.parse(/** @type {string} */ (await realmSaveTextOf(await bucket.get(row.obj)))); } catch { stored = null; }
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return { wealth: null, level: null };
    const level = Number.isInteger(stored.level) && stored.level >= 1 ? stored.level : null;
    return { wealth: wealthOf(stored), level };
  }
  return { wealth: REALM_BIRTH_WEALTH_MAX, level: REALM_BIRTH_LEVEL };
}

/** THE SAVE, as it stands - for a join's load, and for "Copy to offline", which needs no lease: a copy played offline
 *  is an offline character and never comes back. Answers `{ ok, object, seq }` or `{ error }`. */
export async function getRealmBlob({ db, bucket }, /** @type {string} */ playerId, /** @type {string} */ id) {
  if (!bucket) return { error: 'no-storage' };
  if (!REALM_ID_RE.test(id)) return { error: 'body' };
  const row = await db.prepare('SELECT seq, bytes, obj FROM realm_characters WHERE id = ? AND player = ?').bind(id, playerId).first();
  if (!row) return { error: 'no-realm-character' };
  if (!row.seq || !row.bytes || !row.obj) return { error: 'no-data' };
  const object = await bucket.get(row.obj);
  return object ? { ok: true, object, seq: row.seq } : { error: 'no-data' };
}

// ── REALM P2.2: A REALM CHARACTER'S GOLD MOVES ON ITS RECORD ─────────

/** THE GUARD a batch step answers to (`realm_tx_guard`): placed right after an UPDATE that must change
 *  exactly `n` rows, it inserts only when that UPDATE changed another number, and the table's CHECK refuses the row - so
 *  D1 rolls the whole batch back. An UPDATE that matches nothing is not an error by itself; this makes it one. */
export const mustChange = (/** @type {any} */ db, n = 1) => db.prepare('INSERT INTO realm_tx_guard (moved, expected) SELECT changes(), ? WHERE changes() != ?').bind(n, n);

/** Where a tab says its record stands - `{ id, lease, seq }` - or null. */
export function realmAtOf(/** @type {any} */ v) {
  if (!v || typeof v !== 'object') return null;
  const { id, lease, seq } = v;
  if (typeof id !== 'string' || !REALM_ID_RE.test(id) || typeof lease !== 'string' || !LEASE_RE.test(lease) || !Number.isSafeInteger(seq) || seq < 1) return null;
  return { id, lease, seq };
}

/**
 * A REALM CHARACTER'S RECORD, CHANGED WITH AN ACT - the service's half of every act online that costs or pays a realm
 * character gold: a guild's treasury, a founding, a home, a piece of decor. `at` is the record as its tab last
 * checkpointed it (the tab checkpoints just before, and holds its checkpoints until the answer, so the save read here
 * is the one it plays); `change(save)` changes it in place (net/realm/realmGoldLaw.js payFromSave, creditSave) and answers
 * null, or a refusal's word. The record is written ONE SEQUENCE ON as a new object - but the row is not moved here: the
 * answer's `steps` go into the caller's OWN batch beside the act they pay for (the row's move and its guard), so the
 * gold and the act land together or neither does. After the batch the caller drops `prev` (it landed) or `key` (it did
 * not). Answers `{ steps, key, prev, seq }` or `{ error }`: 'lease' or 'seq' (the record is not where the tab says - a
 * checkpoint's own words, `seq` with the service's), `change`'s own word, 'no-data'.
 *
 * INT3: AN ACT THAT HANDS VALUE TO ANOTHER PLAYER says so (`outbound`) - a listing, a purchase, a vault's deposit, a
 * treasury's, a rent, a stake, a disenchant - and is refused while the judge holds the character (holdRefusal: 'trade-held',
 * 'record-unjudged'); and (INT4) a change that takes out a piece whose id the ledger has marked a duplicate is refused
 * 'piece-dupe', whatever the act: no route moves that piece again. INT5: the wealth the change moves is WITNESSED - the
 * row's `witnessed` takes it in the same step, so the budget never charges a gain the service itself made. INT6: the
 * last checkpoint judged clean is never `prev` to drop.
 * STAFF-PANEL3-REALM: `take` - staff take pieces out (staffRealm.js, the design's "Remove from a player"): a piece leaves
 * whatever the ledger says of it, a copy above all, so INT4's refusals are not asked (design doc weak spots: "The repair
 * path refuses to touch copied pieces").
 * LOST-SPOILS: `witness` false - a piece the CLIENT rolled, carried into the record by the service (a boss's floor's
 * leftover, claimed from the Lost and Found - post.js claimPost): the budget charges it as it charges that piece taken
 * off the floor, so the service's hand is no road past the budget for what the client said.
 * @param {any} ctx @param {string} playerId @param {{ id: string, lease: string, seq: number }} at
 * @param {(save: any) => string | null} change @param {{ outbound?: boolean, escrow?: boolean | Set<string>, seize?: boolean, take?: boolean, witness?: boolean }} [opts]
 *   `escrow`: the pieces leaving in the service's hands (ledger.js ledgerMoves - true all, a Set those keys)
 */
export async function prepareRealmRecord({ db, bucket, rand, nowS }, playerId, at, change, { outbound = false, escrow = false, seize = false, take = false, witness = true } = {}) {
  if (!bucket) return { error: 'no-storage' };
  const row = await db.prepare('SELECT seq, lease, obj, prev, held, judged_seq, clean_obj FROM realm_characters WHERE id = ? AND player = ?').bind(at.id, playerId).first();
  if (!row) return { error: 'no-realm-character' };
  if (!seize && row.lease !== at.lease) return { error: 'lease' };   // INT9: a seizure names no tab's lease (seizeRealmRecord)
  if (row.seq !== at.seq || !row.obj) return { error: 'seq', seq: row.seq };
  if (outbound) {
    const held = holdRefusal(row);
    if (held) return held;
  }
  const object = await bucket.get(row.obj);
  let save = null;
  try { save = JSON.parse(await realmSaveTextOf(object)); } catch { save = null; }   // REALM-GZIP: packed or plain
  if (!save || typeof save !== 'object' || Array.isArray(save)) return { error: 'no-data' };
  const before = wealthOf(save);
  const piecesBefore = ledgerPieces(save);
  const classicBefore = outbound ? classicCount(save) : 0;
  const refused = change(save);
  if (refused) return { error: refused };
  // a classic save's piece the realm keeps its character's (itemLaw.js classicPiece - "Keep all, can't sell")
  if (outbound && classicCount(save) < classicBefore) return { error: 'piece-legacy' };
  // INT4: a piece leaves a record only as its own - held by it, unclaimed, no copy (ledger.js piecesRefusal). A Set, never
  // a list walked once a piece (AUDIT INT: a thousand pieces' record walked a million times - seconds of CPU)
  const piecesAfter = ledgerPieces(save);
  // AUDIT AUTO-HOLD: a key whose count fell is leaving - one of two the record held is a copy, never handed on
  const { leaving, twice } = leavingKeys(piecesBefore, piecesAfter);
  const why = take ? null : twice.length ? 'piece-dupe' : leaving.length ? await piecesRefusal(db, at.id, leaving) : null;
  if (why) return { error: why };
  const text = JSON.stringify(save);
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > REALM_TEXT_MAX_BYTES) return { error: 'no-data' };   // REALM-GZIP: written plain, within the text's bound
  const key = mintObjectKey(rand, playerId, at.id, at.seq + 1);
  await bucket.put(key, text);
  // INT6: a record the judge last found clean, moved by the service, is clean still - the clean one follows it, so a
  // rollback never hands back what the service moved since (AUDIT INT: a piece listed after the clean checkpoint came
  // back in the pack, and stood listed too); `svc_seq` says a service move came after one that did not follow
  const clean = row.clean_obj != null && row.clean_obj === row.obj;
  const moves = ledgerMoves(db, { player: playerId, char: at.id, seq: at.seq + 1, nowS }, piecesBefore, piecesAfter, { escrow });
  // INT9: a seizure clears the lease (whatever tab held the character plays a record that moved under it) and is guarded on
  // the sequence it read alone
  const steps = [
    db.prepare(`UPDATE realm_characters SET seq = ?1, bytes = ?2, obj = ?3, prev = obj, updated_at = ?4, witnessed = witnessed + ?5, svc_seq = ?1${clean ? ', clean_obj = ?3, clean_seq = ?1' : ''}${seize ? ', lease = NULL' : ''}
      WHERE id = ?6 AND player = ?7 AND ${seize ? '?8 = ?8 AND dead_at IS NULL' : 'lease = ?8'} AND seq = ?9`)
      .bind(at.seq + 1, bytes, key, nowS, witness ? wealthOf(save) - before : 0, at.id, playerId, at.lease, at.seq),
    mustChange(db),
    ...moves.left,
    ...moves.entered,
  ];
  return { steps, key, prev: row.prev === row.clean_obj ? null : row.prev, seq: at.seq + 1 };
}

/**
 * INT9: A REALM CHARACTER'S RECORD SEIZED - changed by the service on another player's word the relay signed (a death in
 * the zone, its killer carrying the fall's receipt after the fallen's own tab let its grace go by (wildReceipt.js wildFallGraceS):
 * server-account/src/wild.js), so with no tab's `at`: the record read where it stands, `change(save)` applied, written one
 * sequence on, and THE LEASE CLEARED - whatever tab held the character plays a record that moved under it, and its next
 * join reads the new one (the staff rollback's way, review.js). Answers prepareRealmRecord's `{ steps, key, prev, seq }`,
 * guarded on the sequence it read, or `{ error }`.
 * @param {any} ctx @param {string} playerId @param {string} charId
 * @param {(save: any) => string | null} change @param {{ escrow?: boolean | Set<string>, take?: boolean }} [opts] `take` prepareRealmRecord's
 */
export async function seizeRealmRecord(ctx, playerId, charId, change, { escrow = true, take = false } = {}) {
  const row = await ctx.db.prepare('SELECT seq, lease FROM realm_characters WHERE id = ? AND player = ? AND dead_at IS NULL').bind(charId, playerId).first();
  if (!row) return { error: 'no-realm-character' };
  return prepareRealmRecord(ctx, playerId, { id: charId, lease: row.lease ?? '', seq: row.seq }, change, { escrow, seize: true, take });
}

/** AUDIT REALM2 S3: AFTER A BATCH THAT THREW, the object it wrote goes only if the row names it nowhere (`obj` or
 *  `prev`). D1 can commit a batch and lose its answer: every catch dropped the new object whatever the row said, and the
 *  row that had moved to it named a save that was gone - a trade's two records, a guild deposit's, the character's live
 *  save deleted and its next join 'no-data'. Answers whether the row names it (the batch landed). */
export async function dropIfUnnamed(/** @type {any} */ db, /** @type {any} */ bucket, /** @type {string} */ playerId, /** @type {string} */ id, /** @type {string} */ key) {
  const row = await db.prepare('SELECT obj, prev, clean_obj FROM realm_characters WHERE id = ? AND player = ?').bind(id, playerId).first();
  if (row && (row.obj === key || row.prev === key || row.clean_obj === key)) return true;   // INT6: the clean one kept, too
  await dropObjects(bucket, [key]);
  return false;
}

/** After a batch that carried a record's move failed: the record's own reason - 'lease' (another tab holds it) or
 *  'seq' with the service's sequence (it moved) - or null when it still stands where the tab said, and the act's own
 *  write was what failed. */
export async function recordMovedOf(/** @type {any} */ db, /** @type {string} */ playerId, /** @type {{ id: string, lease: string, seq: number }} */ at) {
  const row = await db.prepare('SELECT seq, lease FROM realm_characters WHERE id = ? AND player = ?').bind(at.id, playerId).first();
  if (!row) return { error: 'no-realm-character' };
  if (row.lease !== at.lease) return { error: 'lease' };
  return row.seq !== at.seq ? { error: 'seq', seq: row.seq } : null;
}

/**
 * THE REALM SIDE OF AN ACT, asked before the act: a realm character (its id the service's own shape - REALM_ID_RE,
 * minted only here) must say where its record stands (`realm`, `{ id, lease, seq }`, the same character), and any other
 * character may not. Answers `{ at }` for a realm character, `{ at: null }` for another, or `{ error }`.
 * @param {unknown} character @param {unknown} realm
 */
export function realmSideOf(character, realm) {
  const mine = typeof character === 'string' && REALM_ID_RE.test(character);
  if (!mine) return realm == null ? { at: null } : { error: 'body' };
  const at = realmAtOf(realm);
  if (!at || at.id !== character) return { error: 'realm-needed' };
  return { at };
}

/**
 * AUDIT REALM L1-F2: THE RECORD, ASKED FIRST. An act that moves a realm character's gold answers where its record
 * stands BEFORE any other word - a rank, a rate, a guild already joined, a house already held - because the client reads
 * a lost answer by it: an act sent again finds its record one on (`seq`, the service's own), and that is the act,
 * landed (systems/realmSaves.js realmGoldAct). Asked after them, a founding that landed was told 'guild-already' on its
 * retry, a deposit 'rate', a claim 'home-rate' - each read as "nothing moved" - and the tab gave itself the gold back
 * and checkpointed it over the record that had paid. Answers realmSideOf's `{ at }` (null for a character that is not
 * the realm's), or `{ error }` - 'lease', or 'seq' with the service's sequence.
 * @param {any} db @param {string} playerId @param {unknown} character @param {unknown} realm
 */
export async function realmActFirst(db, playerId, character, realm) {
  const side = realmSideOf(character, realm);
  if (side.error || !side.at) return side;
  return (await recordMovedOf(db, playerId, side.at)) ?? side;
}

/** A LEAVE: the lease given up, if it is still this tab's. Answers `{ ok, released }`. */
export async function leaveRealm({ db }, /** @type {string} */ playerId, /** @type {{ id: unknown, lease: unknown }} */ { id, lease }) {
  if (typeof id !== 'string' || !REALM_ID_RE.test(id) || typeof lease !== 'string' || !LEASE_RE.test(lease)) return { error: 'body' };
  const r = await db.prepare('UPDATE realm_characters SET lease = NULL WHERE id = ? AND player = ? AND lease = ?').bind(id, playerId, lease).run();
  return { ok: true, released: r.meta.changes > 0 };
}

/** THE PLAYER'S OWN DELETE: its objects - the two the row names, and anything else under its prefix a lost write left
 *  - then the row: saves.js's order, so a failure halfway leaves a row whose bytes lie rather than objects nothing
 *  names. AUDIT REALM L1-F7 / L3-F5: AND ITS ONLINE LIFE WITH IT, as the door promises ("its home and its guild place
 *  with it"): the row's delete carries its homes (their pieces and hidden furniture go by the tables' own cascade), its
 *  guild place and its Renown track in ONE batch. ACCOUNT-HOMES: the homes are the ones it BOUGHT -
 *  every character of the account owns them while it stands, and they go with it, whatever another of them placed in
 *  them; goods another stocked at their traders wait ('home-vendor-stocked'). They stood under a dead id: a house nobody could buy again nor its
 *  owner sell, a guild whose master could never be succeeded, a track that counted against the account's sixty
 *  (RENOWN-CHAR: the character's Renown goes with it again, as the door said before RENOWN-ACCOUNT).
 *  A guildmaster with members hands the guild over first ('guild-master-leaves', the guild's own word for leaving).
 *  AUDIT REALM2 S8: AND A LONE ONE EMPTIES THE TREASURY FIRST ('guild-treasury'), as leaving asks (guilds.js leaveGuild).
 *  The delete let it go with gold inside: a guild nobody is in, holding what its records paid in, until the next founder
 *  of its name or tag cleared it away, gold and all.
 *  AUDIT LEGACY III O7: A TOMBSTONE IS NEVER DELETED ('dead') - it is the realm's only word on a Bloodline's death, and
 *  its row the person's claim (realm_characters_person): deleted, the death was gone and the person could be born again
 *  once the line's record forgot it. It holds no roster slot and is never listed, so no door offers its delete.
 *  PROF-DELETE: AND ITS PROFESSIONS WITH IT - its Stores and
 *  its professions' tracks go in the same batch, as its Renown does; they stood under a dead id where nothing could
 *  reach them (MERGE 2's open question 3). What another player is part of waits: while the character has market
 *  business open ('realm-market-open', REALM_MARKET_OPEN_SQL) the delete is refused, since the goods or the piece it
 *  would be handed come to this character. The history (the ledger, the crafts, the sales) stays. */
export async function deleteRealm({ db, bucket, nowS = Math.floor(Date.now() / 1000) }, /** @type {string} */ playerId, /** @type {unknown} */ id) {
  if (typeof id !== 'string' || !REALM_ID_RE.test(id)) return { error: 'body' };
  const row = await db.prepare('SELECT obj, prev, dead_at, held FROM realm_characters WHERE id = ? AND player = ?').bind(id, playerId).first();
  if (!row) return { error: 'no-realm-character' };
  if (row.dead_at != null) return { error: 'dead' };   // AUDIT LEGACY III O7
  // AUDIT CRAFT-HOLD (the exploit audit): A HELD CHARACTER WITH CRAFTS IS NOT DELETED - its row is where its hold lives,
  // and the hold on the pieces it made (craftHoldOf) went with it: held, deleted, and its pieces listed under any other
  // name the next minute. Its Stores go with the row (below), so a held character with no piece of its make at the
  // account goes as any other - a finding can be the law's mistake, and the slot is the player's. The hold lifts (the
  // law's at a clean checkpoint, a timed one at the first past its end - AUTO-HOLD; staff's by review.js realm-clear);
  // then it goes.
  if (row.held && await db.prepare('SELECT 1 FROM products WHERE owner = ?1 AND char_id = ?2 LIMIT 1')
    .bind(playerId, id).first()) return { error: 'trade-held', held: row.held };
  const master = await db.prepare(`SELECT (SELECT COUNT(*) FROM guild_members o WHERE o.guild_id = m.guild_id) AS n,
    (SELECT treasury FROM guilds g WHERE g.id = m.guild_id) AS treasury,
    (SELECT 1 FROM homes h WHERE h.guild_id = m.guild_id) AS hall,
    (SELECT 1 FROM guild_vault v WHERE v.guild_id = m.guild_id LIMIT 1) AS vault FROM guild_members m
    WHERE m.player = ? AND m.char_id = ? AND m.rank = ?`).bind(playerId, id, GUILD_RANK_MASTER).first();
  if ((master?.n ?? 0) > 1) return { error: 'guild-master-leaves' };
  if ((master?.treasury ?? 0) > 0) return { error: 'guild-treasury' };
  // AUDIT GUILD1d S1: and a lone one sells its guild's hall first - deleted, the guild stood memberless with the hall,
  // which kept it from ever being reclaimed (guildKeepsSql): the building, the name and the deed share gone for good
  if (master?.hall) return { error: 'guild-hall' };
  // AUDIT GUILD2 G2: and empties its guild's vault - deleted, the guild stood memberless with pieces nobody could take
  // out, kept from going by them (guildKeepsSql), its name and tag held for good (guilds.js disband and leave ask it too)
  if (master?.vault) return { error: 'guild-vault' };
  if (Number((await db.prepare(REALM_MARKET_OPEN_SQL).bind(playerId, id).first())?.n ?? 0) > 0) return { error: 'realm-market-open' };
  // ACCOUNT-HOMES: the homes it bought go with it ("Deleted characters should remove their houses from
  // online"), and any character of the account may stock a trader in one now - so goods another of them has standing at
  // one wait, as a sale waits for them (homes.js releaseHome): the delete would leave them for sale at a trader gone
  if (Number((await db.prepare(HOME_VENDOR_STOCK_SQL).bind(playerId, id).first())?.n ?? 0) > 0) return { error: 'home-vendor-stocked' };
  // AUDIT SEA VENTURES B4: gold owed it at sea, a wreck's goods held for it, and its own hold's goods due back come home
  // to it first (seaBounty.js, seaWreck.js) - deleted, they stood owed to no character for good
  if (await db.prepare(`SELECT 1 FROM sea_bounty_owed WHERE killer = ?1 AND killer_char = ?2 AND paid_at IS NULL
    UNION ALL SELECT 1 FROM sea_prizes WHERE killer = ?1 AND killer_char = ?2 AND state = 'held' AND until_s > ?3
    UNION ALL SELECT 1 FROM sea_prizes WHERE victim = ?1 AND victim_char = ?2 AND state = 'held' AND until_s <= ?3 LIMIT 1`).bind(playerId, id, nowS).first()) return { error: 'sea-held' };
  // HOME-RENT: a room another player is renting in its home waits for its days to run out, and rent held for it waits to
  // be collected - the delete takes the home with it. AUDIT: then no room of it is offered any more, and both are asked
  // again - a rent landing between the first asking and the delete's batch was deleted with the home (a rent needs its
  // room offered, so none can land after the offers go)
  const homeHeld = async () => {
    if (Number((await db.prepare(HOME_TENANTS_SQL).bind(playerId, id, nowS).first())?.n ?? 0) > 0) return { error: 'home-tenants' };
    if (Number((await db.prepare(HOME_RENT_DUE_SQL).bind(playerId, id).first())?.due ?? 0) > 0) return { error: 'home-rent-due' };
    return null;
  };
  const held = await homeHeld();
  if (held) return held;
  await db.prepare(`UPDATE home_rooms SET listed = 0 WHERE EXISTS (SELECT 1 FROM homes h WHERE h.map_id = home_rooms.map_id
    AND h.building_key = home_rooms.building_key AND h.player = ? AND h.char_id = ?)`).bind(playerId, id).run();
  const late = await homeHeld();
  if (late) return late;
  await dropCharacterObjects(bucket, playerId, id, [row.obj, row.prev]);
  // QUEST-HOME: the homes the delete takes, a house again to every page online - read
  // with the delete in one batch, so the answer names exactly what went
  const [gone] = await db.batch([
    db.prepare('SELECT map_id, building_key FROM homes WHERE player = ? AND char_id = ? ORDER BY map_id, building_key').bind(playerId, id),
    db.prepare('DELETE FROM homes WHERE player = ? AND char_id = ?').bind(playerId, id),
    db.prepare('DELETE FROM guild_members WHERE player = ? AND char_id = ?').bind(playerId, id),
    db.prepare('DELETE FROM renown_tracks WHERE player = ? AND char_id = ?').bind(playerId, id),
    db.prepare('DELETE FROM prof_stores WHERE player = ? AND char_id = ?').bind(playerId, id),   // PROF-DELETE
    db.prepare('DELETE FROM prof_tracks WHERE player = ? AND char_id = ?').bind(playerId, id),   // PROF-DELETE
    db.prepare('DELETE FROM firmament WHERE player = ? AND char_id = ?').bind(playerId, id),   // AUDIT UICALM-FIRM1 L2 L2: its sky with it (firmament_sets stay - the ids' memory, so a replay is answered, never made again)
    db.prepare('DELETE FROM prof_unbruised WHERE player = ? AND char_id = ?').bind(playerId, id),   // AUDIT PROF-541 B5: the unbruised count goes with the Stores it counts
    db.prepare('DELETE FROM prof_carried WHERE player = ? AND char_id = ?').bind(playerId, id),   // BAG1: and what it was counted as carrying
    db.prepare('DELETE FROM prof_silver_cloth WHERE player = ? AND char_id = ?').bind(playerId, id),   // WOVEN-PAYS: and its cloth's silver counts
    db.prepare('DELETE FROM npc_roll WHERE player = ? AND char_id = ?').bind(playerId, id),   // CHAP1: its standing with the guilds (npcRoll.js)
    db.prepare('DELETE FROM npc_roll_heads WHERE player = ? AND char_id = ?').bind(playerId, id),
    db.prepare('DELETE FROM npc_rep_events WHERE player = ? AND char_id = ?').bind(playerId, id),
    db.prepare('DELETE FROM npc_receipt_credits WHERE player = ? AND char_id = ?').bind(playerId, id),   // CHAP2b: and what its receipts gave
    db.prepare('DELETE FROM npc_chapter_seats WHERE account = ? AND char_id = ?').bind(playerId, id),   // CHAP4a: and its seats (the Chronicle keeps their story)
    db.prepare('DELETE FROM realm_characters WHERE id = ? AND player = ?').bind(id, playerId),
    ...releaseSteps(db, id, nowS, { deleted: true }),   // INT4: its pieces no record's, its claims and copies gone with it
    endUnionsOf(db, id, nowS, 'gone'),   // LEGACY7 part three: a union ends with the character
    db.prepare('DELETE FROM realm_wed_halves WHERE char_id = ?').bind(id),
  ]);
  /** @type {Map<number, number[]>} */
  const towns = new Map();
  for (const h of gone?.results ?? []) towns.set(h.map_id, [...(towns.get(h.map_id) ?? []), h.building_key]);
  return { ok: true, ...(towns.size ? { moved: [...towns].flatMap(([mapId, keys]) => homeMoved(mapId, [], keys)) } : {}) };
}

/** HOME-RENT: THE TENANCIES STILL RUNNING in a character's homes - a sale (homes.js) or the character's
 *  delete waits for them: another player paid for those days. `?1` the account, `?2` the character, `?3` now; `n`. */
export const HOME_TENANTS_SQL = `SELECT COUNT(*) AS n FROM home_rooms r JOIN homes h ON h.map_id = r.map_id AND h.building_key = r.building_key
  WHERE h.player = ?1 AND h.char_id = ?2 AND r.tenant IS NOT NULL AND r.until > ?3`;
/** HOME-RENT: the rent held on a character's homes, not yet collected (`due`) - its delete waits for it too. */
export const HOME_RENT_DUE_SQL = 'SELECT COALESCE(SUM(rent_due), 0) AS due FROM homes WHERE player = ?1 AND char_id = ?2';
/** ACCOUNT-HOMES: the goods standing for sale at the traders of the homes a character bought, whoever of the account
 *  stocked them (`n`) - its delete takes those homes and their traders, so it waits for them. `?1` the account, `?2` the
 *  character. */
export const HOME_VENDOR_STOCK_SQL = `SELECT COUNT(*) AS n FROM market_listings l JOIN home_decor d ON d.map_id = l.vendor_map AND d.id = l.vendor_id
  JOIN homes h ON h.map_id = d.map_id AND h.building_key = d.building_key WHERE l.state = 'open' AND h.player = ?1 AND h.char_id = ?2 AND h.guild_id IS NULL`;

/** PROF-DELETE: A CHARACTER'S MARKET BUSINESS STILL OPEN (`?1` the account, `?2` the character) - each a thing another
 *  player is part of whose goods, piece or Marks' worth would come to this character: a listing or an auction still
 *  standing, or closed with its goods not yet back (market.js settle hands them back on the next read); a leading bid; a
 *  buy order or a commission still open; a courier's load of materials still on the road to its Stores; a piece to
 *  collect; gold its sales hold for it (GOLD-MARKET: collected into its own record alone). Escrowed Marks come back to
 *  the ACCOUNT, never the character, so an outbid bid or a closed order holds nothing up. `n`, the count. */
export const REALM_MARKET_OPEN_SQL = `SELECT
  (SELECT COUNT(*) FROM market_listings WHERE seller = ?1 AND char_id = ?2
    AND (state = 'open' OR (state IN ('expired', 'removed') AND returned = 0)))
  + (SELECT COUNT(*) FROM market_auctions WHERE seller = ?1 AND char_id = ?2
    AND (state = 'open' OR (state IN ('unsold', 'removed') AND returned = 0)))
  + (SELECT COUNT(*) FROM market_bids WHERE bidder = ?1 AND char_id = ?2 AND state = 'high')
  + (SELECT COUNT(*) FROM market_orders WHERE poster = ?1 AND char_id = ?2 AND state = 'open')
  + (SELECT COUNT(*) FROM commissions WHERE poster = ?1 AND poster_char = ?2 AND state = 'open')
  + (SELECT COUNT(*) FROM market_sales WHERE buyer = ?1 AND char_id = ?2 AND kind = 'material' AND delivered = 0)
  + (SELECT COUNT(*) FROM market_deliveries WHERE player = ?1 AND char_id = ?2 AND collected = 0)
  + (SELECT COUNT(*) FROM market_gold WHERE player = ?1 AND char_id = ?2 AND gold > 0) AS n`;

/** A character's objects: the ones its row names, and anything else under its prefix a lost write left. Best effort -
 *  an object that will not go is not a reason to keep the row. */
async function dropCharacterObjects(/** @type {any} */ bucket, /** @type {string} */ playerId, /** @type {string} */ id, /** @type {(string | null | undefined)[]} */ named) {
  if (!bucket) return;
  await dropObjects(bucket, named);
  if (typeof bucket.list !== 'function') return;
  try {
    const listed = await bucket.list({ prefix: `${realmPrefix(playerId)}${id}/` });
    await dropObjects(bucket, (listed?.objects ?? []).map((/** @type {any} */ o) => o.key));
  } catch { /* the walk is the sweep's, not the delete's */ }
}
