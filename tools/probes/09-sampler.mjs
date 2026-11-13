// Probe 9: what this browser's driver does with a nearest-mip sampler that has anisotropy (lib/samplerCheck.mjs). It
// records the answer for src/render/anisotropic-mip-filter.ts, which lists the drivers that drop the mip filter; it
// fails only when the check cannot run, or when the driver contradicts the list for its own renderer string.
import { samplerCheck } from './lib/samplerCheck.mjs';
import { anisotropyDropsMipFilter } from '../../src/render/anisotropic-mip-filter.ts';

export const name = 'sampler';

export async function run({ browser, ck }) {
  const page = await browser.newPage();
  try {
    await page.goto('about:blank');
    const result = await page.evaluate(samplerCheck);
    console.log(`[sampler] ${JSON.stringify(result)}`);
    ck('the sampler check ran', !result.error, result.error ?? result.renderer);
    ck('the control reads one mip level', result.nearest1?.level !== null, JSON.stringify(result.nearest1));
    if (result.maxAnisotropy > 1) {
      const listed = anisotropyDropsMipFilter(result.renderer);
      ck(
        'the driver list agrees with this driver',
        listed === !result.keepsNearestMip,
        `${result.renderer}: keeps the nearest mip under anisotropy ${result.keepsNearestMip}, listed as dropping it ${listed}`,
      );
    }
  } finally {
    await page.close();
  }
}
