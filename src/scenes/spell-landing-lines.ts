// The HUD lines DFU's EntityEffectManager.AssignBundle prints when a spell lands and an effect fails.
//
// "Spell was absorbed." prints for any target. The failure lines print when the target is the player, or when the
// bundle came with ShowNonPlayerFailures, which DFU's missile (DaggerfallMissile.AssignPayloadToTargets) and Cast
// When Strikes set. Every spell the player aims at a foe comes that way, so a foe's absorb, failed chance and saving
// throw all show. The other AssignBundle lines (reflection, paralysis) are the player's alone.

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

/**
 * A landing on a foe. A foe's sinks carry no say, so its absorb line is spoken here too. Another player's cast that
 * lands on a foe this client runs is that player's to hear, not this one's.
 */
export function sayFoeLandingFailures(
  landing: SpellLanding | null | undefined,
  say: (line: string) => void,
  peerCaster: string | null = null,
): void {
  if (!landing || peerCaster) return;
  if (landing.absorbed) say(localizedText('spellAbsorbed', 'Spell was absorbed.'));
  if (landing.chanceFailed) say(saveMade());
  if (landing.saved) say(saveMade());
}
