// AUDIT 24 (the seven-slice sweep), THE LIFETIME GATE.
//
// EVERY ALLOCATION HAS AN OWNER is one of the port's standing laws, and
// the sweep found five places where the owner had quietly gone missing:
// a foe culled at distance, a foe killed, a city guard on either death
// path, a retired dungeon missile, and the sky's panorama cache. None
// of them fails a test - a leak is invisible to a suite - so this file
// gates the SHAPE: the release call must be reachable from the place
// that ends the thing's life, and the bounded cache must stay bounded.
//
// A source-shape pin is a weak pin and this file says so out loud. It
// exists because the alternative is no pin at all: these modules need a
// live WebGL context to construct, and the defect is an absence.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLASSIC_MINUTES_PER_SECOND } from '../../src/systems/worldTick.js';
import { hostText } from '../hostText.mjs';   // HOST-SPLIT 2 (AUDIT, the second read): its negatives read the host whole

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/** The body of the named function, brace-matched from its header. */
function bodyOf(src, header) {
  const i = src.indexOf(header);
  assert.ok(i > 0, `${header} not found`);
  let depth = 0;
  // start the scan at the header's LAST character, so a default-value
  // brace inside the parameter list ("senses = {}") cannot be mistaken
  // for the body's opening brace
  let j = src.indexOf('{', i + header.length - 1);
  const start = j;
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) break;
  }
  return src.slice(start, j + 1);
}

// ---- the DEAD FLAGS: a read with no writer, a write with no reader ----

test('audit24: preventNormalizingReputations is set by the prison jump and cleared by the tick', async () => {

  // and the shield really shields: a 112-day boundary crossed with the
  // flag up must not normalize, and must clear the flag on the way out
  const { tickPlayerMinutes, resetMagicRoundMarker } = await import('../../src/systems/worldTick.js');
  const NORMALIZE = 161280;   // 112 days
  const run = (prevent, legalRep, from) => {
    const entity = {
      stats: {}, skills: [], factionRep: null, level: 1,
      legalRep, preventNormalizingReputations: prevent,
    };
    resetMagicRoundMarker(from);
    tickPlayerMinutes({
      entity, classicMinutes: from, dt: 1 / CLASSIC_MINUTES_PER_SECOND,
      sinks: {}, activity: {},
    });
    return entity;
  };
  // THE EDGE, both sides of it. DFU's loop is
  //     for (i = 0; i < minutesPassed; ++i)
  //         if (((i + lastGameMinutes) % 161280) == 0 && !preventNormalizing...)
  // so the minute VALUES tested are [last, now) with NO +1, and the one that
  // fires is the minute numbered 161280 itself. AUDIT 24 (wave 32) moved this
  // loop out of the broker's round loop, where AUDIT 23 had written it with
  // the round loop's `r + 1` - so the port normalised one game minute late,
  // and the fixture below pinned the port's own off-by-one by probing the
  // minute AFTER the boundary. A pin aimed at the middle of a band tells you
  // nothing about its edge.
  assert.equal(run(false, [40], NORMALIZE - 1).legalRep[0], 40,
    'stepping ONTO minute 161280 tests 161279, which is not the boundary');
  const bare = run(false, [40], NORMALIZE);
  assert.notEqual(bare.legalRep[0], 40, 'stepping OFF it tests 161280, which is - a RULE, not a tautology');

  const shielded = run(true, [40], NORMALIZE);
  assert.equal(shielded.legalRep[0], 40, 'the shield holds the credited reputation across the jump');
  assert.equal(shielded.preventNormalizingReputations, false, 'and the flag clears itself, one jump only');

});

// ---- wave 9: four boot-and-host defects the bug hunt's verify pass confirmed ----

