// @ts-check
// TOWN-SEATS: whether the seat mod is on for this client (townSeatsRow.js is the Features row; it cannot read the pref
// itself, since uiPrefs.js imports the rows' defaults).
import { getPref } from '../uiPrefs.js';
import { TOWN_SEATS_PREF } from './townSeatsRow.js';

/** Is the seat mod on? (Unset reads on, as the row's default.) */
export const townSeatsOn = () => getPref(TOWN_SEATS_PREF) !== false;
/** Does this page ask the account service about seats: online, with the mod on? */
export const townSeatsOnline = (params) => params.has('online') && townSeatsOn();
