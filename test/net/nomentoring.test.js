// The party leader can set the party to "no mentoring". The hub's `party.mentoring.off` and
// `party.mentoring.on` acts are the leader's alone; the party view carries `nm: 1` while it stands; and the mentor host
// (scenes/mentorHost.js) then mentors nobody, so the higher-level player fights at full strength and nobody gets the
// pupil's training bonus. The server profile's `party.allowNoMentoring` rule lets a server keep every party mentored.
// The panel's switch is test/net/soc3_socialpanel.test.js's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOCIAL_ACTS, validSocialAct, validSocialFrame, validPartyView, SOCIAL_ROOM } from '../../src/net/wire.js';
import { fakeRoom } from '../fakeRoom.mjs';
import { createMentorHost } from '../../src/scenes/mentorHost.js';
import { MENTOR_JOIN_MS } from '../../src/systems/mentorMode.js';
import { mentorEndedText } from '../../src/systems/mentorText.js';
import { partyMentoring, noMentoringField, noMentoringAllowed } from '../../server/src/partyMentoring.js';
import { mentoringSwitch, noMentoringAllowed as panelAllows } from '../../src/ui/partyMentoring.js';
import { installProfile, _resetProfileForTests } from '../../src/systems/online/serverProfile.ts';
import { OFFICIAL_PROFILE } from '../../src/net/profile/officialProfile.ts';
import { resolveRules } from '../../src/net/profile/profileKeys.ts';

test('No mentoring wire: the two acts name nothing; a party view keeps nm 1 and drops any other value', () => {
  assert.deepEqual([SOCIAL_ACTS['party.mentoring.off'], SOCIAL_ACTS['party.mentoring.on']], ['', '']);
  assert.deepEqual(validSocialAct({ k: 'party.mentoring.off' }), { k: 'party.mentoring.off' });
  assert.deepEqual(validSocialAct({ k: 'party.mentoring.on' }), { k: 'party.mentoring.on' });
  const view = {
    id: 'party-1',
    leader: 'acct-a',
    members: [{ acct: 'acct-a', name: 'a', online: true, seen: null, peers: [], p: null }],
  };
  assert.equal(validPartyView({ ...view, nm: 1 }).nm, 1);
  assert.equal('nm' in validPartyView(view), false);
  assert.equal('nm' in validPartyView({ ...view, nm: 'yes' }), false);
});

const ofKind = (ws, k) => ws.sent.filter((m) => m.t === 'social' && m.k === k);
const lastOf = (ws, k) => ofKind(ws, k).at(-1) ?? null;
const errors = (ws) => ofKind(ws, 'error').map((m) => m.m);
async function withHub(fn) {
  const r = fakeRoom(SOCIAL_ROOM);
  const realNow = Date.now;
  let clock = 1e12;
  Date.now = () => clock;
  const tick = (ms = 600) => {
    clock += ms;
  };
  const act = (ws, o) => r.raw(ws, JSON.stringify({ t: 'social', ...o }));
  const join = async (n) => {
    const ws = r.connect();
    await r.hello(ws, `peer-${n}`, null, { name: n, acct: `acct-${n}`, asecret: `secret-of-acct-${n}` });
    tick(10);
    return ws;
  };
  try {
    await fn({ r, act, join, tick });
  } finally {
    Date.now = realNow;
  }
}

test('No mentoring hub: the leader sets no mentoring and back - stored, said to every member in the party view; a member and a player in no party are refused', () =>
  withHub(async ({ r, act, join, tick }) => {
    const a = await join('a'),
      b = await join('b'),
      c = await join('c');
    await act(a, { k: 'party.invite', peer: 'peer-b' });
    tick();
    await act(b, { k: 'party.accept', party: lastOf(b, 'invite').party });
    tick();
    const pid = a.att.party;
    await act(c, { k: 'party.mentoring.off' });
    tick();
    assert.equal(errors(c).at(-1), 'you are not in a party');
    await act(b, { k: 'party.mentoring.off' });
    tick();
    assert.equal(errors(b).at(-1), 'only the leader can do that');
    assert.equal(r.store.get('party:' + pid).nm, undefined, 'a refusal changed nothing');
    await act(a, { k: 'party.mentoring.off' });
    tick();
    assert.equal(r.store.get('party:' + pid).nm, 1);
    for (const ws of [a, b]) {
      const f = lastOf(ws, 'party');
      assert.equal(f.party.nm, 1, 'every member reads it');
      assert.ok(validSocialFrame(f), JSON.stringify(f));
    }
    await act(a, { k: 'party.mentoring.on' });
    tick();
    assert.equal('nm' in r.store.get('party:' + pid), false);
    for (const ws of [a, b]) assert.equal('nm' in lastOf(ws, 'party').party, false, 'mentoring again');
  }));

