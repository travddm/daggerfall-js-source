// @ts-check
// REPAIR-PRICE: the Features row for what a smith charges (systems/repairPriceByDamage.js reads its pref). Off is DFU's
// tenth of the item's value; on is Roleplay & Realism: Items' price, which grows with the damage. Forced off online.
import { t } from './textManager.js';

export const REPAIR_PRICE_ROW = Object.freeze({
  id: 'repair-price-by-damage',
  group: 'world',
  get title() {
    return t('features.repairPriceByDamage.title', 'Repair price by damage');
  },
  get note() {
    return t(
      'features.repairPriceByDamage.note',
      'A smith charges more for a more damaged item. Off is the original: a tenth of the value. Online it is always off.',
    );
  },
  get effect() {
    return t('features.repairPriceByDamage.effect', 'Takes effect at the next quote.');
  },
  kinds: Object.freeze(['enhanced']),
  control: Object.freeze({ store: 'prefs', key: 'repairPriceByDamage', initial: false, online: 'room' }),
});
