// The operator's door: the acts a server's operator runs on its own account service, from the machine that hosts it
// (`selfhost/operator.ts`). Each act was a GitHub workflow that ran wrangler against the old Cloudflare account; a
// self-hosted server has no such path (decision #118 A6, server feature audit PR 1b).
//
// The door answers only while OPERATOR_SECRET is set, and only a request that carries it. Cloudflare never sets it,
// so the path stays an unknown one there, as the cron door's does.
//
// Acts, each a JSON body `{ act, ... }`:
//   find      an account by its handle: its id, when it registered, its staff role
//   role      set an account's staff role by its id (owner, admin, moderator, none)
//   recovery  a new recovery code for an account; only its hash is stored, and the code is answered once
//   post      a server post to named accounts; a dry run unless `apply`
//   characters an account's realm characters and their ids, read as the named Admin
//   rollback  a realm character back to its last clean checkpoint, as the named Admin; a dry run unless `apply`
import { HANDLE_RE, isHandleShaped } from '../../src/net/handleShape.js';
import { ID_RE } from '../../src/net/identityToken.js';
import { POST_BATCH_RE, POST_BODY_MAX, POST_SENDER, POST_SUBJECT_MAX } from '../../src/net/postLaw.js';
import { codeForHashing, hashPassword, mintRecoveryCode, timingSafeEqual } from './password.js';
import { reviewAct } from './review.js';

export const OPERATOR_DOOR_PATH = '/__operator';
export const OPERATOR_SECRET_HEADER = 'x-operator-secret';
const BODY_MAX_CHARS = 8192;

/** How many accounts one server post may name. */
export const POST_RECIPIENTS_MAX = 200;

/** What each role sets: Owner implies Admin, and a role replaces the one before it (tools/staffRole.mjs). */
export const ROLE_COLUMNS = Object.freeze({
  owner: { staff_owner: 1, staff_admin: 1, staff_mod: 0 },
  admin: { staff_owner: 0, staff_admin: 1, staff_mod: 0 },
  moderator: { staff_owner: 0, staff_admin: 0, staff_mod: 1 },
  none: { staff_owner: 0, staff_admin: 0, staff_mod: 0 },
});
type Role = keyof typeof ROLE_COLUMNS;

type Statement = {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  run(): Promise<{ meta?: { changes?: number } }>;
};
type Db = { prepare(sql: string): Statement };
type OperatorEnv = { OPERATOR_SECRET?: unknown; DB: Db; SAVES?: unknown };
type Body = Record<string, unknown>;
type Answer = { status: number; body: Record<string, unknown> };

const refuse = (error: string, status = 400): Answer => ({ status, body: { ok: false, error } });
const done = (body: Record<string, unknown>): Answer => ({ status: 200, body: { ok: true, ...body } });
const nowS = (): number => Math.floor(Date.now() / 1000);
const rand = (bytes: Uint8Array): void => {
  crypto.getRandomValues(bytes);
};
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

const secretOf = (env: OperatorEnv): string => (typeof env?.OPERATOR_SECRET === 'string' ? env.OPERATOR_SECRET : '');

/** True for a request to the door while OPERATOR_SECRET is set. Unset, the path is the service's like any unknown one. */
export const isOperatorDoor = (request: Request, env: OperatorEnv): boolean =>
  secretOf(env) !== '' && new URL(request.url).pathname === OPERATOR_DOOR_PATH;

const sha256 = async (s: string): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));

// Both sides are hashed first so the comparison reads equal lengths and its time says nothing about the secret's length.
async function secretMatches(given: string | null, secret: string): Promise<boolean> {
  if (given === null) return false;
  return timingSafeEqual(await sha256(given), await sha256(secret));
}

async function bodyOf(request: Request): Promise<Body | null> {
  const raw = await request.text();
  if (raw.length > BODY_MAX_CHARS) return null;
  try {
    const body: unknown = JSON.parse(raw);
    return body !== null && typeof body === 'object' && !Array.isArray(body) ? (body as Body) : null;
  } catch {
    return null;
  }
}

