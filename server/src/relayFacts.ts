// The relay's public facts: `/health` (which relay this is) and `/profile` (the rules it plays by, fetched by an online
// page before its world boots, and the account service that goes with this relay). Both name the profile's hash, as
// every welcome does. The account service sits beside the profile, not in it, so it never moves the hash.

import { RELAY_VERSION } from '../../src/net/wire.js';
import { OFFICIAL_PROFILE } from '../../src/net/profile/officialProfile.ts';
import { profileHashOf } from '../../src/net/profile/profileHash.ts';

let held: Promise<string> | null = null;
/** The profile's hash, computed on first use: a Worker may not run `crypto.subtle` in its global scope. */
export const relayProfileHash = (): Promise<string> => (held ??= profileHashOf(OFFICIAL_PROFILE));

/** The paths relayFactsAnswer answers. */
export const RELAY_FACT_PATHS: readonly string[] = Object.freeze(['/health', '/profile']);

const json = (o: unknown): Response =>
  new Response(JSON.stringify(o), {
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
  });

/** The account service a player of this relay signs in to: the `ACCOUNT_SERVICE_URL` var when it is an https address,
 *  else null (decision 116 (8): the client has no built-in service, so a relay without one offers no accounts). */
export function accountServiceOfEnv(env: { ACCOUNT_SERVICE_URL?: unknown } | null | undefined): string | null {
  const url = env?.ACCOUNT_SERVICE_URL;
  return typeof url === 'string' && /^https:\/\/\S+$/.test(url) ? url : null;
}

/** The answer to one of RELAY_FACT_PATHS. */
export async function relayFactsAnswer(path: string, env?: { ACCOUNT_SERVICE_URL?: unknown }): Promise<Response> {
  const ph = await relayProfileHash();
  if (path === '/profile') {
    return json({ v: RELAY_VERSION, ph, profile: OFFICIAL_PROFILE, accounts: accountServiceOfEnv(env) });
  }
  return json({ ok: true, service: 'daggerfall-online', version: RELAY_VERSION, ph, t: Date.now() });
}
