// G5: the teleport POPUP - DaggerfallTeleportPopUp's four rects, its
// centring, and the two answers. (The Teleport EFFECT - Recall - is
// the TP-slice's, in teleport.test.js; one window, one file.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TeleportPopUpWindow, TELEPORT_RECTS, TELEPORT_PANEL_W, TELEPORT_PANEL_H,
  TELEPORT_PANEL_X, TELEPORT_PANEL_Y, DESTINATION_LABEL_OFFSET,
  _setTeleportPopUpArtForTests, teleportPopUpArtLoaded,
} from '../../src/ui/teleportPopUp.js';
import { serviceDestination } from '../../src/systems/guild/guildServiceFlow.js';
import { readFileSync } from 'node:fs';

const DEST = Object.freeze({ pixel: { x: 50, y: 120 }, name: 'Daggerfall' });
const mk = (over = {}) => {
  const log = { teleported: null, exited: 0 };
  const w = new TeleportPopUpWindow(DEST, {
    onTeleport: (pixel, name) => { log.teleported = { pixel, name }; },
    onExit: () => { log.exited++; },
    ...over,
  });
  return { w, log };
};
/** A point at the middle of a panel-relative rect. */
const mid = ([x, y, w, h]) => [TELEPORT_PANEL_X + x + w / 2, TELEPORT_PANEL_Y + y + h / 2];

test('G5: the panel is CENTRED, and mainPanelRect\'s own position is dead', () => {
  // TELE00I0 ships 171x57 and that IS mainPanelRect's size (:21).
  assert.equal(TELEPORT_PANEL_W, 171);
  assert.equal(TELEPORT_PANEL_H, 57);

  // DFU sets `Position = mainPanelRect.position` - which is (0, 50) -
  // and THEN sets HorizontalAlignment.Center and
  // VerticalAlignment.Middle. BaseScreenComponent's alignment
  // switches (:1205-1230) assign rectangle.x/.y outright on every arm
  // but `None`, so the position never reaches the screen. A port that
  // took the rect wholesale would put the box thirty pixels high and
  // hard against the left edge.
  assert.equal(TELEPORT_PANEL_X, 75, '(320 - 171) / 2, rounded');
  assert.equal(TELEPORT_PANEL_Y, 72, '(200 - 57) / 2, rounded');
  assert.notEqual(TELEPORT_PANEL_X, 0);
  assert.notEqual(TELEPORT_PANEL_Y, 50, 'the rect says 50 and the screen does not');
  // both halves land at .5 and round the same way every other centred
  // panel in this port rounds
  assert.equal((320 - TELEPORT_PANEL_W) / 2, 74.5);
  assert.equal((200 - TELEPORT_PANEL_H) / 2, 71.5);

  // the three rects, verbatim (:22-24), and all of them inside the panel
  assert.deepEqual(TELEPORT_RECTS.destination, [5, 15, 161, 8]);
  assert.deepEqual(TELEPORT_RECTS.yes, [4, 38, 52, 15]);
  assert.deepEqual(TELEPORT_RECTS.no, [115, 38, 52, 15]);
  assert.deepEqual(DESTINATION_LABEL_OFFSET, [1, 1]);
  for (const [key, [x, y, w, h]] of Object.entries(TELEPORT_RECTS)) {
    assert.ok(x >= 0 && y >= 0 && x + w <= TELEPORT_PANEL_W && y + h <= TELEPORT_PANEL_H, key);
  }
  // yes is LEFT of no and they do not overlap
  assert.ok(TELEPORT_RECTS.yes[0] + TELEPORT_RECTS.yes[2] < TELEPORT_RECTS.no[0]);
});

test('G5: YES hands the destination back, NO hands nothing back', () => {
  const { w, log } = mk();
  assert.equal(w.done, false);
  w.input('KeyY');
  assert.deepEqual(log.teleported, { pixel: { x: 50, y: 120 }, name: 'Daggerfall' });
  assert.equal(log.exited, 0, 'a teleport is not an exit');
  assert.equal(w.done, true, 'and the box closes either way');

  const no = mk();
  no.w.input('KeyN');
  assert.equal(no.log.teleported, null);
  assert.equal(no.log.exited, 1);
  assert.equal(no.w.done, true);

  // Escape and E are the port's own on a Yes/No box, as everywhere
  for (const code of ['Escape', 'KeyE']) {
    const t = mk();
    t.w.input(code);
    assert.equal(t.log.teleported, null, code);
    assert.equal(t.log.exited, 1, code);
  }
  // Enter agrees with Y - the box has one affirmative
  const enter = mk();
  enter.w.input('Enter');
  assert.ok(enter.log.teleported);
  // an unrelated key does nothing at all
  const idle = mk();
  idle.w.input('KeyQ');
  assert.equal(idle.w.done, false);
  assert.equal(idle.log.teleported, null);
  assert.equal(idle.log.exited, 0);
});

test('G5: the two buttons hit where the rects say, and the panel swallows the rest', () => {
  const yes = mk();
  assert.equal(yes.w.click(...mid(TELEPORT_RECTS.yes)), true);
  assert.deepEqual(yes.log.teleported.pixel, { x: 50, y: 120 });

  const no = mk();
  no.w.click(...mid(TELEPORT_RECTS.no));
  assert.equal(no.log.exited, 1);
  assert.equal(no.log.teleported, null);

  // the rects are PANEL-RELATIVE: the same coordinates without the
  // panel offset are not on either button
  const stray = mk();
  stray.w.click(TELEPORT_RECTS.yes[0] + 2, TELEPORT_RECTS.yes[1] + 2);
  assert.equal(stray.log.teleported, null, 'the raw rect is off-panel');
  assert.equal(stray.log.exited, 0);
  assert.equal(stray.w.done, false);

  // ...and a modal swallows the click anyway, so nothing behind it
  // gets a look in
  assert.equal(stray.w.click(0, 0), true);
  assert.equal(stray.w.click(319, 199), true);
  assert.equal(stray.w.done, false);

  // the boundary: the last pixel of a button is IN, the next is out
  const [bx, by, bw, bh] = TELEPORT_RECTS.no;
  const edge = mk();
  edge.w.click(TELEPORT_PANEL_X + bx + bw - 0.5, TELEPORT_PANEL_Y + by + bh - 0.5);
  assert.equal(edge.log.exited, 1);
  const past = mk();
  past.w.click(TELEPORT_PANEL_X + bx + bw, TELEPORT_PANEL_Y + by + bh);
  assert.equal(past.log.exited, 0, 'one pixel past is off the button');
});

test('G5: a missing TELE00I0 does not close the door', () => {
  // The travel map RETHROWS a missing IMG so the host can refuse to
  // open a blank map; this panel's loader swallows instead, because a
  // missing yes/no box must not take the whole teleport service down
  // with it. The window draws a plain rect and the labels it needs.
  _setTeleportPopUpArtForTests(null);
  assert.equal(teleportPopUpArtLoaded(), false);
  const { w, log } = mk();
  const drawn = [];
  const renderer = { drawScreenQuad: (tex, r) => drawn.push(r) };
  const font = { tex: null, fnt: { fixedHeight: 6, glyphWidth: () => 4 } };
  w.draw(renderer, { width: 1280, height: 800 }, font);
  assert.ok(drawn.length > 0, 'something was painted');
  // and it still answers
  w.input('KeyY');
  assert.ok(log.teleported);
});

test('G5: the service destination is no longer a FLAGGED null', () => {
  assert.equal(serviceDestination('Teleport'), 'guildServiceTeleport');
});

