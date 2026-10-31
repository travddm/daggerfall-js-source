// AUDIT CARDS-6 (2026-10-09, bible/01-Overview/audits/Audit-Cards-6.md) lane E: THE HOLD'EM CLIENT, THE GESTURES, THE SEATED
// SPRITE AND THE RECORDS, driven. The interior host's card block run (test/systems/card/cardssaid.test.js's way: sliced from
// scenes/worldModes.js, `let cardSeat = null;` to the hurt listener) over the real panel, the real gestures and - for the
// relay's words - the real relay on test/fakeRoom.mjs: a press on the hand is its own pointer's, and a press the window
// never heard let go is let go unread (E2: a stale press folded the next chip drag); a finger the cards took is never
// the touch layer's stick, on either half (E1's last door: a squeeze from the hand's left edge walked him off the seat);
// the online panel offers Iliac Hand and the packs whenever he is not in a hand (E7) and says a cloth that plays Iliac
// Hand instead of asking for its chair for ever (E8); the click checks and the push folds through the host for real
// (E20: the old pins read the text); the narrow screen's hand fitted and lifted clear of the panel (E21); the squeeze
// follows the finger down (E22); the class sprite's sink through its own path (E20); the relay that deals Hold'em (E20).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { nearestFreeSeat, takenSeats } from '../../src/world/card/cardTables.js';
import { RemoteCardTable } from '../../src/systems/card/cardRemoteTable.js';
import * as court from '../../src/systems/court.js';
import * as sess from '../../src/systems/card/cardTableSession.js';
import * as hudm from '../../src/ui/card/cardTableHud.js';
import * as hand from '../../src/world/card/cardHand.js';
import { CARD_W, CARD_L, chipDiscs } from '../../src/world/card/cardMotion.js';
import { cardMatrix } from '../../src/render/cardTableDraw.js';
import { holdCursor } from '../../src/player/pointerLock.js';
import { rayDirFromScreen, projectToScreen } from '../../src/player/tapRay.js';
import { perspective, lookAt, mirrorProjectionX } from '../../src/world/mat4.js';
import { regularsToStand, regularBark, BARK_MS } from '../../src/world/card/cardRegulars.js';
import { fakeDoc, fakeWin } from '../decorFakes.mjs';
import { cardPackPrice, buyCardPack } from '../../src/systems/card/cardSources.js';
import { openIliacTableGame } from '../../src/scenes/iliacTableGame.js';
import { openGambitTableGame, gambitTableOn } from '../../src/scenes/gambitTableGame.js';   // KG3: the third game at the table
import { gambitBoardKey } from '../../src/ui/gambitTableHud.js';   // KG3: the board's own keys, the cloth's listener's
import { regularLook } from '../../src/world/card/cardRegulars.js';
import { seatTopByte } from '../../src/player/seatPose.js';
import { iliacGrade } from '../../src/systems/iliac/iliacPatrons.js';
import { giveBinderAtChargen } from '../../src/systems/iliac/iliacItems.js';
import { skillValue, SKILLS } from '../../src/systems/skills.js';
import { liveStat } from '../../src/systems/statMods.js';
import { attachTouch } from '../../src/ui/touch/touch.js';
import { setPref, _resetForTests as resetPrefs } from '../../src/systems/uiPrefs.js';
import { HOLDEM_FIRST_MS, newTable, sit, tableLook } from '../../src/net/holdemTable.js';
import { STARTER_DECK } from '../../src/net/iliac/iliacCards.js';
import { relaySupportsHoldem, HOLDEM_RELAY_MIN, RELAY_VERSION } from '../../src/net/wire.js';
import { RemotePlayers } from '../../src/net/remotePlayers.js';
import { SEAT_HIP_DROP } from '../../src/player/seatPose.js';
import { fakeRoom } from '../fakeRoom.mjs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const grab = (src, re, what) => { const m = re.exec(src); assert.ok(m, `${what} is no longer where this pin reads it`); return m[1]; };
const ROOM = 'interior:m100.200';

// THE FAKE GEOMETRY (lane E's s10 rig): the eye over the cloth, a screen point meeting the top at P(x, y), the held cards'
// middles projected onto `hand`; THE REAL GEOMETRY: the frame's own projection, for the hand as it is drawn
const W = 1100, H = 640, EYE = [0, 1.2, 0.5];
const P = (x, y) => [(x - 550) / 1000, 0.8, -(H - y) / 400];
const STACK = [600, 600], POT = [580, 450];
const seatedPlaces = (seatOf) => ({ seatOf, board: [[0, 0.8, -0.6]], table: { centre: [0, 0.8, -0.6], axisYaw: 0, halfLong: 1, halfShort: 1 },
  seats: seatOf.map(() => ({ stack: P(...STACK), holes: [P(550, 590), P(560, 590)], yaw: Math.PI })) });

