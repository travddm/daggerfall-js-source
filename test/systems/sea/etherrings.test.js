// THE ELTHERIC SEA'S RINGS (systems/sea/etherRings.js): the four depth bands as tiers, Veilhaven's peace, an isle's ruin
// read by its band, the ring words, and the sea ground flag Undertow reads. Moved out of the open zone's file with the
// zone's removal; the law is unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ETHER_PEACE_PX, ETHER_RINGS, etherInPeace, etherWildRingAt, etherRingName, etherRingAtPlace,
  etherWayWord, setSeaGround, seaGroundHere,
} from '../../../src/systems/sea/etherRings.js';
import { ETHER_BOX, VEIL_X, LEAGUE_PX, BANDS, veilhaven, landfall } from '../../../src/world/ethericSea.js';
import { synthesizeEtherLocation } from '../../../src/world/etherPlaces.js';

/** A pixel well north of Veilhaven, where only the depth decides. */
const FAR_Y = -3000;
/** The first whole pixel of a band, coming from the Veil: the easternmost x whose depth reaches its `from`. */
const bandEdgeX = (from) => Math.floor(VEIL_X - from * LEAGUE_PX);

test('the sea has a ring everywhere in its box but Veilhaven\'s peace - nothing outside the box, nothing in the Veil, nothing within twelve pixels of Veilhaven', () => {
  const h = veilhaven();
  assert.deepEqual([h.px, h.py], [8068, -5185], 'Veilhaven where the crossing has always made landfall');
  assert.equal(ETHER_PEACE_PX, 12);
  assert.equal(etherWildRingAt(h.px, h.py), 0, 'Veilhaven itself');
  assert.equal(etherWildRingAt(landfall().px, landfall().py), 0, 'the landfall');
  assert.equal(etherWildRingAt(h.px - 12, h.py), 0, 'twelve pixels west: still the peace');
  assert.equal(etherWildRingAt(h.px - 13, h.py), 1, 'thirteen: the Shallows');
  assert.equal(etherWildRingAt(h.px, h.py - 13), 1, 'thirteen north');
  assert.equal(etherWildRingAt(h.px - 8, h.py - 8), 0, 'on a diagonal, 11.3 px: the peace');
  assert.equal(etherWildRingAt(h.px - 9, h.py - 9), 1, '12.7 px on a diagonal: a ring - a circle, never a square');
  assert.equal(etherInPeace(h.px - 9, h.py - 8), false, '12.04 px: past the peace by a hair');
  assert.equal(etherInPeace(h.px - 9, h.py - 7), true, '11.4 px: in it');
  assert.equal(etherWildRingAt(VEIL_X, FAR_Y), 0, 'the Veil\'s first pixel');
  assert.equal(etherWildRingAt(ETHER_BOX.x1 - 1, FAR_Y), 0, 'the Veil\'s last');
  assert.equal(etherWildRingAt(VEIL_X - 1, FAR_Y), 1, 'one pixel west of the Veil: the Shallows');
  for (const [x, y] of [[500, 250], [0, 0], [ETHER_BOX.x0 - 1, FAR_Y], [ETHER_BOX.x1, FAR_Y], [4000, ETHER_BOX.y0 - 1], [4000, ETHER_BOX.y1]]) {
    assert.equal(etherWildRingAt(x, y), 0, `${x},${y}`);
  }
  assert.equal(etherWildRingAt(ETHER_BOX.x0, ETHER_BOX.y0), 4, 'the box\'s far corner: the Abyss');
  for (const bad of [undefined, null, NaN, Infinity]) assert.equal(etherWildRingAt(bad, FAR_Y), 0, String(bad));
});

test('the rings are the depth bands - the Shallows I, the Reaches II, the Deep Aether III, the Abyss IV - to the pixel at each band\'s edge, with their loot and names', () => {
  assert.equal(ETHER_RINGS, 4);
  assert.deepEqual(BANDS.map((b) => b.id), ['shallows', 'reaches', 'deep', 'abyss'], 'four bands for four rings');
  assert.deepEqual(BANDS.map((b) => b.from), [0, 12, 45, 140]);
  for (let i = 1; i < BANDS.length; i++) {
    const x = bandEdgeX(BANDS[i].from);
    assert.equal(etherWildRingAt(x, FAR_Y), i + 1, `${BANDS[i].id} at its edge (${x})`);
    assert.equal(etherWildRingAt(x + 1, FAR_Y), i, `${BANDS[i - 1].id} a pixel east of it`);
  }
  assert.deepEqual([bandEdgeX(12), bandEdgeX(45), bandEdgeX(140)], [8041, 7846, 7286], 'the edges, written down');
  assert.deepEqual([1, 2, 3, 4].map(etherRingName), ['The Shallows', 'The Reaches', 'The Deep Aether', 'The Abyss']);
  assert.equal(etherRingName(9), 'The Abyss', 'a ring past the four is the deepest');
});

test('an isle\'s ruin is read by its band at its own pixel, through the place\'s longitude and latitude; a place that is not the sea\'s has none', () => {
  const template = { name: 'Template', mapTableData: { mapId: 1, longitude: 0, latitude: 0, dungeonType: 0 }, exterior: { exteriorData: {} } };
  const isle = (px, py, kind = 'ruin') => ({ key: `${px},${py}`, cx: 10, cy: 10, px, py, kind, name: 'Old Thal' });
  for (const [px, py, ring] of [[bandEdgeX(140) - 40, -6000, 4], [bandEdgeX(45) - 3, FAR_Y, 3], [bandEdgeX(12) - 1, -7000, 2], [VEIL_X - 2, FAR_Y, 1], [veilhaven().px, veilhaven().py, 0]]) {
    const loc = synthesizeEtherLocation(template, isle(px, py));
    assert.equal(loc.ether, `${px},${py}`);
    assert.equal(etherRingAtPlace(loc), ring, `${px},${py}`);
    assert.equal(etherRingAtPlace(loc), etherWildRingAt(px, py), 'the pixel round-trips through MapsFile\'s own sum');
  }
  assert.equal(etherRingAtPlace({ mapTableData: { longitude: 400 * 128, latitude: (499 - 120) * 128 } }), 0, 'a place of the Bay: none');
  assert.equal(etherRingAtPlace({ ether: '1,1', mapTableData: {} }), 0, 'a place that cannot say where it stands');
  assert.equal(etherRingAtPlace(null), 0);
});

test('the compass words are the text core\'s, a point or nothing', () => {
  assert.equal(etherWayWord('north-north-east'), 'north-north-east');
  assert.equal(etherWayWord('west'), 'west');
  assert.equal(etherWayWord(null), '');
  assert.equal(etherWayWord(undefined), '');
  assert.equal(etherWayWord('somewhere'), 'somewhere', 'a word that is no point is said as it came');
});

test('the sea ground flag is the world host\'s word and nothing else sets it', () => {
  try {
    assert.equal(seaGroundHere(), false, 'off until the host says so');
    setSeaGround(true);
    assert.equal(seaGroundHere(), true);
    setSeaGround(false);
    assert.equal(seaGroundHere(), false);
  } finally { setSeaGround(false); }
});
