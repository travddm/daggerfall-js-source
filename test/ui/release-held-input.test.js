import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindKeyRelease, bindButtonRelease, cancelHeldSwing } from '../../src/ui/release-held-input.js';
import { keyEdges, mouseCode, beginInputFrame, noteKeyDown } from '../../src/ui/input.js';
import { PlayerWeapon } from '../../src/combat/playerWeapon.js';
import { BOW_DRAWN_HOLD_FRAME } from '../../src/characters/weaponStates.js';
import { HULL } from '../../src/systems/naval/navalShips.js';
import { sea } from '../navalSea.mjs';

/** A window and a document as the bindings read them, with the host's release paths recorded. */
function wired(heldCodes) {
  const target = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const held = new Set(heldCodes);
  const edges = keyEdges();
  const log = { keys: [], keyUps: [], buttons: [], cancelled: [] };
  const releaseKey = bindKeyRelease({
    target,
    held,
    edges: () => edges,
    released: (code) => log.keys.push(code),
    keyUp: (e) => log.keyUps.push(e.code),
  });
  bindButtonRelease({
    target,
    doc,
    held,
    releaseKey,
    released: (e) => {
      log.buttons.push(e.button);
      held.delete(mouseCode(e.button));
    },
    cancelled: (e) => log.cancelled.push(e.button),
  });
  return { target, doc, held, edges, log };
}

const keyup = (code) => Object.assign(new Event('keyup'), { code });

test('a keyup drains the held set, notes the edge, then runs the host release and the host keyup in that order', () => {
  const { target, held, log } = wired(['KeyW']);
  target.dispatchEvent(keyup('KeyW'));
  assert.equal(held.has('KeyW'), false);
  assert.deepEqual(log.keys, ['KeyW']);
  assert.deepEqual(log.keyUps, ['KeyW']);
});

test('as the window loses focus a held key is released through the host by its code, with no keyup sent to an open window, and a held mouse button is cancelled, never released; each once (mutants: no blur listener; a button released; the button left held; the window told of the key)', () => {
  const swing = mouseCode(2);
  const { target, held, log } = wired(['KeyW', 'ShiftLeft', swing]);
  target.dispatchEvent(new Event('blur'));
  assert.deepEqual(log.keys, ['KeyW', 'ShiftLeft']);
  assert.deepEqual(log.keyUps, [], 'no keyup reaches the host on focus loss');
  assert.deepEqual(log.buttons, [], 'the mouseup path never runs for a button');
  assert.deepEqual(log.cancelled, [2]);
  assert.equal(held.size, 0, 'nothing is left held');
  target.dispatchEvent(new Event('blur'));
  assert.deepEqual(log.keys, ['KeyW', 'ShiftLeft'], 'a second blur finds nothing held');
  assert.deepEqual(log.cancelled, [2]);
});

test('a key released by focus loss leaves its release edge for the frame, as a keyup does', () => {
  const { target, edges } = wired(['KeyW']);
  noteKeyDown(edges, 'KeyW');
  target.dispatchEvent(new Event('blur'));
  beginInputFrame(edges);
  assert.equal(edges.upFrame.has('KeyW'), true);
});

test('a mouseup reaches the host release with its event', () => {
  const { target, log } = wired([]);
  target.dispatchEvent(Object.assign(new Event('mouseup'), { button: 0 }));
  assert.deepEqual(log.buttons, [0]);
});

test('a tab hidden with a key and a button held releases the key and cancels the button; the tab shown again does nothing (mutants: the hidden tab ignored; every visibility change releasing)', () => {
  const { doc, log } = wired(['KeyD', mouseCode(0)]);
  doc.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual(log.keys, [], 'shown: nothing released');
  assert.deepEqual(log.cancelled, []);
  doc.visibilityState = 'hidden';
  doc.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual(log.keys, ['KeyD']);
  assert.deepEqual(log.cancelled, [0]);
  assert.deepEqual(log.buttons, []);
});

