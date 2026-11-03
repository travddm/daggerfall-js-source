// @ts-check
// WEAPON-TECHNIQUES-SETTING: the Features row for the twelve weapon techniques (combat/technique/techniqueRoster.js). They
// rode the Loot rarity switch, so a player who wanted the ladder's gear but not the extra attack key (or the reverse) had no
// way to say so. Off, a found technique line sleeps and its key is free; the loot ladder is untouched. Its own file keeps
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
      'Some weapons carry a technique: a special attack on its own key, with a cooldown and a fatigue cost. Off, techniques do not drop. Needs Loot rarity on.',
    );
  },
  get effect() {
    return t(
      'features.weaponTechniques.effect',
      'Takes effect on the next drop; a technique already on a weapon sleeps while this is off.',
    );
  },
  kinds: Object.freeze(['enhanced']),
  control: Object.freeze({ store: 'prefs', key: 'weaponTechniques', initial: true, online: true }),
});
