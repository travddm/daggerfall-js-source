// @ts-check
// PLACE-PINS (bible/03-World/Place-Epochs.md): the country places that hold player data, held where they stand.
// A country place's map id is its pixel, and the countryside's roll stands it wherever hash, climate and ground say.
// A change to the land or a climate zone can roll it away or give it another template, and a home in it would then
// point at nothing. A pinned place stands on its pixel with the template it was pinned with, whatever the roll says.
// The shipped list is pinnedPlacesList.js; an offline player's own deeds can add pins for their world alone.

import { PINNED_PLACES_LIST } from './pinnedPlacesList.js';

/**
 * One pinned place.
 * @typedef {object} PinnedPlace
 * @property {number} id map id of the country place (its pixel, by countryPlaceId)
 * @property {number} type the location type it stands as (LOCATION_TYPES)
 * @property {number} template map id of the Bay place it clones
 */

/** @type {ReadonlyArray<PinnedPlace>} */
let localPins = [];
let pinsVersion = 0;

/** Every pinned place: the shipped list, then this player's own. @returns {ReadonlyArray<PinnedPlace>} */
export function pinnedPlaces() {
  if (localPins.length === 0) return PINNED_PLACES_LIST;
  return PINNED_PLACES_LIST.concat(localPins);
}

/** Changes whenever the pins change, so a reader that keeps a lookup knows to rebuild it. */
export const pinnedPlacesVersion = () => pinsVersion;

/** This player's own pins (from their save's deeds), replacing any set before. A pin the shipped list already holds is
 *  kept once, with the shipped template. @param {ReadonlyArray<PinnedPlace>} pins */
export function setLocalPins(pins) {
  const shipped = new Set(PINNED_PLACES_LIST.map((pin) => pin.id >>> 0));
  localPins = Object.freeze(pins.filter((pin) => !shipped.has(pin.id >>> 0)).map((pin) => Object.freeze({ ...pin })));
  pinsVersion += 1;
}

/**
 * The pick a pinned place stands with: its type, and its template found among the kind's templates by its map id.
 * A template list of placeholders (the roads worker's, which knows only how many there are) gives a null template.
 * @param {PinnedPlace} pin @param {Map<number, any[]>} templates
 * @returns {{ type: number, template: any }}
 */
export function pinnedPick(pin, templates) {
  const list = templates?.get(pin.type) ?? [];
  const template = list.find((row) => (row?.mapTableData?.mapId ?? -1) >>> 0 === pin.template >>> 0) ?? null;
  return { type: pin.type, template };
}
