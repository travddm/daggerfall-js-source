// @ts-check
// PROFESSION-CAPS: the day's bound on a profession track, and the level gate on a crafted Rare - the law both ends read.
//
// A TRACK'S DAY. A character does at most PROF_DAY_CAP.gathering harvests a UTC day on a gathering track and
// PROF_DAY_CAP.crafting crafts on a crafting track (professionLaw.js PROFESSIONS' `kind`). Daggerfall has no
// professions, so the bound is the port's own; the account service pins it, and its PROF_DAY_CAPS setting ("off") lifts it
// where an operator wants no cap.
//
// A CRAFTED RARE PASSES THE LEVEL GATE. A Masterwork piece is Rare (recipeLaw.js QUALITY_EFFECTS). Under it a Rare drop
// is held back by the roller's level (systems/loot/lootLevelGate.js); a crafter below the gate's level gets a Superior
// (Magic) piece in the Masterwork's place, on the roll.
import { rareGate } from '../systems/loot/lootLevelGate.js';
import { MASTERWORK } from './recipeLaw.js';

/** Most harvests (gathering) or crafts (crafting) a character does on one track in a UTC day. */
export const PROF_DAY_CAP = Object.freeze({ gathering: 60, crafting: 40 });

/** The service's switch: the caps stand unless its PROF_DAY_CAPS setting says "off". */
export const profCapsOn = (env) => String(env?.PROF_DAY_CAPS ?? 'on').toLowerCase() !== 'off';

/** The Masterwork a crafter's level opens: below the Rare gate's roll it is a Superior. `roll()` answers [0, 1) and is
 *  asked only for a Masterwork of a crafter whose level is known. */
export function gateMasterwork(quality, level, roll) {
  if (quality !== MASTERWORK || level == null) return quality;
  return roll() >= rareGate(level) ? MASTERWORK - 1 : quality;
}
