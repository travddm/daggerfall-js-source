// MENU-RELOCK (2026-09-22, Fedu on Discord: a 1-3 second delay before
// the camera answers the mouse again after closing a menu).
//
// POINTER LOCK IS ONLY GRANTED INSIDE A USER GESTURE. The browser hands
// `requestPointerLock` out on the keypress or click the player just
// made and refuses it anywhere else; a refusal is silent (the port logs
// it once) and nothing retries, so the look stays dead until the
// player's NEXT gesture happens to reach a relock arm. That is the
// whole of the report: the delay is not a timer, it is however long it
// takes you to press something else.
//
// THE PORT ASKED A FRAME LATE. `makeLookGate` is the per-host
// reconciler and it runs on the FRAME: it sees the overlay slot drain
// and relocks on the next call, which is a new task with no user
// activation left. The fix is not to make the gate faster - it is for
// the four hosts to ask inside the key handler that closed the window,
// while the gesture is still live, and let the gate keep doing its own
// resting-state job.
//
// WHAT IS HELD HERE. The first two tests EXECUTE the mechanism and the
// gap: that a request really is made and a refusal really is swallowed,
// and that the gate alone leaves a window in which nobody has asked.
// The third holds the four call sites by source, because the gesture
// itself needs a browser - and it holds the SHAPE the fix has to take,
// not just the strings it contains.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { requestLook, makeLookGate, RELOCK_GRACE_MS, setCursorActive } from '../../src/player/pointerLock.js';

const rd = (p) => readFileSync(p, 'utf8');
/** A canvas that counts requests, and can refuse the way Chrome does. */
const stubCanvas = ({ reject = null } = {}) => {
  const c = { calls: [], requestPointerLock(opts) { c.calls.push(opts ?? null); return reject ? Promise.reject(reject) : Promise.resolve(); } };
  return c;
};

test('MENU-RELOCK: a request really is made, asks for raw deltas, and a refusal is swallowed rather than fatal', async () => {
  setCursorActive(false);
  const ok = stubCanvas();
  requestLook(ok);
  assert.equal(ok.calls.length, 1, 'the lock was asked for');
  assert.deepEqual(ok.calls[0], { unadjustedMovement: true }, 'MAC1: raw device counts, not the OS-accelerated pointer');

  // Chrome rejects when the document is not focused, a request is
  // pending, or inside the post-exit cooldown. An unhandled rejection
  // was a crash overlay AND a frozen yaw; a refused lock must be a
  // no-op that the next gesture retries.
  const refused = stubCanvas({ reject: new DOMException('refused', 'NotAllowedError') });
  assert.doesNotThrow(() => requestLook(refused));
  await new Promise((r) => setTimeout(r, 0));   // let the rejection settle unhandled if it were going to
  assert.equal(refused.calls.length, 1);

  // U45's precedence: a cursor the player DELIBERATELY activated is not
  // taken back by a closing gesture - only by the toggle.
  setCursorActive(true);
  const held = stubCanvas();
  requestLook(held);
  assert.equal(held.calls.length, 0, 'an activated cursor survives the relock');
  setCursorActive(false);
});

test('MENU-RELOCK by execution: the frame gate leaves a window in which nobody has asked - which is the bug', async () => {
  // THE GAP, measured. Drive the gate the way a host does: a window up
  // for some frames, then gone. The gate cannot ask until the call
  // AFTER the overlay drains, and that call is a new task - no user
  // activation, so the browser refuses it.
  setCursorActive(false);
  const canvas = stubCanvas();
  const gate = makeLookGate(canvas);

  gate(true);                                   // a window is up
  gate(true);
  const atTheMomentOfTheKey = canvas.calls.length;
  // ...the player presses the key that closes it. The overlay slot
  // drains, but the gate has not run again yet.
  assert.equal(atTheMomentOfTheKey, 0, 'nothing has asked for the lock while the gesture is still live');

  gate(false);                                  // the next FRAME
  assert.equal(canvas.calls.length, 1, 'the gate asks, but a frame late - outside the gesture the browser wanted');

  // And the host's in-gesture request is not wasted work the gate then
  // undoes: PL3's grace means a request made within RELOCK_GRACE_MS is
  // not released by a gate call that still thinks the window is up.
  const c2 = stubCanvas();
  const gate2 = makeLookGate(c2);
  gate2(true);
  requestLook(c2);                              // the host, inside the closing key
  let released = false;
  const realExit = globalThis.document;
  globalThis.document = { pointerLockElement: {}, exitPointerLock() { released = true; }, addEventListener() {} };
  gate2(true);                                  // the stale frame, overlay slot not yet drained
  globalThis.document = realExit;
  assert.equal(released, false, `a request inside the grace (${RELOCK_GRACE_MS}ms) is not torn down by the stale frame`);
});

