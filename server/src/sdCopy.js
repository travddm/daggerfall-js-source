// @ts-check
// SD-PARTY: the relay's half of a party's own Hour,
// the room `sd:<s>.<owner>` (sdLaw.js sdRoomKey). The door lets in the owner, staff and the owner's party (the hub's
// word, _instanceKinOf); the hub silent is busy. The hub keeps one life and one win an account a Hollow across copies:
// a realm asks it before a newcomer and tells it each death, kept with the copy it was in - SD-BACK: that copy takes the
// dead back, no other does. SD-SOLO: a shared Hour (`p<n>`) admits anyone to SD_PUB_SEATS; the Worker finds the open one.
import { SD_KEY, sdReceiptKey, SOCIAL_ROOM, SD_TELL_RETRY_MS, tokenGate } from '../../src/net/wire.js';
import { sdOwnerOfRoom, sdRoomKey, sdPubOwner, isSdPubOwner, SD_NO_FALLEN, SD_PUB_SEATS, SD_PUB_MAX } from '../../src/net/superDungeon/sdLaw.js';
import { instanceOwnerOf } from '../../src/net/instanceRoom.js';
import { verifyToken } from '../../src/net/identityToken.js';
import { ROOM_CALL_MS } from './relayScale.js';

/** The door's refusals, said by the realm as its others are: a copy of the Hour is its party's alone, and an account
 *  wins one Hollow once, in whichever copy. */
export const SD_NO_PARTY = 'This Hour belongs to another party.';
export const SD_NO_WON = 'You have already broken this Hour.';
/** The hub's internal door a realm asks and tells of an account's life and win this Hollow. */
export const SD_INTERNAL_ACCT = '/internal/sd/acct';
/** Where the hub keeps an account's death in this Hollow - `{ s, d: 1 }` (one Hollow stands at a time). */
export const sdAcctKey = (sub) => `sdac:${sub}`;
const SUB_RE = /^[A-Za-z0-9_-]{4,64}$/;

/**
 * THE COPY'S DOOR - why `sub` may not stand in the realm `key`, or null. `staff` its right as staff; `kin(sub, owner)`
 * the hub's word that `sub`'s party holds the owner (true, false, or null while the hub is silent).
 * @param {string} key @param {string|null} sub @param {boolean} staff
 * @param {(sub: string, owner: string) => Promise<boolean|null>} kin @returns {Promise<string|null>} 'busy' or a refusal
 */
export async function sdCopyRight(key, sub, staff, kin) {
  const owner = sdOwnerOfRoom(key);
  if (!owner || !sub) return SD_NO_PARTY;
  if (isSdPubOwner(owner)) return null;   // SD-SOLO: a shared Hour's door is its seats'
  if (staff || (await instanceOwnerOf(sub)) === owner) return null;
  const k = await kin(sub, owner);
  return k == null ? 'busy' : k ? null : SD_NO_PARTY;
}

/** A realm's word to the hub - `{ s, a, op, o }`, op 'may' or 'down', `o` the copy's owner - projected, or null. */
export function validSdAcct(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const b = /** @type {any} */ (v);
  return Number.isSafeInteger(b.s) && b.s > 0 && typeof b.a === 'string' && SUB_RE.test(b.a) && ['may', 'down'].includes(b.op) && sdRoomKey(b.s, b.o) ? { s: b.s, a: b.a, op: b.op, o: b.o } : null;
}

/** THE REALM ASKS OR TELLS THE HUB. Answers the hub's JSON, or null when it is silent (a relay of one room: `{ ok: true }`).
 *  @param {any} env @param {{ s: number, a: string, op: string, o: string }} body */
export async function sdAcctAsk(env, body) {
  const rooms = env?.ROOMS;
  if (!rooms?.idFromName || !rooms?.get) return { ok: true };
  try {
    const res = await rooms.get(rooms.idFromName(SOCIAL_ROOM)).fetch(new Request(`https://relay.internal${SD_INTERNAL_ACCT}`, { method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(ROOM_CALL_MS) }));
    return res?.ok ? await res.json() : null;
  } catch (e) { console.warn('[sd] acct', e?.message ?? e); return null; }
}

/** May `sub`, new to the copy owned by `o`, come in - null or the refusal. The hub silent lets it in: the realm's own
 *  record and door still hold (a hub that struggles shuts no Hour - AUDIT SD II L3 F2's law).
 *  @param {any} env @param {number} s @param {string} sub @param {string} o */
