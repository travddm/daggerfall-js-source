// The Ground sharpness row, a Features row over the `groundSharpness` preference (render/ground-sampler.ts): the ground's
// minification, the mip chain read nearest (Off, one fetch, the cheapest) or blended (trilinear). Its anisotropy is the
// Anisotropic Filtering row's. The player's own online.
// This file must not reach uiPrefs.js: features.js imports it, and uiPrefs.js imports features.js.
import { t, localizedText } from './textManager.js';
import { getInt } from './settings/settings.js';
import { ANISOTROPY_PREF } from './anisotropic-filtering-row.ts';
import { groundSharpnessInactive } from '../render/anisotropic-mip-filter.ts';

type Tier = readonly [string, string];

type GroundSharpnessRow = {
  readonly id: string;
  readonly group: 'sight';
  readonly title: string;
  readonly note: string;
  readonly effect: string;
  readonly kinds: readonly string[];
  /** Why the row has no effect now, or null when it has; `readPref` reads the Anisotropic Filtering row. */
  readonly inactive: (readPref?: (key: string) => unknown) => string | null;
  readonly control: {
    readonly store: 'prefs';
    readonly key: string;
    readonly initial: string;
    readonly online: 'player';
    readonly tiers: readonly Tier[];
  };
};

/** A tier whose label is read in the player's language when it is shown. */
const tier = (value: string, label: () => string): Tier =>
  Object.freeze(Object.defineProperty([value], 1, { enumerable: true, get: label }) as unknown as Tier);

export const GROUND_SHARPNESS_ROW: GroundSharpnessRow = Object.freeze({
  id: 'ground-sharpness',
  group: 'sight',
  get title() {
    return t('features.groundSharpness.title', 'Ground sharpness');
  },
  get note() {
    return t(
      'features.groundSharpness.note',
      'How smoothly the ground blends into the distance. Off is the cheapest. How clear it stays at a ' +
        'slant is Anisotropic filtering.',
    );
  },
  // the renderer re-filters the ground arrays on the frame after a change
  get effect() {
    return t('features.effect.atOnce', 'Takes effect at once.');
  },
  kinds: Object.freeze(['enhanced', 'classic']),
  // Off and Smooth draw alike where the driver drops the nearest mip for anisotropy (render/anisotropic-mip-filter.ts).
  inactive: (readPref) =>
    groundSharpnessInactive(
      readPref?.(ANISOTROPY_PREF),
      getInt('Video', 'MainFilterMode', 0, 3) === 0,
      t('features.groundSharpness.inactive', 'No effect while Anisotropic Filtering is on'),
    ),
  control: Object.freeze({
    store: 'prefs',
    key: 'groundSharpness',
    initial: 'default',
    online: 'player',
    tiers: Object.freeze([
      tier('off', () => localizedText('off', 'Off')),
      tier('default', () => t('features.groundSharpness.default', 'Smooth')),
    ]),
  }),
});
