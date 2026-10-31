// FIX-E (2026-09-08, Mac: "When dying and returning to the main menu, the
// game bugs and you're unable to make selections"). The death seam killed
// the host loop FIRST and then waited, unbounded, on a video and a fetch
// before it navigated - a promise that never settles (a backgrounded tab's
// rAF, a stalled audio clock, a fetch with no timeout) left a frozen frame
// under a modal overlay whose keys the dead host's ladder still ate, with
// the pointer still locked and no menu ever coming. And the death screen's
// own two choices were half dead: "F11 load" reached nothing above ground.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { endRunToTitleMenu, frameHeld, DEATH_VIDEO_WATCHDOG_MS, playDeathVideo } from '../../src/scenes/shared.js';   // AUDIT DEATH1 F2: the real function is driven now

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('FIX-E: the death seam HOLDS the frame (the host waits, and lives), and releases it on every path out', async () => {
  assert.equal(frameHeld(), false);
  let release;
  let ready;
  const gate = new Promise((r) => { release = r; });
  // DEATH1: the hold is taken when the video says it is READY, not when the
  // death begins - so the play seam is handed the signal and calls it.
  const p = endRunToTitleMenu({ canvas: null }, { play: (_r, r) => { ready = r; return gate; }, watchdogMs: 60000, setTimer: () => 0 });
  assert.equal(frameHeld(), false, 'DEATH1: NOT held while the video is still loading - the host keeps drawing the death screen');
  ready();
  assert.equal(frameHeld(), true, 'held while the video plays - not claimed: the loop is alive and idle, as under the infection videos');
  release(true);
  await p;
  assert.equal(frameHeld(), false, 'released before the navigation');
  // a video that REJECTS costs the video, not the return - and one that
  // rejects BEFORE it was ready never held the frame at all
  await endRunToTitleMenu({ canvas: null }, { play: () => Promise.reject(new Error('no VID')), setTimer: () => 0 });
  assert.equal(frameHeld(), false);
});

// DEATH1 (2026-09-15, Mac: "Black screen after death and pressing enter").
// holdFrame stops the host drawing, and it was taken FIRST - then two
// dynamic imports and an archive read of ANIM0012.VID ran before the video
// painted anything. Every frame of that load was black: the host held, the
// death screen it had been drawing stopped, the video not yet begun. On a
// cold cache that is seconds of nothing, and the last thing drawn was the
// death fade, so it reads as a hang.
test('DEATH1: nothing is held until the video is loaded - the load is not a black screen', async () => {
  // AUDIT DEATH1 F2: this pin was GREP-ONLY. playDeathVideo was never
  // executed by anything - every behavioural test injects its own `play`
  // seam - so the law lived in two regexes, and a regex cannot see an
  // await. Driven proof of the gap: one more `await import(...)` placed
  // AFTER ready() restored Mac's black screen and passed the whole
  // suite. The real function is DRIVEN here now.
  const order = [];
  let loadDone = null;
  const load = () => new Promise((r) => {
    loadDone = () => { order.push('loaded'); r({ playVideo: (...a) => { order.push(`play:${a[2]}`); return 'played'; }, bytes: 'BYTES' }); };
  });
  const ready = () => order.push('ready');
  const p = playDeathVideo({ canvas: null }, ready, load);
  await Promise.resolve();
  assert.deepEqual(order, [], 'nothing is signalled while the load is still out');
  loadDone();
  assert.equal(await p, 'played');
  // THE LAW: loaded, THEN the hold, THEN the video - and the bytes the
  // load returned are the bytes played.
  assert.deepEqual(order, ['loaded', 'ready', 'play:BYTES'],
    'the hold is raised after everything is loaded and before anything is drawn');

});

test('FIX-E: a video that never settles is a BOUNDED wait - the watchdog navigates', async () => {
  let armed = null;
  const p = endRunToTitleMenu({ canvas: null }, { play: () => new Promise(() => {}), watchdogMs: 1234, setTimer: (fn, ms) => { armed = ms; fn(); return 0; } });
  await p;
  assert.equal(armed, 1234, 'the watchdog is armed for the given wait');
  assert.equal(frameHeld(), false, 'and the hold is released when it fires');
  assert.ok(DEATH_VIDEO_WATCHDOG_MS >= 15000 && DEATH_VIDEO_WATCHDOG_MS <= 60000, `a real death video ends well inside it (${DEATH_VIDEO_WATCHDOG_MS} ms)`);
});

// AUDIT DEATH1 F7 (2026-09-15): THE WATCHDOG IS A RACE, NOT A CANCEL.
// Every DEATH1 assertion above either injects a `play` that settles or
// reads the source as text; none drove the one order that matters -
// the watchdog fires, the seam returns, and THEN the load settles and
// calls ready(). Before the `closed` latch that took a hold whose only
// release closure had already been read as null: frameHeld() true with
// nothing left to release it, world.js and exterior.js skipping every
// frame forever. Mac's black screen, re-made by its own fix. Driven:
test('AUDIT DEATH1 F7: a load that settles AFTER the watchdog cannot take a hold nobody can release', async () => {
  assert.equal(frameHeld(), false, 'clean start');
  let ready = null;
  // the play never settles, and hands out its ready() the way the real
  // playDeathVideo does - the load is still out when the race is lost
  const p = endRunToTitleMenu({ canvas: null }, {
    play: (_r, r) => { ready = r; return new Promise(() => {}); },
    watchdogMs: 5, setTimer: (fn) => { fn(); return 0; },
  });
  await p;
  assert.equal(frameHeld(), false, 'the watchdog navigated and nothing is held');
  // ...and NOW the archive read finally lands:
  ready();
  assert.equal(frameHeld(), false,
    'a late ready() past the closed seam takes NO hold - a hold taken here has no release and the host never draws again');
});

