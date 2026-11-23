// @ts-check
// INFECTION-KEPT: does a cure leave a vampirism or lycanthropy infection? DFU stores the infection as a disease bundle
// and CureAllDiseases ends every one, the infection included (EntityEffectManager.cs). The port ended the plain diseases
// first while a plain disease was active (a field report: a player curing plague who wanted to keep lycanthropy). The
// `cureKeepsInfection` pref (a Features row): off is DFU's, a cure ends all; on is the port's earlier way. Forced off
// online (onlineLane.js). A leaf, so effects.js and diseases.js can ask.
import { getPref } from './uiPrefs.js';

export const CURE_KEEPS_INFECTION_PREF = 'cureKeepsInfection';
/** Whether a cure leaves an infection alone while a plain disease is there to take. Read at every call. */
export const cureKeepsInfection = () => getPref(CURE_KEEPS_INFECTION_PREF) === true;
