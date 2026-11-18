// @ts-check
// The realm character's save route (`PUT /v1/realm/<id>/data`), past the body's bounds: the headers read and the
// checkpoint asked. The route in index.js reads the body and turns the answer into a response.
import { checkpointRealm } from './realm.js';

/**
 * A save sent to the realm. The lease, the sequence and the tile ride headers, since the body is the save.
 * @param {any} ctx @param {string} playerId
 * @param {{ id: string, headers: Headers, raw: ArrayBuffer, session: string | null }} put
 */
export async function putRealmSave(ctx, playerId, { id, headers, raw, session }) {
  let summary = null;
  try { summary = JSON.parse(headers.get('x-realm-summary') || 'null'); } catch { summary = null; }
  return checkpointRealm(ctx, playerId, {
    id, lease: headers.get('x-realm-lease'), seq: Number(headers.get('x-realm-seq')), summary,
    session,   // SESSION-SIGN (AUDIT PLAN-1000 E3): the save asks its session and the ban itself
  }, raw, raw.byteLength);
}
