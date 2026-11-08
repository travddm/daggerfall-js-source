// @ts-check
// LOCKPICK-MODE: the Features row for how a lock is picked (systems/lockpick/lockpickMode.js reads its pref). Off is DFU's:
// one skill roll, no item. On plays the tumbler window and spends a Lockpick that snaps. Forced off online.
import { t } from '../textManager.js';

export const LOCKPICK_TUMBLERS_ROW = Object.freeze({
  id: 'lockpick-tumblers',
  group: 'character',
  get title() {
    return t('features.lockpickTumblers.title', 'Lockpick puzzle');
  },
  get note() {
    return t(
      'features.lockpickTumblers.note',
      'Picking a lock plays a puzzle and a lockpick can snap. Off is the original: one roll of your skill, no lockpick needed. Online it is always off.',
    );
  },
  get effect() {
    return t('features.lockpickTumblers.effect', 'Takes effect on the next lock.');
  },
  kinds: Object.freeze(['enhanced']),
  control: Object.freeze({ store: 'prefs', key: 'lockpickTumblers', initial: false, online: false }),
});
