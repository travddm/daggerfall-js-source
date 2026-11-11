// AUDIT 26, misc group: a dev tuner nothing could reach stays deleted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

test('audit26 misc F039: the C6L paint overlay is not a module nothing can reach', () => {
  // The overlay tuned the SPRITE-TRACE body sheets ({front,back}
  // ImageData + silhouette masks + rebuild()), and that rig is retired -
  // interiorContext builds the neutral paperdoll instead and produces no
  // sheets at all. So mountPaintOverlay had no possible caller and no
  // possible kit: 154 lines that could only ever be dead. It is gone
  // rather than left standing as an affordance nobody can take.
  assert.equal(
    existsSync(join(root, 'src/scenes/paintOverlay.js')), false,
    'src/scenes/paintOverlay.js is back - a mount for a rig that no longer exists',
  );
  const holders = walk(join(root, 'src'))
    .filter((p) => p.endsWith('.js') && /mountPaintOverlay/.test(readFileSync(p, 'utf8')));
  assert.deepEqual(holders, [], 'something under src/ names mountPaintOverlay again');
});
