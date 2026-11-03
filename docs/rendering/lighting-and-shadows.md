# Lighting and shadows

This page covers the two lighting looks (classic and enhanced), point lights and their clusters, the air pass
(ambient occlusion, bloom, sun shafts, eye adaptation), fog, and shadow maps.

## Lighting lanes

The renderer has one set of world programs per lighting look. A set is called a lane. The host installs one at scene
mount with `syncLightingLane(renderer)` (`src/render/enhancedLighting.js`); a change of the preference applies when
the world next loads.

| Lane | Installed by | Look |
| --- | --- | --- |
| Classic | `renderer.setLightingLane(null)` | Daggerfall's look: display-space colour, `(1 - d/r)^2` light falloff, no highlights, no post effects. At most 16 point lights. |
| Enhanced lighting | `EL_LANE` from `enhancedLighting.js` | Linear light: sRGB decode, windowed inverse-square lanterns, specular highlight, exposure (`EL_EXPOSURE`) and an extended Reinhard tone map, then sRGB encode. At most `EL_MAX_LIGHTS` (48) point lights. Shadows and the air pass. |
| Classic with shadows | `syncClassicShadowLane` (`src/render/classicShadowLane.js`) | The enhanced programs with the classic look put back (`classicLook` swaps the GLSL functions) plus shadow maps. Used by the Improved Interior Lighting mod (`src/systems/improvedInteriorLighting.js`). |

`enhancedLightingOn()` decides the lane: the enhanced skin, the `enhancedLighting` preference, and not
`?lighting=classic`. A lane object declares its fragment shaders (`meshFs`, `bbFs`, `terrainFs`, `charFs`,
`decalFs`, `farRingFs`), whether it wants shadows (`shadows`) and the air pass (`air`), and its light cap.
`setLightingLane` builds the lane's program set once, keyed by `lane.key`, and installs it.

Host colours (ambient, sun, light colours) are always given in display space. Each lane converts them when it uploads
(`_c3`), so a host never needs to know which lane is on.

### What the host sets each frame

- `setLighting(ambient, sunScale, sunColor, trilight)` and `setAmbientTrilight` (sky, equator and ground ambient from
  the Better Ambience mod).
- `setLightDir`, `setMoonlight`, `setThirdLight`.
- `setPointLights(data, color, colors)`: up to the lane's cap, four floats each (position and radius). Light identity
  (`src/render/lightId.js`) lets the shadow pass keep a light's map when the list is reordered.
- `setFlashLight`, `setIndirectLight`.
- `setWindowEmission(rgb)`: the colour of lit windows. The styles (`day`, `night`, `fog`) and their intensities are
  Daggerfall Unity's (`src/render/windowEmission.js`).
- `setFog(mode, density, start, end, color)`, plus `setWaterFog`, `setJungleHaze`, `setSeaHaze`. Every world program
  computes fog with the one function in `src/render/fogGlsl.js`.

A dungeon under the enhanced lane scales its ambient and fog colour together (`dungeonAmbient`, `dungeonFog`), so the
far end of a hall is not brighter than the near walls.

`flatLightAt(pos)` returns the light at a point for flats and sprites that are lit on the CPU.

## Clustered point lights

Under the enhanced lane, each world frame `beginFrame` cuts the view frustum into a grid of cells (tiles of the
screen by exponential depth slices) and lists, on the CPU, the lights whose spheres touch each cell
(`src/render/lightClusters.js`). Two small integer textures carry the grid and the lists. A fragment reads its own
cell and loops over two or three lights instead of all 48. The lit result is the same up to float summation order.
`?clusters=off` turns it off for comparison.

## The air pass

`src/render/airPass.js` (`AirPass`) runs on the enhanced lane unless `?air=off`. It owns the frame target: a
canvas-sized RGBA8 image with a 24-bit depth buffer that the world draws into. The image is display-encoded, not
floating point. At the resolve (the frame's first screen-space draw, or `resolveFrame()`) it:

- computes ambient occlusion (horizon-based, at half resolution: `AIR_AO_SCALE`), blurs it and applies it;
- computes bloom (quarter resolution, `AIR_BLOOM_SCALE`) from emitters and glares around flames;
- marches sun shafts, using the fog's extinction and the cloud shadow;
- adds contact shadows (`AIR_CONTACT_*`, `?contact=off`);
- applies eye adaptation from the mean log luminance of a small downsample;
- grades the image (vignette, contrast; a scene can override it with `setSceneGrade`) and writes it to the canvas, or
  to the retro image.

`snapshotAoDepth()` takes the depth for ambient occlusion before the grass draws, so the grass field does not occlude
itself.

## Shadows

`src/render/shadowPass.js` (`ShadowPass`) runs when the lane asks for shadows.

**Record and replay.** The renderer has no scene graph: hosts issue their draws in their own order from their own
culled lists. During the world pass the renderer records each mesh with its matrix, each terrain surface and each
billboard batch list. At the start of the next frame, before the clear, `_renderPasses` replays that list depth-only
from the light. The maps match this frame's light and camera; only the caster list is one frame old.

**Maps.**

| Scene | Map | Size |
| --- | --- | --- |
| Outdoors (sun above the horizon) | Cascaded orthographic maps around the eye, radii `SHADOW_CASCADES` (12, 48, 240 units) | `SHADOW_SUN_SIZE` 2048 |
| Indoors | A cube map for each of up to `SHADOW_POINT_CASTERS` (12) point lights | `SHADOW_POINT_SIZE` 512 per face |
| Lights past those, when the host asks for every light to cast | Low-resolution cube maps of static casters only | `SHADOW_LO_SIZE` 256 |

- The far cascade updates every `SHADOW_FAR_CASCADE_EVERY` frames. The nearest `SHADOW_PCF_CASCADES` cascades use a
  wider PCF kernel.
- Static casters are drawn once into a cache and copied under the moving casters each frame. `?shadowcache=off`
  disables the cache.
- A light carried in the hand never casts. A flat drawn with `noShadow` does not cast. A sprite smaller than
  `SHADOW_CASCADE_MIN_RADIUS_TEXELS` texels in a cascade does not cast into it.
- Receivers read the maps through the `SHADOW_GLSL` block with hardware depth compare.
- The depth programs use the renderer's own vertex shaders, passed in at construction. `shadowPass.js` imports nothing
  from the renderer, so a page on the classic lane never loads it.

**Known limits.** A caster the host did not draw (frustum-culled, behind the camera) casts nothing. When the player
crosses a door, the recorded casters are discarded for one frame, so a room never shows the street's shadows.

**Cloud shadow.** On the enhanced sky the volumetric clouds write a shadow map of the cloud deck. Every sun-lit
program reads it through the GLSL in `src/render/cloudShadow.js` (`cloudShadowAt`), and the air pass uses it for the
shafts. The deck belongs to one frame: the exterior host sets it after `beginFrame`; interiors and dungeons never get
one.

## Testing lighting changes

- Unit tests in `test/render/` import the lighting modules and check their functions; `test/glsl.mjs` runs GLSL
  functions in JavaScript.
- Probes in `tools/` (for example `tools/lightClusterProbe.mjs`) compile and draw in headless Chromium and read the
  frame back. Headless Chromium runs SwiftShader (software GL), so its timings are relative only, and it does not show
  every driver's behaviour. Check a visible change on a real GPU in the running game.
