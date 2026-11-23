// The Close interior gaps row, a Features row over the `interiorSeams` preference. On, a building interior's wall
// pieces meet its floor and ceiling (world/interior/kit-wall-ends.ts, applied by interior-model-patches.js), the slits
// left between its models are filled (render/seam-fill.ts), each door is fitted to its own doorway and keeps that size
// as it swings, and a door that stands proud of its wall is set into it (door-frame-fit.ts); scenes/interiorContext.js
// applies the last three.
// Off is Daggerfall Unity's look, with the thin slits its models leave. The player's own online: the patched walls feed
// the collider as well, but no wall edge moves more than a unit (2.5 cm), and a door's collider keeps Daggerfall's
// size and moves at most 10 cm into its wall, so play is the same.
// This file must not reach uiPrefs.js: features.js imports it, and uiPrefs.js imports features.js.
import { t, localizedText } from './textManager.js';

type Tier = readonly [string, string];

type InteriorSeamsRow = {
  readonly id: string;
  readonly group: 'sight';
  readonly title: string;
  readonly note: string;
  readonly effect: string;
  readonly kinds: readonly string[];
  readonly control: {
    readonly store: 'prefs';
    readonly key: string;
    readonly initial: string;
    readonly online: 'player';
    readonly tiers: readonly Tier[];
  };
};

/** The preference's key, and its value when the row is off. */
export const INTERIOR_SEAMS_PREF = 'interiorSeams';
export const INTERIOR_SEAMS_OFF = 'off';

/** Whether the row is on, from the preference's stored value: on unless the player turned it off. */
export const interiorSeamsOn = (stored: unknown): boolean => stored !== INTERIOR_SEAMS_OFF;

/** A tier whose label is read in the player's language when it is shown. */
const tier = (value: string, label: () => string): Tier =>
  Object.freeze(Object.defineProperty([value], 1, { enumerable: true, get: label }) as unknown as Tier);

export const INTERIOR_SEAMS_ROW: InteriorSeamsRow = Object.freeze({
  id: 'interior-seams',
  group: 'sight',
  get title() {
    return t('features.interiorSeams.title', 'Close interior gaps');
  },
  get note() {
    return t(
      'features.interiorSeams.note',
      'Inside buildings, walls, floors and ceilings meet with no thin gap, and closed doors fill their frames. Off shows the gaps of the original models.',
    );
  },
  // the models are built once a session (scenes/dataPipeline.js)
  get effect() {
    return t('features.effect.nextStart', 'Takes effect the next time you start the game.');
  },
  kinds: Object.freeze(['enhanced', 'classic']),
  control: Object.freeze({
    store: 'prefs',
    key: INTERIOR_SEAMS_PREF,
    initial: 'on',
    online: 'player',
    tiers: Object.freeze([
      tier('on', () => t('menu.toggle.on', 'On')),
      tier(INTERIOR_SEAMS_OFF, () => localizedText('off', 'Off')),
    ]),
  }),
});
