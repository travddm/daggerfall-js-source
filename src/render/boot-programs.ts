// The boot's longest program links, started as soon as the renderer exists. On a cold shader cache the world's boot
// waited about 20 s on links made one after another: the lighting lane's world set, the terrain clip and the
// volumetric clouds. Where the driver compiles beside the page (KHR_parallel_shader_compile), this module starts
// them while the boot reads the game's data, and each pass's build later takes the program started for it
// (render/glProgram.js buildProgram). Nothing is drawn differently: the builds are the same, only earlier.
//
// Each switch below restates the switch its host reads when it builds the pass. A wrong guess costs a compile and the
// program's memory, never a picture. Without the extension nothing starts: a link queued early would hold the next
// GL read.
import { parallelCompile, startPrograms } from './glProgram.js';
import { WORLD_SET_SHADERS, terrainClipFs } from './renderer.js';
import { worldSetPrograms, type WorldSetSource } from './world-set-programs.ts';
import { setFragment } from './sharp-world-sets.ts';
import { EL_LANE, enhancedLightingOn } from './enhancedLighting.js';
import { VS as CLOUD_VS, MARCH_FS, SHADOW_FS, COMPOSITE_FS, SHADOW_VIEW_FS } from './volumetricClouds.js';
import { NOISE_VS, SHAPE_FS, DETAIL_FS, SLICE_FS } from './cloudNoise.js';
import { isEnhanced } from '../systems/uiSkin.js';
import { getPref } from '../systems/uiPrefs.js';
import { takeTerrainClipRecord } from './terrain-clip-hint.ts';
import { pageParam, pageHas } from '../systems/pageQuery.js';

/** The renderer state the start reads: its context and its classic set (its sharpness and its sources). */
export type BootRenderer = {
  readonly gl: unknown;
  readonly _classicSet: { readonly sharp: boolean; readonly source: { readonly terrainFs: string } };
};

/** Whether the outdoor host will build the volumetric clouds: scenes/shared.js createSkyController builds them when the
 *  enhanced sky stands and `?clouds=off` is absent. A page that boots straight into a building or a dungeon has none. */
export function cloudsExpected(search: string): boolean {
  if (pageHas('interior', search) || pageHas('dungeon', search)) return false;
  const enhancedSky = isEnhanced() && pageParam('sky', search) !== 'classic' && !!getPref('enhancedEnvironments');
  return enhancedSky && pageParam('clouds', search) !== 'off';
}

/** Whether the world host will build the terrain clip: the session before built it (render/terrain-clip-hint.ts). The
 *  record is taken: ask once a boot. */
export function terrainClipExpected(): boolean {
  return takeTerrainClipRecord();
}

/** The programs to start for the page's query, and the terrain clip when `terrainClip`. The cloud march comes first: it is the longest single link, and the
 *  driver starts programs in the order it is handed them. */
export function bootPrograms(renderer: BootRenderer, search: string, terrainClip: boolean): Array<[string, string]> {
  const programs: Array<[string, string]> = [];
  if (cloudsExpected(search)) {
    programs.push([CLOUD_VS, MARCH_FS], [CLOUD_VS, SHADOW_FS], [CLOUD_VS, COMPOSITE_FS], [CLOUD_VS, SHADOW_VIEW_FS]);
    programs.push([NOISE_VS, SHAPE_FS], [NOISE_VS, DETAIL_FS], [NOISE_VS, SLICE_FS]);
  }
  const sharp = renderer._classicSet.sharp;
  // render/renderer.js setLightingLane builds the lane's set with the classic set's sharpness.
  const lane: WorldSetSource | null = enhancedLightingOn(search) ? { ...EL_LANE, sharp } : null;
  if (lane) programs.push(...worldSetPrograms(lane, WORLD_SET_SHADERS));
  if (terrainClip) {
    // render/renderer.js _ensureTerrainClip, for the set the world host installs before it asks for the clip.
    const set = lane ?? { sharp, terrainFs: renderer._classicSet.source.terrainFs };
    const terrainFs = setFragment(set, set.terrainFs);
    programs.push([WORLD_SET_SHADERS.terrain, setFragment(set, terrainClipFs(terrainFs))]);
  }
  return programs;
}

/** Starts the boot's programs on the renderer's context; answers whether it started any. main.js calls this once,
 *  right after the renderer is made. */
export function startBootPrograms(renderer: BootRenderer, search: string): boolean {
  if (!parallelCompile(renderer.gl)) return false;
  const programs = bootPrograms(renderer, search, terrainClipExpected());
  startPrograms(renderer.gl, programs);
  return programs.length > 0;
}
