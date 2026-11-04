// P0 SERVER PROFILE: THE HASH THAT NAMES A PROFILE (server-profile design, section 9; decision #65).
//
// `ph` is the SHA-256 of the profile AS WRITTEN, in a canonical form: object keys sorted at every depth, arrays in their
// own order, no whitespace. So the relay, the account Worker and every client that holds the same profile name it the
// same, whatever order its source lists its keys in. The registry's defaults are NOT filled in first (decision 5): the
// relay bundles only the profile and this file, never the key registry, so a key added with its default moves no
// relay bundle.
//
// A leaf: no imports. test/importGraph.mjs walks the relay's bundle, and Workers and browsers both have
// `crypto.subtle`.

/** The wire's shape of a profile hash: 64 lowercase hex digits. */
export const PROFILE_HASH_RE = /^[0-9a-f]{64}$/;

/** The close reason of a hello the relay refused for its `ph`: none, or another than the relay's (a WebSocket close's
 *  reason is at most 123 bytes; the player's words ride the error frame before it, server/src/helloDoor.ts). No setting
 *  holds this door open: the fork has no older build to let in. */
export const PROFILE_OTHER_REASON = 'other rules';

/** The profile's JSON with every object's keys sorted, at every depth. Throws on a value JSON cannot hold. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`a profile holds no ${value}`);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    const record = value as Record<string, unknown>;
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k])}`).join(',')}}`;
  }
  throw new TypeError(`a profile holds no ${typeof value}`);
}

/** The profile's hash (`ph`): SHA-256 of its canonical JSON, as lowercase hex. */
export async function profileHashOf(profile: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(profile));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
