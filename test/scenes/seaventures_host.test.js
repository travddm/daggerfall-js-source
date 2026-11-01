// SEA VENTURES, reduced (open-world PvP removal): the sea's host keeps the day's vaults (SEA-VAULTS), the storm and the
// treasure fleet (SEA-EVENTS) and the season boards (SEA-SEASON), and holds no wreck, bounty, gun or hub lock.
// Driven over the real host with fake seams: the clock, the player's pixel, the social socket and the ether host.
import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeaVentures } from '../../src/scenes/seaVenturesHost.js';
import { seaVaultPicks } from '../../src/systems/sea/seaVaults.js';
import { fleetAt, fleetOf } from '../../src/systems/sea/seaEvents.js';

const DAY = 20_500;
const MINUTE = 60_000;

/** A clock at which a treasure fleet is under way. */
function fleetClock() {
  for (let now = 0; now < 48 * 60 * MINUTE; now += MINUTE) if (fleetAt(now)) return now;
  throw new Error('no fleet sails in two days');
}

function rig({ live = true, pixel = { x: 0, y: 0 }, clock = fleetClock() } = {}) {
  const sent = [];
  const said = [];
  const credited = [];
  const done = new Set();
  const state = { live, pixel, clock, linkOpen: true };
  const link = {
    get status() {
      return state.linkOpen ? 'open' : 'closed';
    },
    sendSea: (word) => {
      sent.push(word);
      return true;
    },
  };
  const ether = {
    credit: (n) => credited.push(n),
    mid: (text) => said.push(text),
    say: (text) => said.push(text),
    fleetDone: (n) => done.has(n),
    endFleet: (n) => done.add(n),
  };
  const host = createSeaVentures({
    live: () => state.live,
    day: () => DAY,
    pixel: () => state.pixel,
    clock: () => state.clock,
    naval: () => null,
    state: null,
    link: () => link,
    ether,
    session: null,
  });
  return { host, state, sent, said, credited };
}

test("SEA VENTURES vaults: the day's vaults stand while the sea stands, none when it does not; the vault at the player's pixel is the one found", () => {
  const picks = seaVaultPicks(DAY);
  assert.ok(picks.length > 0, 'a day has vaults');
  const r = rig();
  assert.deepEqual(
    r.host.vaultsNow().map((v) => v.key),
    picks.map((v) => v.key),
    "the day's picks, by the shared clock's day",
  );
  r.state.pixel = { x: picks[0].x, y: picks[0].y };
  assert.equal(r.host.vaultHere()?.key, picks[0].key, 'standing at its ruin: that vault');
  r.state.pixel = { x: picks[0].x + 1, y: picks[0].y };
  assert.equal(r.host.vaultHere(), null, 'a pixel off: none');
  r.state.live = false;
  assert.deepEqual(r.host.vaultsNow(), [], 'the sea not standing: no vaults');
  r.state.pixel = { x: picks[0].x, y: picks[0].y };
  assert.equal(r.host.vaultHere(), null, 'and none found');
});

test('SEA VENTURES chart: a vault is a place, a name and a band alone - no lock, no crows, no fights flag; the office holds the season only', () => {
  const r = rig();
  const word = r.host.chartWord();
  assert.equal('pvp' in word, false, 'no fights flag');
  assert.ok(word.vaults.length > 0);
  for (const v of word.vaults) assert.deepEqual(Object.keys(v).sort(), ['band', 'key', 'name', 'ring', 'x', 'y']);
  assert.deepEqual(Object.keys(r.host.office()), ['season'], 'no Wanted section');
  for (const gone of ['crowLine', 'wref', 'guns']) assert.equal(gone in r.host, false, `${gone} is gone`);
});

test('SEA VENTURES fleet: a flagship sunk is told to the social room as a `sea` word once, and its purse is paid once', () => {
  const r = rig();
  const f = fleetAt(r.state.clock);
  const paid = r.host.fleetEnded(f.n, 'sink');
  assert.equal(paid, fleetOf(f.n).purse, 'the purse is paid');
  assert.deepEqual(r.sent, [{ k: 'fk', n: f.n }], 'the room is told which sailing');
  assert.deepEqual(r.credited, [fleetOf(f.n).purse]);
  assert.equal(r.host.fleetEnded(f.n, 'sink'), 0, 'a second word pays nothing');
  assert.equal(r.credited.length, 1);
  assert.equal(r.host.chartWord().fleet.sunk, true, 'and the chart shows her down');
});

test('SEA VENTURES fleet: a sinking told while the socket is shut is told again at the next step the socket is open', () => {
  const r = rig();
  const f = fleetAt(r.state.clock);
  r.state.linkOpen = false;
  r.host.fleetEnded(f.n, 'sink');
  assert.deepEqual(r.sent, [], 'a shut socket sends nothing');
  r.state.linkOpen = true;
  r.state.clock += 31_000;
  r.host.step();
  assert.deepEqual(r.sent, [{ k: 'fk', n: f.n }], 'told again once it can be');
});

test("SEA VENTURES hub word: `st` and `fd` carry the sunk sailings; `fd` is the fleet's word alone; other words are not", () => {
  const r = rig();
  const f = fleetAt(r.state.clock);
  assert.equal(r.host.chartWord().fleet.sunk, false);
  assert.equal(r.host.hubWord({ k: 'st', fleets: [f.n] }), false, 'the hello is not a fall');
  assert.equal(r.host.chartWord().fleet.sunk, true, 'but it marks her down');
  assert.equal(r.host.hubWord({ k: 'st', fleets: [] }), false);
  assert.equal(r.host.chartWord().fleet.sunk, false, 'a hello without her stands her again');
  assert.equal(r.host.hubWord({ k: 'fd', fleets: [f.n] }), true);
  assert.equal(r.host.chartWord().fleet.sunk, true);
  assert.equal(r.host.hubWord({ k: 'zz' }), false, "an unknown word is none of the fleet's");
  assert.equal(r.host.hubWord(null), false);
});
