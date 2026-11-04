// @ts-check
// PROFESSION-CAPS: the day's bound on a profession track, and the level gate on a crafted Rare - the law both ends read.
//
// A TRACK'S DAY. A character does at most PROF_DAY_CAP.gathering harvests a UTC day on a gathering track and
// PROF_DAY_CAP.crafting acts on a crafting track (professionLaw.js PROFESSIONS' `kind`): a craft, a smelt, a brew, a
// disenchant or a reforge each count one. Daggerfall has no professions, so the bound is the port's own; the account
// service pins it, and its PROF_DAY_CAPS setting ("off") lifts it where an operator wants no cap.
//
// A CRAFTED RARE PASSES THE LEVEL GATE. A Masterwork piece is Rare (recipeLaw.js QUALITY_EFFECTS). Under it a Rare drop
// is held back by the roller's level (systems/loot/lootLevelGate.js); a crafter below the gate's level gets a Superior
// (Magic) piece in the Masterwork's place, on the roll. The service's PROF_MASTERWORK_GATE setting ("off") lifts the gate.
//
// THE TIER PRICES. The ores, ingots, planks, leathers and Arcane Essence are priced on DFU's own ingredient scale
// (systems/professions/profTemplates.js DFU_TIER_PRICE). The service's PROF_DFU_PRICES setting ("off") puts back the
// port's earlier scale; the service tells the client in its state read (`caps.prices`).
import { rareGate } from '../systems/loot/lootLevelGate.js';
import { MASTERWORK } from './recipeLaw.js';

/** Most harvests (gathering) or crafts (crafting) a character does on one track in a UTC day. */
export const PROF_DAY_CAP = Object.freeze({ gathering: 60, crafting: 40 });

/** The service's switch: the caps stand unless its PROF_DAY_CAPS setting says "off". */
export const profCapsOn = (env) => String(env?.PROF_DAY_CAPS ?? 'on').toLowerCase() !== 'off';

/** The service's switch for the Masterwork's level gate: it stands unless PROF_MASTERWORK_GATE says "off". */
export const masterworkGateOn = (env) => String(env?.PROF_MASTERWORK_GATE ?? 'on').toLowerCase() !== 'off';

/** The service's switch for the tier prices: DFU's scale stands unless PROF_DFU_PRICES says "off". */
export const dfuPricesOn = (env) => String(env?.PROF_DFU_PRICES ?? 'on').toLowerCase() !== 'off';

/** The gathering track each harvest kind raises (server-account/src/professions.js NODE_HARVESTS, by the kind a harvest
 *  names); the client reads it to learn which track a refused harvest closed. */
export const TRACK_OF_KIND = Object.freeze({
  ore: 'mining',
  stone: 'mining',
  logs: 'logging',
  herbs: 'herbalism',
  food: 'herbalism',
  hide: 'hunting',
  fish: 'fishing',
});

/** The Masterwork a crafter's level opens: below the Rare gate's roll it is a Superior. `roll()` answers [0, 1) and is
 *  asked only for a Masterwork of a crafter whose level is known. */
export function gateMasterwork(quality, level, roll) {
  if (quality !== MASTERWORK || level == null) return quality;
  return roll() >= rareGate(level) ? MASTERWORK - 1 : quality;
}
