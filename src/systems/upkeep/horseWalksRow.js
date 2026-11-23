// @ts-check
// HORSE-WALK: the Features row for the cared-for horse's walk (systems/upkeep/horseWalks.js reads its pref). Off is DFU's:
// the horse rides at its own pace. On, horse care walks the horse until you hold Run. The player's own online, as Horse
// care is.
import { t } from '../textManager.js';

export const HORSE_WALKS_ROW = Object.freeze({
  id: 'horse-walks',
  group: 'world',
  get title() {
    return t('features.horseWalks.title', 'Horse walks');
  },
  get note() {
    return t(
      'features.horseWalks.note',
      'Horse care walks your horse until you hold Run. Off is the original: it rides at its own pace. Online, each player picks their own.',
    );
  },
  get effect() {
    return t('features.horseWalks.effect', 'Takes effect at once.');
  },
  kinds: Object.freeze(['enhanced']),
  control: Object.freeze({ store: 'prefs', key: 'horseWalks', initial: false, online: 'player' }),
});
