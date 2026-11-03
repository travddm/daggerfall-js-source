# The renderer

This page covers `Renderer` in `src/render/renderer.js`: what it owns, the resources it creates, the life of one
frame, and the rules for code that draws. It is hand-written WebGL2 with no engine or framework.

## What it is

`main.js` creates one `Renderer` on the game canvas, and every scene host draws through it. It owns:

- the WebGL2 context and all GL state (program, VAO, texture units, blend, depth, viewport, scissor, framebuffer);
- the world programs (mesh, billboard, terrain, character, decal, water) in two sets: the classic set and the
  enhanced lighting set ([lighting-and-shadows.md](lighting-and-shadows.md));
- texture, mesh and billboard caches;
- the post passes it drives: the shadow pass, the air pass, the retro pass;
- per-frame counters in `renderer.stats` (`draws`, `programBinds`, `vaoBinds`, `texBinds`, `bbCulled`,
  `spriteBinds`, `viewDraws`, `shadowDraws`) and `renderer.frameInfo`. The FPS counter shows them.

Rules from the data side, stated at the top of `renderer.js`:

- UVs can be negative or above 1. Daggerfall's models rely on `REPEAT` wrapping.
- Textures from `TextureFile.getColor32` are already bottom-up, which is GL's texel order. Upload with `flipY` off.
- Indexed colour means hard pixels: world textures use `NEAREST` filtering.
- A texel with alpha 0 is a palette cutout. The shaders discard it.

## Resources

| Resource | Create | Release | Notes |
| --- | --- | --- | --- |
| Texture | `uploadTexture(archive, record, color32, opts)` | `releaseTexture`, `evictTexture` | Cached in `textures` by `archive_record` plus option suffixes (`#smooth`, `#opaque`, ...). Sampling options are part of the key. |
| Window mask | `uploadEmissionTexture` | `evictEmissionTexture` | In `emissionTextures`; marks window glass for night emission. |
| Ground tile array | uploaded per terrain archive (`uploadTileArraySteps`, `TILE_LAYERS_A_STEP` layers per step) | `releaseTileArray` | A `TEXTURE_2D_ARRAY` per archive in `tileArrays`; uploaded in steps so a new climate does not stall a frame. |
| Mesh | `createMesh(model, { bounds })` | (owner releases) | A Daggerfall model's vertices and sub-meshes; bounds measured at upload for culling. |
| Billboard batch | `createBillboardBatch(archive, record, size, centers, opts)` | `destroyBillboardBatch` | Every flat of one texture in one batch, four vertices each. Quads come from a shared arena (`BB_ARENA_QUADS`). |
| Character mesh | `createCharacterMesh`, `createSkinnedCharacterMesh` | `releaseCharacterSkin`, `releaseCharacterTexture` | Player and NPC bodies; skinned meshes use a palette texture. |
| Particles, decals | `createParticleEffect`, `createDecalBatch` | `releaseParticleEffect`, `destroyDecalBatch` | |

Every allocation has an owner: the scene or module that created it releases it. A billboard batch's fields and the
other shapes that cross from a host into the renderer are declared in `src/render/contract.js` (types only, no code).
Use those types instead of passing ad-hoc objects; a wrong shape here throws inside WebGL.

Static models do not move, so a streamed map pixel merges them at build time into one mesh grouped by texture
(`src/render/staticBatch.js`): one draw call per texture instead of one per sub-mesh. Models that animate or swap
(gates, mill rotors) stay out of the batch.

## One world frame

A host draws a world frame like this (see the frame order in
[../architecture/boot-and-frame.md](../architecture/boot-and-frame.md)):

```js
renderer.setFog(mode, density, start, end, color);
renderer.setLighting(ambient, sunScale, sunColor, trilight);
renderer.setPointLights(data, color, colors);
renderer.setClearColor(rgba);
renderer.beginFrame(proj, view, lightDir, WORLD_FRAME);   // WORLD_FRAME = { world: true }
// terrain, meshes, static batches, water, sky, billboards, characters, foreign passes
// 2D: HUD and windows (drawScreenQuad ...)
renderer.resolveFrame();
```

What `beginFrame` does:

1. Closes the previous 2D pass and resets per-frame state: counters, the cloud-shadow deck, fog overrides, the
   sea haze, the travel-view focus, cached program and VAO bindings. Anything a host wants for this frame it must set
   again after `beginFrame`.
2. Resizes the canvas to its CSS size if it changed, and applies a world viewport the host asked for
   (`setWorldViewport`, used by the docked large HUD). The request is consumed, so the host asks every frame.
3. `_beginLane`:
   - presents an image still owed from the previous frame (the enhanced resolve or a retro image);
   - opens a retro or render-scale image when one is active (`_retroBegin`);
   - on a world frame with shadows, runs the shadow pass (`_renderPasses`). It replays the casters recorded during
     the previous frame's world pass into the shadow maps;
   - binds the frame target: the air pass's canvas-sized image under enhanced lighting, the retro image, or the
     canvas.
