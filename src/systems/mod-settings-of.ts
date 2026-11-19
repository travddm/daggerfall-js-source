// A whole vendored mod's settings, resolved key by key (systems/modSettings.js modSetting) and kept until something
// they are read from changes: the store (its generation), whether the page is online, a room's base roll, and the
// installed server profile's tables (each install assigns new ones). Several first-person and travel mods ask for a
// whole mod's settings every frame.
import { MOD_SETTINGS, modSetting, modSettingsGeneration } from './modSettings.js';
import { isOnlinePage, rollingAsTheRoom, ONLINE_ROOM_MOD_KEYS, ONLINE_WHOLE_MODS } from './online/onlineLane.js';

type ResolvedSettings = Record<string, unknown>;

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
export function resolvedModSettings(vendor: string): ResolvedSettings {
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
