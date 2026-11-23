// @ts-check
// ═══════════════════════════════════════════════════════════════════
// SERVER-POST - THE SERVICE'S SIDE OF THE SERVER'S POST.
//
//
// What a piece is - its bounds and its sender - is src/net/postLaw.js.
// This file is the four things its reader does with their own: list the
// box, open one, CLAIM its item, and throw one away. Nothing here writes
// a piece: the operator does, and no route a player can reach sends one of
// a player's choosing.
//
// ═══ A READER'S POST IS THEIRS ALONE ═══════════════════════════════
//
// Every read, claim and delete names the piece AND its reader in the one
// statement (`WHERE id = ? AND to_id = ?`) - the letters' law (letters.js):
// an id that is somebody else's is exactly as absent as one that never
// existed, `no-post` for both.
//
// ═══ THE CLAIM IS THE GUILD VAULT'S TAKE ═══════════════════════════
//
// An online character's truth is the service's (0018_realm_characters):
// the item goes into the RECORD, written one sequence on by the service
// (realm.js prepareRealmRecord), and the piece's claim is stamped in the
// SAME batch, guarded - so the item lands in the record and the piece
// reads claimed together, or neither. A second claim (another tab, a lost
// answer asked again) finds `claimed_at` set and changes nothing. The
// client puts the answer's record in its pack (net/serverPost.js, as the
// vault's take does); a lost answer ends the session, and a join reads the
// record, which holds it.
// ═══════════════════════════════════════════════════════════════════
import { realmActFirst, prepareRealmRecord, mustChange, dropObjects, dropIfUnnamed, recordMovedOf, REALM_ID_RE } from './realm.js';
import { giveTradeGoods } from '../../src/net/realm/realmTradeLaw.js';
import { POST_ID_RE, POST_BOX_MAX, postItemHead, postMaterialsOf, postHoldsGoods } from '../../src/net/postLaw.js';
import { STORES_MAX } from '../../src/net/professionLaw.js';
import { creditSave } from '../../src/net/realm/realmGoldLaw.js';
import { isLostBatch } from '../../src/net/lostLaw.js';
import { lawTemplate } from '../../src/systems/item/itemLaw.js';   // a gift of a template the game no longer knows is no item   // LOST-SPOILS: the Lost and Found's pieces, charged to the budget
import { isReportReader, reportCountsOf } from './reports.js';   // PRIVATE-REPORT: a reader's box counts the reports waiting

/** The record a row holds, or null. AUDIT SERVER-POST: ONE ANSWER to "does this piece hold an item" for the box, the
 *  claim and the throw - a record the box can name (postItemHead) - so no row can be listed as words alone and refused as
 *  holding a gift, or claimed where the box shows nothing to claim. A row the operator wrote is such a record; any other
 *  is no item - and so is a record of a template the game no longer knows (the Hourlock, template 560, sent
 *  before the guns were removed): it is never written into a character, and the piece can be thrown away. */
export const recordOf = (/** @type {any} */ row) => {
  if (typeof row?.item !== 'string') return null;
  let r = null;
  try { r = JSON.parse(row.item); } catch { return null; }
  return r && typeof r === 'object' && !Array.isArray(r) && postItemHead(r) && lawTemplate(r.templateIndex) ? r : null;
};

/** The gold a row carries; a value that is not a whole amount carries none. */
const goldOf = (/** @type {any} */ row) => (Number.isSafeInteger(Number(row?.gold)) && Number(row.gold) > 0 ? Number(row.gold) : 0);

/** The Stores materials a row carries; a list that does not read as one carries none, so it is never claimed. */
const materialsOf = (/** @type {any} */ row) => {
  if (typeof row?.materials !== 'string') return [];
  try {
    return postMaterialsOf(JSON.parse(row.materials)) ?? [];
  } catch {
    return [];
  }
};

/** A row's head as the box lists it. */
const headOf = (/** @type {any} */ row) => {
  const item = postItemHead(recordOf(row));
  const gold = goldOf(row);
  const materials = materialsOf(row);
  return {
    id: row.id, from: row.sender, subject: row.subject, sentAt: row.sent_at, read: row.read_at != null,
    item, gold, materials, claimed: postHoldsGoods({ item, gold, materials }) ? row.claimed_at != null : false,
  };
};

/** Whether a row holds anything a claim gives: an item record, gold or materials. */
const rowHoldsGoods = (/** @type {any} */ row) => postHoldsGoods({ item: recordOf(row), gold: goldOf(row), materials: materialsOf(row) });

/**
 * The units of each material a claim adds, one total per material and origin.
 * @param {import('../../src/net/postLaw.js').PostMaterial[]} materials
 */
function materialTotals(materials) {
  /** @type {Map<string, import('../../src/net/postLaw.js').PostMaterial>} */
  const totals = new Map();
  for (const entry of materials) {
    const key = `${entry.material} ${entry.origin}`;
    const held = totals.get(key);
    if (held) held.qty += entry.qty;
    else totals.set(key, { ...entry });
  }
  return [...totals.values()];
}

