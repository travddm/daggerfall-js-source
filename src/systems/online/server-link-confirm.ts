// A `?server=` link can name any relay, and joining one hands its owner the player's sign-in for that server: the
// relay names the account service the client then signs in to, and the hello carries the identity token. So the first
// time a link names a relay this device has not joined, a full-screen prompt asks the player before anything is
// fetched or sent. The relay saved in Settings and every relay the player accepted before join without a prompt.

import { relayUrl } from '../../net/wire.js';
import { t } from '../textManager.js';

/** The relays the player accepted from a link, as a JSON array of relay URLs. */
export const JOINED_SERVERS_KEY = 'dagger.online.joinedServers';
/** The oldest accepted relays are dropped past this many, so the record stays small. */
const JOINED_SERVERS_MAX = 32;

type Store = { getItem(key: string): string | null; setItem(key: string, value: string): void } | null | undefined;
type Params = { get(k: string): string | null };

/** The relays this device has accepted from a link, oldest first. */
export function joinedServers(storage: Store): string[] {
  try {
    const list: unknown = JSON.parse(storage?.getItem?.(JOINED_SERVERS_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((relay): relay is string => typeof relay === 'string') : [];
  } catch {
    return [];
  }
}

/** Records that the player accepted `relay`. */
export function rememberJoinedServer(storage: Store, relay: string): void {
  const list = joinedServers(storage).filter((known) => known !== relay);
  list.push(relay);
  try {
    storage?.setItem?.(JOINED_SERVERS_KEY, JSON.stringify(list.slice(-JOINED_SERVERS_MAX)));
  } catch {
    // Storage that cannot be written asks again next time, which is safe.
  }
}

/**
 * The relay a `?server=` link names when the player must be asked first, or null: no link, an address that is no relay
 * (the profile door refuses it in its own words), the relay saved in Settings, or one accepted before.
 */
export function unconfirmedServerLink(params: Params, storage: Store, savedServer: unknown): string | null {
  const relay = relayUrl(params.get('server'));
  if (!relay) return null;
  if (relay === relayUrl(savedServer)) return null;
  return joinedServers(storage).includes(relay) ? null : relay;
}

/** The host a player reads in the prompt: the relay URL without its scheme. */
export const relayHostOf = (relay: string): string => relay.replace(/^wss?:\/\//, '');

export const serverLinkAskText = (host: string): string =>
  t(
    'net.serverLink.ask',
    'This link joins the server at {host}. Its owner receives your sign-in for that server. Join only a server you trust.',
    { host },
  );
export const serverLinkJoinText = (): string => t('net.serverLink.join', 'Join');
export const serverLinkStayText = (): string => t('net.serverLink.stay', 'Do not join');
export const serverLinkDeclinedText = (): string =>
  t('net.serverLink.declined', 'You did not join that server. Nothing was sent to it.');

/**
 * Shows the full-screen prompt for `relay` and answers whether the player chose to join. A page with no document
 * cannot ask, so it answers no.
 */
export function askServerLink(relay: string, doc: Document | undefined = globalThis.document): Promise<boolean> {
  if (!doc?.body) return Promise.resolve(false);
  return new Promise((resolve) => {
    const screen = doc.createElement('div');
    screen.style.cssText =
      'position:fixed;inset:0;background:#111;color:#ddd;font:16px monospace;display:flex;align-items:center;justify-content:center;z-index:20;padding:16px;box-sizing:border-box';
    const box = doc.createElement('div');
    box.style.cssText = 'max-width:460px;text-align:center;border:1px solid #444;padding:24px';
    const words = doc.createElement('p');
    words.textContent = serverLinkAskText(relayHostOf(relay));
    box.append(words);
    const choose = (join: boolean) => {
      screen.remove();
      resolve(join);
    };
    for (const [label, join] of [
      [serverLinkJoinText(), true],
      [serverLinkStayText(), false],
    ] as const) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.style.cssText = 'min-width:120px;min-height:44px;margin:8px;font:inherit';
      button.addEventListener('click', () => choose(join));
      box.append(button);
    }
    screen.append(box);
    doc.body.append(screen);
  });
}
