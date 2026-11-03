// mwTexture.js was rewritten from the format documentation. This test holds the rewrite to the answers of the module
// it replaced: `mwTexture.golden.json` was recorded by running that module over `texParityCases.mjs` (path lookups with
// every probe the lookup made, actor model paths, wrap modes, the warning image, and TGA, BMP and DDS decoding with
// pixel digests). A case that diverges names its inputs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as mwTexture from '../../../src/formats/morrowind/mwTexture.js';
import { buildCases } from '../../fixtures/mw/texParityCases.mjs';

const golden = JSON.parse(readFileSync(new URL('../../fixtures/mw/mwTexture.golden.json', import.meta.url), 'utf8'));

test('mwTexture answers every recorded case as the module it replaced did', () => {
  const cases = buildCases();
  assert.equal(cases.length, golden.length, 'the case list and the recording are the same length');
  assert.ok(cases.length > 4000, 'the recording covers thousands of inputs');
  const diverged = [];
  cases.forEach((c, i) => {
    const answer = c.run(mwTexture);
    if (answer !== golden[i]) diverged.push(`${c.label}\n    recorded ${golden[i].slice(0, 160)}\n    now      ${answer.slice(0, 160)}`);
  });
  assert.deepEqual(diverged.slice(0, 10), [], `${diverged.length} of ${cases.length} cases diverge`);
});

test('the recording reaches every branch family it claims to', () => {
  const labels = buildCases().map((c) => c.label);
  for (const family of ['texture path', 'actor model', 'tga type 1 ', 'tga type 10', 'bmp 8bpp', 'bmp 24bpp', 'bmp 32bpp', 'route a.dds', 'route a.tga', 'wrap 3']) {
    assert.ok(labels.some((l) => l.startsWith(family)), `a case starts with "${family}"`);
  }
  const decoded = golden.filter((g) => /^\d+x\d+\//.test(g)).length;
  const refused = golden.filter((g) => g === 'throws').length;
  assert.ok(decoded > 1000 && refused > 200, `the recording holds both decoded images (${decoded}) and refusals (${refused})`);
});
