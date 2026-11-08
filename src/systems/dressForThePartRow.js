// @ts-check
// DRESS1: the Features row for the clothing reaction (systems/dressForThePart.js reads its pref). Off is DFU's: what you wear
// changes nothing. On, common clothes please commoners, fine clothes the nobility and priest robes the temples. Forced off
// online.
import { t } from './textManager.js';

export const DRESS_FOR_THE_PART_ROW = Object.freeze({
  id: 'dress-for-the-part',
  group: 'world',
  get title() {
    return t('features.dressForThePart.title', 'Dress for the part');
  },
  get note() {
    return t(
      'features.dressForThePart.note',
      'Clothes change how people greet you: plain for commoners, fine for nobles, robes for temples. Off is the original. Online it is always off.',
    );
  },
  get effect() {
    return t('features.dressForThePart.effect', 'Takes effect within a few seconds.');
  },
  kinds: Object.freeze(['enhanced']),
  control: Object.freeze({ store: 'prefs', key: 'dressForThePart', initial: false, online: false }),
});