/** Answers a request that isOperatorDoor passed: 405 for any method but POST, 401 for a missing or wrong secret. */
export async function operatorDoor(request: Request, env: OperatorEnv): Promise<Response> {
  if (request.method !== 'POST') return new Response('method', { status: 405, headers: { allow: 'POST' } });
  if (!(await secretMatches(request.headers.get(OPERATOR_SECRET_HEADER), secretOf(env))))
    return new Response('unauthorized', { status: 401 });
  const body = await bodyOf(request);
  if (body === null) return Response.json({ ok: false, error: 'body' }, { status: 400 });
  const answer = await operatorAct(env, body);
  return Response.json(answer.body, { status: answer.status });
}

/** Runs one act. Exported for the tests, which run it without the HTTP layer as well as through it. */
export async function operatorAct(env: OperatorEnv, body: Body): Promise<Answer> {
  switch (body.act) {
    case 'find':
      return findAct(env.DB, text(body.handle));
    case 'role':
      return roleAct(env.DB, text(body.id), text(body.role));
    case 'recovery':
      return recoveryAct(env.DB, text(body.handle));
    case 'post':
      return postAct(env.DB, body);
    case 'characters':
      return reviewAs(env, body, 'characters', { name: text(body.handle) });
    case 'rollback':
      return reviewAs(env, body, body.apply === true ? 'rollback' : 'findings', {
        id: text(body.id),
        note: text(body.note) || 'operator rollback',
      });
    default:
      return refuse('act');
  }
}

type PlayerRow = {
  id: string;
  handle: string;
  registered_at: number | null;
  staff_owner: number | null;
  staff_admin: number | null;
  staff_mod: number | null;
};

const playerByHandle = (db: Db, handle: string): Promise<PlayerRow | null> =>
  db
    .prepare('SELECT * FROM players WHERE handle_lc = ? AND handle IS NOT NULL')
    .bind(handle.toLowerCase())
    .first<PlayerRow>();

const roleOf = (p: PlayerRow): Role =>
  p.staff_owner === 1 ? 'owner' : p.staff_admin === 1 ? 'admin' : p.staff_mod === 1 ? 'moderator' : 'none';

async function findAct(db: Db, handle: string): Promise<Answer> {
  if (!isHandleShaped(handle)) return refuse('handle');
  const p = await playerByHandle(db, handle);
  if (!p) return refuse('no-player', 404);
  return done({ id: p.id, handle: p.handle, registeredAt: p.registered_at, role: roleOf(p) });
}

// A role is set by account id, never by handle: a name is free to whoever registers it first, so the operator finds
// the id with `find` and checks its registration time before giving it a role (docs/operations/staff-roles.md).
async function roleAct(db: Db, id: string, role: string): Promise<Answer> {
  if (!ID_RE.test(id)) return refuse('id');
  if (!Object.hasOwn(ROLE_COLUMNS, role)) return refuse('role');
  const c = ROLE_COLUMNS[role as Role];
  const wrote = await db
    .prepare('UPDATE players SET staff_owner = ?, staff_admin = ?, staff_mod = ? WHERE id = ? AND handle IS NOT NULL')
    .bind(c.staff_owner, c.staff_admin, c.staff_mod, id)
    .run();
  if (!wrote.meta?.changes) return refuse('no-player', 404);
  return done({ id, role });
}

// The player spends the code in the game's "Forgot password" form and picks a new password; that spend mints new
// codes and signs every device out (accounts.js `recover`), so the code the operator saw is dead once it is used.
async function recoveryAct(db: Db, handle: string): Promise<Answer> {
  if (!isHandleShaped(handle)) return refuse('handle');
  const code: string = mintRecoveryCode(rand);
  const hash: string = await hashPassword(codeForHashing(code), { subtle: crypto.subtle, rand });
  const row = await db
    .prepare('UPDATE players SET recovery_hash = ? WHERE handle_lc = ? AND handle IS NOT NULL RETURNING handle')
    .bind(hash, handle.toLowerCase())
    .first<{ handle: string }>();
  if (!row) return refuse('no-player', 404);
  return done({ handle: row.handle, code });
}

