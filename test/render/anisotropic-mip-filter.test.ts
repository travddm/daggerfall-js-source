import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  anisotropyDropsMipFilter,
  forgetSamplingDriver,
  groundSharpnessInactive,
  noteSamplingDriver,
  rendererString,
} from '../../src/render/anisotropic-mip-filter.ts';

const RENDERER = 0x1f01;
const UNMASKED = 0x9246;
const REASON = 'No effect while Anisotropic Filtering is on';

/** A context that answers the renderer strings, with or without the debug extension. */
function contextOf(unmasked: string | null, masked = 'WebKit WebGL') {
  return {
    RENDERER,
    getExtension: (name: string) =>
      name === 'WEBGL_debug_renderer_info' && unmasked !== null ? { UNMASKED_RENDERER_WEBGL: UNMASKED } : null,
    getParameter: (name: number) => (name === UNMASKED ? unmasked : name === RENDERER ? masked : null),
  };
}

const D3D11 = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 (0x00002206) Direct3D11 vs_5_0 ps_5_0, D3D11)';
const SOFTWARE_VULKAN = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)';

test('the renderer string: the unmasked one where the browser offers it, else the masked one', () => {
  assert.equal(rendererString(contextOf(D3D11)), D3D11);
  assert.equal(rendererString(contextOf(null, 'Mozilla')), 'Mozilla');
});

test('ANGLE over Direct3D 11 drops the mip filter for anisotropy; a driver nothing has measured is not listed', () => {
  for (const name of [D3D11, 'ANGLE (Intel, Intel(R) UHD Graphics 630 (0x00003E9B) Direct3D11 vs_5_0 ps_5_0, D3D11)'])
    assert.equal(anisotropyDropsMipFilter(name), true, name);
  for (const name of [
    SOFTWARE_VULKAN,
    'ANGLE (AMD, Radeon RX 6600 Direct3D9Ex vs_3_0 ps_3_0)',
    'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)',
    'Mesa Intel(R) UHD Graphics 620 (KBL GT2)',
    '',
  ])
    assert.equal(anisotropyDropsMipFilter(name), false, name);
});

test('the Ground sharpness row is inactive only with anisotropy above 1, off Point, on a driver that drops the mip filter', () => {
  forgetSamplingDriver();
  try {
    assert.equal(groundSharpnessInactive(8, false, REASON), null, 'no context noted yet');
    noteSamplingDriver(contextOf(D3D11), 16);
    for (const setting of [8, 2, 16, 'texture', '4'])
      assert.equal(groundSharpnessInactive(setting, false, REASON), REASON, String(setting));
    assert.equal(groundSharpnessInactive('off', false, REASON), null, 'Anisotropic Filtering Off');
    assert.equal(groundSharpnessInactive(8, true, REASON), null, 'Point: the ground takes no anisotropy');
    noteSamplingDriver(contextOf(SOFTWARE_VULKAN), 16);
    assert.equal(groundSharpnessInactive(8, false, REASON), REASON, 'a later context leaves the first one standing');
    forgetSamplingDriver();
    noteSamplingDriver(contextOf(D3D11), 1);
    assert.equal(groundSharpnessInactive(8, false, REASON), null, 'a driver without anisotropy');
    forgetSamplingDriver();
    noteSamplingDriver(contextOf(SOFTWARE_VULKAN), 16);
    assert.equal(groundSharpnessInactive(8, false, REASON), null, 'a driver not listed');
  } finally {
    forgetSamplingDriver();
  }
});