/**
 * Whether a character's Stores have room for the materials: the Stores hold at most STORES_MAX of one material, all
 * origins together.
 * @param {any} db @param {string} player @param {string} character
 * @param {import('../../src/net/postLaw.js').PostMaterial[]} materials
 */
async function storesHaveRoom(db, player, character, materials) {
  /** @type {Map<string, number>} */
  const incoming = new Map();
  for (const entry of materials) incoming.set(entry.material, (incoming.get(entry.material) ?? 0) + entry.qty);
  for (const [material, qty] of incoming) {
    const held = await db.prepare('SELECT COALESCE(SUM(qty), 0) AS n FROM prof_stores WHERE player = ? AND char_id = ? AND material = ?')
      .bind(player, character, material).first();
    if (Number(held?.n ?? 0) + qty > STORES_MAX) return false;
  }
  return true;
}

/**
 * The batch steps that put a claim's materials in the character's Stores. The last step refuses the batch when a
 * material went past STORES_MAX meanwhile (another act filled the Stores after the room was read).
 * @param {any} db @param {string} player @param {string} character
 * @param {import('../../src/net/postLaw.js').PostMaterial[]} materials
 */
function storesSteps(db, player, character, materials) {
  if (materials.length === 0) return [];
  const list = JSON.stringify(materialTotals(materials));
  return [
    db.prepare(`INSERT INTO prof_stores (player, char_id, material, origin, qty)
      SELECT ?1, ?2, json_extract(value, '$.material'), json_extract(value, '$.origin'), json_extract(value, '$.qty') FROM json_each(?3) WHERE true
      ON CONFLICT (player, char_id, material, origin) DO UPDATE SET qty = prof_stores.qty + excluded.qty`).bind(player, character, list),
    db.prepare(`INSERT INTO realm_tx_guard (moved, expected) SELECT 0, 1 WHERE EXISTS (
      SELECT 1 FROM prof_stores WHERE player = ?1 AND char_id = ?2 AND material IN (SELECT json_extract(value, '$.material') FROM json_each(?3))
      GROUP BY material HAVING SUM(qty) > ?4)`).bind(player, character, list, STORES_MAX),
  ];
}

/**
 * A READER'S BOX, what waits first (a gift unclaimed, then the unread), then newest first: every piece's head (from whom, about what, when, whether opened, what it holds and
 * whether that was taken), the count unopened and the count holding an item not yet taken - never a body (`readPost`).
 * PRIVATE-REPORT: and, for a reader of the private reports (reports.js isReportReader) and them alone, `reports` - the
 * open reports and those nobody has opened - so the box the heartbeat already looks at says when one comes.
 * @param {{ db: any }} ctx @param {any} reader the session's player row @param {any} [env] the service's config
 */
export async function postBoxOf({ db }, reader, env = null) {
  // AUDIT SERVER-POST: WHAT WAITS FIRST - a gift not yet claimed, then the unread, then the rest newest first: the box
  // lists POST_BOX_MAX, and a gift behind fifty newer pieces had been neither shown nor counted
  const { results = [] } = await db.prepare(`SELECT id, sender, subject, item, gold, materials, sent_at, read_at, claimed_at FROM server_post
    WHERE to_id = ? ORDER BY ((item IS NOT NULL OR gold > 0 OR materials IS NOT NULL) AND claimed_at IS NULL) DESC, (read_at IS NULL) DESC, sent_at DESC, id DESC LIMIT ?`).bind(reader.id, POST_BOX_MAX).all();
  const post = results.map(headOf);
  return {
    post,
    unread: post.filter((p) => !p.read).length,
    unclaimed: post.filter((p) => postHoldsGoods(p) && !p.claimed).length,
    max: POST_BOX_MAX,
    ...(isReportReader(reader, env) ? { reports: await reportCountsOf(db) } : {}),
  };
}

/**
 * OPEN ONE of the reader's own: the whole piece, and its first opening stamped. `no-post` for an id not theirs.
 * @param {{ db: any, nowS: number }} ctx @param {any} reader @param {unknown} id
 */
export async function readPost({ db, nowS }, reader, id) {
  if (typeof id !== 'string' || !POST_ID_RE.test(id)) return { error: 'no-post' };
  const row = await db.prepare('SELECT id, sender, subject, body, item, gold, materials, sent_at, read_at, claimed_at FROM server_post WHERE id = ? AND to_id = ?')
    .bind(id, reader.id).first();
  if (!row) return { error: 'no-post' };
  if (row.read_at == null) await db.prepare('UPDATE server_post SET read_at = ? WHERE id = ? AND to_id = ? AND read_at IS NULL').bind(nowS, id, reader.id).run();
  return { post: { ...headOf(row), body: row.body, read: true, readAt: row.read_at ?? nowS } };
}

