// Classic distance shading, route A of the classic rendering study (dfo-plans, rendering/classic-rendering-options.md,
// decision 111). The original game darkened and fogged by distance through 64-step palette remap tables: the far a
// surface, the further its colours were moved toward the table's fade colour. This pass gives the same 64 steps to the
// full-colour image: after the world is drawn, each pixel is moved toward the fade colour by its step.
//
// Departures from the original game, recorded here and in the row's note:
//   - The step is picked per pixel from the depth buffer. The original game picked one row per flat, or per surface
//     from its centre point.
//   - The colour moves by a linear blend, not through the palette tables (route B, which needs palettization).
//   - The range is not measured on the original game yet (it needs a capture). Indoors it is 30 m: in the original
//     game dungeons fall to dark after about that distance (Daggerfall Unity 0.13 Rendering Update, parts 2 and 3).
//     Outdoors the steps follow the scene's own fog, so the land stays visible as far as it does today.
//   - The fade colour is a choice (decision 126, an agreed design). To black, the default, is the original game's look:
//     dungeons and buildings go to black whatever their fog. To fog colour moves every place toward its own fog, so a
//     mod's coloured fog (Better Ambience gives dungeons a brown one) tints the far view. The two differ only indoors
//     under a fog that is not black.
//
// The pass costs nothing while it is off: the renderer builds it on the first shaded frame, so no program, buffer or
// framebuffer of it exists before. It is a leaf: it is handed the renderer's program builder and imports nothing of it.

/** The original game's remap tables have 64 rows. */
export const CLASSIC_SHADE_STEPS = 64;

/** Indoors, where the fade colour is black: the distance in metres at which the last step is reached. */
export const CLASSIC_DARK_RANGE_M = 30;

/** An exponential fog leaves 5% of the colour at 3 / density. */
const EXP_FOG_FULL = 3;

/** Where the last step leads. */
export type ShadeTarget = 'black' | 'fog';

const BLACK: readonly number[] = Object.freeze([0, 0, 0]);

/** The fog the renderer was given for the frame, as setFog stores it. */
export type SceneFog = {
  /** 0 off, 1 linear, 2 exp, 3 exp2 (Renderer.setFog). */
  readonly mode: number;
  readonly density: number;
  /** Linear fog's end distance, in metres. */
  readonly end: number;
  readonly color: ArrayLike<number>;
};

/** How many steps a surface at `distance` metres is moved toward the fade colour: 0 (untouched, near the player) to
 *  63 (all the way). The original game's row 63 is its untouched row and row 0 its full fade; this counts the other way. */
export function shadeStep(distance: number, range: number): number {
  if (!(distance > 0) || !(range > 0)) return 0;
  return Math.min(CLASSIC_SHADE_STEPS - 1, Math.floor((distance / range) * CLASSIC_SHADE_STEPS));
}

/** The share of the fade colour at a step, 0 to 1. */
export function shadeAmount(step: number): number {
  return step / (CLASSIC_SHADE_STEPS - 1);
}

/** The distance at which the last step is reached for a scene's fog, or null when the scene has no fog to fade to.
 *  A black fog is a dungeon's or a building's (Renderer.setFog from scenes/dungeon.js and scenes/interior.js). */
export function shadeRange(fog: SceneFog): number | null {
  if (fog.mode === 0) return null;
  const black = fog.color[0] === 0 && fog.color[1] === 0 && fog.color[2] === 0;
  if (black) return CLASSIC_DARK_RANGE_M;
  if (fog.mode === 1) return fog.end > 0 ? fog.end : null;
  return fog.density > 0 ? EXP_FOG_FULL / fog.density : null;
}

/** The last step's colour and distance for a scene, or null when the scene has no fog to fade to. */
export type ShadeFade = { readonly range: number; readonly color: ArrayLike<number> };

/** Whether a frame is a dungeon's or a building's, by its clear colour: those clear to opaque black (INTERIOR_CLEAR,
 *  as DFU's CameraClearManager), the exterior to the sky, and the real windows' view out to transparent black. */
export function clearsIndoors(clear: ArrayLike<number>): boolean {
  return clear[0] === 0 && clear[1] === 0 && clear[2] === 0 && clear[3] === 1;
}

export function shadeFade(fog: SceneFog, indoors: boolean, target: ShadeTarget): ShadeFade | null {
  const range = shadeRange(fog);
  if (range === null) return null;
  if (target === 'black' && indoors) return { range: CLASSIC_DARK_RANGE_M, color: BLACK };
  return { range, color: fog.color };
}

