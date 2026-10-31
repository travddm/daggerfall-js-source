// AUDIT 68, the pre-merge review of the integrated branch: four
// hostile lanes read the whole diff for regressions, merge errors and fixes
// that stopped at one host. The pins for what they found that no lane's own
// pin file owns sit here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPlayerTicker, subscribeFoePools } from '../../src/scenes/shared.js';

const rd = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

test('AUDIT 68 review R-scenes-round-tick-provenance-three-hosts: a foe\'s magic round is nobody\'s blow unless its tick says so - in all four hosts', () => {
  const ticker = createPlayerTicker({ getMinutes: () => 0 });
  const asked = [];
  subscribeFoePools(ticker, [() => [{ entity: { health: 10 } }]], (f, fromPlayer) => { asked.push(fromPlayer); return {}; });
  ticker.advance(1);
  assert.ok(asked.length > 0, 'the pool was ticked');
  assert.ok(asked.every((v) => v === false), 'mutants: sinksFor(f) - the default fromPlayer=true billed every round (and the stat-zero kill) to the player');
  for (const [file, re] of [
    ['src/scenes/world.js', /hurt: \(n, o\) => \{ const fp = o\?\.fromPlayer \?\? fromPlayer;/],
    ['src/scenes/exterior.js', /hurt: \(n, o\) => \{ const fp = o\?\.fromPlayer \?\? fromPlayer;/],
    ['src/scenes/worldModes.js', /hurt: \(n, o\) => \{\s*if \(n <= 0\) return;\s*const fp = o\?\.fromPlayer \?\? fromPlayer;/],
    ['src/scenes/dungeonContext.js', /hurt: \(n, o\) => damageFoe\(f, n, null, null, \{ kind: 'spell', fromPlayer: o\?\.fromPlayer \?\? fromPlayer, whole: !!o\?\.whole, round: !!o\?\.round, element: o\?\.element \?\? null \}\)/],     // AUDIT PSCALE1 DOORS-1: and a kill's flag   //
  ]) assert.match(rd(file), re, `${file}'s foe sink reads the tick's provenance (THE FOUR HOSTS RULE)`);
});