/**
 * CLAIM WHAT IT HOLDS into the realm character being played: `{ id, character, realm, letter }` - `realm` where its
 * record stands (`{ id, lease, seq }`, the same character), asked FIRST as every realm act is (realm.js realmActFirst).
 * The item and the gold go into the record, the materials into the character's Stores, and the piece is stamped claimed,
 * in one batch. `letter` true takes the gold as a letter of credit, for gold the pack cannot carry (the client weighs
 * it). Answers `{ ok, id, item, gold, materials, realm: { seq } }`, or a refusal: `realm-only` (not an online
 * character), the realm's own words (`lease`, `seq`, `realm-needed`), `no-post`, `post-no-item`, `post-claimed`,
 * `stores-full`, or `server` - the batch failed with the piece still waiting, asked again.
 * @param {any} ctx  `{ db, bucket, rand, nowS }`
 * @param {any} reader
 * @param {{ id?: unknown, character?: unknown, realm?: unknown, letter?: unknown }} body
 */
export async function claimPost(ctx, reader, { id, character, realm = null, letter = false } = {}) {
  const { db, bucket, nowS } = ctx;
  if (typeof character !== 'string' || !REALM_ID_RE.test(character)) return { error: 'realm-only' };
  const side = await realmActFirst(db, reader.id, character, realm);
  if (side.error) return side;
  if (!side.at) return { error: 'realm-needed' };
  if (typeof id !== 'string' || !POST_ID_RE.test(id)) return { error: 'no-post' };
  const row = await db.prepare('SELECT id, batch, item, gold, materials, claimed_at FROM server_post WHERE id = ? AND to_id = ?').bind(id, reader.id).first();
  if (!row) return { error: 'no-post' };
  const rec = recordOf(row);
  const gold = goldOf(row);
  const materials = materialsOf(row);
  if (!postHoldsGoods({ item: rec, gold, materials })) return { error: 'post-no-item' };
  if (row.claimed_at != null) return { error: 'post-claimed' };
  if (!(await storesHaveRoom(db, reader.id, character, materials))) return { error: 'stores-full' };
  // LOST-SPOILS: a boss's leftover is the client's roll - charged to the budget as the floor's piece is, never witnessed
  // (lostLaw.js); the developers' gifts the service minted are witnessed, as every act of its own is
  const give = (/** @type {any} */ save) => {
    if (rec) giveTradeGoods(save, [rec], 0);
    if (gold > 0) creditSave(save, gold, { letter: letter === true });
    return null;
  };
  const prep = await prepareRealmRecord(ctx, reader.id, side.at, give, { witness: !isLostBatch(row.batch) });
  if ('error' in prep) return prep;
  try {
    await db.batch([
      ...prep.steps,
      // THE CLAIM, once: a second (another tab, an answer lost and asked again) finds it stamped and moves nothing
      db.prepare('UPDATE server_post SET claimed_at = ?, claimed_by = ?, read_at = COALESCE(read_at, ?) WHERE id = ? AND to_id = ? AND claimed_at IS NULL')
        .bind(nowS, character, nowS, id, reader.id),
      mustChange(db),
      ...storesSteps(db, reader.id, character, materials),
    ]);
  } catch {
    await dropIfUnnamed(db, bucket, reader.id, side.at.id, prep.key);
    return claimFailure(db, reader.id, side.at, { id, character, materials });
  }
  await dropObjects(bucket, [prep.prev]);
  return { ok: true, id, item: rec, gold, materials, realm: { seq: prep.seq } };
}

/**
 * Why a claim's batch failed, read after it: the record moved, or the piece was taken meanwhile (another tab), gone, or
 * its materials no longer fit the Stores. Otherwise the service's own failure, which the client asks again
 * (realmSaves.js REALM_ACT_TRANSIENT).
 * @param {any} db @param {string} player @param {any} at
 * @param {{ id: string, character: string, materials: import('../../src/net/postLaw.js').PostMaterial[] }} claim
 */
async function claimFailure(db, player, at, { id, character, materials }) {
  const moved = await recordMovedOf(db, player, at);
  if (moved) return moved;
  const again = await db.prepare('SELECT claimed_at FROM server_post WHERE id = ? AND to_id = ?').bind(id, player).first();
  if (!again) return { error: 'no-post' };
  if (again.claimed_at != null) return { error: 'post-claimed' };
  if (!(await storesHaveRoom(db, player, character, materials))) return { error: 'stores-full' };
  return { error: 'server' };
}

/**
 * THROW ONE AWAY - the reader's own, and never one whose goods are still waiting (`post-unclaimed`: claim it first, so a
 * gift is never thrown away by a slip).
 * @param {{ db: any }} ctx @param {any} reader @param {unknown} id
 */
export async function deletePost({ db }, reader, id) {
  if (typeof id !== 'string' || !POST_ID_RE.test(id)) return { error: 'no-post' };
  const row = await db.prepare('SELECT id, item, gold, materials, claimed_at FROM server_post WHERE id = ? AND to_id = ?').bind(id, reader.id).first();
  if (!row) return { error: 'no-post' };
  if (rowHoldsGoods(row) && row.claimed_at == null) return { error: 'post-unclaimed' };   // the one answer the box and the claim give
  // and as it was read: a claim that lands between the read and this leaves it claimed - never a gift thrown away unclaimed
  const r = await db.prepare('DELETE FROM server_post WHERE id = ? AND to_id = ? AND claimed_at IS ? AND item IS ?').bind(id, reader.id, row.claimed_at, row.item).run();
  return r?.meta?.changes ? { ok: true, id } : { error: 'no-post' };
}
