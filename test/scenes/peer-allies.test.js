// Another player's summon and companion stand here as that player's allies, and my own ride my foes frame named as mine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { companionWords, standCrewPuppet, coopCandidates } from '../../src/scenes/peer-allies.js';
import { staticTeamOf } from '../../src/characters/enemy/enemyTargets.js';
import { KNIGHT_CITYWATCH_ID } from '../../src/characters/enemy/enemyEntity.js';

const DAEDROTH = 13;
/** A foe of my pool, as these doors read it. */
const foe = (over = {}) => ({
  mobileType: DAEDROTH,
  dead: false,
  companion: null,
  puppet: null,
  ai: { isHostile: true },
  entity: { team: staticTeamOf(DAEDROTH), mobileTeam: staticTeamOf(DAEDROTH), name: 'Daedroth' },
  ...over,
});
const ally = (over = {}) =>
  foe({
    ai: { isHostile: false },
    entity: { team: 'PlayerAlly', mobileTeam: 'PlayerAlly', name: 'Daedroth' },
    ...over,
  });

test('my summon rides my foes frame named as my ally; a crewman, a refugee, a watchman, a body and a plain foe do not', () => {
  const summon = ally();
  const companion = ally({ companion: 'crew:1', shipmate: true, entity: { team: 'PlayerAlly', name: 'Brynja' } });
  const crewman = ally({ shipmate: true });
  const refugee = ally({ refugee: true });
  const watchman = ally({ mobileType: KNIGHT_CITYWATCH_ID });
  const body = ally({ dead: true });
  const plain = foe();
  const sources = [summon, companion, crewman, refugee, watchman, body, plain];
  const records = sources.map((f, i) => ({ i: i + 1, d: f.dead ? 1 : 0 }));
  const words = companionWords(records, (r) => sources[r.i - 1]);
  assert.deepEqual(words, { cp: [1, 2], cn: ['Daedroth', 'Brynja'] });
});

test("another player's summon stands here as an ally that my foes fight, frame after frame, and as its species again once its owner stops naming it", () => {
  const pup = foe({ puppet: 'peerA', seq: 7, ai: { isHostile: true } });
  standCrewPuppet(pup, false, true);
  assert.equal(pup.entity.team, 'PlayerAlly', 'not shown as a hostile foe');
  assert.equal(pup.companion, 'peer:peerA:7');
  assert.ok(!pup.shipmate, 'it wears no crew bar');
  standCrewPuppet(pup, false, true);
  assert.equal(pup.companion, 'peer:peerA:7', 'the next frame keeps it');
  const mine = foe();
  assert.deepEqual(coopCandidates(mine, [pup]), [pup], 'a hostile foe of mine may fight it');
  standCrewPuppet(pup, false, false);
  assert.equal(pup.companion, null);
  assert.equal(pup.entity.team, staticTeamOf(DAEDROTH), 'unnamed, it is its species again');
});

test('a crewman puppet keeps the crew law it had: a shipmate while named, its species when no longer named', () => {
  const pup = foe({ puppet: 'peerA', seq: 3 });
  standCrewPuppet(pup, true, true);
  assert.equal(pup.shipmate, true);
  assert.equal(pup.entity.team, 'PlayerAlly');
  standCrewPuppet(pup, false, false);
  assert.equal(pup.shipmate, false);
  assert.equal(pup.entity.team, staticTeamOf(DAEDROTH));
});
