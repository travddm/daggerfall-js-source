// @ts-check
// F3b: the Features row for the size and length of the Climates & Calories boons (survival/boonProfile.js reads its pref).
// Its own file keeps systems/features.js from growing (docs/testing/lint-ratchet.md).
import { t } from './textManager.js';

/** @param {string} value @param {() => string} label */
const tier = (value, label) => Object.freeze(Object.defineProperty([value], 1, { enumerable: true, get: label }));

export const BOON_SIZE_ROW = Object.freeze({
  id: 'boon-size',
  group: 'character',
  get title() {
    return t('features.boonSize.title', 'Boon size');
  },
  get note() {
    return t(
      'features.boonSize.note',
      'How much staying fed, watered and rested gives, and a horse\u2019s bond. None is the classic game: no bonus at all. Small gives one or two points for two hours, and a rest lasts four hours. Original gives five points on seven attributes, for longer.',
    );
  },
  get effect() {
    return t('features.boonSize.effect', 'Takes effect at once. Online, the room uses Small.');
  },
  kinds: Object.freeze(['enhanced']),
  control: Object.freeze({
    store: 'prefs',
    key: 'boonSize',
    initial: 'small',
    online: 'small',
    tiers: Object.freeze([
      tier('none', () => t('features.boonSize.none', 'None')),
      tier('small', () => t('features.boonSize.small', 'Small')),
      tier('mod', () => t('features.boonSize.mod', 'Original')),
    ]),
  }),
});
