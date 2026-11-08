// @ts-check
// PROFESSION-CAPS: what the client book (profBook.js) learns from the service's two words about the caps: a refused
// harvest (`prof-day-cap`: the character's day on that track is done) and the state read's `caps.prices` (the scale the
// ores', woods', hides' and Arcane Essence's rows are priced on).
import { TRACK_OF_KIND } from './profCapLaw.js';
import { setProfPrices } from '../systems/professions/profTemplates.js';

/** The key a character's day on a harvest kind's track is closed under; null for a kind with no track. */
const dayCapKey = (/** @type {string} */ character, /** @type {string} */ kind) =>
  TRACK_OF_KIND[kind] ? `day:${character}:${TRACK_OF_KIND[kind]}` : null;

/** A harvest refused `prof-deep-cap` closes `deep` for the account, one refused `prof-day-cap` that character's day on its
 *  track, until the UTC day turns. */
export function learnRefusal(
  /** @type {Map<string, number>} */ closed,
  /** @type {{ character: string, kind: string }} */ harvest,
  /** @type {string|undefined} */ error,
  /** @type {number} */ day,
) {
  const key =
    error === 'prof-deep-cap' ? 'deep' : error === 'prof-day-cap' ? dayCapKey(harvest.character, harvest.kind) : null;
  if (key) closed.set(key, day);
}

/** Whether a refusal closed `key` for `day`: `deep`, or `day:<harvest kind>` for that character's day on the kind's track. */
export function closedToday(
  /** @type {Map<string, number>} */ closed,
  /** @type {string} */ character,
  /** @type {string} */ key,
  /** @type {number} */ day,
) {
  const k = key.startsWith('day:') ? dayCapKey(character, key.slice(4)) : key;
  return !!k && closed.get(k) === day;
}

/** The state read's caps: the tier prices' scale is DFU's unless the service says the port's earlier one. */
export const heardCaps = (/** @type {{ prices?: string }|null} */ caps) => setProfPrices(caps?.prices !== 'port');
