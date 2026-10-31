// REST-OPT (2026-09-27, Discord - Tabitha: "Allow party members to choose not to rest with their party").
//
// A MEMBER MAY REST ALONE. The switch is the player's own ("Rest with my party", uiPrefs `restWithParty`, default on,
// the player's own online); off, the party pose says `nr` (net/wire.js validPartyPose) and the party's rest goes on
// without them - no voter, nobody to gather, no rest to mirror - while their own rest is their own, as in a tavern.
// A leader who turns it off leaves everyone to rest for themselves. The law is systems/party/partyRestLaw.js's, run here on
// a table; world.js's seams are pinned by source (test/scenes/partyrest1.test.js's law for its closure).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validPartyPose } from '../../../src/net/wire.js';
import { restsAlone, partyRestsTogether, restAloneText } from '../../../src/systems/party/partyRestLaw.js';
import { PREF_DEFAULTS } from '../../../src/systems/uiPrefs.js';
import { ONLINE_PLAYERS_OWN_PREFS } from '../../../src/systems/online/onlineLane.js';

const src = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const POSE = Object.freeze({ px: 100, py: 200, loc: 'Daggerfall', in: 0, h: 30, hm: 60, f: 1000, fm: 2000, m: 10, mm: 20, race: 'Nord', gender: 'male', face: 2 });

test('REST-OPT the wire and the switch: `nr` rides the pose only as 1; the switch is on by default and the player\'s own online (mutants: `nr` coerced; the switch forced)', () => {
  assert.equal(validPartyPose({ ...POSE, nr: 1 }).nr, 1);
  assert.equal('nr' in validPartyPose({ ...POSE, nr: true }), false);
  assert.equal('nr' in validPartyPose({ ...POSE }), false, 'a pose from before this build rests with its party');
  assert.equal(PREF_DEFAULTS.restWithParty, true);
  assert.ok(ONLINE_PLAYERS_OWN_PREFS.includes('restWithParty'));
});

test('REST-OPT the law: a member whose pose says `nr` rests alone; my rest is the party\'s only while my switch is on AND the leader\'s is - a leader resting alone leaves everyone to themselves; the words for a vote said alone (mutants: the leader\'s switch ignored; mine ignored)', () => {
  const party = (leaderNr) => ({ leader: 'a-lead', members: [{ acct: 'a-lead', p: { ...POSE, ...(leaderNr ? { nr: 1 } : {}) } }, { acct: 'a-me', p: { ...POSE } }] });
  assert.equal(restsAlone({ p: { nr: 1 } }), true);
  assert.equal(restsAlone({ p: {} }), false);
  assert.equal(restsAlone(null), false);
  assert.equal(partyRestsTogether(true, party(false), false), true);
  assert.equal(partyRestsTogether(false, party(false), false), false, 'my switch off: my rest is my own');
  assert.equal(partyRestsTogether(true, party(true), false), false, 'the leader rests alone: so does everyone');
  assert.equal(partyRestsTogether(true, party(true), true), true, 'the leader is me: my own switch says');
  assert.equal(partyRestsTogether(false, party(false), true), false);
  assert.equal(partyRestsTogether(true, null, false), true, 'no party: nothing stops me');
  assert.match(restAloneText(false), /Rest with my party/);
  assert.match(restAloneText(true), /leader rests on their own/);
});

