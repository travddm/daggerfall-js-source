// The HUD lines DFU's EntityEffectManager.AssignBundle prints when a spell lands and an effect fails.

import { localizedText } from '../systems/textManager.js';

/** The counts applySpell returns that these lines read. */
export interface SpellLanding {
  absorbed?: number;
  chanceFailed?: number;
  saved?: number;
}

const saveMade = (): string => localizedText('saveVersusSpellMade', 'Save versus spell made.');

/**
 * The player's own landing. A failed chance on a CasterOnly spell says "Spell effect failed."; on any other spell
 * it is a save. The player's absorb line comes from applySpell itself, through the player's sinks.
 */
export function sayPlayerLandingFailures(
  landing: SpellLanding,
  say: (line: string) => void,
  casterOnly: boolean,
): void {
  if (landing.chanceFailed) say(casterOnly ? localizedText('spellEffectFailed', 'Spell effect failed.') : saveMade());
  if (landing.saved) say(saveMade());
}
