// `ph`, the name of a profile: SHA-256 of the profile as written, in canonical JSON (keys sorted at every depth), so
// every holder names it the same whatever its key order. Defaults are not filled in, so the relay bundles no registry.
// A leaf: the relay bundles it.

/** The wire's shape of a profile hash: 64 lowercase hex digits. */
export const PROFILE_HASH_RE = /^[0-9a-f]{64}$/;

/** The close reason of a hello refused for its `ph`. A close reason holds 123 bytes, so the player's words ride the
 *  error frame before it (server/src/helloDoor.ts). */
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
