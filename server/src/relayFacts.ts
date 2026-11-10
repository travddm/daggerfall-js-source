// The relay's public facts: `/health` (which relay this is) and `/profile` (the rules it plays by, fetched by an online
// page before its world boots). Both name the profile's hash, as every welcome does.

import { RELAY_VERSION, DFU_TIME_SCALE, setOnlineTimeScale } from '../../src/net/wire.js';
import { OFFICIAL_PROFILE } from '../../src/net/profile/officialProfile.ts';
import { profileHashOf } from '../../src/net/profile/profileHash.ts';

// The world clock's TimeScale is the profile's (time.worldScale), so every raid, exhibition and grant minute the relay reads
// agrees with the clients'. The relay does not bundle the key registry, so a profile that names none plays at DFU's.
setOnlineTimeScale(Number((OFFICIAL_PROFILE.rules as Record<string, unknown>)['time.worldScale'] ?? DFU_TIME_SCALE));

let held: Promise<string> | null = null;
/** The profile's hash, computed on first use: a Worker may not run `crypto.subtle` in its global scope. */
export const relayProfileHash = (): Promise<string> => (held ??= profileHashOf(OFFICIAL_PROFILE));

/** The paths relayFactsAnswer answers. */
export const RELAY_FACT_PATHS: readonly string[] = Object.freeze(['/health', '/profile']);

const json = (o: unknown): Response =>
  new Response(JSON.stringify(o), {
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
  });

/** The answer to one of RELAY_FACT_PATHS. */
export async function relayFactsAnswer(path: string): Promise<Response> {
  const ph = await relayProfileHash();
  if (path === '/profile') return json({ v: RELAY_VERSION, ph, profile: OFFICIAL_PROFILE });
  return json({ ok: true, service: 'daggerfall-online', version: RELAY_VERSION, ph, t: Date.now() });
}
