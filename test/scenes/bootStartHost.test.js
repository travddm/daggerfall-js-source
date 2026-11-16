// The start past the Bay (src/scenes/bootStartHost.js reach) on a slow boot. bootWorld constructs the boot start long
// before it declares its town voice, and passes the voice as a getter that throws until then. On a slow device the
// wait for the world to stand can run out first. The start must then settle without reading the voice: a Project
// Legacy birth waits on it, and a rejection sends the player to the title menu.
//
// The host here is a fake of world.js's: a Bay town to stand on, a registry that knows the seat, and the voice behind
// a getter that throws as the host's does before its declaration. Timers are mocked, so the minute of waits runs at
// once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBootStart } from '../../src/scenes/bootStartHost.js';
import { START_READY_MS, START_READY_TRIES, STARTS_TEXT } from '../../src/scenes/startsHost.js';
import { REPOSITION } from '../../src/systems/ship.js';

const SEAT = Object.freeze({ id: 4242, x: 1569, y: -430 });
const BAY_TOWN = Object.freeze({ name: 'Daggerfall' });

/** A boot of a Legacy birth whose seat is past the Bay, over a fake host. The test decides when the voice is declared
 *  and when the world stands. */
function slowBoot({ seatStands = true } = {}) {
  const state = { voiceDeclared: false, stands: false, voiceReads: 0 };
  const said = [];
  const moves = [];
  const params = new URLSearchParams(`?world=1&legacyborn=4&region=Skyrim&loc=Solitude&seat=${SEAT.id}`);
  const start = createBootStart({
    params,
    regionName: 'Skyrim',
    locationName: 'Solitude',
    locationIndex: new Map(),
    maps: { getLocationByName: (region, loc) => (region === 'Daggerfall' && loc === 'Daggerfall' ? BAY_TOWN : null) },
    worldPlaces: {
      byMapId: (id) => (seatStands && id === SEAT.id ? { px: SEAT.x, py: SEAT.y } : null),
      all: () => [],
      at: () => null,
      inTheatre: () => [],
    },
    _teleportToPixel: async (x, y, local, opts) => {
      moves.push([x, y, local, opts]);
    },
    _worldReady: () => state.stands,
    arenaTraced: Promise.resolve(),
    get townTalk() {
      state.voiceReads++;
      if (!state.voiceDeclared) throw new ReferenceError("Cannot access 'townTalk' before initialization");
      return { say: (line) => said.push(line) };
    },
  });
  let outcome = null;
  start.farStart.then(
    (at) => {
      outcome = { at };
    },
    (error) => {
      outcome = { error };
    },
  );
  return { start, state, said, moves, outcome: () => outcome };
}

/** Lets the boot's pending promise steps run, then moves the mocked clock one wait on, `count` times. */
async function spendWaits(t, count) {
  const settle = () =>
    new Promise((resolve) => {
      setImmediate(resolve);
    });
  for (let i = 0; i < count; i++) {
    await settle();
    t.mock.timers.tick(START_READY_MS);
  }
  await settle();
}

test('a world that does not stand within the waits, its voice not yet declared: the start settles with no move and reads no voice', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(console, 'warn', () => {});
  const boot = slowBoot();
  assert.equal(boot.start.startLoc, BAY_TOWN, 'the world stands on the Bay while it waits');
  await spendWaits(t, START_READY_TRIES);
  assert.deepEqual(boot.outcome(), { at: null }, 'settled, not rejected: a birth waiting on it goes on');
  assert.equal(boot.state.voiceReads, 0, 'the voice is never read before the world stands');
  assert.deepEqual(boot.moves, []);
  // the world stands at last: the start has settled, so nothing more is moved or said
  boot.state.voiceDeclared = true;
  boot.state.stands = true;
  await spendWaits(t, 1);
  assert.deepEqual(boot.moves, []);
  assert.deepEqual(boot.said, []);
});

test('a world that stands late but within the waits: the player is moved to the seat, and the voice is not read', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(console, 'info', () => {});
  const boot = slowBoot();
  await spendWaits(t, START_READY_TRIES - 10);
  assert.equal(boot.outcome(), null, 'still waiting for the world');
  boot.state.voiceDeclared = true;
  boot.state.stands = true;
  await spendWaits(t, 1);
  assert.deepEqual(boot.outcome(), { at: { x: SEAT.x, y: SEAT.y } });
  assert.deepEqual(boot.moves, [[SEAT.x, SEAT.y, null, { reposition: REPOSITION.RandomStartMarker }]]);
  assert.equal(boot.state.voiceReads, 0);
});

test('a world that stands where no way to the seat is found: the line is said once, through the declared voice', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(console, 'warn', () => {});
  const boot = slowBoot({ seatStands: false });
  await spendWaits(t, 3);
  boot.state.voiceDeclared = true;
  boot.state.stands = true;
  await spendWaits(t, 1);
  assert.deepEqual(boot.outcome(), { at: null });
  assert.deepEqual(boot.moves, []);
  assert.deepEqual(boot.said, [STARTS_TEXT.noSite]);
});