/** The names a post is to, folded as `handle_lc` holds them: each a handle's shape, none twice; or null. */
export function postHandles(raw: unknown): string[] | null {
  const names = (Array.isArray(raw) ? raw : String(raw ?? '').split(',')).map((h) => String(h).trim()).filter(Boolean);
  if (names.length === 0 || names.length > POST_RECIPIENTS_MAX) return null;
  if (!names.every((h) => HANDLE_RE.test(h))) return null;
  return [...new Set(names.map((h) => h.toLowerCase()))];
}

/** A post's subject and message within the post box's bounds (`\n` typed as two characters is a line break); or null. */
export function postWords(subject: unknown, message: unknown): { subject: string; body: string } | null {
  const s = String(subject ?? '').trim();
  const b = String(message ?? '')
    .replaceAll('\\n', '\n')
    .trim();
  if (!s || s.length > POST_SUBJECT_MAX || !b || b.length > POST_BODY_MAX) return null;
  if (/[\u0000-\u0008\u000b-\u001f\u007f]/.test(s + b)) return null;
  return { subject: s, body: b };
}

// One piece to each registered account the names find, once a batch an account (INSERT OR IGNORE over the
// one-a-batch index), so a send run twice writes nothing the second time.
async function postAct(db: Db, body: Body): Promise<Answer> {
  const names = postHandles(body.handles);
  if (!names) return refuse('handles');
  const batch = text(body.batch);
  if (!POST_BATCH_RE.test(batch)) return refuse('batch');
  const words = postWords(body.subject, body.message);
  if (!words) return refuse('words');
  const marks = names.map(() => '?').join(', ');
  const { results: found = [] } = await db
    .prepare(
      `SELECT p.id, p.handle, (SELECT COUNT(*) FROM server_post s WHERE s.to_id = p.id AND s.batch = ?) AS sent
       FROM players p WHERE p.handle IS NOT NULL AND p.handle_lc IN (${marks}) ORDER BY p.handle_lc`,
    )
    .bind(batch, ...names)
    .all<{ id: string; handle: string; sent: number }>();
  const seen = new Set(found.map((p) => p.handle.toLowerCase()));
  const plan = {
    batch,
    ...words,
    to: found.map((p) => ({ handle: p.handle, sent: p.sent > 0 })),
    unknown: names.filter((n) => !seen.has(n)),
  };
  if (body.apply !== true) return done({ dry: true, ...plan });
  let written = 0;
  for (const p of found) {
    const id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
    const wrote = await db
      .prepare(
        'INSERT OR IGNORE INTO server_post (id, to_id, batch, sender, subject, body, item, sent_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)',
      )
      .bind(id, p.id, batch, POST_SENDER, words.subject, words.body, nowS())
      .run();
    written += wrote.meta?.changes ?? 0;
  }
  return done({ dry: false, written, ...plan });
}

// The review's own acts (review.js), under its own gate: `by` must hold the Admin role, and a rollback is written into
// the character's findings under that name. A rollback's dry run reads the character's findings and writes nothing.
async function reviewAs(env: OperatorEnv, body: Body, act: string, args: Body): Promise<Answer> {
  const by = text(body.by);
  if (!isHandleShaped(by)) return refuse('by');
  const admin = await playerByHandle(env.DB, by);
  if (!admin) return refuse('no-player', 404);
  const ctx = { db: env.DB, bucket: env.SAVES, nowS: nowS() };
  const said: Record<string, unknown> = await reviewAct(ctx, admin, env, act, args);
  if (typeof said?.error === 'string') return refuse(said.error, said.error === 'not-developer' ? 403 : 400);
  return done(act === 'rollback' ? { dry: false, ...said } : act === 'findings' ? { dry: true, ...said } : said);
}
