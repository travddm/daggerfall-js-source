// The grass's two sprite sheets, each with a mip chain built by hand (render/grassPixelArt.js, render/grassMeadow.js),
// and how each is sampled on texture unit 4. The renderer's own passes stop at unit 3 and its reserved units start at
// 11, and the host marks the grass a foreign pass after every draw, so nothing counts on unit 4 holding across it.
//
// The pixel style's sheet is data: a texel holds a tone index, a height along its blade and a blade ordinal. A blend of
// two texels would be a tone or a blade that does not exist, so that sheet is nearest under every texture filter. The
// meadow's atlas is colour, so it follows the world texture filter: under Sharp each texel is sampled at its centre, at
// the meadow's own mip level plus the retro modes' bias, as the world's flats are (render/sharp-texels.ts).
import { SHARP, SHARP_TEXEL_GLSL } from './sharp-texels.ts';
import { filterWorldPicture, freshWorldPicture, worldFilterMode } from './world-texture-filter.ts';

/** One level of a sheet's chain. */
export type SheetLevel = { readonly width: number; readonly height: number; readonly data: ArrayBufferView | null };

/** The grass program's locations by uniform name (labGrass.js `this.u`); this module uploads uPxSheet, uSharpOn and
 *  uSharpRetro. */
export type SheetUniforms = { readonly [name: string]: WebGLUniformLocation | null | undefined };

/** The frame's Sharp retro values when the host hands none: the full-size frame's. */
const NO_SHARP_RETRO = new Float32Array(2);

/** A sheet and its chain on a texture of its own, every level uploaded and clamped. `colour` (the meadow's atlas)
 *  takes the world texture filter; the pixel sheet is nearest both ways. */
export function uploadGrassSheet(
  gl: WebGL2RenderingContext,
  mips: readonly SheetLevel[],
  colour = false,
): WebGLTexture {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  for (let i = 0; i < mips.length; i++) {
    gl.texImage2D(gl.TEXTURE_2D, i, gl.RGBA, mips[i].width, mips[i].height, 0, gl.RGBA, gl.UNSIGNED_BYTE, mips[i].data);
  }
  if (colour) {
    filterWorldPicture(gl, tex, gl.TEXTURE_2D, mips.length > 1);
  } else {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  }
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

/** Binds a sheet on unit 4 for a draw of the pixel or meadow style. The meadow's atlas first takes a changed filter, and
 *  the meadow's sample is told whether to snap and the frame's retro values. */
export function bindGrassSheet(
  gl: WebGL2RenderingContext,
  u: SheetUniforms,
  sheet: WebGLTexture,
  meadow: boolean,
  sharpRetro: Float32Array | null | undefined,
): void {
  gl.activeTexture(gl.TEXTURE4);
  gl.bindTexture(gl.TEXTURE_2D, sheet);
  if (meadow) freshWorldPicture(gl, sheet);
  gl.uniform1i(u.uPxSheet ?? null, 4);
  gl.uniform1f(u.uSharpOn ?? null, meadow && worldFilterMode() === SHARP ? 1 : 0);
  if (u.uSharpRetro) gl.uniform2fv(u.uSharpRetro, sharpRetro ?? NO_SHARP_RETRO);
  gl.activeTexture(gl.TEXTURE0);
}

/** The meadow's sample, for the grass fragment shader after `uPxSheet` is declared: the plain level-of-detail sample
 *  outside Sharp, Sharp's texel centre at that level otherwise. */
export const MEADOW_TEXEL_GLSL = `${SHARP_TEXEL_GLSL}uniform float uSharpOn;
vec4 meadowTexel(vec2 uv, float lod, vec2 gx, vec2 gy) {
  if (uSharpOn < 0.5) return textureLod(uPxSheet, uv, lod);
  vec2 size = vec2(textureSize(uPxSheet, 0));
  vec2 footprint = (abs(gx) + abs(gy)) * size * (1.0 - uSharpRetro.x);
  return textureLod(uPxSheet, sharpTexel(uv * size, footprint) / size, lod + uSharpRetro.y);
}
`;
