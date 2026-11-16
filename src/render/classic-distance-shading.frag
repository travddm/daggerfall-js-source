#version 300 es
// Classic distance shading (classic-distance-shading.ts). Blending (SRC_ALPHA, ONE_MINUS_SRC_ALPHA) does the move:
// colour * (1 - amount) + fade * amount. The sky, at the far plane, is left as it is.
//   uMode 0: 64 steps toward uFade over uRange metres along the pixel's ray; the step must equal shadeStep's.
//   uMode 1: Daggerfall Unity's Color Boost dungeon falloff, toward black by min(depth / 90, 1) * uFalloff of eye depth.
precision highp float;
uniform highp sampler2D uDepth;
uniform vec2 uSize;     // the image, in pixels
uniform vec4 uProj;     // |proj[0]|, proj[5], proj[10], proj[14] of the world's projection
uniform int uMode;
uniform float uRange;   // metres to the last step
uniform vec3 uFade;
uniform float uFalloff; // ColorBoostDungeonFalloff, 0 to 8
out vec4 outColor;
void main() {
  float depth = texelFetch(uDepth, ivec2(gl_FragCoord.xy), 0).r;
  if (depth >= 1.0) { outColor = vec4(0.0); return; }
  vec2 ndc = gl_FragCoord.xy / uSize * 2.0 - 1.0;
  float viewDepth = uProj.w / (depth * 2.0 - 1.0 + uProj.z);
  if (uMode == 1) {
    // DFU blends toward colour * 0.001: lerp(c, c * 0.001, t) is c * (1 - 0.999 * t), held at black past t = 1.
    float t = clamp(viewDepth / 90.0, 0.0, 1.0) * uFalloff;
    outColor = vec4(0.0, 0.0, 0.0, clamp(0.999 * t, 0.0, 1.0));
    return;
  }
  float distance = viewDepth * length(vec3(ndc.x / uProj.x, ndc.y / uProj.y, 1.0));
  float step = min(floor(distance / uRange * 64.0), 63.0);
  outColor = vec4(uFade, max(step, 0.0) / 63.0);
}
