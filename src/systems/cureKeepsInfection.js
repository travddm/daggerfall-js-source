// @ts-check
// INFECTION-KEPT: DOES A CURE LEAVE A VAMPIRISM OR LYCANTHROPY INFECTION? DFU stores the infection as a disease bundle,
// and CureAllDiseases ends every disease bundle, the infection included (EntityEffectManager.cs CureAllDiseases;
// DaggerfallGuildServiceCureDisease.cs prices each disease). The port ended the plain diseases first and left the infection
// while a plain disease was also active (a field report: a player who wanted to keep lycanthropy while curing plague).
// The `cureKeepsInfection` pref (a Features row) is that choice: off is DFU's, a cure ends all; on is the port's earlier way.
// Online the room's answer is forced off (onlineLane.js). A leaf: the shelf only, so effects.js and diseases.js can ask.
import { getPref } from './uiPrefs.js';

export const CURE_KEEPS_INFECTION_PREF = 'cureKeepsInfection';
/** Whether a cure leaves an infection alone while a plain disease is there to take. Read at every call. */
export const cureKeepsInfection = () => getPref(CURE_KEEPS_INFECTION_PREF) === true;
