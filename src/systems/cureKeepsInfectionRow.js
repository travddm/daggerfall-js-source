// @ts-check
// INFECTION-KEPT: the Features row for whether a cure of disease leaves a vampirism or lycanthropy infection alone
// (systems/cureKeepsInfection.js reads its pref). Off is DFU's: a cure ends every disease. Forced off online: the room's
// temples and potions answer one way. Its own file keeps systems/features.js from growing.
import { t } from './textManager.js';

export const CURE_KEEPS_INFECTION_ROW = Object.freeze({
  id: 'cure-keeps-infection',
  group: 'character',
  get title() {
    return t('features.cureKeepsInfection.title', 'Cure keeps infection');
  },
  get note() {
    return t(
      'features.cureKeepsInfection.note',
      'A cure ends every disease, as in the original. On, it leaves vampirism or lycanthropy while you have a plain disease. Online it is always off.',
    );
  },
  get effect() {
    return t('features.cureKeepsInfection.effect', 'Takes effect on the next cure.');
  },
  kinds: Object.freeze(['enhanced']),
  control: Object.freeze({ store: 'prefs', key: 'cureKeepsInfection', initial: false, online: 'room' }),
});