export const SHADE_VS = `#version 300 es
layout(location = 0) in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

// The fragment's step must equal shadeStep's. Blending (SRC_ALPHA, ONE_MINUS_SRC_ALPHA) does the move:
// colour * (1 - amount) + fade * amount. The sky, at the far plane, is left as it is.
export const SHADE_FS = `#version 300 es
precision highp float;
uniform highp sampler2D uDepth;
uniform vec2 uSize;     // the image, in pixels
uniform vec4 uProj;     // |proj[0]|, proj[5], proj[10], proj[14] of the world's projection
uniform float uRange;   // metres to the last step
uniform vec3 uFade;
out vec4 outColor;
void main() {
  float depth = texelFetch(uDepth, ivec2(gl_FragCoord.xy), 0).r;
  if (depth >= 1.0) { outColor = vec4(0.0); return; }
  vec2 ndc = gl_FragCoord.xy / uSize * 2.0 - 1.0;
  float viewDepth = uProj.w / (depth * 2.0 - 1.0 + uProj.z);
  float distance = viewDepth * length(vec3(ndc.x / uProj.x, ndc.y / uProj.y, 1.0));
  float step = min(floor(distance / uRange * ${CLASSIC_SHADE_STEPS.toFixed(1)}), ${(CLASSIC_SHADE_STEPS - 1).toFixed(1)});
  outColor = vec4(uFade, max(step, 0.0) / ${(CLASSIC_SHADE_STEPS - 1).toFixed(1)});
}
`;

type ProgramBuilder = (vs: string, fs: string) => WebGLProgram;

type ShadeProgram = {
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  uSize: WebGLUniformLocation | null;
  uProj: WebGLUniformLocation | null;
  uRange: WebGLUniformLocation | null;
  uFade: WebGLUniformLocation | null;
};

/** One shaded frame: the image to shade in place and the frame's depth, both `width` x `height`. */
export type ShadeFrame = {
  readonly color: WebGLTexture;
  readonly depth: WebGLTexture;
  readonly width: number;
  readonly height: number;
  /** The world's projection (column-major, as mat4.js perspective builds it). */
  readonly proj: ArrayLike<number>;
  readonly fog: SceneFog;
  /** The frame's clear colour (Renderer.setClearColor), which tells a dungeon or a building from the outdoors. */
  readonly clear: ArrayLike<number>;
  readonly target: ShadeTarget;
};

export class DistanceShadePass {
  private readonly gl: WebGL2RenderingContext;
  private readonly build: ProgramBuilder;
  private shade: ShadeProgram | null = null;
  private failed = false;
  /** A framebuffer over the image's colour alone: the depth is read, so it may not be attached. */
  private target: { fbo: WebGLFramebuffer; color: WebGLTexture } | null = null;

  constructor(gl: WebGL2RenderingContext, options: { build: ProgramBuilder }) {
    this.gl = gl;
    this.build = options.build;
  }

  private program(): ShadeProgram | null {
    if (this.shade || this.failed) return this.shade;
    const gl = this.gl;
    try {
      const program = this.build(SHADE_VS, SHADE_FS);
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
      gl.useProgram(program);
      gl.uniform1i(gl.getUniformLocation(program, 'uDepth'), 1);
      this.shade = {
        program,
        vao,
        uSize: gl.getUniformLocation(program, 'uSize'),
        uProj: gl.getUniformLocation(program, 'uProj'),
        uRange: gl.getUniformLocation(program, 'uRange'),
        uFade: gl.getUniformLocation(program, 'uFade'),
      };
    } catch (error) {
      this.failed = true;
      console.warn('[shade] the distance shading program would not build - drawing without it:', error);
    }
    return this.shade;
  }

  private framebufferFor(color: WebGLTexture): WebGLFramebuffer {
    const gl = this.gl;
    if (this.target?.color === color) return this.target.fbo;
    if (this.target) gl.deleteFramebuffer(this.target.fbo);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0);
    this.target = { fbo, color };
    return fbo;
  }

  /** Shades the image in place. Leaves the image's framebuffer bound, the depth unbound from unit 1 with TEXTURE0
   *  active, and the draw-state baseline (depth test, depth writes and culling on, blending off); the present that
   *  follows binds its own. Returns false when the scene has no fog to fade to or the program would not build. */
  draw(frame: ShadeFrame): boolean {
    const fade = shadeFade(frame.fog, clearsIndoors(frame.clear), frame.target);
    if (fade === null || !(frame.width > 0) || !(frame.height > 0)) return false;
    const shade = this.program();
    if (!shade) return false;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebufferFor(frame.color));
    gl.viewport(0, 0, frame.width, frame.height);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    // The image's alpha is kept: the present may carry it to the canvas.
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
    gl.useProgram(shade.program);
    gl.bindVertexArray(shade.vao);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, frame.depth);
    const proj = frame.proj;
    gl.uniform2f(shade.uSize, frame.width, frame.height);
    gl.uniform4f(shade.uProj, Math.abs(proj[0]), proj[5], proj[10], proj[14]);
    gl.uniform1f(shade.uRange, fade.range);
    gl.uniform3f(shade.uFade, fade.color[0], fade.color[1], fade.color[2]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    return true;
  }

  /** Frees the framebuffer it holds over the image (the image itself is the retro pass's). */
  dropTarget(): void {
    if (this.target) this.gl.deleteFramebuffer(this.target.fbo);
    this.target = null;
  }
}
