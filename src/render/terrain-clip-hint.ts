// Whether the last session built the terrain clip program (render/renderer.js prepareTerrainClip). The boot start
// (render/boot-programs.ts) starts the clip only on this record: the host that asks for the clip is a mod's, and the
// boot knows nothing of mods. After a shader change, the first launch is the one that waits for every link, and the
// record then comes from the session before it. The boot takes the record and removes it, and a session that builds
// the clip writes it again, so a player who turns the clip's mod off pays one wasted compile at most. A wrong record
// costs a compile, never a picture.
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

/** Whether the session before this one built the terrain clip. Removes the record: this session writes it again if it
 *  builds the clip. */
export function takeTerrainClipRecord(): boolean {
  try {
    const storage = appStorage();
    const built = storage?.getItem(STORE_KEY) === '1';
    if (built) storage?.removeItem(STORE_KEY);
    return built;
  } catch {
    return false;
  }
}
