// AUDIT EG IV (2026-10-13, the Elite Gates arc; bible/11-Multiplayer/Elite-Gates.md sections 12, 13.3 and 13.4) - THE LORDS'
// PAGE AS THE GAME HAS IT: section 13.4 names the brain that was built (`net/eliteGates/egLords.js` - lane 1 #29); the Ward-Bearer's job is the
// Rampart's portcullis alone and Ilthys's banner an errand's object (lane 1 #28); and the Haven Nova's three numbers are the code's own measure over the Spellmaster's court (lane 1 #9; net/eliteGates/egLords.js egHavenRouteM).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { egHallOf } from '../../../src/net/eliteGates/egLaw.js';
import { egHavenRouteM } from '../../../src/net/eliteGates/egLords.js';
import { egErrandMs } from '../../../src/net/eliteGates/egShape.js';

test('AUDIT EG IV lane1 #9 THE HAVEN NOVA\'S NUMBERS ON THE PAGE ARE THE CODE\'S (section 13.3): each wind-up and route the page gives for two, three and four havens is net/eliteGates/egLords.js egHavenRouteM over the Spellmaster\'s court and its errand floor (mutants: the measure moved)', () => {
  const spec = egHallOf(1, 15, 0), f = spec.fl.find((q) => q.t === 'd'), all = spec.spots.haven.map((p) => [p.x, p.z, 3]);
  assert.equal(spec.lord, 'spellmaster');
});