/** An offline evening dealt and played on to the player's turn (lane E's s10 rig): `until` the law he must hold. */
function seatedOnHisTurn(h, until = (l) => !!l) {
  h.api.sitAtCardTable(0);
  h.press('Deal me in');
  const g = h.api.cardGame;
  let t = 0;
  for (; t < 900000; t += 100) {
    h.api.cardGameFrame(t);
    const l = g.session.legal();
    if (l && until(l)) break;
    if (l) { g.session.playerAct(l.check ? { type: 'check' } : l.call <= 2 * g.stakes.bb ? { type: 'call' } : { type: 'fold' }, t); h.api.cardGameFrame(t); }   // not the turn asked for: played on, cheaply
    if (g.session.over) { g.session = null; break; }
  }
  assert.ok(g.session?.legal(), 'the player\'s turn came');
  g.frame = { proj: new Float32Array(16), view: new Float32Array(16), eye: EYE.slice() };
  g.heldAt = [[0, 1, 0], [0.01, 1, 0]];
  return g;
}
const ev = (x, y, more = {}) => ({ clientX: x, clientY: y, button: 0, pointerId: 1, isPrimary: true, target: { closest: () => null }, ...more });
/** A drag of the chips from his stack into the pot. */
function chipDrag(win, more = {}) { win.fire('pointermove', ev(...STACK, more)); win.fire('pointerdown', ev(...STACK, more)); win.fire('pointermove', ev(...POT, more)); win.fire('pointerup', ev(...POT, more)); }
function withWindow(fn) {
  const prev = globalThis.window;
  const win = fakeWin();
  globalThis.window = win;
  try { return fn(win); } finally { globalThis.window = prev; }
}

// ── E1: THE TOUCH LAYER AND THE CARDS TOGETHER ─────────────────────────────────────────────────────────────────────
function stubEl() {
  return {
    id: '', textContent: '', children: [], _l: new Map(), attrs: {}, style: { cssText: '' },
    appendChild(c) { this.children.push(c); return c; },
    addEventListener(t, f) { if (!this._l.has(t)) this._l.set(t, []); this._l.get(t).push(f); },
    setAttribute(k, v) { this.attrs[k] = v; }, remove() { this.removed = true; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 600 }),
    fire(t, e) { for (const f of [...(this._l.get(t) ?? [])]) f(e); },
  };
}

// ── E7, E8: THE RELAY'S WORDS ────────────────────────────────────────────────────────────────────────────────────────
const gateKey = webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']).then(async (kp) => Buffer.from(await webcrypto.subtle.exportKey('pkcs8', kp.privateKey)).toString('base64'));

// ── E21, E22: THE HAND AS IT IS DRAWN ────────────────────────────────────────────────────────────────────────────────
/** The host's cardDrawGame on a frame of `w` x `h` from a seat's eye, the panel's box `box` (or none): the held matrices. */
function drawSeated(h, w, ht, box) {
  const g = h.api.cardGame;
  if (box) g.hud.root.getBoundingClientRect = () => ({ ...box, width: box.right - box.left, height: box.bottom - box.top });
  const eye = [0, 1.2, 0.5];
  const proj = mirrorProjectionX(perspective((60 * Math.PI) / 180, w / ht, 0.02, 100));
  const view = lookAt(eye, [0, 0.8, -0.6], [0, 1, 0]);
  h.api.cardDrawGame(g, proj, view, eye);
  const mats = [...g.hold.values()].map((x) => x.m);
  const corners = mats.flatMap((m) => [-1, 1].flatMap((sx) => [-1, 1].map((sz) => {
    const x = sx * CARD_W / 2, z = sz * CARD_L / 2;
    return projectToScreen([m[0] * x + m[8] * z + m[12], m[1] * x + m[9] * z + m[13], m[2] * x + m[10] * z + m[14]], w, ht, proj, view, null);
  })));
  return { g, proj, view, mats, xs: corners.map((s) => s.x), ys: corners.map((s) => s.y) };
}

// ── E20: THE RECORDS ─────────────────────────────────────────────────────────────────────────────────────────────────
test('AUDIT CARDS-6 E20: the relay that deals Hold\'em is TAVERN CARDS\' world178 - main\'s world176 and world177 deal nothing (mutants: the least relay)', () => {
  assert.equal(HOLDEM_RELAY_MIN, 178);
  for (const [v, ok] of [['world175', false], ['world176', false], ['world177', false], ['world178', true], [RELAY_VERSION, true]]) assert.equal(relaySupportsHoldem(v), ok, v);
});

test('AUDIT CARDS-6 E20: the class sprite\'s path sunk at its seat for real on a fake renderer, its name brought down with it; on its feet standing (the old pin read the text)', () => {
  const made = [];
  const renderer = { createBillboardBatch: (archive, rec, size) => { const b = { archive, rec, size }; made.push(b); return b; }, destroyBillboardBatch() {}, textures: { has: () => true } };
  const rp = new RemotePlayers({ renderer, deps: { fetchBytes: async () => null, palette: null, uploadRecordFrame: () => {} }, compose: async () => null });
  const bundle = { mobileUnit: { update: () => ({ record: 0, frame: 0, flip: false }) }, archive: 400, tex: { archive: 400, getSize: () => ({ width: 40, height: 80 }), getScale: () => ({ width: 0, height: 0 }) } };
  const peer = { id: 'p1', shown: { x: 2, y: 0, z: 3, st: 16 } };
  rp._shown = [];
  rp._syncMobilePeer(peer, bundle, (s) => [s.x, s.y, s.z], 0.016, [0, 1.6, 0]);
  const entry = rp._batches.get('p1');
  assert.equal(made.length, 1);
  assert.deepEqual(entry.batch.origin.map((v) => +v.toFixed(6)), [2, -SEAT_HIP_DROP, 3], 'sunk by the seat\'s drop');
  assert.ok(Math.abs(rp._shown[0].height - (entry.height - SEAT_HIP_DROP)) < 1e-9, 'the name over the sunk head');
  peer.shown = { x: 2, y: 0, z: 3 };
  rp._shown = [];
  rp._syncMobilePeer(peer, bundle, (s) => [s.x, s.y, s.z], 0.016, [0, 1.6, 0]);
  assert.deepEqual(entry.batch.origin, [2, 0, 3], 'stood up: on its feet');
  assert.equal(rp._shown[0].height, entry.height);
});
