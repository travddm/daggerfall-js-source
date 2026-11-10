// Whether a foe caught open takes extra damage: a staggered foe x1.25 and an overreached one x1.3 (ai/tells.js
// STAGGER_TAKEN, PUNISH_TAKEN; registered in ai/tactics.js). DFU's blows do the same damage whatever the foe is doing,
// so DFU's damage is the default: a stagger and an overreach still stop the foe, and a blow on it does what any blow
// does. The `openingDamage` pref (a Features row, opening-damage-row.ts) keeps the multipliers as an option. Pinned off
// online (net/profile/officialProfile.ts).

import { getPref } from '../systems/uiPrefs.js';

export const OPENING_DAMAGE_PREF = 'openingDamage';

/** Whether a staggered or overreached foe takes the extra damage. Read at every blow. */
export const openingDamageOn = (): boolean => getPref(OPENING_DAMAGE_PREF) === true;
