// @ts-check
// The server's post: its law, the one file the service (server-account/src/post.js)
// and the client (net/serverPost.js, ui/enhanced/enhancedPost.js) all read.
//
// A piece of the post is the developers' to one account: a subject, a body, and at most ONE item, gold and Stores
// materials, which its reader claims into the online character they are playing. Nothing a player sends writes one - the operator is its sender, and the operator's list First of the Spire's letter's,
// its words fixed (server-account/src/egHonours.js egFirstPost), and the service's hourly clock a spent Weir Key
// stake's, its words fixed too (server-account/src/eg.js spendLapsedStakes).

/** A piece's id: the service's mintId shape, or the operator's statement's `lower(hex(randomblob(12)))` - 24 hex. */
export const POST_ID_RE = /^[A-Za-z0-9_-]{16,40}$/;
/** An operator's send's name ('hours-first-hourlock'): lower-case words and hyphens. One piece a batch an account. */
export const POST_BATCH_RE = /^[a-z0-9][a-z0-9-]{2,47}$/;
/** Who the post is from, as the box shows it. */
export const POST_SENDER = 'The Developers';
/** How many pieces the box lists, newest first - the rest wait behind them, never lost. */
export const POST_BOX_MAX = 50;
/** A subject's and a body's bounds, in characters. */
export const POST_SUBJECT_MAX = 80;
export const POST_BODY_MAX = 1200;
/** How often the client looks at the box while the game runs - the letterbox's own clock (net/mail.js MAIL_POLL_MS). */
export const POST_POLL_MS = 3 * 60 * 1000;

/** A string within `max`, or null. */
const text = (v, max) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);

/**
 * WHAT A PIECE'S ITEM IS, as the box lists it - its name and its rarity, never the record (the record is the claim's).
 * Null for a piece with none, or a record that is not one.
 * @param {any} rec
 * @returns {{ name: string, rarity: string|null } | null}
 */
export function postItemHead(rec) {
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return null;
  const name = text(rec.name, 80);
  if (!name) return null;
  return { name, rarity: typeof rec.rarity === 'string' && /^[a-z]{1,16}$/.test(rec.rarity) ? rec.rarity : null };
}

/** A material's key as the Stores file it (`herb:rose`, `p1:12`). */
export const POST_MATERIAL_RE = /^[a-z0-9_-]{1,16}:[a-z0-9_-]{1,40}$/;
/** Where a material in the Stores came from; the market treats own and bought units apart. */
export const POST_MATERIAL_ORIGINS = Object.freeze(['own', 'bought', 'gold', 'loose']);
/** The most of one material a piece carries: what an empty Stores can take (professionLaw.js STORES_MAX). */
export const POST_MATERIAL_MAX = 5000;
/** The most materials one piece lists. */
export const POST_MATERIALS_MAX = 64;

/**
 * @typedef {{ material: string, origin: string, qty: number }} PostMaterial
 */

/**
 * The materials a piece carries, checked, or null when the list is not one. A missing or empty list is `[]`.
 * @param {unknown} list
 * @returns {PostMaterial[] | null}
 */
export function postMaterialsOf(list) {
  if (list == null) return [];
  if (!Array.isArray(list) || list.length > POST_MATERIALS_MAX) return null;
  /** @type {PostMaterial[]} */
  const out = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') return null;
    const { material, origin, qty } = /** @type {Record<string, unknown>} */ (entry);
    if (typeof material !== 'string' || !POST_MATERIAL_RE.test(material)) return null;
    if (typeof origin !== 'string' || !POST_MATERIAL_ORIGINS.includes(origin)) return null;
    if (!Number.isSafeInteger(qty) || /** @type {number} */ (qty) < 1 || /** @type {number} */ (qty) > POST_MATERIAL_MAX) {
      return null;
    }
    out.push({ material, origin, qty: /** @type {number} */ (qty) });
  }
  return out;
}

/**
 * Whether a piece holds anything to claim: an item, gold or materials.
 * @param {{ item?: unknown, gold?: number, materials?: unknown[] }} head
 */
export const postHoldsGoods = (head) => head.item != null || (head.gold ?? 0) > 0 || (head.materials?.length ?? 0) > 0;

/**
 * A PIECE'S HEAD as the box carries it, checked on the way in (the client reads the service's answer through it), or
 * null: `{ id, from, subject, sentAt, read, item, gold, materials, claimed }` - `item` its postItemHead or null.
 * @param {any} p
 */
export function postHead(p) {
  if (!p || typeof p !== 'object') return null;
  if (typeof p.id !== 'string' || !POST_ID_RE.test(p.id)) return null;
  const from = text(p.from, 40), subject = text(p.subject, POST_SUBJECT_MAX);
  if (!from || !subject || !Number.isSafeInteger(p.sentAt)) return null;
  const item = p.item == null ? null : postItemHead(p.item);
  if (p.item != null && !item) return null;
  const gold = p.gold == null ? 0 : p.gold;
  if (!Number.isSafeInteger(gold) || gold < 0) return null;
  const materials = postMaterialsOf(p.materials);
  if (!materials) return null;
  const holds = postHoldsGoods({ item, gold, materials });
  return { id: p.id, from, subject, sentAt: p.sentAt, read: p.read === true, item, gold, materials, claimed: holds ? p.claimed === true : false };
}

/** A WHOLE PIECE (`/v1/post/read`'s answer): its head and its body, or null. */
export function postWhole(p) {
  const head = postHead(p);
  const body = text(p?.body, POST_BODY_MAX);
  return head && body ? { ...head, body, read: true } : null;
}

/** The pieces that hold goods not yet taken - the mailbox's mark lights for these as for unread words. */
export const unclaimedOf = (/** @type {Array<{ item?: any, gold?: number, materials?: unknown[], claimed: boolean }>} */ heads) =>
  heads.filter((h) => postHoldsGoods(h) && !h.claimed).length;
