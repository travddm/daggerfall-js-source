// @ts-check
// CHARACTER MODES: what this page offers at creation (docs/systems/character-modes.md). The mod `character-modes` and
// Project Legacy's `Enabled` (the Legacy mode) are read through modSetting, which online answers with the room's pinned
// values (systems/online/onlineLane.js ONLINE_ROOM_MOD_KEYS); the account service checks again against its profile.
import { modSetting } from './modSettings.js';

export const CHARACTER_MODES_MOD = 'character-modes';

/** Whether a new character is asked its mode at all. Off is Daggerfall Unity: every character plays Classic. */
export const characterModesOn = () => !!modSetting(CHARACTER_MODES_MOD, 'Enabled');

/** The `offered` table net/modeLaw.js creatableModes reads. */
export function offeredModes() {
  return {
    hardcore: !!modSetting(CHARACTER_MODES_MOD, 'Modes.Hardcore'),
    legacy: !!modSetting('project-legacy', 'Enabled'),
    ironman: !!modSetting(CHARACTER_MODES_MOD, 'Modes.Ironman'),
    hardcore_ironman: !!modSetting(CHARACTER_MODES_MOD, 'Modes.HardcoreIronman'),
  };
}
