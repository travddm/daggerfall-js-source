// The front door: before an online world boots, fetch the relay's `/profile`, check its version and hash, and install
// it. The world reads dungeon sizes and ground pins while it boots, so the welcome would be too late. main.js wires it.

import { relayUrl, relayMatches } from '../../net/wire.js';
import { DEFAULT_SERVER } from '../../net/online.js';
import { getPref } from '../uiPrefs.js';
import { t } from '../textManager.js';
import { profileHashOf } from '../../net/profile/profileHash.ts';
import { installProfile, profileErrors } from './serverProfile.ts';
import { rememberAccountService } from '../../net/account-service-address.ts';
import { appStorage } from '../appStorage.js';
import { noServerAddressText } from './no-server-address.ts';

export { noServerAddressText };

type Params = { has(k: string): boolean; get(k: string): string | null };
type Fetch = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/** The relay an online page joins: the URL's `server`, or the player's saved one (empty when neither) - the same
 *  answer as the world host's session (scenes/world.js, `url:` of its OnlineSession). Were they ever to differ, the
 *  relay the page joins would refuse its hello for another profile, in words, rather than play by the wrong rules. */
export const relayServerOf = (params: Params): string =>
  params.get('server') || String(getPref('onlineServer') || '') || DEFAULT_SERVER;

/** The profile's address on a relay (`wss://host` -> `https://host/profile`), or null when the URL is no relay. */
export function profileUrlOf(server: string): string | null {
  const ws = relayUrl(server);
  return ws ? `${ws.replace(/^ws/, 'http')}/profile` : null;
}

export const profileUnreachableText = (): string =>
  t('net.profile.unreachable', 'The server did not answer. Check your connection and try again.');
export const profileNewerGameText = (): string =>
  t('net.profile.newerGame', 'This server needs a newer version of the game. Reload the page.');

/**
 * Fetches, checks and installs the server's profile on an online page; does nothing on any other. Throws an Error
 * whose message is the player's words when the page cannot go online with it, after saying them on `status`. The
 * account service the relay names (`accounts`) is remembered in `storage` (net/account-service-address.ts).
 */
export async function openProfileDoor(
  params: Params,
  status: (words: string) => void = () => {},
  fetchImpl: Fetch = globalThis.fetch,
  storage: Parameters<typeof rememberAccountService>[0] = appStorage(),
): Promise<void> {
  if (!params.has('online')) return;
  const refuse = (words: string, cause?: unknown): never => {
    status(words);
    throw new Error(words, { cause });
  };
  const server = relayServerOf(params);
  if (!server) refuse(noServerAddressText());
  const url = profileUrlOf(server);
  if (!url) refuse(profileUnreachableText());
  let body: unknown = null;
  try {
    const res = await fetchImpl(url);
    if (res.ok) body = await res.json();
  } catch (e) {
    refuse(profileUnreachableText(), e);
  }
  if (body === null) refuse(profileUnreachableText());
  const b = (body ?? {}) as { v?: unknown; ph?: unknown; profile?: unknown; accounts?: unknown };
  if (!relayMatches(b.v))
    refuse(t('net.relayVersionMismatch', 'The game and the server are different versions. Reload the page.'));
  if (profileErrors(b.profile).length) refuse(profileNewerGameText());
  // The hash this page sends is the one it computes from what it installs, held to the relay's word for it.
  const ph = await profileHashOf(b.profile);
  if (ph !== b.ph) refuse(profileNewerGameText());
  installProfile(b.profile, ph);
  rememberAccountService(storage, server, b.accounts);
}
