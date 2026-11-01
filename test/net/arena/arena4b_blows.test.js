// ARENA4b: THE BLOW'S SEQUENCE AND THE SPELL ON A PLAYER. The relay's
// referee counts a swing through several bodies as one blow by its `q` (net/arena/arenaBrain.js refBlow), but the client never
// sent it, so a cleave through a Grand Melee spent the rate four bodies at a time; and a spell of mine that met my
// opponent went nowhere (only a swing and a shaft reached `rival`). Now the dungeon's host numbers every swing, shaft
// and spell (scenes/dungeonContext.js nextArenaQ) and sends it with the claim, a spell that meets my opponent goes to
// the referee as a spell (spellOnRival, through the duel's own seam in the cast engine), and the referee counts a cast
// once however many bodies it met.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openBout, joinBout, stepBout, poseOf, refBlow } from '../../../src/net/arena/arenaBrain.js';
import { ARENA_HIT, ARENA_HIT_HZ_MAX, ARENA_SPELLS_IN, ARENA_SPELL_MAX, ARENA_TICK_MS, ARENA_FLOOR_CENTRE } from '../../../src/net/arena/arenaLaw.js';
import { createArenaOnline } from '../../../src/scenes/arena/arenaOnline.js';
import { boutLive } from '../../../src/systems/arena/arenaBout.js';

const C = ARENA_FLOOR_CENTRE;
/** A Grand Melee on the relay (tier 10's first bout: three of its fighters, every one for themselves), at its fight,
 *  the fighter and the three a step apart. */
function melee() {
  let now = 10_000;
  const st = openBout({ o: '0000000000000abc', kind: 'pve', f: [{ sub: 'acct-ceryn', name: 'Ceryn', lv: 20, cl: 20 }], tier: 9, bout: 0, now });
  joinBout(st, 'acct-ceryn', 'f', now);
  for (let i = 0; i < 400 && !boutLive(st.b); i++) { now += ARENA_TICK_MS; stepBout(st, now, () => 0.5); }
  assert.ok(boutLive(st.b), 'the fight');
  poseOf(st, 'p0', C[0], C[2], now);
  for (const a of st.ai) { a.pos = [C[0] + 1, C[2]]; a.mv = null; a.atk = null; a.nextAt = Infinity; }
  return { st, now: () => now, step: (ms) => { now += ms; } };
}
const healthOf = (st, id) => st.b.fighters.find((f) => f.id === id).health;

test('ARENA4b a cleave is one blow: one swing\'s sequence through three bodies spends the rate once, so four swings in a second land on all twelve; without the sequence four bodies are all a second holds (mutants: the sequence ignored; each body a blow)', () => {
  const M = melee();
  const before = M.st.ai.map((a) => healthOf(M.st, a.id));
  let landed = 0;
  for (let q = 1; q <= ARENA_HIT_HZ_MAX; q++) {
    for (const a of M.st.ai) if (refBlow(M.st, 'p0', { i: a.id, d: 1, r: ARENA_HIT.Melee, w: 116, m: 1, q }, M.now()).got > 0) landed++;
    M.step(100);
  }
  assert.equal(landed, ARENA_HIT_HZ_MAX * 3, 'every body of every swing');
  M.st.ai.forEach((a, i) => assert.equal(healthOf(M.st, a.id), before[i] - ARENA_HIT_HZ_MAX));
  const N = melee();
  let bare = 0;
  for (let k = 0; k < ARENA_HIT_HZ_MAX; k++) { for (const a of N.st.ai) if (refBlow(N.st, 'p0', { i: a.id, d: 1, r: ARENA_HIT.Melee, w: 116, m: 1 }, N.now()).got > 0) bare++; N.step(100); }
  assert.equal(bare, ARENA_HIT_HZ_MAX, 'unnumbered, each body is a blow');
});

test('ARENA4b a spell is one cast however many bodies its blast meets: three casts in five seconds land on every body they met, the fourth is refused; each body capped at sixty (mutants: the cast counted per body; the fourth cast believed)', () => {
  const M = melee();
  let landed = 0;
  for (let q = 1; q <= ARENA_SPELLS_IN; q++) {
    for (const a of M.st.ai.slice(0, 2)) if (refBlow(M.st, 'p0', { i: a.id, d: 10, r: ARENA_HIT.Spell, q: 100 + q }, M.now()).got > 0) landed++;
    M.step(1100);
  }
  assert.equal(landed, ARENA_SPELLS_IN * 2, 'three casts, two bodies each');
  assert.equal(refBlow(M.st, 'p0', { i: M.st.ai[2].id, d: 10, r: ARENA_HIT.Spell, q: 200 }, M.now()).got, 0, 'the fourth cast in five seconds');
  M.step(5000);
  const r = refBlow(M.st, 'p0', { i: M.st.ai[2].id, d: 999, r: ARENA_HIT.Spell, q: 201 }, M.now());
  assert.ok(r.got > 0 && r.got <= ARENA_SPELL_MAX, `the window past, a cast lands, sixty at most: ${r.got}`);
});

test('ARENA4b the client sends the sequence and the spell: a blow\'s claim carries its `q`, a spell its kind; a watcher\'s blow is no claim (mutants: the sequence dropped; a spell sent as a swing)', async () => {
  const sent = [];
  const session = { status: 'open', arenaOk: true, room: 'world:1,1', sendArena: (w) => { sent.push(w); return true; } };
  const deps = (link) => ({ now: () => 0, session: () => session, makeHall: () => link, bouts: { ask() {}, relayWord: () => true, dismiss() {}, holds: () => false, relay: () => null },
    account: { board: async () => ({ ok: false }), claim: async () => ({ ok: true, data: {} }), me: () => null }, enterFloor: () => true });
  const A = createArenaOnline(deps(null));
  A.act('spectate', { o: '0123456789abcdef' });
  session.room = 'arena:b0123456789abcdef';
  assert.equal(A.hit({ i: 'p1', d: 12, kind: 'melee', q: 4 }), false, 'from the stands nothing is claimed');
  assert.deepEqual(sent, []);
  const link = { status: 'open', join() {}, leave() {}, sendArena: () => true, onArena: null };
  const B = createArenaOnline(deps(link));
  B.model();
  link.onArena({ k: 'go', o: '0123456789abcde0', side: 0, vs: { n: 'Brann' } });
  await new Promise((r) => setTimeout(r, 0));
  session.room = 'arena:b0123456789abcde0';
  B.hit({ i: 'p1', d: 12.2, kind: 'melee', w: 120, m: 2, q: 41 });
  B.hit({ i: 'p1', d: 30, kind: 'spell', q: 42 });
  assert.deepEqual(sent, [{ k: 'hit', i: 'p1', d: 12, r: ARENA_HIT.Melee, w: 120, m: 2, q: 41 }, { k: 'hit', i: 'p1', d: 30, r: ARENA_HIT.Spell, w: -1, m: 0, q: 42 }]);
});