4. Builds this frame's light clusters (enhanced lighting only).
5. Clears colour and depth, binds the mesh program, and uploads the frame's uniforms: matrices, light direction,
   ambient, sun, moon, a third light, point lights, window emission colour and fog.

During the world pass the draw methods record shadow casters as they draw. Main draw calls:

| Method | Draws |
| --- | --- |
| `drawTerrain(surface, model, arrayTex, tilemapTex, tileSize, clip, eco, snow)` | All ground: exterior blocks and terrain, as a tile map over a tile array. `clip` selects the variant that discards `CLIP_SENTINEL` tiles. |
| `drawMesh(mesh, model, texRemap, { noShadow, translucent })` | A model or a static batch. `texRemap` swaps textures (climate and season). |
| `drawWaterSurface(...)` | The enhanced water surface. |
| `drawSnow(surface, u, tex)` | Snow cover tiers over the ground. |
| `drawBillboards(batches, camRight, camUp)` | Flats: trees, NPCs, foes, lights. Culled per batch; blended flats (ghosts, concealed bodies) are drawn after the opaque ones. |
| `drawCharacter(mesh, model)` | A 3D character directly in the world. |
| `drawDecals`, `drawWorldParticleEffects` | Decals and particle effects. |

### Characters as sprites

Characters are often drawn as pixel art: `renderCharacterSprite` (and the batched `beginCharacterSpriteBatch` /
`queueCharacterSprite` / `flushCharacterSpriteBatch`) renders the 3D mesh into an offscreen target under a fitted
orthographic camera at `CHAR_PIXEL` size, and `drawCharacterSpriteQuad` places the result in the world as a quad.
The world itself is not pixelized this way.

### Foreign passes

Sky, clouds, precipitation, horizon rings and many feature effects are drawn by modules outside `renderer.js` that use
the same context. These are foreign passes. Rules:

- Build programs with `buildProgram` from `src/render/glProgram.js` (the renderer uses the same function).
- After drawing, restore what you changed (cull face, blend, depth mask, bound framebuffer) and call
  `renderer.markForeignPass()`. It tells the renderer that its cached program, VAO and texture-unit state are no longer
  valid, so the next renderer draw rebinds.
- If you bind a framebuffer, restore the frame target with `frameTarget()` / `setFrameTarget()` from
  `src/render/renderTarget.js`. Under enhanced lighting or retro mode the frame target is not the canvas.

### The 2D pass and the resolve

Screen-space drawing uses `drawScreenQuad`, `drawScreenQuadRun`, `drawScreenQuadGlow`, `setScreenOffset` and
`setScreenScissor`. The first screen-space draw of a frame resolves the world image first (`_compositeAir`): the air
pass composites ambient occlusion, bloom and sun shafts and writes the frame to the canvas, then the retro or
render-scale image is presented. `resolveFrame()` does the same for a frame that draws no screen quad afterwards.

### Panel frames

A window that shows a 3D view (the automap, a model preview) uses `panelFrame({ proj, view, lightDir, rect, clear,
setup }, body)` or `beginPanelFrame` / `endPanelFrame`. The renderer sets the scissor and viewport, draws, and restores
its state. Do not save and restore GL state yourself in UI code. The default clear colour is Daggerfall Unity's
automap clear (`PANEL_CLEAR_RGBA`), nearly transparent so the panel art shows through.

### Real windows

With real windows on, a building's glass shows the other side: from the street the room behind it, from inside the
street. `outsideViewFrame` draws the outside view into an offscreen target before the room's frame; `setWindowRooms`
and `setGlassView` select the mode each frame. The shader text and rules are in `src/render/realWindows.js`.

## Shaders and GLSL modules

- Shader text is JavaScript template strings. The main world shaders are at the top of `renderer.js`; each pass keeps
  its own in its module.
- Shared GLSL lives in leaf modules imported as strings: `fogGlsl.js` (`FOG_GLSL`, the one fog factor),
  `cloudShadow.js`, `orderedDither.js`, `meshAlpha.js`, `columnGlsl.js`, `hazeGlsl.js`, `snowCoverGlsl.js`,
  `roadEdgeGlsl.js`, `groundEdgeGlsl.js`, `ecotoneGlsl.js`, `lowPolyTreesGlsl.js`, `waterBedGlsl.js`,
  `weaponGlowGlsl.js`. Keep one home for each formula; do not copy a block into a second shader file.
- These modules have no imports of their own, so they are evaluated before the shader templates that use them.
- Some texture units are reserved by name (`CLOUD_SHADOW_UNIT`, `BB_SURFACE_UNIT`, `SNOW_UNITS`, `ECO_UNITS`). Check
  the existing constants before you bind a new unit in a world program.
- `test/glsl.mjs` evaluates GLSL functions in JavaScript, so a test can check a shader's maths on the real shader text.

## Data and presentation

The renderer is presentation and is our own, not a port of Daggerfall Unity's Unity rendering. What it draws must
still follow the data: texture records, palettes, UV wrapping, window emission colours (`src/render/windowEmission.js`
holds Daggerfall Unity's values) and the sky's records (`src/render/skyRenderer.js` follows `DaggerfallSky.cs`).
