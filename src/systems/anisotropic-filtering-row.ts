// The Anisotropic Filtering row, a Features row over the `anisotropicFiltering` preference (render/anisotropic-
// filtering.ts). It goes beyond DFU, which has no such setting: DFU fixes 8x on its terrain and takes the rest from
// Unity's quality levels, which Detail Level copies into this row when the player changes it.
// The row's preference and default live here, not in the render module: features.js imports this file, and uiPrefs.js
// imports features.js, so this file must not reach uiPrefs.js.
import { t, localizedText } from './textManager.js';

export const ANISOTROPY_PREF = 'anisotropicFiltering';

/** The row's default: 8x, DFU's terrain level, and the level the forced quality levels set. */
export const ANISOTROPY_DEFAULT = 8;

type Tier = readonly [string | number, string];

type AnisotropyRow = {
  readonly id: string;
  readonly group: 'sight';
  readonly title: string;
  readonly note: string;
  readonly effect: string;
  readonly kinds: readonly string[];
  readonly control: {
    readonly store: 'prefs';
    readonly key: string;
    readonly initial: number;
    readonly online: 'player';
    readonly tiers: readonly Tier[];
  };
};

/** A tier whose label is read in the player's language when it is shown. */
const tier = (value: string | number, label: () => string): Tier =>
  Object.freeze(Object.defineProperty([value], 1, { enumerable: true, get: label }) as unknown as Tier);

const times = (level: number): Tier => tier(level, () => `${level}x`);

export const ANISOTROPIC_FILTERING_ROW: AnisotropyRow = Object.freeze({
  id: 'anisotropic-filtering',
  group: 'sight',
  get title() {
    return t('features.anisotropicFiltering.title', 'Anisotropic filtering');
  },
  get note() {
    return t(
      'features.anisotropicFiltering.note',
      'How clear textures stay when you see them at a slant, such as the ground ahead. Higher is clearer and costs ' +
        'more on slow machines. Per texture is Daggerfall Unity’s own: 8x on the ground, none elsewhere. No effect ' +
        'with the Point texture filter. Detail Level sets it.',
    );
  },
  get effect() {
    return t('features.effect.atOnce', 'Takes effect at once.');
  },
  kinds: Object.freeze(['enhanced', 'classic']),
  control: Object.freeze({
    store: 'prefs',
    key: ANISOTROPY_PREF,
    initial: ANISOTROPY_DEFAULT,
    online: 'player',
    tiers: Object.freeze([
      tier('off', () => localizedText('off', 'Off')),
      tier('texture', () => t('features.anisotropicFiltering.texture', 'Per texture')),
      times(2),
      times(4),
      times(8),
      times(16),
    ]),
  }),
});
