// @ts-check
// WEAPON-TECHNIQUES-SETTING: whether the weapon techniques are awake. A technique line rolls on a drop and its key answers
// only with the Loot rarity ladder on AND the Weapon techniques row on (systems/weaponTechniquesRow.js).
import { getPref } from '../uiPrefs.js';
import { lootRarityOn } from './lootRarity.js';

export const WEAPON_TECHNIQUES_KEY = 'weaponTechniques';
export const techniquesOn = () => lootRarityOn() && !!getPref(WEAPON_TECHNIQUES_KEY);
