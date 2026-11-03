// @ts-check
// F3b: HOW BIG AND HOW LONG THE CLIMATES & CALORIES BOONS ARE - the player's choice (the `boonSize` pref, a Features row).
// DFU has no needs and no boons, so each size is a named departure:
//   none   DFU's own game: a met need earns nothing, the hearth gives nothing, a horse's bond adds no stat.
//   small  the default: +1 and +2 on one or two attributes, for two hours, a rest bank of four hours, +1 a horse stat
//          for every 50 points of bond.
//   mod    the values this port shipped before F3b: +5 on seven attributes, Well fed while the hunger's first stage
//          lasts (four hours), Quenched under 50 thirst, a twelve-hour bank, +1 a horse stat for every 5 points of bond.
// A leaf: the shelf only, so needs.js, status.js, the tooltips and the horse law can ask without a cycle. Online the room's
// answer is forced to the default (onlineLane.js declareOnlinePrefs).
import { getPref } from '../uiPrefs.js';

export const BOON_SIZE_PREF = 'boonSize';
export const BOON_SIZE_DEFAULT = 'small';

const table = (/** @type {Record<string, Record<string, number>>} */ t) =>
  Object.freeze(Object.fromEntries(Object.entries(t).map(([id, a]) => [id, Object.freeze(a)])));

export const BOON_PROFILES = Object.freeze({
  none: Object.freeze({ boon: table({}), fedMinutes: 0, quenchedBelow: 0, bankMinutes: 0, bondStep: Infinity }),
  small: Object.freeze({
    boon: table({
      fed: { strength: 1, endurance: 2 },
      quenched: { agility: 1, speed: 2 },
      rested: { intelligence: 1, willpower: 2 },
      thriving: { luck: 2 },
    }),
    fedMinutes: 120,
    quenchedBelow: 25,
    bankMinutes: 4 * 60,
    bondStep: 50,
  }),
  mod: Object.freeze({
    boon: table({
      fed: { strength: 5, endurance: 5 },
      quenched: { agility: 5, speed: 5 },
      rested: { intelligence: 5, willpower: 5 },
      thriving: { luck: 5 },
    }),
    fedMinutes: 240,
    quenchedBelow: 50,
    bankMinutes: 12 * 60,
    bondStep: 5,
  }),
});

/** The profile of a stored choice; a value that names none reads as the default. */
export const boonProfileFor = (/** @type {unknown} */ stored) =>
  typeof stored === 'string' && Object.hasOwn(BOON_PROFILES, stored)
    ? BOON_PROFILES[/** @type {keyof typeof BOON_PROFILES} */ (stored)]
    : BOON_PROFILES[BOON_SIZE_DEFAULT];
/** The live profile, read at every call: the pick takes effect at once. */
export const boonProfile = () => boonProfileFor(getPref(BOON_SIZE_PREF));
/** True when the live choice is DFU's: no boon at all. */
export const boonsOff = () => getPref(BOON_SIZE_PREF) === 'none';
/** The default size's table (the live one is `boonProfile().boon`). */
export const BOON = BOON_PROFILES.small.boon;
