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
