// AUDIT WW: the world-wide arc's review - its findings, each
// pinned where it was fixed. F2, F3 and F6 (the lanes that stand, the spent word, a lane's pixel) are pinned in
// ww2_gates.test.js beside the lanes' own law; F9 (a band's hideout in its own province) in ww1_world.test.js beside
// the bands'.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEventToasts } from '../../../src/systems/eventBoard.js';
import { gateEventId } from '../../../src/systems/eventTimers.js';
import { gateNumber } from '../../../src/net/gate/gateLaw.js';
import { createLivingLanes } from '../../../src/scenes/livingWorld/livingLanes.js';
import { setTamrielTrace } from '../../../src/world/tamriel/tamrielLand.js';
import { setTamrielFit } from '../../../src/world/tamriel/tamrielFrame.js';
import { worldPixelKey } from '../../../src/world/worldWide/worldGrid.js';
import { PORT_ID_WORLD } from '../../../src/world/worldWide/worldPorts.js';
import { codeOnly } from '../../codeOnly.mjs';

setTamrielTrace(null); setTamrielFit(null);   // the authored shape and fit: no player's picture in the suite
const src = (p) => codeOnly(readFileSync(new URL('../../../' + p, import.meta.url), 'utf8'));

test('AUDIT WW F5: EVERY GATE\'S LINES ON ITS OWN CARD - the Bay\'s gate and a lane\'s are two cards, each line and announcement on its own gate\'s (its number\'s id, the Timers row\'s); the host says the omen\'s, the fall\'s and the rite\'s lines with the gate\'s number (mutants: the Bay\'s lines id-less; the fall\'s; the rite\'s)', () => {
  const bayN = gateNumber(900, 0), laneN = gateNumber(900, 3);
  assert.equal(gateEventId(bayN), 'gate:900');
  assert.equal(gateEventId(laneN), `gate:${laneN}`);
  assert.equal(gateEventId(null), null);
  const t = createEventToasts({ shown: 4 });
  t.note('gate', 'The sky over Daggerfall burns', 0, gateEventId(bayN));
  t.note('gate', 'The sky over Solitude burns', 0, gateEventId(laneN));
  t.announce({ id: gateEventId(laneN), kind: 'gate', phase: 'omen' });
  t.note('gate', 'The breach by Daggerfall opens', 1, gateEventId(bayN));
  const cards = t.cards();
  assert.equal(cards.length, 2, 'two gates, two cards');
  const bay = cards.find((c) => c.id === 'gate:900'), lane = cards.find((c) => c.id === `gate:${laneN}`);
  assert.deepEqual(bay?.notes, ['The sky over Daggerfall burns', 'The breach by Daggerfall opens']);
  assert.deepEqual(lane?.notes, ['The sky over Solitude burns']);
  assert.equal(lane?.phase, 'omen');
});

test('AUDIT WW F7: THE LIVING WORLD\'S LANES ARE MADE AGAIN WHEN THE WORLD MOVES - a port town\'s lanes and a port\'s berths when the world\'s lanes are a new list (a province\'s ports registered) or the places\' generation moves; the host\'s hideouts by both generations (mutants: the lanes\' list kept; the generation kept; the hideouts\' generation the roads\' alone)', () => {
  const port = (id, px, py) => ({ id, px, py });
  const bayA = { mapId: (3 << 20) | 100200, px: 200, py: 100, port: true }, bayB = { mapId: (3 << 20) | 110300, px: 300, py: 110, port: true };
  const far = { mapId: 7001, px: 1600, py: -400, port: true }, bayC = { mapId: (3 << 20) | 120400, px: 400, py: 120, port: true };
  const idA = bayA.mapId & 0xfffff, idB = bayB.mapId & 0xfffff, idC = bayC.mapId & 0xfffff, idFar = PORT_ID_WORLD + worldPixelKey(far.px, far.py);
  const towns = new Map([[idA, bayA], [idB, bayB], [idC, bayC], [idFar, far]]);
  let list = [{ key: 'ab', a: port(idA, 200, 100), b: port(idB, 300, 110) }], gen = 1, sailors = 0;
  const lanes = createLivingLanes({ lanes: () => list, way: () => ({ len: 7, pts: [{ x: 0, z: 0 }, { x: 7, z: 0 }] }), townOfPort: (id) => towns.get(id) ?? null, sailorsOf: () => { sailors++; return []; }, generation: () => gen });
  assert.deepEqual(lanes.from(bayA).map((l) => l.to.mapId), [bayB.mapId]);
  const book = lanes.berths(idFar);
  assert.equal(lanes.berths(idFar), book, 'kept while nothing moved');
  // is the Bay's (bayC), and one to a port past the Bay is no Bay town's (WW3 lays none: the Bay's lanes join its ports)
  list = [...list, { key: 'ac', a: port(idA, 200, 100), b: port(idC, 400, 120) }, { key: 'af', a: port(idA, 200, 100), b: port(idFar, far.px, far.py) }];   // a new list
  assert.deepEqual(lanes.from(bayA).map((l) => l.to.mapId), [bayB.mapId, bayC.mapId], 'the new lane joins; the one over the edge none');
  assert.notEqual(lanes.berths(idFar), book, 'the berths made again');
  const kept = lanes.berths(idFar);
  towns.set(idC, { ...bayC, name: 'Wayrest' });
  gen = 2;
  assert.equal(lanes.from(bayA)[1].to.name, 'Wayrest', 'the places moved: the far port\'s town as it stands now');
  assert.notEqual(lanes.berths(idFar), kept);
  assert.equal(sailors, 3, 'the sailors asked again each time');
});

