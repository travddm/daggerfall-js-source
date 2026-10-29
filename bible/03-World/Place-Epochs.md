# Place epochs - a change to the map past the Bay that loses no player's data (M0)

Opened 2026-10-29. The owner approved the design: no change to the map past the Bay may lose or orphan a player's
data. Moving a city, reshaping the coast, renaming a town and re-rolling the countryside all count. Daggerfall Unity
has no land past the Bay, so nothing here has a DFU reference. The places it guards are the port's own (TESA12,
`03-World/Arena-Provinces.md`).

## The problem

Most player data past the Bay is keyed by a place's map id: homes and the twelve tables beside them, deeds, seats,
guild halls, discovery. A city keeps its id when it moves, so that data is safe while ids never change. Two kinds of
record are not safe:

- **Records keyed by a pixel:** the saved player position, a booked charter's destination, a quest site's pixel, and
  the relay's ledger, staff events and raids.
- **Places whose id is their pixel:** a country place's id is its pixel (`tamrielCountry.js` countryPlaceId). A
  change to the land, a climate zone or a nearby place can roll it away, and a home in it would point at nothing.

## The design, in slices

1. **PLACE-PINS (this slice):** a country place that holds player data stands where it was pinned, with its template.
   Each place's id and kind are listed, and a change that drops one or changes its kind is named.
2. **Epochs:** each map is an epoch. A save carries its epoch, and a pixel from an older one is moved to the same spot
   in the same place.
3. **The account service:** the seat witnesses are moved aside at a switch, and an admin read lists the keys that hold
   data.
4. **The relay reset and the deploy gate:** a switch drops the relay's past-Bay transient state once. The deploy
   refuses a map that leaves a home's key unresolved.
5. **A test epoch** moves one city 5 pixels, to drive the whole path.

Every map change ships twice: its law first, inactive, then a one-line switch. A rollback then lands on code that
knows both maps.

## PLACE-PINS - the places that hold player data stand where they were pinned (2026-10-29)

- **The pins** (`src/world/placeEpochs/pinnedPlaces.js`): a pin is a country place's map id, its location type, and
  the map id of the Bay place it clones. The shipped list (`src/world/placeEpochs/pinnedPlacesList.js`) is empty until
  the first pin read: nothing is pinned yet, so nothing a player sees changes. An offline player's own deeds can add
  pins for their world alone (`setLocalPins`).
- **The roll** (`tamrielCountry.js:"export function countryStandsAt("`): a pinned pixel stands its pinned place before
  the roll is read. The climate, the ground and the Ghostfence are not asked, because they may change under it and
  its buildings must not. Should its template be gone, it takes the template the roll would hash to for that kind;
  it never stands nothing. `countryMayStandAt` answers yes for a pinned pixel.
- **The worker:** the roads worker reads the same roll (`tamrielRoads.js` rollTypeAt), so its roads reach a pinned
  place too.
- **Identity** (`src/world/placeEpochs/placeIdentity.js`): every place that can hold player data, by map id and kind:
  - the made places by their slot's map id;
  - every slice of every capital;
  - every pin.

  `identityBreaks` names each place a later list drops or gives another kind. A rename or a new place is no break:
  homes key on the id, and their buildings on the kind's template.

Pins: 7 in `test/world/placeEpochs/pinnedPlaces.test.js` and `test/world/placeEpochs/placeIdentity.test.js`.
Campaign: `tools/mutants/placepins.json`, 10 mutants, 10 dead.
