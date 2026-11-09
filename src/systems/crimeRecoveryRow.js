// @ts-check
// F3a: the Features row for how fast a bad name recovers (systems/repRecovery.js reads its pref). DFU's pace, 4x it (the
// default) or 16x. Online the room uses the default: the row's `online` names the tier the lane forces
// (onlineLane.js declareOnlinePrefs). Its own file keeps systems/features.js from growing (docs/testing/lint-ratchet.md).
import { t } from './textManager.js';

/** @param {string} value @param {() => string} label */
const tier = (value, label) => Object.freeze(Object.defineProperty([value], 1, { enumerable: true, get: label }));

export const CRIME_RECOVERY_ROW = Object.freeze({
  id: 'crime-recovery',
  group: 'world',
  get title() {
    return t('features.crimeRecovery.title', 'Bad name recovery');
  },
  get note() {
    return t(
      'features.crimeRecovery.note',
      'A standing below zero with the law and the guilds climbs back toward zero over time. The classic game gives one point every 112 days. The default gives one point every 28 days. Fast gives one point every 7 days.',
    );
  },
  get effect() {
    return t('features.crimeRecovery.effect', 'Takes effect at once. Online, the room uses the default.');
  },
  kinds: Object.freeze(['enhanced']),
  control: Object.freeze({
    store: 'prefs',
    key: 'crimeRecovery',
    initial: 'x4',
    online: 'room',
    tiers: Object.freeze([
      tier('dfu', () => t('features.crimeRecovery.dfu', 'Classic')),
      tier('x4', () => t('features.crimeRecovery.x4', '4x')),
      tier('x16', () => t('features.crimeRecovery.x16', 'Fast')),
    ]),
  }),
});
