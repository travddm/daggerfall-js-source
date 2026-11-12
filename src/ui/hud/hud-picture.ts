// One classic HUD picture (the vitals bars, the compass): the worn UI pack's picture when a pack is worn, at the
// classic size (nativePanel.loadImg's rule), else the IMG file's own.
import { bitmapToColor32 } from '../../formats/color32Order.js';
import { parseWorldFilterMode, samplerFilterWord } from '../../render/world-texture-filter.ts';
import { getString } from '../../systems/settings/settings.js';
import { packImgTexture } from '../packArt.js';

type Bitmap = { width: number; height: number; data: ArrayLike<number> };
type Palette = { get(index: number): { r: number; g: number; b: number } };

/** What loadHud hands in: the file reader, the IMG reader, the palette and the renderer. */
export type HudPictureSource = {
  fetchBytes(name: string): Promise<Uint8Array>;
  ImgFile: new () => { load(bytes: Uint8Array, name: string, palette: Palette): void; getDFBitmap(): Bitmap };
  palette: Palette;
  renderer: { uploadTexture(archive: string, record: string, color32: unknown, opts?: object): unknown };
};

export type HudPicture = { tex: unknown; w: number; h: number };

/** Loads one picture; `opts` are the upload's options (its sampler). */
export async function loadHudPicture(source: HudPictureSource, name: string, opts: object = {}): Promise<HudPicture> {
  const img = new source.ImgFile();
  img.load(await source.fetchBytes(name), name, source.palette);
  const bmp = img.getDFBitmap();
  const packed: unknown = await packImgTexture(source.renderer, name);
  const tex = packed ?? source.renderer.uploadTexture('img', name, bitmapToColor32(bmp, source.palette), opts);
  return { tex, w: bmp.width, h: bmp.height };
}

/** DFU's HUDCompass samples its two pictures with GUI/GUIFilterMode, Point by default; the bars keep Point. */
export function compassPictureOptions(): object {
  return { sampler: { filter: samplerFilterWord(parseWorldFilterMode(getString('GUI', 'GUIFilterMode'))) } };
}
