// @ts-check
// REVENANTS: whether the revenants row is on for this client (revenantsRow.js is the Features row; it cannot read the pref
// itself, since uiPrefs.js imports the rows' defaults).
import { getPref } from '../uiPrefs.js';
import { REVENANTS_PREF } from './revenantsRow.js';

/** Is the revenants row on? (Unset reads on, as the row's default.) */
export const revenantsRowOn = () => getPref(REVENANTS_PREF) !== false;
