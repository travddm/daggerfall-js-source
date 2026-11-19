// Whether the last session built the terrain clip program (render/renderer.js prepareTerrainClip). The boot start
// (render/boot-programs.ts) starts the clip only on this record: the host that asks for the clip is a mod's, and the
// boot knows nothing of mods. After a shader change, the first launch is the one that waits for every link, and the
// record then comes from the session before it. A wrong record costs one compile, never a picture.
import { appStorage } from '../systems/appStorage.js';

const STORE_KEY = 'dfo.terrainClipBuilt';

/** Records that this session built the terrain clip. Writes once a page. */
let noted = false;
export function noteTerrainClipBuilt(): void {
  if (noted) return;
  noted = true;
  try {
    appStorage()?.setItem(STORE_KEY, '1');
  } catch {
    // No storage: the next boot does not start the clip early, and the host builds it when it asks.
  }
}

/** Whether a session built the terrain clip before this one. */
export function terrainClipBuiltBefore(): boolean {
  try {
    return appStorage()?.getItem(STORE_KEY) === '1';
  } catch {
    return false;
  }
}