// The world host's two button paths, as world.js wires them: the mouseup lets go of the swing and fires laid guns (its
// navalRelease does nothing when no guns are laid), and the focus-loss cancel goes through cancelHeldSwing.
function hostButtons(rig, guns) {
  const target = new EventTarget();
  const swing = 0;
  const held = new Set([mouseCode(swing)]);
  bindButtonRelease({
    target,
    held,
    releaseKey: () => {},
    released: () => {
      rig.attackInput(0, 0, false);
      if (guns?.aiming) guns.attackInput(false);
    },
    cancelled: () => cancelHeldSwing(rig, guns),
  });
  return { target, mouseup: () => target.dispatchEvent(Object.assign(new Event('mouseup'), { button: swing })) };
}

const DIM = 1200;
const DRAWBACK = { bowDrawback: true, swingMode: 0 };

/** A weapon rig over a real short bow with Bow Drawback on: the latch the host's buttons set, and a frame that feeds it
 *  to the bow as the rig's frame does. */
function bowRig() {
  const bow = new PlayerWeapon({ weapon: { name: 'Short Bow', templateIndex: 129, material: 0 }, liveSpeed: 50 });
  bow.sheathed = false;
  bow.update(0);
  let held = false;
  return {
    playerWeapon: bow,
    attackInput: (dx, dy, h) => {
      held = h;
    },
    frame: () => {
      bow.update(1 / 60);
      return bow.gesture(0, 0, held, 1 / 60, DIM, DRAWBACK);
    },
  };
}

/** Frames until something is loosed, at most `n`: the strikes seen. */
const strikes = (rig, n) => {
  const seen = [];
  for (let i = 0; i < n; i++) {
    const s = rig.frame();
    if (s) seen.push(s);
  }
  return seen;
};

test('a bow drawn and held as the window loses focus is put down unloosed, and a stray mouseup after it looses nothing (mutants: the blur releasing the button; the draw left standing)', () => {
  const rig = bowRig();
  const buttons = hostButtons(rig, null);
  rig.attackInput(0, 0, true);
  strikes(rig, 120);
  assert.equal(rig.playerWeapon.machine.frame, BOW_DRAWN_HOLD_FRAME, 'drawn and held');
  buttons.target.dispatchEvent(new Event('blur'));
  assert.deepEqual(strikes(rig, 60), [], 'no arrow after the focus loss');
  assert.equal(rig.playerWeapon.machine.state, 'Idle', 'the bow is undrawn');
  buttons.mouseup();
  assert.deepEqual(strikes(rig, 60), [], 'no arrow on the release after');
});

test('a bow still drawing as the window loses focus does not loose when the draw would have reached its hold', () => {
  const rig = bowRig();
  const buttons = hostButtons(rig, null);
  rig.attackInput(0, 0, true);
  rig.frame();
  assert.ok(rig.playerWeapon.machine.frame < BOW_DRAWN_HOLD_FRAME, 'not yet drawn');
  buttons.target.dispatchEvent(new Event('blur'));
  assert.deepEqual(strikes(rig, 120), []);
  assert.equal(rig.playerWeapon.machine.state, 'Idle');
});

test('a broadside laid at the helm as the window loses focus is put down unfired and silent, and a stray mouseup after it fires nothing (mutants: the blur releasing the button; the guns left laid)', async () => {
  const h = await sea({ hull: HULL.SmallShip });
  const anims = [...h.boat.GameObject.walk()].flatMap((n) => n.getComponents('Animator').map((c) => c.animator).filter(Boolean));
  const frame = (dt) => {
    for (const a of anims) a.update(dt);
    h.host.frame(dt);
  };
  const run = (s) => {
    for (let t = 0; t < s; t += 0.02) frame(0.02);
  };
  run(0.2);
  h.view.look = { origin: [0, 5, 0], dir: [1, -0.05, 0] };
  const rig = { playerWeapon: { cancelHold: () => {} }, attackInput: () => {} };
  const buttons = hostButtons(rig, h.host);
  h.host.attackInput(true);
  run(1);
  assert.equal(h.host.aiming, true, 'the guns are laid');
  const shots = h.log.shake.length;
  const said = h.log.say.length;
  buttons.target.dispatchEvent(new Event('blur'));
  run(3);
  assert.equal(h.host.aiming, false, 'the guns are put down');
  assert.equal(h.log.shake.length, shots, 'no ball after the focus loss');
  assert.equal(h.log.say.length, said, 'put down without a word');
  buttons.mouseup();
  run(3);
  assert.equal(h.log.shake.length, shots, 'no ball on the release after');
});
