// @ts-check
// CLAW-METAL: the Features row for whether a werewolf's claws take the metal of its gauntlets (combat/clawMetal.js reads
// its pref). Off is DFU's: the beast's claws are the bare hand (FormulaHelper.cs CalculateHandToHandAttackDamage reads no
// item). Online the room's answer is the server profile's. Its own file keeps systems/features.js from growing.
import { t } from '../systems/textManager.js';

export const CLAW_METAL_ROW = Object.freeze({
  id: 'claw-metal',
  group: 'character',
  get title() {
    return t('features.clawMetal.title', 'Claws take gauntlet metal');
  },
  get note() {
    return t(
      'features.clawMetal.note',
      'In beast form, plate gauntlets add their metal to each claw hit, Elven 1 up to Daedric 6. Off is the original: bare claws. Online the server sets it.',
    );
  },
  get effect() {
    return t('features.clawMetal.effect', 'Takes effect on the next hit.');
  },
  kinds: Object.freeze(['enhanced']),
  control: Object.freeze({ store: 'prefs', key: 'clawMetal', initial: false, online: 'room' }),
});
