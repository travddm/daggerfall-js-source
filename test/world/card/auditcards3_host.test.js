// AUDIT CARDS-3 (2026-10-08, bible/01-Overview/audits/Audit-Cards-3.md): THE HOSTS' SEAMS. The relay's frames on the cloth's
// own clock (D1); the panel's message rewritten in place, its slider and its buttons kept (B5); the next hand waiting
// for the cloth (C4); a friendly game never refusing a save (E-N5); the comments back on their own lines (D11).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fakeDoc } from '../../decorFakes.mjs';
import { createCardTableHud } from '../../../src/ui/card/cardTableHud.js';
import { CardScene, tablePlaces } from '../../../src/world/card/cardScene.js';
import { tableFrame, cardTableSeats } from '../../../src/world/card/cardTables.js';
import { PUSH_S } from '../../../src/world/card/cardMotion.js';

const read = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');

test('AUDIT CARDS-3 B5: a model that differs only in its message rewrites the message - the slider and the buttons are the same nodes', () => {
  const doc = fakeDoc();
  const hud = createCardTableHud({ onPress: () => {}, doc });
  const model = (message) => ({ phase: 'playing', title: 'T', note: null, seats: [], pot: 0, board: [], street: null, message, log: [],
    actions: [{ id: 'fold', label: 'Fold', enabled: true }, { id: 'raise', label: 'Raise to', enabled: true, min: 20, max: 400, step: 5 }] });
  hud.render(model('Your turn - 30 s.'));
  const kids = [...hud.root.children];
  hud.render(model('Your turn - 29 s.'));
  assert.deepEqual([...hud.root.children], kids, 'the same nodes');
  assert.ok(kids.some((n) => n.className === 'msg' && n.textContent === 'Your turn - 29 s.'), 'the message rewritten');
  hud.render({ ...model('Your turn - 28 s.'), pot: 30 });
  assert.notDeepEqual([...hud.root.children], kids, 'anything else rebuilds');
  const again = [...hud.root.children];
  hud.resetSlider();
  hud.render({ ...model('x'), pot: 30 });
  assert.notDeepEqual([...hud.root.children], again, 'a reset slider rebuilds at the law\'s own value');
});

test('AUDIT CARDS-3 C4: the cloth says when it is still - the last turned card, the last share home - and the host holds the deal for it', () => {
  const table = { aabb: { min: [10, 0, 20], max: [12, 0.8, 21] } };
  const seats = cardTableSeats(table, () => true);
  const scene = new CardScene({ places: tablePlaces(tableFrame(table), seats, [0, 1]), playerSeat: 0 });
  scene.onEvent({ t: 'hand', hand: 1, button: 0, seats: [0, 1], at: 0 }, () => -1);
  const dealt = scene.settledAt();
  scene.onEvent({ t: 'street', street: 'river', board: [1, 2, 3, 4, 5], at: 2000 }, () => -1);
  assert.ok(scene.settledAt() > Math.max(dealt, 2), 'a run-out still turning');
  scene.onEvent({ t: 'showdown', hand: 1, seats: [0, 1], result: { shown: false, pots: [{ amount: 40, seats: [0] }], payouts: [40, 0] }, board: [1, 2, 3, 4, 5], holes: [null, null], at: 2000 }, () => -1);
  const push = scene.pushes.at(-1);
  assert.equal(scene.settledAt(), Math.max(scene.busyUntil, push.t0 + PUSH_S), 'the pot\'s share home last');
});

