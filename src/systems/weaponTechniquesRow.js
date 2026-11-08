// @ts-check
// WEAPON-TECHNIQUES-SETTING: the Features row for the twelve weapon techniques (combat/technique/techniqueRoster.js). It
// is the only switch the techniques have: they work with Loot rarity on or off, and rarity adds drops that carry a stronger
// one. Off, a found technique line sleeps and its key is free; the loot ladder is untouched. Its own file keeps
// systems/features.js from growing (docs/testing/lint-ratchet.md).
import { t } from './textManager.js';

export const WEAPON_TECHNIQUES_ROW = Object.freeze({
  id: 'weapon-techniques',
  group: 'loot',
  get title() {
    return t('features.weaponTechniques.title', 'Weapon techniques');
  },
  get note() {
    return t(
      'features.weaponTechniques.note',
      'Every weapon has a technique: a special attack on its own key, with a cooldown and a fatigue cost. With Loot rarity on, a weapon may drop with a stronger one.',
    );
  },
  get effect() {
    return t(
      'features.weaponTechniques.effect',
      'Takes effect at once; a technique line already on a weapon sleeps while this is off.',
    );
  },
  kinds: Object.freeze(['enhanced']),
  control: Object.freeze({ store: 'prefs', key: 'weaponTechniques', initial: true, online: true }),
});
