// The port's limits on spell absorption (ABSORB-NERF), as one player option. DFU absorbs a destruction spell outright
// from an item that absorbs spells, lets a Spell Absorption effect reach any chance, and gives the target back the whole
// cost of what it drank (EntityEffectManager.TryAbsorption, :1160-1200). The port's limits: the item absorbs on a 50%
// roll, the effect's chance and the Spell Maker's chance stop at 50, and the refund is half the points drunk. The
// `absorptionLimits` pref (a Features row, absorption-limits-row.ts): off is DFU's, on is the limits. Pinned off online
// (net/profile/officialProfile.ts).

import { getPref } from './uiPrefs.js';

export const ABSORPTION_LIMITS_PREF = 'absorptionLimits';

/** Whether the port's absorption limits apply. Read at every absorb and every Spell Maker change. */
export const absorptionLimitsOn = (): boolean => getPref(ABSORPTION_LIMITS_PREF) === true;
