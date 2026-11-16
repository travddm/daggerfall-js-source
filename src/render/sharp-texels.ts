// The Sharp world texture filter (Video/MainFilterMode 3, the port's default; a departure from DFU, whose default is
// Point). It samples through a linear sampler with anisotropy, but first moves each fragment's coordinate to the centre
// of its texel, with a blend of about one screen pixel across each texel edge. Close up the texels stay square with
// smooth edges; in the distance, where a texel is smaller than a pixel, the coordinate is left alone and the mip chain
// and anisotropy filter it. The sampler being linear also keeps Direct3D under ANGLE from smearing the texels, which it
// does to a NEAREST sampler that has anisotropy.
//
// The world shaders are rewritten for Sharp as text: their world-art samples (the model and flat maps, the ground, its
// neighbour sets and the snow ground's albedo) call the helpers below with the original coordinate's gradients, so the mip and the anisotropy
// still follow the real footprint. Every other sample (screen quads, the sky, data textures) is left as it is.

/** The Video/MainFilterMode value of Sharp. Points 0 to 2 are DFU's Point, Bilinear and Trilinear. */
export const SHARP = 3;

/** The coordinate math, in texel space: `t` the coordinate times the texture size, `fw` the footprint of one screen
 *  pixel in texels. Inside a texel the result is its centre; within half a pixel of an edge it ramps across. Where a
 *  texel is smaller than a pixel (fw of 1 or more) the coordinate is unchanged. A footprint of zero snaps every
 *  coordinate to its texel's centre.
 *
 *  `uSharpRetro` holds the retro modes' values (render/retro-sharp.ts): x 1 drops the edge blend (the footprint is
 *  taken as zero), y is a mip bias in levels, applied by scaling the gradients the mip and the anisotropy are chosen
 *  from. Both are 0 outside the retro modes. */
export const SHARP_TEXEL_GLSL = `uniform vec2 uSharpRetro;
vec2 sharpTexel(vec2 t, vec2 fw) {
  vec2 seam = floor(t + 0.5);
  return seam + clamp((t - seam) / clamp(fw, vec2(1e-5), vec2(1.0)), -0.5, 0.5);
}
vec4 sharpTex(sampler2D s, vec2 uv, vec2 gx, vec2 gy) {
  vec2 size = vec2(textureSize(s, 0));
  vec2 fw = (abs(gx) + abs(gy)) * size * (1.0 - uSharpRetro.x);
  float mipScale = exp2(uSharpRetro.y);
  return textureGrad(s, sharpTexel(uv * size, fw) / size, gx * mipScale, gy * mipScale);
}
`;

/** The ground's overload, for shaders that declare a sampler2DArray precision. */
export const SHARP_TEXEL_ARRAY_GLSL = `vec4 sharpGrad(sampler2DArray s, vec3 p, vec2 gx, vec2 gy) {
  vec2 size = vec2(textureSize(s, 0).xy);
  vec2 fw = (abs(gx) + abs(gy)) * size * (1.0 - uSharpRetro.x);
  float mipScale = exp2(uSharpRetro.y);
  return textureGrad(s, vec3(sharpTexel(p.xy * size, fw) / size, p.z), gx * mipScale, gy * mipScale);
}
`;

const MARKER = 'vec2 sharpTexel(vec2 t, vec2 fw)';

/** Each world-art sample as the world shaders write it, and its Sharp form. */
const SAMPLE_REWRITES: ReadonlyArray<readonly [string, string]> = [
  ['texture(uTex, vUV)', 'sharpTex(uTex, vUV, dFdx(vUV), dFdy(vUV))'],
  ['texture(uEmissionTex, vUV)', 'sharpTex(uEmissionTex, vUV, dFdx(vUV), dFdy(vUV))'],
  ['texture(uTex, uv)', 'sharpTex(uTex, uv, dFdx(uv), dFdy(uv))'],
  ['texture(uEmissionTex, uv)', 'sharpTex(uEmissionTex, uv, dFdx(uv), dFdy(uv))'],
  ['textureGrad(uTileArr,', 'sharpGrad(uTileArr,'],
  ['textureGrad(uEcoArr1,', 'sharpGrad(uEcoArr1,'],
  ['textureGrad(uEcoArr2,', 'sharpGrad(uEcoArr2,'],
  ['textureGrad(uEcoArr3,', 'sharpGrad(uEcoArr3,'],
  // the snow ground's albedo, in the terrain's snow program: the same arguments as sharpTex
  ['textureGrad(uSnowAlbedo,', 'sharpTex(uSnowAlbedo,'],
];

/** How many world-art samples a shader has, by the table above (for the tests). */
export function worldSampleCount(fs: string): number {
  return SAMPLE_REWRITES.reduce((sum, [plain]) => sum + fs.split(plain).length - 1, 0);
}

/** A world fragment shader's Sharp form: the helpers after its precision statements, and every world-art sample
 *  rewritten. Running it twice changes nothing more, so a variant built from a rewritten shader stays right. */
export function sharpenWorldFs(fs: string): string {
  let out = fs;
  for (const [plain, sharp] of SAMPLE_REWRITES) out = out.split(plain).join(sharp);
  if (out.includes(MARKER)) return out;
  const helpers = SHARP_TEXEL_GLSL + (/precision\s+\w+\s+sampler2DArray\s*;/.test(out) ? SHARP_TEXEL_ARRAY_GLSL : '');
  const precisions = [...out.matchAll(/^[ \t]*precision[ \t][^;\n]*;[ \t]*$/gm)];
  const last = precisions[precisions.length - 1];
  const lineEnd = last ? last.index + last[0].length : out.indexOf('\n');
  const at = lineEnd + 1;
  return out.slice(0, at) + helpers + out.slice(at);
}

/** The coordinate math in JavaScript, the same as `sharpTexel` above, for the tests. */
export function sharpTexelCoordinate(t: number, fw: number): number {
  const seam = Math.floor(t + 0.5);
  return seam + Math.min(0.5, Math.max(-0.5, (t - seam) / Math.min(Math.max(fw, 1e-5), 1)));
}
