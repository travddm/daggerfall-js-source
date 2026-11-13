// Sharp in the retro modes (Video/RetroRenderingMode 1 and 2). The world is drawn at 320x200 or 640x400 and shown
// point-sampled at the window's size, so Sharp's blend across a texel edge, one render pixel wide, becomes a soft band
// several screen pixels wide. In the retro modes the blend is dropped: every texel is sampled at its centre, as under
// Point. The mip level is also chosen from the small image's footprints, which are larger than the window's, so the
// distance reads a smaller mip than at full size; a negative mip bias moves it back towards the detailed levels.
// The values reach the world programs as one uniform (`uSharpRetro`, render/sharp-texels.ts), uploaded with the fog.
// Zero in both is the full-size frame, so a program that never receives the upload draws as it does outside retro.

/** The mip bias of the retro modes, in levels. DFU sets the same bias on its world textures whenever retro mode is on
 *  (TextureReader, the albedo's mipMapBias). It only acts when Retro Mip Maps keeps the mip chains. */
export const RETRO_MIP_BIAS = -0.75;

/** The part of the renderer this module writes: the values it uploads and the stamp that makes it upload them. */
export type RetroSharpRenderer = {
  _sharpRetro?: Float32Array;
  _frameStamp: number;
};

let retroMipBias = RETRO_MIP_BIAS;

/** Changes the retro mip bias for the frames that follow. For probes that compare biases in one session, and tests. */
export function setRetroMipBias(bias: number): void {
  retroMipBias = bias;
}

/** The world frame the renderer opened: a retro image, a render-scale image, or none (null). */
export type OpenedFrame = { readonly kind: string } | null;

/** Sets and answers the frame's values: the edge drop and the bias in a retro frame, neither in any other frame (a
 *  panel, a scaled or a full-size world). The stamp moves only when a value changes, so the frame-constant uploads stay
 *  once a stamp. */
export function applyRetroSharp(renderer: RetroSharpRenderer, frame: OpenedFrame): Float32Array {
  const values = (renderer._sharpRetro ??= new Float32Array(2));
  const retro = frame?.kind === 'retro';
  const edgeDrop = retro ? 1 : 0;
  const bias = retro ? Math.fround(retroMipBias) : 0;
  if (values[0] !== edgeDrop || values[1] !== bias) {
    values[0] = edgeDrop;
    values[1] = bias;
    renderer._frameStamp++;
  }
  return values;
}
