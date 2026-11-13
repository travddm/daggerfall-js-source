// A .js test: it builds the renderer, which is WebGL code the Node type check (tsconfig.node.json) has no types for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Renderer } from '../../src/render/renderer.js';
import { _resetForTests as resetSettings } from '../../src/systems/settings/settings.js';
import { stateGl } from '../retroGl.mjs';

/** A 2 x 1 cut-out: one opaque red texel, one transparent black one. */
const cutOut = () => ({ width: 2, height: 1, colors: new Uint8ClampedArray([200, 0, 0, 255, 0, 0, 0, 0]) });

/** The bytes the last level-0 texImage2D call sent. */
const uploaded = (calls) => [
  ...calls
    .filter((c) => c[0] === 'texImage2D' && c[2] === 0)
    .at(-1)
    .at(-1),
];

test("world art goes up bled, so no filter mixes black into its cut-out edge; UI art and its caller's bytes are left alone", () => {
  resetSettings();
  const { canvas, calls } = stateGl();
  const renderer = new Renderer(canvas);
  const art = cutOut();
  calls.length = 0;
  renderer.uploadTexture(7, 0, art);
  assert.deepEqual(
    uploaded(calls),
    [200, 0, 0, 255, 200, 0, 0, 0],
    'a world texture: the transparent texel red, still transparent',
  );
  assert.deepEqual([...art.colors], [200, 0, 0, 255, 0, 0, 0, 0], "the caller's bytes unchanged");
  calls.length = 0;
  renderer.uploadTexture('ui', 0, cutOut());
  assert.deepEqual(uploaded(calls), [200, 0, 0, 255, 0, 0, 0, 0], 'a nearest-only picture: as it was');
});
