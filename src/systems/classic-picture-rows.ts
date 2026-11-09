// The Features rows for the original game's picture. Three are doors over Daggerfall Unity's retro mode
// (systems/retroMode.js), each over one of DFU's own [Video] keys, so a DFU settings file keeps its meaning. The keys
// alone sat under DFU's names in the Retro look section, where few players looked. Mip maps and the palette shift stay
// plain keys there. The fourth, classic distance shading (render/classic-distance-shading.ts), is this game's own.
import { t, localizedText } from './textManager.js';

type SettingsRow = {
  readonly id: string;
  readonly group: 'sight';
  readonly title: string;
  readonly note: string;
  readonly effect: string;
  readonly kinds: readonly string[];
  readonly control: { readonly store: 'settings'; readonly key: string };
};

type Tier = readonly [string, string];

type PrefsRow = Omit<SettingsRow, 'control'> & {
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

const takesEffectAtOnce = (): string => t('features.effect.atOnce', 'Takes effect at once.');

const CLASSIC_PICTURE_ROW: SettingsRow = Object.freeze({
  id: 'classic-picture',
  group: 'sight',
  get title() {
    return t('features.classicPicture.title', 'Classic picture');
  },
  get note() {
    return t(
      'features.classicPicture.note',
      'Draws the world at 320x200, the original game’s size, and shows it with square pixels. 640x400 is ' +
        'sharper: the original never drew at that size. Render scale does nothing while this is on.',
    );
  },
  get effect() {
    return takesEffectAtOnce();
  },
  kinds: Object.freeze(['classic']),
  control: Object.freeze({ store: 'settings', key: 'Video/RetroRenderingMode' }),
});

const CLASSIC_ASPECT_ROW: SettingsRow = Object.freeze({
  id: 'classic-aspect',
  group: 'sight',
  get title() {
    return t('features.classicAspect.title', 'Classic aspect');
  },
  get note() {
    return t(
      'features.classicAspect.note',
      'Works with Classic picture. 4:3 shows the picture at the shape an old monitor gave it, with black bars at the ' +
        'sides. 16:10 shows it at its own shape. Off stretches it to fill the window.',
    );
  },
  get effect() {
    return takesEffectAtOnce();
  },
  kinds: Object.freeze(['classic']),
  control: Object.freeze({ store: 'settings', key: 'Video/RetroModeAspectCorrection' }),
});

const CLASSIC_COLOURS_ROW: SettingsRow = Object.freeze({
  id: 'classic-colours',
  group: 'sight',
  get title() {
    return t('features.classicColours.title', 'Classic colours');
  },
  get note() {
    return t(
      'features.classicColours.note',
      'Works with Classic picture. Palettization draws every pixel in one of the original game’s 256 colours. ' +
        'Posterization cuts each colour to 16 levels. The (-sky) choices leave the sky as it is.',
    );
  },
  get effect() {
    return takesEffectAtOnce();
  },
  kinds: Object.freeze(['classic']),
  control: Object.freeze({ store: 'settings', key: 'Video/PostProcessingInRetroMode' }),
});

/** Off by default (decision 104). Both choices are route A, and they differ only in where the steps lead (decision 126).
 *  Route B, the original palette tables, would be a choice of its own. */
const CLASSIC_DISTANCE_SHADING_ROW: PrefsRow = Object.freeze({
  id: 'classic-distance-shading',
  group: 'sight',
  get title() {
    return t('features.classicDistanceShading.title', 'Classic distance shading');
  },
  get note() {
    return t(
      'features.classicDistanceShading.note',
      'Darkens the world in 64 steps with distance, as the original game did. To black: dungeons and buildings go to ' +
        'black, and the outdoors to the fog colour. To fog colour: every place goes to its own fog colour, so a mod ' +
        'that colours the fog, as Better Ambience does in dungeons, tints the far view. Made for Classic picture, but ' +
        'it works without it. The original game picked one step for each surface; this picks one for each pixel.',
    );
  },
  get effect() {
    return takesEffectAtOnce();
  },
  kinds: Object.freeze(['enhanced']),
  control: Object.freeze({
    store: 'prefs',
    key: 'classicDistanceShading',
    initial: 'off',
    online: 'player',
    tiers: Object.freeze([
      tier('off', () => localizedText('off', 'Off')),
      tier('black', () => t('features.classicDistanceShading.black', 'To black')),
      tier('fog', () => t('features.classicDistanceShading.fog', 'To fog colour')),
    ]),
  }),
});

/** In the order the Features home draws them. */
export const CLASSIC_PICTURE_ROWS: readonly (SettingsRow | PrefsRow)[] = Object.freeze([
  CLASSIC_PICTURE_ROW,
  CLASSIC_ASPECT_ROW,
  CLASSIC_COLOURS_ROW,
  CLASSIC_DISTANCE_SHADING_ROW,
]);
