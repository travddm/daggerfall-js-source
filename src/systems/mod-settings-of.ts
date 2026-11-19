// A whole vendored mod's settings, resolved key by key (systems/modSettings.js modSetting) and kept until something
// they are read from changes: the store (its generation), whether the page is online, a room's base roll, and the
// installed server profile's tables (each install assigns new ones). The weapon and shield widgets, the torches and
// the cart ask for a whole mod's settings every frame.
import { MOD_SETTINGS, modSetting, modSettingsGeneration } from './modSettings.js';
import { isOnlinePage, rollingAsTheRoom, ONLINE_ROOM_MOD_KEYS, ONLINE_WHOLE_MODS } from './online/onlineLane.js';

// A value has its key's declared kind (a boolean, a number, a string or a pair); callers read them as such.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ResolvedSettings = Record<string, any>;

type ResolvedSettingsState = {
  generation: number;
  online: boolean;
  roomRoll: boolean;
  roomModKeys: unknown;
  wholeMods: unknown;
};

const resolvedByVendor = new Map<string, ResolvedSettings>();
let resolvedState: ResolvedSettingsState | null = null;

function currentState(): ResolvedSettingsState {
  return {
    generation: modSettingsGeneration(),
    online: isOnlinePage(),
    roomRoll: rollingAsTheRoom(),
    roomModKeys: ONLINE_ROOM_MOD_KEYS,
    wholeMods: ONLINE_WHOLE_MODS,
  };
}

function sameState(a: ResolvedSettingsState, b: ResolvedSettingsState): boolean {
  return (
    a.generation === b.generation &&
    a.online === b.online &&
    a.roomRoll === b.roomRoll &&
    a.roomModKeys === b.roomModKeys &&
    a.wholeMods === b.wholeMods
  );
}

/** Every key of one vendored mod, resolved, in a new object for each caller: a caller may write to its copy. */
export function modSettingsOf(vendor: string): ResolvedSettings {
  const keys = (MOD_SETTINGS as Record<string, { keys?: Record<string, unknown> } | undefined>)[vendor]?.keys;
  if (!keys) throw new Error(`modSettingsOf: ${vendor} is not a vendored mod with switches`);
  const state = currentState();
  if (!resolvedState || !sameState(resolvedState, state)) {
    resolvedByVendor.clear();
    resolvedState = state;
  }
  let resolved = resolvedByVendor.get(vendor);
  if (!resolved) {
    resolved = {};
    for (const key of Object.keys(keys)) resolved[key] = modSetting(vendor, key);
    resolvedByVendor.set(vendor, resolved);
  }
  return { ...resolved };
}
