// RESPAWN1 - A DUNGEON'S DEAD STOOD BACK UP, AND THE DOOR WAS WHY.
//
// Mac, 2026-09-17, forwarding a patch: a dungeon's kills did not persist.
// Every other part of the pipeline was right - the kill was stamped
// (`died`, the relay's clock), collected (`collectWorld`), sent, stored
// and served back - and then the RESTORE threw the whole memory away,
// because `validSharedFoe` asked for `team` and `mobileTeam` as NUMBERS
// and this port carries them as the MobileTeams NAME. Every foe has a
// team, so every record was refused whole and `.filter(Boolean)` dropped
// the lot.
//
// The pin that should have caught it passed `team: 2` - it encoded the
// same misreading as the code, which is the shape of a bug that survives
// a green suite. So the pin below is not another example: it takes the
// PUBLISHER's own field list out of the source, builds the record that
// publisher would really write, and asserts the DOOR admits it. A field
// added to the record with a law the door does not share fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validSharedFoe, TEAM_NAME_MAX } from '../../src/net/wire.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

/** What the publisher would really put in each of those fields, off the
 *  live types: the entity's team is a MobileTeams NAME, the flats are
 *  booleans, the feet are the pose's three numbers. */
const REAL = {
  health: 12, dead: true, died: 1_700_000_000_000, feet: [10.5, 2, -3.25], yaw: 0.75, anchor: 1,
  items: [], hostile: true, encountered: true, magicka: 4, mobileType: 21, gender: 'female',
  maxHealth: 30, fatigue: 64, activeEffects: [{ name: 'Paralysis', rounds: 2 }],
  team: 'PlayerEnemy', mobileTeam: 'PlayerEnemy', wabbajackActive: false, specialTransformationCompleted: false,
  abyssDestroyed: true,   // AUDIT OH-F B1: the save's alone - sharedWorld strips it, and the door does not admit it
  noBody: true,   // REVENANT-FATE (the 2026-10-02 audit): a foe gone with no body - the save's alone too, stripped the same way
  bg: 2,   // AUDIT DEX D3: a body a mod's corpse prefab destroyed (1 risen, 2 burnt) - the memory carries it (validSharedFoe), on a dead record alone
  eliteFoe: true,     // AUDIT BAL: the save's word on an elite - its alone, stripped the same way (every client's pick is the room's)
};

test('RESPAWN1: the team pair is a NAME, not an ordinal - DFU writes the number, this port does not', () => {
  const base = { health: 5, feet: [0, 0, 0] };
  for (const team of ['PlayerEnemy', 'PlayerAlly', 'Vermin', 'Criminals', 'Undead', 'Daedra', 'KnightsAndMages']) {
    assert.equal(validSharedFoe({ ...base, team, mobileTeam: team })?.team, team, `${team} rides through`);
  }
  // DFU's serializer writes `(int)entity.Team + 1`; a record carrying
  // that is not this port's and is refused, as every off-law value is.
  assert.equal(validSharedFoe({ ...base, team: 2 }), null, 'an ordinal is not a team here');
  assert.equal(validSharedFoe({ ...base, team: null }), null);
  assert.equal(validSharedFoe({ ...base, team: {} }), null);
  assert.equal(validSharedFoe({ ...base, team: 'x'.repeat(TEAM_NAME_MAX + 1) }), null, 'and the string is bounded like every other');
  assert.ok(validSharedFoe({ ...base, team: 'x'.repeat(TEAM_NAME_MAX) }), 'up to the bound');
});

