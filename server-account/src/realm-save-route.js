// @ts-check
// The realm character's save route (`PUT /v1/realm/<id>/data`), past the body's bounds: the headers read and the
// checkpoint asked. The route in index.js reads the body and turns the answer into a response.
import { checkpointRealm, leaveRealm } from './realm.js';

/** A closing tab's last save (`x-realm-leave: 1`): the lease is released with it, so the tab sends no leave. */
export const REALM_LEAVE_HEADER = 'x-realm-leave';

/**
 * A save sent to the realm. The lease, the sequence and the tile ride headers, since the body is the save. A closing save
 * releases the lease in the update that stores it. Refused, it releases the lease all the same: the page that sent it
 * is gone, and a seat held for nobody keeps the character "playing" and its account's seat taken.
 * @param {any} ctx @param {string} playerId
 * @param {{ id: string, headers: Headers, raw: ArrayBuffer, session: string | null }} put
 */
export async function putRealmSave(ctx, playerId, { id, headers, raw, session }) {
  let summary = null;
  try {
    summary = JSON.parse(headers.get('x-realm-summary') || 'null');
  } catch {
    summary = null;
  }
  const lease = headers.get('x-realm-lease');
  const leave = headers.get(REALM_LEAVE_HEADER) === '1';
  const r = await checkpointRealm(
    ctx,
    playerId,
    {
      id,
      lease,
      seq: Number(headers.get('x-realm-seq')),
      summary,
      leave,
      session, // the save asks whether its session still stands and whether the account is banned
    },
    raw,
    raw.byteLength,
  );
  if (leave && r.error) await leaveRealm(ctx, playerId, { id, lease });
  return r;
}
