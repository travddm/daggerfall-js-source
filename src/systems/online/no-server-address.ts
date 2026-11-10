// The words a player reads when the game has no server address to go online with. There is
// no built-in relay. The profile door and the menu's account card both say them, so they live apart from either.
import { t } from '../textManager.js';

export const noServerAddressText = (): string =>
  t('net.profile.noAddress', 'No server address is set. Enter one in Settings, Online, Relay.');
