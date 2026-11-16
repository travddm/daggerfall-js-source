// THE ANTI-FLICKER PATCH. EMPTY-HOLD (audit68_render_b.test.js
// S17, disc15.test.js THE DOOR) and IDLER-STICKY (audit_reach.test.js B3) are pinned beside the laws they changed.
// CACHE-OFF - the shadow cache off unless asked on - is RETIRED (CACHE-COPY, 2026-10-07, test/render/cachecopy.test.js): the
// blink was the cache's copy on Direct3D, not the cache; the copy is a draw and the cache is on again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHADOW_EMPTY_HOLD } from '../../src/render/shadowPass.js';

test('EMPTY-HOLD: half a second of empty frames is held, never longer', () => {
  assert.equal(SHADOW_EMPTY_HOLD, 30);
});
