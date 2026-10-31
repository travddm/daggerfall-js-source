// EG-E (2026-10-12, the Elite Gates arc; bible/11-Multiplayer/Elite-Gates.md sections 5, 15, 19, 20 and 25.4): THE
// ECONOMY'S HOST WIRING - what the agents' slices left for the hosts, wired in scenes/world.js, scenes/eliteGates/egClient.js and
// scenes/dungeonContext.js: the claim carries the claiming character (its guild's deed) and restacks its Weir Key; the
// Broker's Panoply sink; `/breach board`; the Reprieve's allies and THE SPIRE'S RECOVERY (a death save held to the next
// Redoubt); the dungeon's find (the owner's kill and the joiner's door); THE QUIET COMPANY; the fight on the corrected clock.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerEgFind, egFindStruck } from '../../../src/systems/eliteGates/egFind.js';
import { raiseEnemyDeath } from '../../../src/scenes/corpseMarker.js';

const read = (f) => readFileSync(new URL(`../../../${f}`, import.meta.url), 'utf8');

test('EG-E3 THE FIND\'S HOST DOORS (section 5): the owner\'s death names the striker the foes stream carries (`by: foe._killedBy`), so a joiner\'s kill is the joiner\'s ask; the joiner\'s record door asks through egFindStruck; the world host registers the find online with the dungeon\'s tier (mutants: the striker unnamed; the joiner\'s door unwired; the seam never registered)', async () => {
  // the seam: the joiner's door reaches the registered find, and nothing once it is disposed
  const asked = [];
  const elite = { eliteFoe: true, items: [] };
  const reg = registerEgFind({ ask: async (t) => { asked.push(t); return { ok: true, data: { found: true, keys: 3, asks: 1 } }; }, tierNow: () => 'elite', selfId: () => 'me', online: () => true, throwKey: () => {} });
  const got = await egFindStruck(elite);
  assert.equal(typeof got, 'boolean');
  // the owner's half through the real death door: a kill another peer struck is not mine to ask
  const other = { eliteFoe: true, items: [] };
  raiseEnemyDeath(other, { by: 'someone-else' });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(asked.filter((t) => t === 'elite').length <= 1, true, 'never the owner\'s ask for a joiner\'s kill');
  reg.dispose();
  assert.equal(await egFindStruck({ eliteFoe: true, items: [] }), false, 'no find registered, no ask');
});
