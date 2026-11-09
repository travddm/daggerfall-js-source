// Where this device's account service is. There is no built-in service: a player enters one address,
// the relay's, and the relay's `/profile` names its account service (`accounts`, server/src/relayFacts.ts). The
// client remembers that answer beside the relay it came from. A developer may still point the client at a service by
// hand with the `dagger.account.service` storage key, which wins over what a relay said.

import { relayUrl } from './wire.js';

/** The developer override: an https address stored under this key wins over everything else. */
export const SERVICE_KEY = 'dagger.account.service';
/** What a relay last said its account service is: `{ relay, accounts }`, as JSON. */
export const LEARNED_SERVICE_KEY = 'dagger.account.learned';

type Store = { getItem(key: string): string | null; setItem(key: string, value: string): void } | null | undefined;

/** An account service address the client will talk to: https only, so a session secret never travels in clear. */
export const isServiceUrl = (value: unknown): value is string =>
  typeof value === 'string' && /^https:\/\/\S+$/.test(value);

function readStored(storage: Store, key: string): string | null {
  try {
    return storage?.getItem?.(key) ?? null;
  } catch {
    return null;
  }
}

/** The relay and service a relay last named, or null when none was stored or the record does not read. */
export function learnedAccountService(storage: Store): { relay: string; accounts: string } | null {
  const text = readStored(storage, LEARNED_SERVICE_KEY);
  if (!text) return null;
  try {
    const record = JSON.parse(text) as { relay?: unknown; accounts?: unknown };
    if (typeof record.relay !== 'string' || !isServiceUrl(record.accounts)) return null;
    return { relay: record.relay, accounts: record.accounts };
  } catch {
    return null;
  }
}

/** Stores what `relay` said its account service is. An answer that is no https address is not stored. */
export function rememberAccountService(storage: Store, relay: string, accounts: unknown): boolean {
  if (!isServiceUrl(accounts)) return false;
  try {
    storage?.setItem?.(LEARNED_SERVICE_KEY, JSON.stringify({ relay, accounts }));
    return true;
  } catch {
    return false;
  }
}

/** The service this device talks to: the developer override, then what a relay said, then `fallback`. */
export function accountServiceOf(storage: Store, fallback = ''): string {
  const override = readStored(storage, SERVICE_KEY);
  if (isServiceUrl(override)) return override;
  return learnedAccountService(storage)?.accounts ?? fallback;
}

type Fetch = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/** Asks `relay` for its account service (`/profile`'s `accounts`) and remembers it. False when the relay is no relay
 *  address, does not answer, or names no https service. */
export async function learnAccountService(
  relay: string,
  storage: Store,
  fetchImpl: Fetch = globalThis.fetch,
): Promise<boolean> {
  const ws = relayUrl(relay);
  if (!ws) return false;
  try {
    const res = await fetchImpl(`${ws.replace(/^ws/, 'http')}/profile`);
    if (!res.ok) return false;
    const body = (await res.json()) as { accounts?: unknown } | null;
    return rememberAccountService(storage, relay, body?.accounts);
  } catch {
    return false;
  }
}

/** Whether the client should ask `relay` for its account service: no developer override, and nothing learned from
 *  this relay yet. */
export function needsAccountService(storage: Store, relay: string): boolean {
  if (isServiceUrl(readStored(storage, SERVICE_KEY))) return false;
  return learnedAccountService(storage)?.relay !== relay;
}
