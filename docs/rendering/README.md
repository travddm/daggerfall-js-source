# Rendering

The hand-written WebGL2 renderer in `src/render/`: its frame, shaders, lighting, shadows, outdoor passes and
performance.

- [renderer.md](renderer.md) - `Renderer` in `src/render/renderer.js`: resources, the life of a world frame, draw
  calls, character sprites, foreign passes, the 2D pass and resolve, panel frames, shader modules.
- [lighting-and-shadows.md](lighting-and-shadows.md) - the classic and enhanced lighting lanes, point lights and
  clusters, the air pass (ambient occlusion, bloom, shafts, eye adaptation), shadow maps and the cloud shadow.
- [sky-weather-water.md](sky-weather-water.md) - the three skies, volumetric clouds, precipitation and weather
  effects, fog, water, snow, and the horizon rings past the streamed world.
- [performance.md](performance.md) - standing performance rules, measuring tools, URL switches, render scale and retro
  mode, GPU memory release, and how rendering code is tested.
