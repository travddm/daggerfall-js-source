// The Features rows over Daggerfall Unity's retro mode (systems/retroMode.js). Each row is a door over one of DFU's own
// [Video] keys, so a DFU settings file keeps its meaning. The keys alone sat under DFU's names in the Retro look section,
// where few players looked for the original game's picture. Mip maps and the palette shift stay plain keys there.
import { t } from './textManager.js';

type SettingsRow = {
  readonly id: string;
  readonly group: 'sight';
  readonly title: string;
  readonly note: string;
  readonly effect: string;
  readonly kinds: readonly string[];
  readonly control: { readonly store: 'settings'; readonly key: string };
};

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

/** In the order the Features home draws them. */
export const CLASSIC_PICTURE_ROWS: readonly SettingsRow[] = Object.freeze([
  CLASSIC_PICTURE_ROW,
  CLASSIC_ASPECT_ROW,
  CLASSIC_COLOURS_ROW,
]);
