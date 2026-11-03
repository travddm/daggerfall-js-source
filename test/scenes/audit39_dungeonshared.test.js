import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { setInfectionHost } from '../../src/systems/infection.js';
import { wireInfectionVideos, holdFrame, frameHeld, claimFrame, frameAlive } from '../../src/scenes/shared.js';

// AUDIT 39, the dungeon/shared lane. Five of the eight findings are one
// shape: buildDungeonContext BORROWS a process-global seam and never
// gives it back, so the seam outlives the context it points into. The
// other three are a door that opens nothing, a cull that skips its own
// sweep, and a full-screen video the world keeps running under.

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

// ── #35: THE DEATH PRESENTER AND THE AVOID-DEATH HOOK ─────────────
// playerEntity's setters answer the previous holder for exactly this
// purpose ("so a host that mounts another can restore it"), and the
// dungeon discarded both. Nothing above ground takes them back on the
// exit path - worldModes' re-registration lives in its interior-mode
// frame arm, which cannot run in exterior mode - so after one dungeon
// visit every death above ground presented into a torn-down context's
// overlay slot, where no host draws and onReset can never fire.

// ── #37: THE INFECTION HOST ───────────────────────────────────────
// The dungeon registers a STRIPPED set (textAt + showText, no
// factionDict and no transferToCemetery) and the bare assignment used
// to leave it standing for the session: a vampire turn above ground
// then lost its cemetery transfer, its clan lookup and its message box.

test('AUDIT 39 #37: setInfectionHost answers the previous host, and wireInfectionVideos passes it on', () => {
  setInfectionHost(null);
  const first = { messageBox: () => {} };
  assert.equal(setInfectionHost(first), null, 'the first registration replaces nothing');
  const second = { messageBox: () => {} };
  assert.equal(setInfectionHost(second), first, 'and every later one answers who it displaced');
  // the seam the hosts actually call
  const prev = wireInfectionVideos({ canvas: null }, {});
  assert.equal(prev, second, 'wireInfectionVideos hands back the host it mounted over');
  const mounted = setInfectionHost(null);
  assert.notEqual(mounted, second, 'and it really did register its own');
  assert.equal(typeof mounted.playVideo, 'function');
});

// ── #38: THE PAUSE WINDOW'S PACK AND CHRONICLE DOORS ──────────────
// enhancedMenu draws a door for every arm the host hands over, so the
// two arms that read `api.makeInventory` / `api.makeJournal` - members
// this context has never exported - drew two buttons that resumed the
// game and opened nothing.

// ── #40: THE RESTORE CULL ─────────────────────────────────────────
// dropCandidate's own doc names this site ("the quest teardown, the
// dispel sweep, the RESTORE CULL ... One sweep, called from every
// removal") and it was the one removal that skipped it. A culled foe
// keeps its health, and the target machine's dead-target cull reads
// HEALTH (EnemySenses:315-318), so a survivor outside the spawn band
// held the spliced-out record for ever.

// ── #41: THE CROUCHED DEATH IN THE WORLD-HOSTED DUNGEON ───────────
// PlayerDeath.cs reads mainCamera.localPosition.y and
// playerController.height AT the death, and crouching moves both.
// dungeon.js has always passed the live pair; worldModes passed none,
// so every shipped dungeon death sank from the standing eye.

// ── #76: THE INTERIOR RIGS' GROUNDING ─────────────────────────────
// engineRig states the law where it computes the value: liveFootY is
// "the LIVE support point ... the stride arc dips below rest minY".
// interiorContext placed people once, at scene build, off the REST
// footY, and animateChars only drove the rigs - so the feet sank by
// the arc's dip (and the two rigs whose rest low point is fur or scale
// sat above the floor instead).

// ── #160: THE INFECTION VIDEOS AND THE FRAME ──────────────────────
// DFU pushes a DaggerfallVidPlayerWindow, whose inherited
// pauseWhileOpened stops the game for the window's lifetime. The port
// deferred by a microtask only - the host had already re-armed itself,
// so the world walked, fought and could die under an unskippable
// full-screen video. claimFrame is the wrong tool: it ENDS a loop.

test('AUDIT 39 #160: the hold suspends the loop without killing it, and counts', () => {
  assert.equal(frameHeld(), false, 'nothing holds the frame by default');
  const a = holdFrame();
  assert.equal(frameHeld(), true);
  const b = holdFrame();
  a();
  assert.equal(frameHeld(), true, 'two holders, two releases');
  a();
  assert.equal(frameHeld(), true, 'a holder releasing twice does not release the other');
  b();
  assert.equal(frameHeld(), false);
  // the hold is NOT the unwind: the token a host claimed is still its own
  const token = claimFrame();
  const c = holdFrame();
  assert.equal(frameAlive(token), true, 'the host still owns the frame while it waits');
  c();
});

test('AUDIT 39 #160: the infection seam takes the hold before the video and releases on every path out', async () => {
  setInfectionHost(null);
  wireInfectionVideos({ canvas: null }, {});
  const host = setInfectionHost(null);
  let closed = false;
  host.playVideo('ANIM0002.VID', () => { closed = true; });
  assert.equal(frameHeld(), true, 'taken SYNCHRONOUSLY - a microtask defers past the body, not past the re-arm');
  // No ARENA2 here, so the video is the "unavailable" path - which is
  // exactly the path that must still give the world back.
  for (let i = 0; i < 200 && !closed; i++) await new Promise((r) => setTimeout(r, 0));
  assert.equal(closed, true, 'the lifecycle carried on');
  assert.equal(frameHeld(), false, 'and the hold was released before the close ran');
});

// ── #46: townTalk's DIRECTORY-LESS GREETING ───────────────────────
// The file's own law (showOverlay's successor-first replacement) exists
// to dispose the outgoing occupant and reset the close callback; one
// mount assigned the slot raw and did neither.

