// @ts-check
// CHARACTER MODES: what this page offers at creation (docs/systems/character-modes.md). The mod `character-modes` and
// Project Legacy's `Enabled` (the Legacy mode) are read through modSetting, which online answers with the room's pinned
// values (systems/online/onlineLane.js ONLINE_ROOM_MOD_KEYS); the account service checks again against its profile.
import { modSetting } from './modSettings.js';
import { isOnlinePage } from './online/onlineLane.js';
import { withoutUnenforcedModes } from './unenforced-online-modes.ts';

export const CHARACTER_MODES_MOD = 'character-modes';

/** Whether a new character is asked its mode at all. Off is Daggerfall Unity: every character plays Classic. */
export const characterModesOn = () => !!modSetting(CHARACTER_MODES_MOD, 'Enabled');

/** The `offered` table net/modeLaw.js creatableModes reads. Online it hides the modes online play does not enforce yet
 *  (systems/unenforced-online-modes.ts); an online page creates only realm characters, so the page says which. */
export function offeredModes({ online = isOnlinePage() } = {}) {
  const offered = {
    hardcore: !!modSetting(CHARACTER_MODES_MOD, 'Modes.Hardcore'),
    legacy: !!modSetting('project-legacy', 'Enabled'),
    ironman: !!modSetting(CHARACTER_MODES_MOD, 'Modes.Ironman'),
    hardcore_ironman: !!modSetting(CHARACTER_MODES_MOD, 'Modes.HardcoreIronman'),
  };
  return online ? withoutUnenforcedModes(offered) : offered;
}
