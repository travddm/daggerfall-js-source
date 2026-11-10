import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  stealthPoseOf,
  readPeerStealth,
  stealthCheckWire,
  tallyPeerStealth,
  readOwnerRecord,
  applyCalm,
  createPeerSensesLink,
  stealthOfShown,
} from '../../../src/characters/enemy/peer-senses.ts';
import { STEALTH_WIRE_MAX } from '../../../src/net/stealth-wire.ts';
import { SKILLS } from '../../../src/systems/skills.js';

type Player = { isPlayer: boolean; level: number; skills: number[]; stats: { personality: number } } & {
  skillOverrides?: Record<number, number>;
  stealthCheckBox?: { minute: number };
};

const player = (stealth: number): Player => {
  const skills = new Array(35).fill(0);
  skills[SKILLS.Stealth] = stealth;
  return { isPlayer: true, level: 1, skills, stats: { personality: 50 } };
};

test('the pose carries the live Stealth and the half-speed state, each omitted at 0', () => {
  assert.deepEqual(stealthPoseOf(player(40), false), { sk: 40 });
  assert.deepEqual(stealthPoseOf(player(40), true), { sk: 40, hv: 1 });
  assert.deepEqual(stealthPoseOf(player(0), false), {});
  const boosted = { ...player(40), skillOverrides: { [SKILLS.Stealth]: 250 } };
  assert.deepEqual(stealthPoseOf(boosted, false), { sk: STEALTH_WIRE_MAX });
});

test("a peer's candidate reads the pose's fields, and nothing it cannot hold", () => {
  const c = { sk: 7, hv: 1 };
  readPeerStealth(c, { sk: 55 });
  assert.deepEqual(c, { sk: 55, hv: 0 });
  readPeerStealth(c, { sk: 101, hv: 1 });
  assert.deepEqual(c, { sk: 100, hv: 1 }, 'a skill past the cap reads at the cap');
  readPeerStealth(c, null);
  assert.deepEqual(c, { sk: 0, hv: 0 }, 'a peer with no pose');
});

test("the owner's record names the minute of the foe's last stealth check at the peer it hunts", () => {
  assert.equal(stealthCheckWire({ target: { isPeer: true }, peerStealthMinute: 0x10005 }), 5);
  assert.equal(stealthCheckWire({ target: { isPeer: true }, peerStealthMinute: -1 }), undefined, 'no check yet');
  assert.equal(
    stealthCheckWire({ target: { isPeer: false }, peerStealthMinute: 9 }),
    undefined,
    'the owner is no peer',
  );
  assert.equal(stealthCheckWire(null), undefined);
});

test('the Stealth tally is once a classic minute, shared with the local foes', () => {
  const me = player(30);
  let tallies = 0;
  const tally = () => {
    tallies++;
  };
  assert.equal(tallyPeerStealth(me, 10, tally), true);
  assert.equal(tallyPeerStealth(me, 10, tally), false, 'a second check in the same minute');
  assert.equal(tallyPeerStealth(me, 11, tally), true);
  assert.equal(tallies, 2);
});

test("an owner's record: my tally on a new check minute, my language roll once, a success sent as calm", () => {
  const me = player(30);
  const state = {};
  let rolls = 0;
  let calms = 0;
  const deps = {
    playerEntity: me,
    minute: 20,
    rollLanguage: (edge: { justEncountered: boolean; isHostile: boolean }) => {
      rolls++;
      assert.equal(edge.justEncountered, true, 'the roll sees a first meeting');
      return { pacified: true };
    },
    sendCalm: () => {
      calms++;
    },
  };
  assert.equal(readOwnerRecord(state, { sc: 4 }, false, deps), false, 'a record at someone else does nothing');
  assert.equal(rolls, 0);
  assert.equal(me.stealthCheckBox, undefined);

  assert.equal(readOwnerRecord(state, { sc: 4 }, true, deps), true);
  assert.equal(rolls, 1);
  assert.equal(calms, 1);
  assert.equal(me.stealthCheckBox?.minute, 20, 'the check tallied my Stealth for this minute');

  assert.equal(readOwnerRecord(state, { sc: 4 }, true, { ...deps, minute: 21 }), false, 'one roll a foe');
  assert.equal(rolls, 1);
  assert.equal(me.stealthCheckBox?.minute, 20, 'the same check minute tallies once');
  readOwnerRecord(state, { sc: 5 }, true, { ...deps, minute: 21 });
  assert.equal(me.stealthCheckBox?.minute, 21, 'a new check minute tallies again');
});

test('a failed roll sends nothing to the owner', () => {
  let calms = 0;
  const deps = {
    playerEntity: player(0),
    minute: 1,
    rollLanguage: () => ({ pacified: false }),
    sendCalm: () => {
      calms++;
    },
  };
  assert.equal(readOwnerRecord({}, {}, true, deps), false);
  assert.equal(calms, 0);
});

test("the owner's calm stands a live hostile foe down, once", () => {
  const ai = { isHostile: true };
  assert.equal(applyCalm(ai, false), true);
  assert.equal(ai.isHostile, false);
  assert.equal(applyCalm(ai, false), false, 'already pacified');
  assert.equal(applyCalm({ isHostile: true }, true), false, 'a dead foe');
  assert.equal(applyCalm(null, false), false, 'no foe at that number');
});

test("a host's link reads only live records aimed at this client, and sends a won roll down the blow's route", () => {
  const me = player(20);
  const sent: unknown[] = [];
  const link = createPeerSensesLink<{ id: string; dead?: boolean }>({
    playerEntity: me,
    isMe: (_f: { id: string }, at: unknown) => at === 'me',
    minute: () => 30,
    rollLanguage: () => ({ pacified: true }),
    send: (f: { id: string }, word: { calm: 1 }) => {
      sent.push([f.id, word]);
    },
  });
  const foe: { id: string; dead?: boolean } = { id: 'orc' };
  assert.equal(link.read(foe, { sc: 2 }, 'someone'), false, 'a record at another player');
  assert.equal(link.read(foe, { d: 1, sc: 2 }, 'me'), false, 'a dead record');
  assert.equal(sent.length, 0);
  assert.equal(link.read(foe, { sc: 2 }, 'me'), true);
  assert.deepEqual(sent, [['orc', { calm: 1 }]]);
  assert.equal(me.stealthCheckBox?.minute, 30);
  assert.equal(link.read(foe, { sc: 2 }, 'me'), false, 'one roll for each foe');
});

test("a peer's drawn pose gives the foes its stealth fields, and none for a peer without a pose", () => {
  assert.deepEqual(stealthOfShown({ sk: 33, hv: 1 }), { sk: 33, hv: 1 });
  assert.deepEqual(stealthOfShown(undefined), {});
});
