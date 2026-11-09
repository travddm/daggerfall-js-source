#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
uniform sampler2D uColor;   // the world's retro image
uniform sampler2D uDepth;   // its depth - the far plane is the sky
uniform sampler3D uLut;     // the palette's LUT
uniform vec4 uRect;         // the world rect on the canvas, px, bottom-left
uniform vec2 uPresent;      // RetroPresentation's 640x400
uniform int uKind;          // 0 plain Blit, 1 posterize, 2 palettize
uniform int uNoSky;         // EXCLUDE_SKY
uniform int uLutSize;
uniform int uSmooth;        // PERF-SCALE: the render scale's image - LINEAR, unsnapped, no effect
out vec4 outColor;
// the display byte to DFU's linear and back: the exact sRGB pair
vec3 srgbToLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 linearToSrgb(vec3 l) { return mix(l * 12.92, 1.055 * pow(l, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, l)); }
// UnityCG's LinearToGammaSpace and GammaToLinearSpace: the approximate pair DFU's two shaders call
vec3 unityLinearToGamma(vec3 l) { return max(1.055 * pow(max(l, vec3(0.0)), vec3(0.416666667)) - 0.055, vec3(0.0)); }
vec3 unityGammaToLinear(vec3 s) { return s * (s * (s * 0.305306011 + 0.682171111) + 0.012522878); }
void main() {
  if (uSmooth == 1) { outColor = texture(uColor, (gl_FragCoord.xy - uRect.xy) / uRect.zw); return; }
  // the screen pixel's presentation texel, and that texel's centre - two
  // Point blits (source -> 640x400 -> screen) in one fetch
  vec2 uv = (floor((gl_FragCoord.xy - uRect.xy) / uRect.zw * uPresent) + 0.5) / uPresent;
  vec4 c = texture(uColor, uv);
  outColor = c;
  if (uKind == 0) return;
  if (uNoSky == 1 && texture(uDepth, uv).r >= 1.0) return;   // "Sky untouched"
  vec3 g = unityLinearToGamma(srgbToLinear(c.rgb));
  vec3 q;
  if (uKind == 1) q = floor(g * 15.0 + 0.5) / 15.0;
  else q = texelFetch(uLut, min(ivec3(floor(g * float(uLutSize))), ivec3(uLutSize - 1)), 0).rgb;
  outColor = vec4(clamp(linearToSrgb(unityGammaToLinear(q)), 0.0, 1.0), c.a);
}
