// @ts-check
// PLACE-PINS (bible/03-World/Place-Epochs.md): A PLACE'S IDENTITY, WHICH NO CHANGE TO THE MAP MAY ALTER.
//
// Homes, their decor and storage, deeds, seats and discovery are keyed by a place's map id. A place's kind picks the
// template it clones, and the template fixes its building keys, which homes are also keyed by. So a geography change
// (a moved city, a reshaped coast) may move a place but must never renumber it, drop it, or change its kind. This
// module lists every place past the Bay by id with its kind, and names every way one list breaks another.

import { arenaPlaceId } from '../arenaLocations.js';
import { CAPITALS, capitalDims, capitalPlaceId } from '../tamrielCapitals.js';
import { pinnedPlaces } from './pinnedPlaces.js';

/** A place's identity: its map id, its kind ('city-state', 'town', 'village', 'capital', 'pinned:<type>') and its name,
 *  which may change where the id and the kind may not.
 *  @typedef {{ id: number, kind: string, name: string }} PlaceIdentity */

/** Every place past the Bay that can hold player data, by map id.
 *  @param {ReadonlyArray<{ provinceIndex: number, id: number, kind: string, name: string }>} places makeTamrielPlaces'
 *  @returns {Map<number, PlaceIdentity>} */
export function placeIdentities(places) {
  /** @type {Map<number, PlaceIdentity>} */
  const out = new Map();
  for (const place of places) {
    const id = arenaPlaceId(place);
    out.set(id, { id, kind: place.kind, name: place.name });
  }
  CAPITALS.forEach((capital, k) => {
    const dims = capitalDims(capital);
    const slices = dims.w * dims.h;
    for (let slice = 0; slice < slices; slice++) {
      const id = capitalPlaceId(k, slice);
      out.set(id, { id, kind: 'capital', name: capital.name });
    }
  });
  for (const pin of pinnedPlaces()) {
    const id = pin.id >>> 0;
    out.set(id, { id, kind: `pinned:${pin.type}`, name: '' });
  }
  return out;
}

/**
 * How `after` breaks `before`: each id that is gone, and each id whose kind changed. Empty when `after` keeps every
 * place `before` had. A place `after` adds is no break.
 * @param {Map<number, PlaceIdentity>} before @param {Map<number, PlaceIdentity>} after
 * @returns {Array<{ id: number, problem: 'gone' | 'kind', was: PlaceIdentity, now: PlaceIdentity | null }>}
 */
export function identityBreaks(before, after) {
  const breaks = [];
  for (const [id, was] of before) {
    const now = after.get(id) ?? null;
    if (now === null) breaks.push({ id, problem: /** @type {const} */ ('gone'), was, now });
    else if (now.kind !== was.kind) breaks.push({ id, problem: /** @type {const} */ ('kind'), was, now });
  }
  return breaks;
}
