// The settings row of the Classic rendering preset (systems/classic-rendering-preset.ts): an Off / On bar in the
// Quality section, beside the quality preset, that switches between the standard and the classic graphics profile.
// The menu hands in its own row door (tileStates), so a row a profile sets is written exactly as its own bar writes
// it, and a redraw for after the press.
import { FEATURES, modDials, modModules, resolveControl } from '../../systems/features.js';
import { modSetting, onlineModSetting, setModSetting } from '../../systems/modSettings.js';
import { onlineForcedPref } from '../../systems/online/onlineLane.js';
import { getString, setValue, saveSettings } from '../../systems/settings/settings.js';
import { getPref, setPref } from '../../systems/uiPrefs.js';
import { CATEGORIES } from '../settings/settingsMap.js';
import { t } from '../../systems/textManager.js';
import {
  GRAPHICS_PROFILES_PREF,
  applyClassicRendering,
  classicRenderingOn,
  removeClassicRendering,
  type ClassicRenderingDoors,
  type GraphicsProfiles,
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
      'Classic and the standard look each keep their own graphics settings. Off puts back your standard settings. A ' +
        'setting you change while Classic is on stays for the next time. Lighting and the outdoors change when the ' +
        'world next loads.',
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
  if (control?.store === 'mods') return SWITCH_TIERS;
  return null;
}

/** The machine's display settings, shared by both profiles: switching Classic must not move the window or change its
 *  frame rate. */
const SHARED_KEYS = new Set([
  'Video/Fullscreen',
  'Video/ExclusiveFullscreen',
  'Video/ResolutionWidth',
  'Video/ResolutionHeight',
  'Video/TargetFrameRate',
  'Video/VSync',
  'Video/RunInBackground',
]);

/** The Graphics tab's items, in the order the screen draws them. */
const graphicsItems = (): string[] =>
  (CATEGORIES.find((tab: { id: string }) => tab.id === 'graphics')?.sections ?? []).flatMap(
    (section: { items: readonly string[] }) => [...section.items],
  );

/** A drawer choice that does not change the picture: a mod's sound dials. They stay shared, as audio settings are. */
const NOT_VISUAL = /audio/i;

type DrawerControl = {
  key?: string;
  store?: string;
  vendor?: string;
  parts?: readonly { key: string }[];
  also?: readonly { store?: string; vendor?: string }[];
};

/** A row's drawer choices: its parts (a pref each, other than the row's own key), and its mod's modules and dials. */
function drawerIds(rowId: string): string[] {
  const control = resolveControl(FEATURES.find((row: { id: string }) => row.id === rowId)) as DrawerControl | undefined;
  const parts = (control?.parts ?? []).filter((part) => part.key !== control?.key).map((part) => `pref:${part.key}`);
  const vendor =
    control?.store === 'mods' ? control.vendor : control?.also?.find((also) => also.store === 'mods')?.vendor;
  const modKeys: string[] = vendor ? [...modModules(vendor), ...modDials(vendor)] : [];
  const mods = modKeys.filter((key) => !NOT_VISUAL.test(key)).map((key) => `mod:${vendor}:${key}`);
  return [...parts, ...mods];
}

/** What a profile holds: every Graphics tab setting, Features row and drawer choice but the shared display settings
 *  and sound. */
export function graphicsProfileScope(): { rowIds: string[]; videoKeys: string[]; partIds: string[] } {
  const items = graphicsItems();
  const rowIds = items.filter((item) => item.startsWith('feat:')).map((item) => item.slice('feat:'.length));
  return {
    rowIds,
    videoKeys: items.filter((item) => /^[A-Z]\w*\/\w+$/.test(item) && !SHARED_KEYS.has(item)),
    partIds: rowIds.flatMap(drawerIds),
  };
}

/** A drawer choice's store, from its id: `pref:<key>` or `mod:<vendor>:<key>`. */
function partStore(id: string): { read(): unknown; locked: boolean; write(value: unknown): void } {
  if (id.startsWith('pref:')) {
    const key = id.slice('pref:'.length);
    return {
      read: () => getPref(key),
      locked: onlineForcedPref(key) !== undefined,
      write: (value) => setPref(key, value),
    };
  }
  const [, vendor, ...rest] = id.split(':');
  const key = rest.join(':');
  return {
    read: () => modSetting(vendor, key),
    locked: onlineModSetting(vendor, key) !== undefined,
    write: (value) => setModSetting(vendor, key, value),
  };
}

/** The preset's doors over the real stores. */
export function classicRenderingDoors(barOf: RowBarOf): ClassicRenderingDoors {
  const barFor = (id: string): { bar: RowBar; tiers: readonly Tier[] } | null => {
    const bar = barOf(FEATURES.find((row: { id: string }) => row.id === id));
    const tiers = tiersOf(id);
    return bar && !bar.locked && tiers ? { bar, tiers } : null;
  };
  return {
    ...graphicsProfileScope(),
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
    readPart(id) {
      const store = partStore(id);
      return store.locked ? null : { value: store.read() };
    },
    writePart(id, value) {
      const store = partStore(id);
      if (!store.locked) store.write(value);
    },
    readProfiles: () => getPref(GRAPHICS_PROFILES_PREF),
    writeProfiles: (profiles: GraphicsProfiles) => setPref(GRAPHICS_PROFILES_PREF, profiles),
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