export async function sdNewcomerWord(env, s, sub, o) {
  const r = await sdAcctAsk(env, { s, a: sub, op: 'may', o });
  return r?.w === 'won' ? SD_NO_WON : r?.w === 'down' ? SD_NO_FALLEN : null;
}

/** A death told to the hub, with the copy it was in - once again a beat on if the first was not heard, never awaited.
 *  @param {any} room the realm (its `env`, its `state`) @param {string} key its room @param {string} sub */
export function sdAcctTell(room, key, sub) {
  const s = Number(String(key).slice(3).split('.')[0]), o = sdOwnerOfRoom(key);
  const once = () => sdAcctAsk(room.env, { s, a: sub, op: 'down', o });
  const p = once().then((r) => (r ? r : new Promise((ok) => setTimeout(ok, SD_TELL_RETRY_MS)).then(once)));
  try { room.state?.waitUntil?.(p); } catch { /* not every runtime */ }
  return p;
}

/** THE HUB'S ANSWER. `may`: 'won' for an account holding this slot's receipt, 'down' for one that died in another copy;
 *  `down` kept, with its copy (the first death's). A word for another slot than the hub's record is ok and kept nowhere.
 *  @param {any} room the hub @param {Request} request */
export async function sdAcctInternal(room, request) {
  let body = null;
  try { body = await request.json(); } catch { body = null; }
  const c = validSdAcct(body);
  if (!c) return Response.json({ ok: false }, { status: 400 });
  const rec = await room.state.storage.get(SD_KEY);
  if (!rec || rec.s !== c.s) return Response.json({ ok: true });
  const d = await room.state.storage.get(sdAcctKey(c.a));
  const mine = d && d.s === c.s ? d : null;
  if (c.op === 'down') { if (!mine) await room.state.storage.put(sdAcctKey(c.a), { s: c.s, d: 1, o: c.o }); return Response.json({ ok: true }); }
  const rc = await room.state.storage.get(sdReceiptKey(c.a));
  if (rc && typeof rc === 'object' && rc.s === c.s) return Response.json({ ok: true, w: 'won' });
  return Response.json({ ok: true, ...(mine && mine.o !== c.o ? { w: 'down' } : {}) });
}

/** SD-SOLO: the realm's door for the Worker's walk - `{ s, o }` asked: whether its Hour has room for a newcomer (fewer
 *  than SD_PUB_SEATS in, its fight standing) and whether the account whose digest is `o` is in it already.
 *  @param {any} room the realm @param {Request} request */
export async function sdSeatsInternal(room, request) {
  let b = null;
  try { b = await request.json(); } catch { b = null; }
  if (!b || !Number.isSafeInteger(b.s) || b.s <= 0 || typeof b.o !== 'string' || !/^[0-9a-f]{16}$/.test(b.o)) return Response.json({ ok: false }, { status: 400 });
  const realm = await room._sdRealmOf(b.s), f = await room._sdFightOf();
  const owners = await Promise.all(realm.in.map((x) => instanceOwnerOf(x)));
  return Response.json({ ok: true, has: owners.includes(b.o), open: realm.in.length < SD_PUB_SEATS && !f?.fell });
}
/** The Worker's path for the walk: `/sd/open?s=<slot>&o=<my digest>`. */
export const SD_OPEN_PATH = '/sd/open';
export const SD_INTERNAL_SEATS = '/internal/sd/seats';

/** The walk asks for a signed identity token (the game has one for every hello), and is limited two ways. Per ACCOUNT: a
 *  burst of SD_OPEN_ACCT_BURST walks, then one every 1 / SD_OPEN_ACCT_HZ seconds - one walk is up to SD_PUB_MAX calls into
 *  room objects, and a player opens a Hollow once in a long while, so a whole party opening Hollows in a row, each on their
 *  own account, never meets it. Per ADDRESS, a flood backstop only: far above what a household, a campus or a carrier's
 *  shared address can honestly send, and spent BEFORE the token is checked, so a flood of bad tokens costs no signature
 *  check. A call with no address (none is stated) shares the backstop bucket '', and the account's limit applies to it
 *  as to any other. Buckets live per isolate and are bounded. */
