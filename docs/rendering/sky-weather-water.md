# Sky, weather, water and the horizon

This page covers the outdoor passes: the three skies, volumetric clouds, precipitation and other weather effects,
water, snow, and the horizon rings past the streamed world. Most of them are foreign passes: modules outside
`renderer.js` that draw with the shared context and follow the rules in [renderer.md](renderer.md#foreign-passes).

Weather and time are game state in `src/systems/` (for example `src/world/weather.js`, `src/systems/weather/`,
`src/systems/wind/`, `src/systems/lightning.js`). The passes only draw that state; they do not decide it.

## The sky controller

`createSkyController(gl, params)` in `src/scenes/shared.js` builds the sky passes for a scene and chooses among them:

| Sky | Module | Used when |
| --- | --- | --- |
| Classic painted sky | `SkyRenderer`, `src/render/skyRenderer.js` | Always built. Daggerfall's 64 painted day frames (`SKY??.DAT`) and the painted night (`NITE??I0.IMG`), selected as `DaggerfallSky.cs` does. A rainy or snowy night shows the day branch, not stars (`skyFrameForWeatherTime`). |
| Enhanced sky | `EnhancedSkyRenderer`, `src/render/enhancedSky.js` | The enhanced lane (enhanced skin, the `enhancedEnvironments` preference, not `?sky=classic`) with the Dynamic Skies mod off. One fullscreen procedural pass, no textures: sun, two moons with phases, stars, weather tint. |
| Dynamic Skies | `DynamicSkiesRenderer`, `src/render/dynamicSkiesRenderer.js` | The enhanced lane with the Dynamic Skies mod enabled, or `?sky=dynamic`. A line-for-line translation of the mod's procedural skybox shader (`vendor/dynamic-skies/`); its uniform names are the shader's property names. `src/render/dynamicSkiesBridge.js` feeds its moon and cloud state to the rest of the world. |

`enhancedSky.js` also exports the sky maths the world uses: `sunSkyDirection`, `moonSkyDirection`,
`moonlightTerm`, `withMoonAmbient` and `skyState`.

## Volumetric clouds

`src/render/volumetricClouds.js` (`VolumetricClouds`) draws a ray-marched cloud layer between two altitudes, on the
enhanced lane unless `?clouds=off`. Quality follows the `cloudQuality` preference (or `?clouds=<quality>`).

- Density comes from two tiling 3D noise volumes made on the GPU by `src/render/cloudNoise.js`: a 128³ shape volume
  (Perlin-Worley plus Worley octaves) and a 32³ detail volume.
- Cover, softness, colour and a per-weather profile come from the eased weather state. Drift uses the one integrated
  wind, so clouds and wind move together.
- Weather cells (storms, fronts) shape local cover. `?cloudcell=<weather>` places one static cell for testing.
- The clouds write the cloud-shadow map that sun-lit programs and the air pass read
  ([lighting-and-shadows.md](lighting-and-shadows.md#shadows)).
- When clouds are on, the enhanced or dynamic sky skips its own cloud layer (`cloudsExternal`).

## Precipitation and weather effects

| Effect | Module | Notes |
| --- | --- | --- |
| Rain and snow | `src/render/precipitation.js` | A particle volume that wraps around the camera, animated entirely in the shader (no per-frame CPU). Rain quads stretch along the fall; snow quads face the camera and drift. Depth-tested, no depth writes, alpha-blended, drawn after the other world passes, unfogged. Two programs: the classic look and the enhanced lane's own. |
| Sand and ash | `src/render/dryFall.js` | The falls rain does not cover (`isDryFall`): sandstorm sand and ashfall flakes with additive embers. |
| Wind wisps | `src/render/windWisps.js` | Faint streaks along the wind's velocity in a wrapping box around the eye. Enhanced skin, `windWisps` preference, `?wisps=off`. |
| Lightning | `src/render/lightningBolts.js` | Ground-strike channels (`boltPath` in `src/systems/lightning.js`) as eye-facing ribbons, added to the frame. Depth-tested, no depth writes, never thinner than about a pixel so far strikes stay visible. |
| Heat haze | `src/render/heatHaze.js` | Translation of the Heat Haze mod's shader: copies the world's viewport, then draws a ring that refracts what lies beyond it. |
| Weather curtains in the travel view | `src/render/rainCurtains.js` | Rain columns seen from above in the travel view. |

## Fog and haze

All world programs fog by `FOG_GLSL` (`src/render/fogGlsl.js`). Extra terms layer on top: the jungle haze
(`src/render/hazeGlsl.js`, `setJungleHaze`), the sea haze on the far ring (`setSeaHaze`), and water fog under the sea
surface (`setWaterFog`). In dungeons, `src/render/underwaterFog.js` follows Daggerfall Unity's `UnderwaterFog.cs`:
green murk when the eye drops below a dungeon block's water level, and the room's fog restored when it rises.

## Water

Classic Daggerfall draws water as record 0 of the terrain tileset, an opaque flat tile like dirt. The renderer's
terrain pass still does that.

On the enhanced lane, with the `enhancedWater` preference and not `?water=off` (`waterSwitchOn` in
`src/render/waterSurface.js`), a second pass draws a water surface over the water tiles (`drawWaterSurface`):
absorption with depth, Fresnel reflection of the sky, swell, shore foam and ripples. It is drawn after the opaque
passes of a map pixel and before the flats. With shadows on, the surface receives the sun's shadow through its own
program. Deep-water and ocean-hole features have their own passes (`src/render/deepWatersRender.js`,
`src/render/oceanHolesRender.js`).

The lab page `water.html` (`src/tools/waterLab.js`) draws the water pass alone for tuning.

## Snow

- **Snow cover on the ground.** `src/render/snowCoverGlsl.js` is part of both terrain programs. The snowpack state
  (`src/systems/weather/snowpack.js`) gives snow lines about the player; `src/scenes/snowCoverHost.js` uploads them as
  one small texture each frame, and the fragment shader decides cover by height. The same formula runs on the CPU
  (`snowCoverAt`) for grass and footsteps; keep the two in step.
- **Snowfall surface.** The Snowfall mod's dynamic snow (`src/render/snowfallGlsl.js`, `src/render/snowfallSurface.js`)
  is drawn through `renderer.drawSnow` with the mod's albedo and masks. It is owned by `src/scenes/snowfallHost.js`.

## The horizon past the streamed world

The streamed grid of map pixels ends a few kilometres out. Three coarser layers continue the land to the horizon. All
are drawn in one pass by `src/render/farRing.js`, at the far plane, each inner layer over the outer one:

| Layer | Module | Cell size | Built by |
| --- | --- | --- | --- |
| Mid ring | `src/render/midRing.js` | about 100 m | the terrain worker (`src/world/terrain/midRingGrid.js`) from the streamed terrain's own height kernel |
| Far ring | `src/render/farRing.js` | one map pixel | the map heightmap, one vertex per map pixel |
| Far field | `src/render/farField.js` | several km | `buildFarFieldBytes` on the terrain worker |

They share the far ring's program for colour, light, haze, sea and cloud shadows, so the layers read as one field.
`src/render/farTrees.js`, `src/render/farFlora.js` and `src/render/farLandmarks.js` add distant trees, flora and
landmarks. Grids are built on the terrain worker, never during a frame.
