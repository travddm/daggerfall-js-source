// @ts-check
// WEAPON-TECHNIQUES-SETTING: whether the weapon techniques are awake. The Weapon techniques row (systems/weaponTechniquesRow.js)
// is the only switch: techniques work with Loot rarity on or off.
import { getPref } from '../../systems/uiPrefs.js';

export const WEAPON_TECHNIQUES_KEY = 'weaponTechniques';
export const techniquesOn = () => !!getPref(WEAPON_TECHNIQUES_KEY);
