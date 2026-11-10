// @ts-check
// THE WORLD'S REGISTRY OF PLACES, kept as the boot makes it (scenes/world.js), so the raids, Starfall and the Hollows'
// lanes read it with no wiring of their own. The file once also held the staff panel's place picker; the panel is
// removed and only the registry holder stays.

let _places = /** @type {any} */ (null);
/** AUDIT RELEASE R2-7: the world's registry of places (world/worldWide/worldPlaces.js), kept as the boot makes it - a
 *  province's places are the registry's, no MAPS.BSA table holds them. @template T @param {T} p @returns {T} */
export const gamePlaces = (p) => { _places = p; return p; };
/** The registry kept, or null. */
export const keptPlaces = () => _places;
<<<<<<< HEAD

/** The most places one answer carries (the largest region has fewer). */
export const STAFF_PLACES_MAX = 2000;

/** A location type's word, as the panel groups it. */
const KIND = /** @type {Map<number, string>} */ (new Map(Object.entries(LOCATION_TYPES).map(([k, v]) => [v, k])));
export const placeKind = (/** @type {number} */ t) => {
  const k = KIND.get(t) ?? 'None';
  return k.startsWith('Town') ? 'town' : k.startsWith('Dungeon') ? 'dungeon' : k.startsWith('Home') ? 'home' : k.startsWith('Religion') || k === 'Coven' ? 'temple' : k === 'Tavern' ? 'tavern' : k === 'Graveyard' ? 'graveyard' : 'other';
};

/**
 * A region's named places - towns first, then the rest, each by name.
 * @param {any} maps the game's MapsFile @param {unknown} r
 */
export function staffPlaces(maps, r, places = keptPlaces()) {
  const region = regionOf(r);
  if (region !== null && isProvinceRegion(region)) return provincePlaces(maps, region, places);   // AUDIT RELEASE R2-7
  if (region === null || !maps?.getRegion) return { dfoStaff: 'places', region, name: null, list: [] };
  const g = maps.getRegion(region);
  const table = g?.mapTable ?? [];
  const base = typeof maps.baseLocationCount === 'function' ? Math.min(table.length, maps.baseLocationCount(region)) : table.length;
  const list = [];
  for (let k = 0; k < base && list.length < STAFF_PLACES_MAX; k++) {
    const row = table[k];
    const name = String(g.mapNames?.[k] ?? '');
    if (!row || !name) continue;
    const p = longitudeLatitudeToMapPixel(row.longitude, row.latitude);
    list.push({ loc: k, name: name.slice(0, 48), kind: placeKind(row.locationType), px: p.x, py: p.y });
  }
  list.sort((a, b) => Number(b.kind === 'town') - Number(a.kind === 'town') || a.name.localeCompare(b.name));
  return { dfoStaff: 'places', region, name: String(maps.getRegionName?.(region) ?? '').slice(0, 64) || null, list };
}

/**
 * AUDIT RELEASE R2-7: A PROVINCE'S PLACES PAST THE BAY - the world's
 * registry's listed places of its theatre (the capitals, the cities, towns and villages TESA stands), towns first, then
 * by name. WW6: a TOWN is offered as itself - its `loc` its place's own location index
 * (the registry's `location`, negative: no MAPS.BSA row holds it), as the raids past the Bay key it - for a town's own
 * event runs as the town's raid runs, and the raids stand past the Bay since WW6 (net/staffEvent/staffEventLaw.js
 * staffTownPixelOk); a place with no location of its own, as an AREA at its pixel (`loc` -1).
 * @param {any} maps @param {number} region @param {any} places
 */
function provincePlaces(maps, region, places) {
  const rows = places?.inTheatre?.(theatreOfRegion(region)) ?? [];
  const list = [];
  for (const p of rows) {
    if (list.length >= STAFF_PLACES_MAX) break;
    const kind = placeKind(p?.type);
    const loc = kind === 'town' && Number.isSafeInteger(p?.location) && p.location < -1 ? p.location : -1;   // WW6: a town past the Bay by its own index
    if (p?.name) list.push({ loc, name: String(p.name).slice(0, 48), kind, px: p.px, py: p.py });
  }
  list.sort((a, b) => Number(b.kind === 'town') - Number(a.kind === 'town') || a.name.localeCompare(b.name));
  return { dfoStaff: 'places', region, name: String(maps?.getRegionName?.(region) ?? '').slice(0, 64) || null, list };
}

/**
 * Where the staff member stands: their map pixel's region, and the place there (a location on this pixel), or -1, and
 * its kind (a town is said as a city).
 * @param {any} maps @param {{ x: number, y: number } | null} px
 */
export function staffHere(maps, px) {
  const none = { dfoStaff: 'here', region: null, name: null, loc: -1, place: null, kind: null, px: null, py: null };
  if (!maps?.getRegionIndexAt || !px || !Number.isInteger(px.x) || !Number.isInteger(px.y)) return none;
  const region = regionOf(maps.getRegionIndexAt(px.x, px.y));
  if (region === null) return { ...none, px: px.x, py: px.y };
  const at = staffPlaces(maps, region).list.find((p) => p.px === px.x && p.py === px.y) ?? null;
  return { dfoStaff: 'here', region, name: String(maps.getRegionName?.(region) ?? '').slice(0, 64) || null, loc: at ? at.loc : -1, place: at?.name ?? null, kind: at?.kind ?? null, px: px.x, py: px.y };
}
=======
>>>>>>> origin/feat/tamriel-review