export const SD_OPEN_ACCT_HZ = 0.5;
export const SD_OPEN_ACCT_BURST = 12;
export const SD_OPEN_ADDR_HZ = 20;
export const SD_OPEN_ADDR_BURST = 200;
export const SD_OPEN_CLIENTS_MAX = 4096;
const acctBuckets = new Map();
const addrBuckets = new Map();
/** @param {Map<string, any>} buckets @param {string} id @param {number} now @param {number} hz @param {number} burst */
function spendBucket(buckets, id, now, hz, burst) {
  const gate = tokenGate(buckets.get(id), now, hz, burst);
  buckets.delete(id);
  if (buckets.size >= SD_OPEN_CLIENTS_MAX) buckets.delete(/** @type {string} */ (buckets.keys().next().value));
  buckets.set(id, gate.bucket);
  return gate.pass;
}
/** Whether the address `ip` is under the flood backstop; spends one token. @param {string} ip @param {number} now */
export const sdOpenAddrGate = (ip, now) => spendBucket(addrBuckets, ip, now, SD_OPEN_ADDR_HZ, SD_OPEN_ADDR_BURST);
/** Whether the account `acct` may walk now; spends one token. @param {string} acct @param {number} now */
export const sdOpenAcctGate = (acct, now) => spendBucket(acctBuckets, acct, now, SD_OPEN_ACCT_HZ, SD_OPEN_ACCT_BURST);

/** SD-SOLO: THE WORKER'S WALK of a Hollow's shared Hours - the first that holds me, else the first open - as `{ n }`
 *  (`n` null: none answered, or all SD_PUB_MAX full). They open in order, so the one I am in comes first. Answers 429
 *  past a limit and 401 for a token that does not verify.
 *  @param {any} env @param {URL} url
 *  @param {{ ip?: string, tok?: string|null, key?: CryptoKey|null }} [who] the caller's address, signed token and the key that checks it */
export async function sdOpenDoor(env, url, who = {}) {
  const s = Number(url.searchParams.get('s')), o = String(url.searchParams.get('o') ?? '');
  const head = { 'content-type': 'application/json', 'access-control-allow-origin': '*' };
  const no = (status) => new Response(JSON.stringify({ n: null }), { status, headers: head });
  const now = Date.now();
  if (!sdOpenAddrGate(who.ip ?? '', now)) return no(429);
  const r = who.key && who.tok ? await verifyToken(who.tok, who.key, { subtle: crypto.subtle, nowS: Math.floor(now / 1000) }) : null;
  if (!r?.ok) return no(401);
  if (!sdOpenAcctGate(r.claims.s, now)) return no(429);
  if (!sdRoomKey(s, o) || isSdPubOwner(o) || !env?.ROOMS?.idFromName) return no(400);
  return new Response(JSON.stringify({ n: await sdWalk(env, s, o) }), { headers: head });
}

/** The walk itself: the first shared Hour (0..SD_PUB_MAX) that holds owner digest `o` or is open, else null. */
async function sdWalk(env, s, o) {
  for (let n = 0; n < SD_PUB_MAX; n++) {
    const key = /** @type {string} */ (sdRoomKey(s, /** @type {string} */ (sdPubOwner(n))));
    let r = null;
    try {
      const res = await env.ROOMS.get(env.ROOMS.idFromName(key)).fetch(new Request(`https://relay.internal${SD_INTERNAL_SEATS}`, { method: 'POST', body: JSON.stringify({ s, o }), signal: AbortSignal.timeout(ROOM_CALL_MS) }));
      r = res?.ok ? await res.json() : null;
    } catch (e) { console.warn('[sd] seats', e?.message ?? e); }
    if (!r) break;
    if (r.has || r.open) return n;
  }
  return null;
}

/** SD-SOLO: the walk's route - a signed token in `authorization`, the preflight that header needs, and the caller's address.
 *  @param {Request} request @param {any} env @param {URL} url @param {CryptoKey|null} key the key that checks the token */
export async function sdOpenRoute(request, env, url, key) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization', 'access-control-max-age': '86400' } });
  const bearer = /^Bearer (\S+)$/.exec(request.headers.get('authorization') ?? '');
  return sdOpenDoor(env, url, { ip: request.headers.get('cf-connecting-ip') ?? '', tok: bearer?.[1] ?? null, key });
}
