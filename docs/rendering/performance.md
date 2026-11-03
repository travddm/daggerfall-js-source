# Rendering performance

This page covers what keeps the renderer fast, how to measure a change, the switches that turn features off for
comparison, retro mode and render scale, and GPU memory release.

## Rules that hold

- **No shader compile inside a frame.** A compile and link is a driver call that can stall for tens of milliseconds.
  - Every program is built with `buildProgram(gl, vs, fs, label)` in `src/render/glProgram.js`. A failure throws the
    driver's log.
  - Where the browser has `KHR_parallel_shader_compile` (`parallelCompile(gl)`), a pass starts its programs with
    `startPrograms` and builds them only when they report complete, without waiting.
  - Programs the renderer builds on demand are compiled ahead of use on idle time: `renderer.warmSteps()` lists them
    and `src/render/warmPrograms.js` runs one per `requestIdleCallback`. `renderer.lazyWarmSteps()` starts the feature
    passes the game meets later (`src/render/playPrograms.js`).
  - A new on-demand program goes into one of these lists.
- **No per-frame allocation on hot paths.** Reuse typed arrays and scratch objects. Billboard batches mint every
  field at creation so each has one hidden class for life (`src/render/contract.js`).
- **Fewer state changes.** The renderer caches the bound program, VAO and textures and skips redundant binds. A
  foreign pass that changes them must call `markForeignPass()` ([renderer.md](renderer.md#foreign-passes)).
- **Frustum culling.** `src/render/frustum.js` tests bounds against the view planes (`localAabb`, `transformedAabb`,
  `flatBatchAabb`); `src/render/bounds.js` measures spheres at upload (`boundsOf`, `batchVisible`). The test is
  conservative: a box that straddles the frustum is drawn, so padding bounds generously is safe. `?cull=off` disables
  it to check a suspected wrong bound.
- **Static batching.** A map pixel's static models are merged into one mesh per texture at build time
  (`src/render/staticBatch.js`).
- **Billboard arena.** Billboard quads come from shared index arenas (`BB_ARENA_QUADS`, `arenaTake`, `arenaGive`)
  instead of one buffer per batch.
- **Work off the frame.** Terrain grids, horizon rings and texture decodes are built on workers or in steps across
  frames (`uploadTileArraySteps`). The frame only draws.
- **Textures are evicted.** The texture cache tracks which place uses which texture and evicts unused ones
  (`evictTexture`). A draw that finds a texture still decoding asks again on a later frame.

## Measuring

| Tool | How | Gives |
| --- | --- | --- |
| FPS counter | `?fps`, or the Show FPS preference | Frames per second, frame time, draws and binds from `renderer.stats`, GPU name and frame size. |
| Perf meter | `?perf` (`src/render/perfMeter.js`) | One console line every `PERF_EVERY` world frames: GPU time from `beginFrame` to the resolve, and pass counts. `?perf=zones` splits GPU time by pass (shadow, world, air ...). Needs `EXT_disjoint_timer_query_webgl2` (Chrome has it; Firefox and Safari mostly do not). |
| Perf probe | `ARENA2_PATH=... npm run perf` (`tools/perfProbe.mjs`) | Boots the real game in Playwright and logs FPS, frame time, script time, draws and texture binds for a city, the open road and a dungeon. `HEADED=1` uses the machine's GPU; headless runs on SwiftShader and its numbers are relative only. `SCENES=` picks scenes; `OUT=` appends JSON rows. |
| Frame stats in a probe | `window.__renderer.stats` with `?shot` | The same counters, read by a script. |

Run the probe before and after a change on the same machine; the difference is the change. A headless number is not
a real GPU number.

## Switches for comparison

Each switch reads the URL once at scene build through `src/systems/pageQuery.js`.

| Switch | Turns off or changes |
| --- | --- |
| `?lighting=classic` | The enhanced lighting lane (and with it shadows and the air pass). |
| `?air=off` | The air pass: ambient occlusion, bloom, shafts, eye adaptation. |
| `?contact=off` | Contact shadows. |
| `?clusters=off` | Clustered lights; every fragment loops over every light. |
| `?shadowcache=off` | The static shadow-caster cache. |
| `?sky=classic` / `?sky=dynamic` | The enhanced sky; or forces Dynamic Skies. |
| `?clouds=off` | Volumetric clouds. |
| `?water=off` | The enhanced water surface. |
| `?wisps=off` | Wind wisps. |
| `?cull=off` | Frustum culling. |
| `?renderscale=<tier>` | Render scale ([below](#render-scale-and-retro-mode)). |
| `?exposure=<n>` | The enhanced lane's exposure, for tuning. |

## Render scale and retro mode

Both draw the world into a smaller image and present it to the canvas. They share one path in the renderer
(`_retroBegin`, `_presentRetroFrame`, using `src/render/retroPass.js`). The renderer asks for both settings once per
world frame, so a change applies on the next frame.

- **Render scale** (`src/systems/renderScale.js`, preference `renderScale`, tiers in `RENDER_SCALES`, override
  `?renderscale=`). Below 1, the world image is the world viewport times the scale, presented with linear filtering
  and no effects. At 1 there is no extra image. Screen-space kernels (bloom blur, bolt width) are sized in the image's
  pixels.
- **Retro mode** (`src/systems/retroMode.js`, Daggerfall Unity's settings `Video.RetroRenderingMode`,
  `PostProcessingInRetroMode`, `UseMipMapsInRetroMode`, `RetroModeAspectCorrection`, `PalettizationLUTShift`). The
  world draws into 320x200 or 640x400 (320x154 or 640x308 with the docked large HUD) and is point-sampled up, with
  optional posterize or palettize post-processing. Retro mode wins over render scale.
- Leaving both returns to drawing straight to the canvas, and the renderer frees the image and depth it used.

## GPU memory and context loss

- `src/render/glRelease.js` releases GL contexts when the page goes away (`onPageGone`, `loseGlContext` through
  `WEBGL_lose_context`), so a closed tab gives back its GPU memory. `main.js` registers the game's context; a pass or
  lab that creates its own context must register it too.
- Owners release what they create: textures, meshes, batches, render targets. A scene's `dispose` releases its
  resources; leaving that out leaks GPU memory across scene changes.

## Tests for rendering

- `test/render/` holds the renderer's unit tests (about 140 files). They import render modules and test their pure
  functions: bounds, culling, light lists, cluster assignment, retro sizes, shader maths through `test/glsl.mjs`.
- A WebGL2 context is not available under `node --test`. Code that needs one is checked by Playwright probes in
  `tools/` (for example `tools/lightClusterProbe.mjs`, `tools/cloudNoiseProbe.mjs`), which compile, draw and read the
  frame back in headless Chromium.
- A visible change is verified in the running game, on a real GPU, in each lane the change can reach (classic and
  enhanced), and at the sizes it affects.
