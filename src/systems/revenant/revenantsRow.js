// @ts-check
// REVENANTS: the Features row for the returning-nemesis mod - a foe that escapes the player comes back stronger, can be
// beaten into yielding, and can be sworn as a companion (systems/revenant/revenant.js). Off is Daggerfall's own foes: none
// is made, flees or returns. The mod needs no other mod: Loot rarity only rarefies the trophy, and nothing here waits on
// Renown unless the player sets a threshold. Online the lane forces every choice but the Renown wait to its default, so a
// room plays one way. Its own file keeps systems/features.js from growing.
import { t } from '../textManager.js';

/** @param {string} value @param {() => string} label */
const tier = (value, label) => Object.freeze(Object.defineProperty([value], 1, { enumerable: true, get: label }));

/** The pref the row writes and revenant.js reads (revenantsOn.js). */
export const REVENANTS_PREF = 'revenants';
/** The row's choices, their prefs and defaults (revenantsOn.js reads them). */
export const REVENANT_CHOICES = Object.freeze({
  who: Object.freeze({ key: 'revenantWho', initial: 'any' }),
  renown: Object.freeze({ key: 'revenantRenown', initial: 'none' }),
  spare: Object.freeze({ key: 'revenantSpare', initial: 'join' }),
  rank: Object.freeze({ key: 'revenantRank', initial: '2' }),
  flee: Object.freeze({ key: 'revenantFlee', initial: 'normal' }),
  back: Object.freeze({ key: 'revenantReturn', initial: 'normal' }),
});
// The Renown wait is the player's own pace (their own revenants, held on their client, as before), so online it stays theirs; the rest the room fixes.
const choice = (/** @type {{ key: string, initial: string }} */ c) =>
  Object.freeze({
    store: 'prefs',
    key: c.key,
    initial: c.initial,
    online: c === REVENANT_CHOICES.renown ? 'player' : c.initial,
  });
const part = (/** @type {{ key: string }} */ c, /** @type {() => string} */ label, /** @type {any[]} */ tiers) =>
  Object.freeze({
    key: c.key,
    get label() {
      return label();
    },
    tiers: Object.freeze(tiers),
  });

export const REVENANTS_ROW = Object.freeze({
  id: 'revenants',
  group: 'loot',
  get title() {
    return t('features.revenants.title', 'Revenants');
  },
  get note() {
    return t(
      'features.revenants.note',
      'A foe that escapes can return stronger, yield, and be sworn to you. Off, foes are as in Daggerfall. Online the room uses the defaults, except the Renown wait.',
    );
  },
  get effect() {
    return t('features.revenants.effect', 'Takes effect the next time a foe flees or falls.');
  },
  kinds: Object.freeze(['enhanced']),
  control: Object.freeze({
    store: 'prefs',
    key: REVENANTS_PREF,
    initial: true,
    online: true,
    also: Object.freeze(Object.values(REVENANT_CHOICES).map(choice)),
    parts: Object.freeze([
      part(REVENANT_CHOICES.who, () => t('features.revenants.who', 'Who rises'), [
        tier('any', () => t('features.revenants.who.any', 'Any foe')),
        tier('elite', () => t('features.revenants.who.elite', 'Elites and champions')),
      ]),
      part(REVENANT_CHOICES.renown, () => t('features.revenants.renown', 'Renown needed'), [
        tier('none', () => t('features.revenants.renown.none', 'None')),
        tier('5', () => t('features.revenants.renown.5', 'Renown 5')),
        tier('10', () => t('features.revenants.renown.10', 'Renown 10')),
        tier('20', () => t('features.revenants.renown.20', 'Renown 20')),
      ]),
      part(REVENANT_CHOICES.spare, () => t('features.revenants.spare', 'A spared revenant'), [
        tier('join', () => t('features.revenants.spare.join', 'Joins you')),
        tier('leave', () => t('features.revenants.spare.leave', 'Leaves for good')),
      ]),
      part(REVENANT_CHOICES.rank, () => t('features.revenants.rank', 'Levels per rank'), [
        tier('1', () => t('features.revenants.rank.1', '1')),
        tier('2', () => t('features.revenants.rank.2', '2')),
        tier('3', () => t('features.revenants.rank.3', '3')),
      ]),
      part(REVENANT_CHOICES.flee, () => t('features.revenants.flee', 'Flight'), [
        tier('rare', () => t('features.revenants.flee.rare', 'Rare')),
        tier('normal', () => t('features.revenants.flee.normal', 'Normal')),
        tier('often', () => t('features.revenants.flee.often', 'Often')),
      ]),
      part(REVENANT_CHOICES.back, () => t('features.revenants.back', 'Return'), [
        tier('soon', () => t('features.revenants.back.soon', 'About a day')),
        tier('normal', () => t('features.revenants.back.normal', 'One to three days')),
        tier('late', () => t('features.revenants.back.late', 'Three to seven days')),
      ]),
    ]),
  }),
});
