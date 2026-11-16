// @ts-check
// THE ONE PLACE WEAPON TECHNIQUES MEET LOOT RARITY. Techniques work on any weapon; when Loot rarity is on it extends them:
// a drop may carry a technique line that picks the technique and adds power. Nothing else in the techniques imports the
// ladder, and the ladder imports no techniques code: it offers `registerTechniqueRoster`, and this module registers here.
import { registerTechniqueRoster, lootRarityOn, techniqueLineOf, rarityKnown } from '../../systems/loot/lootRarity.js';
import {
  TECHNIQUE_IDS,
  TECHNIQUE_BANDS,
  TECHNIQUE_PER_MILLE,
  techniqueById,
  techniquesFor,
  techniqueBrief,
  techniqueParts,
} from './techniqueRoster.js';
import { techniquesOn } from './techniquesOn.js';

registerTechniqueRoster({
  ids: TECHNIQUE_IDS,
  bands: TECHNIQUE_BANDS,
  perMille: TECHNIQUE_PER_MILLE,
  on: techniquesOn,
  byId: techniqueById,
  forItem: techniquesFor,
  brief: techniqueBrief,
  parts: techniqueParts,
});

/** Whether the ladder is on. With it off, techniques fall back to each weapon family's first technique. */
export const rarityOn = lootRarityOn;
/** The technique line a piece carries, or null. A line is a Loot rarity extension, so it answers only while the ladder is on. */
export const rarityLineOf = (item) => (lootRarityOn() ? techniqueLineOf(item) : null);
/** Whether the piece's technique line is identified (an unknown piece hides its technique's name). */
export const rarityKnownOf = rarityKnown;
