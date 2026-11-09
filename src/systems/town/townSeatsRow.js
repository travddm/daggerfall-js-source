// @ts-check
// TOWN-SEATS: the Features row for the town seat mod - seats, influence and pledges, the weekly Turning, holding with the
// Tithe and Edicts, sieges and the Royal Tourney (net/townSeatBook.js is the client's half; the account service's half is
// switched by its SEATS_OPEN setting: off, dev, on). Online the lane forces the row on and the service's switch is the
// server's pin; off, this client reads no seat, draws no banner, mark or tab, and asks the service nothing. DFU has no
// player-held towns, so off is DFU's own towns. Its own file keeps systems/features.js from growing.
import { t } from '../textManager.js';

/** The pref the row writes and world.js reads. */
export const TOWN_SEATS_PREF = 'townSeats';

export const TOWN_SEATS_ROW = Object.freeze({
  id: 'town-seats',
  group: 'world',
  get title() {
    return t('features.townSeats.title', 'Town seats');
  },
  get note() {
    return t(
      'features.townSeats.note',
      'Guilds hold the Charter of a town seat, pledge to it, and fight sieges for it; a crown city holds a Royal Tourney. Off, towns are as in Daggerfall. Online it follows the server.',
    );
  },
  get effect() {
    return t('features.townSeats.effect', 'Takes effect the next time you load a place.');
  },
  kinds: Object.freeze(['enhanced']),
  control: Object.freeze({ store: 'prefs', key: TOWN_SEATS_PREF, initial: true, online: 'room' }),
});
