// The Features row for the extra damage a foe caught open takes (ai/opening-damage.ts reads its pref). Off is DFU's
// damage. On, a staggered foe takes a quarter more from every blow, and an overreached one 30% more. It acts only with
// Enhanced AI, which makes the staggers and overreaches. Pinned off online.
import { t } from '../systems/textManager.js';

export const OPENING_DAMAGE_ROW = Object.freeze({
  id: 'opening-damage',
  group: 'combat',
  get title(): string {
    return t('features.openingDamage.title', 'Openings take extra damage');
  },
  get note(): string {
    return t(
      'features.openingDamage.note',
      'With Enhanced AI, a staggered enemy takes a quarter more damage and an enemy that missed a telegraphed blow takes 30% more. Off is the original damage. Online it is always off.',
    );
  },
  get effect(): string {
    return t('features.openingDamage.effect', 'Takes effect at the next blow.');
  },
  kinds: Object.freeze(['enhanced']),
  control: Object.freeze({ store: 'prefs', key: 'openingDamage', initial: false, online: 'room' }),
});
