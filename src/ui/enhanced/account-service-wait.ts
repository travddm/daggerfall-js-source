// The account card before it knows its service (decision 116 (8)). There is no built-in account service: the
// player's relay (Settings, Online, Relay) is asked which one is its own, and until it answers the card says why it
// waits instead of offering a sign-in that cannot reach anything.
import { learnAccountService, needsAccountService } from '../../net/account-service-address.ts';
import { noServerAddressText } from '../../systems/online/no-server-address.ts';
import { t } from '../../systems/textManager.js';

type Store = Parameters<typeof needsAccountService>[0];

/** The relay the last lookup was for, so a relay that does not answer is asked once a menu, not once a redraw. */
let askedOf: string | null = null;

/** The words the card shows while it cannot sign in, or null when it can. Starts the lookup, and calls `redraw` when
 *  it ends. */
export function accountServiceWait(relay: string, storage: Store, redraw: () => void): string | null {
  if (!relay) return noServerAddressText();
  if (!needsAccountService(storage, relay)) return null;
  if (askedOf === relay) return t('menu.account.noService', 'The server did not name an account service.');
  askedOf = relay;
  void learnAccountService(relay, storage).then(() => redraw());
  return t('menu.account.finding', 'Asking the server for its account service.');
}

/** `host` with the waiting words in it, in place of the card. */
export function accountWaitNote(host: HTMLElement, words: string): HTMLElement {
  const note = document.createElement('div');
  note.className = 'row-note';
  note.textContent = words;
  host.append(note);
  return host;
}

/** Forgets the last lookup, for tests. */
export function _resetAccountServiceWaitForTests(): void {
  askedOf = null;
}