test('No mentoring host: in a no-mentoring party the high-level member is themself at once and a low-level partner beside them never mentors them; mentoring again engages after the join wait', () => {
  const me = { name: 'Hero', isPlayer: true, level: 30, activeEffects: [], items: [], stats: {}, skills: 40 };
  const lines = [];
  const state = { nm: false };
  const social = {
    get party() {
      return state.nm ? { members: [], nm: 1 } : { members: [] };
    },
    others: () => [{ acct: 'low', online: true, p: { cl: 5 } }],
  };
  const host = createMentorHost({
    player: () => me,
    social: () => social,
    near: () => [{ acct: 'low', feet: [10, 0, 0] }],
    outdoors: () => false,
    feet: () => [0, 0, 0],
    fighting: () => false,
    chat: () => ({ active: 'main', push: (_tab, l) => lines.push(l.text) }),
  });
  host.frame(0);
  host.frame(MENTOR_JOIN_MS);
  assert.ok(me._mentor, 'mentored by default');
  state.nm = true;
  host.frame(MENTOR_JOIN_MS + 16);
  assert.equal(me._mentor, null, 'no mentoring: full strength the same frame');
  assert.equal(lines.at(-1), mentorEndedText(), 'and told so');
  host.frame(MENTOR_JOIN_MS * 4);
  assert.equal(me._mentor, null, 'still none, however long the partner stands beside');
  state.nm = false;
  host.frame(MENTOR_JOIN_MS * 5);
  host.frame(MENTOR_JOIN_MS * 6 + 1);
  assert.ok(me._mentor, 'the switch back: mentoring after the join wait');
});

/** A hub with one party, recording what the act stores and says. */
function partyRoom(party) {
  const room = { stored: [], said: [] };
  room._myParty = async (me) => [party.members.includes(me) ? party : null];
  room._putParty = async (p) => {
    room.stored.push(p);
  };
  room._sayParty = async (p) => {
    room.said.push(p);
  };
  return room;
}

test('No mentoring profile rule, relay: with the rule off the leader is refused and nothing is stored; a stored nm leaves the view; the official profile allows it', async () => {
  const off = resolveRules({ 'party.allowNoMentoring': false });
  const official = resolveRules(OFFICIAL_PROFILE.rules);
  assert.equal(noMentoringAllowed(official), true, 'the official profile allows the switch');
  assert.equal(noMentoringAllowed(off), false);
  const party = { id: 'party-1', leader: 'a', members: ['a', 'b'] };
  const room = partyRoom(party);
  assert.equal(await partyMentoring(room, 'a', {}, false, 0, off), 'this server keeps mentoring on');
  assert.deepEqual([room.stored, room.said], [[], []], 'a refusal changes nothing');
  assert.equal(await partyMentoring(room, 'a', {}, true, 0, off), null, 'turning mentoring back on is never refused');
  assert.equal('nm' in room.stored.at(-1), false);
  assert.equal(await partyMentoring(room, 'a', {}, false, 0, official), null);
  assert.equal(room.stored.at(-1).nm, 1);
  assert.deepEqual(noMentoringField({ ...party, nm: 1 }, official), { nm: 1 });
  assert.deepEqual(noMentoringField({ ...party, nm: 1 }, off), {}, 'a party set before the rule changed is mentored');
  assert.deepEqual(noMentoringField(party, official), {});
});

test('No mentoring profile rule, client: the leader gets no switch when the installed profile sets the rule off, and gets it back under the official profile', () => {
  const btn = (label) => ({ label });
  const party = {};
  try {
    assert.equal(panelAllows(), true, 'nothing installed reads the official profile');
    assert.equal(mentoringSwitch(btn, party, true, () => {}).length, 1);
    installProfile({ ...OFFICIAL_PROFILE, rules: { 'party.allowNoMentoring': false } }, 'a'.repeat(64));
    assert.equal(panelAllows(), false);
    assert.deepEqual(
      mentoringSwitch(btn, party, true, () => {}),
      [],
      'no switch for the leader',
    );
    installProfile(OFFICIAL_PROFILE, 'b'.repeat(64));
    assert.equal(mentoringSwitch(btn, party, true, () => {}).length, 1);
  } finally {
    _resetProfileForTests();
  }
});
