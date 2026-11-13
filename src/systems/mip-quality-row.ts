// The Mip quality row, a Features row over the `mipQuality` preference (render/mip-upload.ts). Standard builds a world
// texture's smaller levels with the driver's box average, as Daggerfall Unity does (Texture2D.Apply with mipmaps).
// Sharp builds them in linear light with a sharper filter and keeps the coverage of cut-outs, so distant textures stay
// clearer. It goes beyond DFU, which has no such setting.
// The row's preference and default live here, not in the render module: features.js imports this file, and uiPrefs.js
// imports features.js, so this file must not reach uiPrefs.js.
import { t } from './textManager.js';

export const MIP_QUALITY_PREF = 'mipQuality';

/** The row's default. */
export const MIP_QUALITY_DEFAULT = 'sharp';

type Tier = readonly [string, string];

type MipQualityRow = {
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

/** A tier whose label is read in the player's language when it is shown. */
const tier = (value: string, label: () => string): Tier =>
  Object.freeze(Object.defineProperty([value], 1, { enumerable: true, get: label }) as unknown as Tier);

export const MIP_QUALITY_ROW: MipQualityRow = Object.freeze({
  id: 'mip-quality',
  group: 'sight',
  get title() {
    return t('features.mipQuality.title', 'Mip quality');
  },
  get note() {
    return t(
      'features.mipQuality.note',
      'How clear textures stay in the distance. Standard is the box average Daggerfall Unity uses. Sharp keeps more ' +
        'detail and keeps trees and signs from thinning out. Changing it rebuilds the loaded textures, which can ' +
        'pause the game for a moment.',
    );
  },
  get effect() {
    return t('features.effect.atOnce', 'Takes effect at once.');
  },
  kinds: Object.freeze(['enhanced', 'classic']),
  control: Object.freeze({
    store: 'prefs',
    key: MIP_QUALITY_PREF,
    initial: MIP_QUALITY_DEFAULT,
    online: 'player',
    tiers: Object.freeze([
      tier('standard', () => t('features.mipQuality.standard', 'Standard')),
      tier('sharp', () => t('features.mipQuality.sharp', 'Sharp')),
    ]),
  }),
});
