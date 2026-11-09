// @ts-check
// REVENANTS: what the player chose in the revenants row, read where the mod acts (revenantsRow.js is the Features row; it
// cannot read the prefs itself, since uiPrefs.js imports the rows' defaults). A pref that holds anything else reads as
// the row's default.
import { getPref } from '../uiPrefs.js';
import { REVENANTS_PREF, REVENANT_CHOICES as C } from './revenantsRow.js';

/** Is the revenants row on? (Unset reads on, as the row's default.) */
export const revenantsRowOn = () => getPref(REVENANTS_PREF) !== false;
const read = (/** @type {{ key: string, initial: string }} */ c, /** @type {readonly string[]} */ allowed) => {
  const v = getPref(c.key);
  return typeof v === 'string' && allowed.includes(v) ? v : c.initial;
};

/** May any regular foe rise, or only an elite or a champion? */
export const revenantAnyFoe = () => read(C.who, ['any', 'elite']) === 'any';
/** The Renown a character needs online before revenants come (0: none). Offline there is no Renown to wait for. */
export const revenantRenownMin = () => Number(read(C.renown, ['none', '5', '10', '20'])) || 0;
/** Does a spared revenant join the retinue? Else it swears off the feud and leaves for good. */
export const revenantSpareJoins = () => read(C.spare, ['join', 'leave']) === 'join';
/** A class foe's levels over the player's per rank (DFU-free: the mod's own scale, 2 by default). */
export const revenantLevelsPerRank = () => Number(read(C.rank, ['1', '2', '3']));
/** What multiplies the flee chances (5% for a special foe, 15% for a revenant). */
export const revenantFleeFactor = () => ({ rare: 0.5, normal: 1, often: 2 })[read(C.flee, ['rare', 'normal', 'often'])];
/** The days a revenant takes to come back: [min, max] in game minutes. */
export const revenantReturnWindow = () => ({ soon: [1440, 1440], normal: [1440, 4320], late: [4320, 10080] })[read(C.back, ['soon', 'normal', 'late'])];
