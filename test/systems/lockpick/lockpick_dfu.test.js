import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createLockpickHost, LOCKPICK_HOST_WORDS } from '../../../src/scenes/lockpickHost.js';
import { LOCKPICK_TUMBLERS_PREF, lockpickTumblersOn } from '../../../src/systems/lockpick/lockpickMode.js';
import {
  exteriorLockpickingChance,
  interiorLockpickingChance,
  ActionSystem,
  LOCKPICKING_SUCCESS_TEXT,
  LOCKPICKING_FAILURE_TEXT,
} from '../../../src/world/actionSystem.js';
import { discoverBuilding, getLastLockpickAttempt } from '../../../src/systems/discovery.js';
import { setPref } from '../../../src/systems/uiPrefs.js';
import { FEATURES } from '../../../src/systems/features.js';
import { ONLINE_FORCED_PREFS } from '../../../src/systems/online/onlineLane.js';
import { SKILLS } from '../../../src/systems/skills.js';

afterEach(() => setPref(LOCKPICK_TUMBLERS_PREF, false));

/** A host with no lockpick in the pack, over a Lockpicking of `skill`: DFU needs no item. */
function rig({ skill = 40, roll = 0.5 } = {}) {
  const player = {
    items: [],
    level: 4,
    skills: new Array(35).fill(skill),
    skillUses: new Array(35).fill(0),
    stats: {},
  };
  const said = [],
    lines = [],
    mounted = [],
    sounds = [];
  const host = createLockpickHost({
    player,
    mount: (w) => mounted.push(w),
    say: (l) => said.push(l),
    line: (l) => lines.push(l),
    changed: () => {},
    audio: { playOneShot: (k) => sounds.push(k) },
    rolls: () => roll,
    overlay: () => {
      throw new Error('the window opens only on the option');
    },
  });
  return { host, player, said, lines, mounted, sounds, tally: () => player.skillUses[SKILLS.Lockpicking] };
}

test("LOCKPICK-MODE: DFU's single roll is the default - the window and the Lockpick item are the option", () => {
  assert.equal(lockpickTumblersOn(), false);
  setPref(LOCKPICK_TUMBLERS_PREF, true);
  assert.equal(lockpickTumblersOn(), true);
});

test("LOCKPICK-MODE: a locked chest rolls once with no pick in the pack - one tally, DFU's interior chance, and the tail only on a success", () => {
  const lock = 6,
    skill = 40,
    chance = interiorLockpickingChance(4, lock, skill);
  assert.ok(chance > 5 && chance < 95, 'a chance a roll can land either side of');
  const win = rig({ skill, roll: (chance - 1) / 100 });
  let opened = 0;
  assert.equal(win.host.inside({ lock, key: 'k', onOpen: () => opened++ }), true);
  assert.deepEqual([opened, win.tally(), win.mounted.length, win.said], [1, 1, 0, []]);
  const lose = rig({ skill, roll: chance / 100 });
  lose.host.inside({ lock, key: 'k', onOpen: () => opened++ });
  assert.deepEqual(
    [opened, lose.tally(), lose.said],
    [1, 1, [LOCKPICKING_FAILURE_TEXT]],
    'a failure tallies, says so and opens nothing',
  );
  assert.notEqual(LOCKPICK_HOST_WORDS.need(), LOCKPICKING_FAILURE_TEXT);
});

test("LOCKPICK-MODE: a front door rolls DFU's exterior chance once; a failure is kept and the door stays shut until the skill rises", () => {
  discoverBuilding(7, { buildingKey: 3, name: 'House' });
  const lock = 3,
    skill = 40,
    chance = exteriorLockpickingChance(lock, skill);
  const place = { locId: 7, buildingKey: 3 };
  const lose = rig({ skill, roll: (chance - 1) / 100 + 0.0101 }); // 1 + floor(100 * roll) = chance + 1 > chance: a miss
  let entered = 0;
  lose.host.frontDoor({ lock, skill, place, key: 'front:7:3', enter: () => entered++ });
  assert.deepEqual(
    [entered, lose.tally(), lose.said, getLastLockpickAttempt(7, 3)],
    [0, 1, [LOCKPICKING_FAILURE_TEXT], skill],
  );
  lose.host.frontDoor({ lock, skill, place, key: 'front:7:3', enter: () => entered++ });
  assert.equal(lose.tally(), 1, 'the retry gate: the same skill rolls nothing and tallies nothing');
  assert.equal(lose.said.length, 2, 'and the look-at line says how hard the lock is');
  const win = rig({ skill: skill + 1, roll: 0 });
  win.host.frontDoor({ lock, skill: skill + 1, place, key: 'front:7:3', enter: () => entered++ });
  assert.deepEqual(
    [entered, win.tally(), win.lines],
    [1, 1, [LOCKPICKING_SUCCESS_TEXT]],
    'a raised skill rolls again and the door is entered',
  );
  assert.equal(win.sounds.length, 1, 'with the unlock chime');
});

test("LOCKPICK-MODE: a dungeon door is left to the action graph's own DFU roll (retry latch and all) while the option is off, and to the window when on", () => {
  const actions = new ActionSystem(null, {});
  const rig1 = rig();
  rig1.host.wire(actions, 'door:1');
  assert.equal(
    actions.onLockpickAttempt({ currentLockValue: 6, key: 'a' }),
    false,
    'off: the host declines, the graph rolls',
  );
  setPref(LOCKPICK_TUMBLERS_PREF, true);
  assert.equal(actions.onLockpickAttempt({ currentLockValue: 6, key: 'a' }), true, 'on: the host takes it');
  assert.deepEqual(rig1.said, [LOCKPICK_HOST_WORDS.need()], 'and asks for a lockpick');
});

const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const CUBE = {
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1]),
  indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
};

test("LOCKPICK-MODE: through the real action graph, a wired host off the option leaves DFU's roll whole - one tally, the retry latch, no item", () => {
  let roll = 0.99,
    skill = 30;
  const tallies = [],
    results = [];
  const actions = new ActionSystem(
    { addMesh: () => {}, removeBucket: () => {}, raycast: () => Infinity },
    { playerLevel: () => 5, lockpickSkill: () => skill, rolls: () => roll },
  );
  actions.onLockpickTally = () => tallies.push(1);
  actions.onLockpickResult = (o, ok) => results.push(ok);
  rig().host.wire(actions, 'door:1');
  const door = actions.addDoor(CUBE, I, { startingLockValue: 4 });
  assert.equal(actions.attemptLockpicking(door), false);
  assert.deepEqual([tallies.length, results, door.failedSkillLevel], [1, [false], 30], 'a failed roll is recorded');
  actions.attemptLockpicking(door);
  assert.equal(tallies.length, 1, 'the same skill is silent');
  skill = 31;
  roll = 0.3;
  assert.equal(actions.attemptLockpicking(door), true, 'a raised skill rolls again and opens the door');
  assert.equal(door.currentLockValue, 0);
});

test("LOCKPICK-MODE: the row defaults to DFU's roll and the online lane forces it", () => {
  const row = FEATURES.find((f) => f.id === 'lockpick-tumblers');
  assert.deepEqual([row.control.key, row.control.initial, row.control.online], [LOCKPICK_TUMBLERS_PREF, false, 'room']);
  assert.equal(ONLINE_FORCED_PREFS[LOCKPICK_TUMBLERS_PREF], false);
});
