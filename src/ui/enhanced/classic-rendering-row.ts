// The settings row of the Classic rendering preset (systems/classic-rendering-preset.ts): an Off / On bar in the
// Quality section, beside the quality preset. The menu hands in its own row door (tileStates), so a row the preset
// sets is written exactly as its own bar writes it, and a redraw for after the press.
import { FEATURES, resolveControl } from '../../systems/features.js';
import { getString, setValue, saveSettings } from '../../systems/settings/settings.js';
import { getPref, setPref } from '../../systems/uiPrefs.js';
import { t } from '../../systems/textManager.js';
import {
  CLASSIC_RENDERING_SAVED_PREF,
  applyClassicRendering,
  classicRenderingOn,
  removeClassicRendering,
  type ClassicRenderingDoors,
  type ClassicRenderingSaved,
  type RowValue,
} from '../../systems/classic-rendering-preset.ts';

/** What the menu's tileStates answers for a row: the bar's position, whether the room decides it, and its press. */
export type RowBar = { readonly at: number; readonly locked?: boolean; set(index: number): void };
export type RowBarOf = (row: unknown) => RowBar | null;

type Tier = readonly [RowValue, unknown];

/** A preference switch has no tiers: the settings screen draws it as Off and On over false and true. */
const SWITCH_TIERS: readonly Tier[] = Object.freeze([
  [false, 'Off'],
  [true, 'On'],
]);

const WORDS = {
  name: (): string => t('menu.settings.classicRendering.name', 'Classic rendering'),
  note: (): string =>
    t(
      'menu.settings.classicRendering.note',
      'Classic picture 320x200, Classic aspect 4:3 and Classic colours Palettization, with ground sharpness Off, ' +
        'no mip maps, land view distance 3, Enhanced lighting and Enhanced environments Off, field of view 60 and ' +
        'World Texture Filter Point.',
    ),
  effect: (): string =>
    t(
      'menu.settings.classicRendering.effect',
      'Lighting and the outdoors change when the world next loads. Off puts back what you had before. A setting you ' +
        'change while it is on keeps your choice.',
    ),
  off: (): string => t('menu.toggle.off', 'Off'),
  on: (): string => t('menu.toggle.on', 'On'),
};

/** What the settings search reads for the row, in the player's language and in English. */
export function classicRenderingSearchText(): string {
  return ['classic rendering retro original dos preset', WORDS.name(), WORDS.note(), WORDS.effect()].join(' ');
}

function tiersOf(id: string): readonly Tier[] | null {
  const control = resolveControl(FEATURES.find((row: { id: string }) => row.id === id)) as
    { store?: unknown; initial?: unknown; tiers?: unknown } | undefined;
  if (Array.isArray(control?.tiers)) return control.tiers as readonly Tier[];
  if (control?.store === 'prefs' && typeof control.initial === 'boolean') return SWITCH_TIERS;
  return null;
}

/** The preset's doors over the real stores. */
export function classicRenderingDoors(barOf: RowBarOf): ClassicRenderingDoors {
  const barFor = (id: string): { bar: RowBar; tiers: readonly Tier[] } | null => {
    const bar = barOf(FEATURES.find((row: { id: string }) => row.id === id));
    const tiers = tiersOf(id);
    return bar && !bar.locked && tiers ? { bar, tiers } : null;
  };
  return {
    readRow(id) {
      const found = barFor(id);
      return found ? (found.tiers[found.bar.at]?.[0] ?? null) : null;
    },
    writeRow(id, value) {
      const found = barFor(id);
      const index = found ? found.tiers.findIndex(([tierValue]) => String(tierValue) === String(value)) : -1;
      if (found && index >= 0) found.bar.set(index);
    },
    readVideo(key) {
      const [section, name] = key.split('/');
      return getString(section, name);
    },
    writeVideo(key, value) {
      const [section, name] = key.split('/');
      setValue(section, name, value);
      saveSettings();
    },
    readSaved: () => getPref(CLASSIC_RENDERING_SAVED_PREF),
    writeSaved: (saved: ClassicRenderingSaved | null) => setPref(CLASSIC_RENDERING_SAVED_PREF, saved),
  };
}

function element(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** The row, drawn as the quality preset's is. `afterPress` redraws the screen from the stores. */
export function classicRenderingRow(barOf: RowBarOf, afterPress: () => void): HTMLElement {
  const doors = classicRenderingDoors(barOf);
  const on = classicRenderingOn(doors);
  const row = element('div', 'row opt-preset');
  row.dataset.opt = 'classicRendering';
  const main = element('div', 'row-main');
  main.append(element('div', 'row-name', WORDS.name()));
  main.append(element('div', 'row-note', WORDS.note()));
  main.append(element('div', 'row-sub', WORDS.effect()));
  row.append(main);
  const control = element('div', 'ctl');
  const bar = element('div', 'ft-seg');
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', WORDS.name());
  for (const [label, wantOn] of [
    [WORDS.off(), false],
    [WORDS.on(), true],
  ] as const) {
    const button = element('button', 'ft-segb', label) as HTMLButtonElement;
    button.type = 'button';
    button.setAttribute('aria-pressed', String(on === wantOn));
    button.onclick = (event) => {
      event.stopPropagation();
      if (wantOn) applyClassicRendering(doors);
      else removeClassicRendering(doors);
      afterPress();
    };
    bar.append(button);
  }
  control.append(bar);
  row.append(control);
  return row;
}
