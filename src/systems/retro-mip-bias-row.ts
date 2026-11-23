// The Retro Mip Bias row, a Features row over the `retroMipBias` preference (render/retro-sharp.ts). DFU sets a mip
// bias of -0.75 on its world textures whenever retro mode is on (TextureReader, the albedo's mipMapBias) and fixes that
// value in code; this row goes beyond DFU and lets the player choose it, with DFU's value the default. The bias only
// acts on mip chains, and the retro modes keep none unless Retro Mip Maps is on, so the row is inactive until then.
// The row's preference and default live here, not in the render module: features.js imports this file, and uiPrefs.js
// imports features.js, so this file must not reach uiPrefs.js.
import { t } from './textManager.js';
import { retroUseMipMaps } from './retroMode.js';

export const RETRO_MIP_BIAS_PREF = 'retroMipBias';

/** DFU's retro mip bias, in levels. */
export const RETRO_MIP_BIAS_DEFAULT = -0.75;

/** The row's range, in levels: 0 (no bias) to -2, in quarter levels. */
export const RETRO_MIP_BIAS_MIN = -2;
export const RETRO_MIP_BIAS_STEP = 0.25;

type Tier = readonly [number, string];

type RetroMipBiasRow = {
  readonly id: string;
  readonly group: 'sight';
  readonly title: string;
  readonly note: string;
  readonly effect: string;
  readonly kinds: readonly string[];
  /** Why the row has no effect now, or null when it has. The settings screen draws the row disabled with this reason,
   *  and hands in the preference reader, which this row does not need. */
  readonly inactive: () => string | null;
  readonly control: {
    readonly store: 'prefs';
    readonly key: string;
    readonly initial: number;
    readonly online: 'player';
    readonly tiers: readonly Tier[];
  };
};

const TIER_COUNT = Math.round(-RETRO_MIP_BIAS_MIN / RETRO_MIP_BIAS_STEP) + 1;

const TIERS: readonly Tier[] = Object.freeze(
  Array.from({ length: TIER_COUNT }, (_, i) => {
    const bias = i === 0 ? 0 : -i * RETRO_MIP_BIAS_STEP;
    return Object.freeze([bias, String(bias)] as const);
  }),
);

export const RETRO_MIP_BIAS_ROW: RetroMipBiasRow = Object.freeze({
  id: 'retro-mip-bias',
  group: 'sight',
  get title() {
    return t('features.retroMipBias.title', 'Retro Mip Bias');
  },
  get note() {
    return t(
      'features.retroMipBias.note',
      'How clear distant textures are in Retro Rendering Mode with the Sharp texture filter. Lower is clearer. ' +
        'Daggerfall Unity uses -0.75 and does not let you change it. It has an effect only when Retro Mip Maps is on.',
    );
  },
  get effect() {
    return t('features.effect.atOnce', 'Takes effect at once.');
  },
  kinds: Object.freeze(['enhanced', 'classic']),
  inactive: () => (retroUseMipMaps() ? null : t('features.retroMipBias.inactive', 'Needs Retro Mip Maps on')),
  control: Object.freeze({
    store: 'prefs',
    key: RETRO_MIP_BIAS_PREF,
    initial: RETRO_MIP_BIAS_DEFAULT,
    online: 'player',
    tiers: TIERS,
  }),
});
