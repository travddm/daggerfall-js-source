// Which enemy mods are loaded for the game, for the leaves that cannot import an install. Daggerfall Enemy Expansion's
// switch, and MUDEX's: Ralzar's "Meaner Unleveled Daggerfall Enemy Expansion" (vendor/mudex), the stat and table set its
// author made for a game with Enemy Expansion in it. MUDEX has no switch of its own: it loads whenever Enemy Expansion
// does (dexInstall.js latches it). A switch flipped mid-game waits for the next load, as Enemy Expansion's does. A leaf
// but for the settings store.

import { modSetting, modLatchedOn } from '../modSettings.js';

export const DEX_VENDOR = 'daggerfall-enemy-expansion';
export const MUDEX_VENDOR = 'mudex';

/** DEX as loaded for this game: the latch its install set, else (before the install, or in a test) its switch. */
export const dexLoaded = () => modLatchedOn(DEX_VENDOR) ?? modSetting(DEX_VENDOR, 'Enabled') === true;

/** MUDEX as loaded for this game: the latch DEX's install sets (DEX loaded); before it, none. */
export const mudexLoaded = () => modLatchedOn(MUDEX_VENDOR) === true;
