// HC1 - THE HORSE AND CART, AUDITED FOR PLAY (2026-09-14, Mac: "audit
// the horse and cart ensuring it works properly ingame and the sprites
// actually show").
//
// They did not show, on the deployed site, ever - and for three
// separate reasons at three separate seams, each of which passed every
// pin around it:
//   1. THE DIET. TR2's riding sprites are MRED00I0.CFA and MRED01I0.CFA,
//      and dataSource.KEEP never kept a .CFA: the browser's ARENA2 store
//      never held them, the network arm 404s in production, and
//      loadRidingArt failed into a console warning. AUDIT 18 F2's pin
//      re-derives the fetch list from every name src/ carries - by an
//      extension list that did not include CFA. The dev server, which
//      serves the folder whole, hid it (the F2 shape exactly).
//   2. THE ONE PLACE. U53 made setTransportModeHere the one place the
//      mode changes; TR3 loaded the art on the T-key pick alone. Three
//      other paths set the mode - a loaded save on horseback, the Test
//      Room's ride out, the ship's landing - nulled the art, and loaded
//      nothing: the speed, the bob and the hoof loop, and no horse.
//   3. THE MANIFEST. A stored set that predates the fix has no CFA and
//      no reason to re-ingest; the diet's own rule is to bump MANIFEST_V
//      so stale sets auto-wipe to the picker.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KEEP } from '../../src/scenes/dataSource.js';
import { HORSE_TEXTURE, CART_TEXTURE, ridingTextureName } from '../../src/systems/riding.js';
import { TRANSPORT_MODES } from '../../src/systems/transport.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

test('HC1: both riding sprites survive BOTH diets - the horse and cart can be seen on a phone too', () => {
  for (const name of [HORSE_TEXTURE, CART_TEXTURE, ridingTextureName(TRANSPORT_MODES.Horse), ridingTextureName(TRANSPORT_MODES.Cart)]) {
    assert.match(name, /\.CFA$/);
    assert.ok(KEEP(name, false), `desktop diet keeps ${name}`);
    assert.ok(KEEP(name, true), `lean diet keeps ${name}`);
  }
  assert.ok(KEEP('X.CFA', true), 'the kind rides wholesale, as GFX and BSS do - a future CFA reader is covered');
  // and the F2 pin can SEE the kind now, so the next dropped kind fails there rather than here
  assert.match(read('test/scenes/audit18.test.js'), /\|GFX\|VID\|DAT\|CEL\|CFA\|BSS\)\)'\/g;/, 'the name regex lists CFA (and BSS, which U45 kept but the regex never scanned)');
});

