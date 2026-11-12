// The renderer's world programs for the current world filter: a world set built for Sharp has its world-art samples
// rewritten (render/sharp-texels.ts), and one built for the other filters has them plain. When the filter changes into
// or out of Sharp, the classic set and the lighting lane's set are swapped for their twins, and whichever was installed
// is installed again, so the change shows on the next frame. A twin is built the first time it is wanted, on the
// settings write and never inside a frame, and kept, so switching back costs nothing.
import { onSettingChange } from '../systems/settings/settings.js';
import { SHARP, sharpenWorldFs } from './sharp-texels.ts';
import { worldFilterMode } from './world-texture-filter.ts';

/** A world set as the renderer builds it, with the source it was built from. */
export type WorldSet = { readonly key: string; readonly sharp: boolean; readonly source: object };

/** What the renderer hands in. */
export type SharpRenderer = {
  _classicSet: WorldSet;
  _laneSet: WorldSet | null;
  readonly _worldSet: WorldSet;
  _buildWorldSet(source: object): WorldSet;
  _installWorldSet(set: WorldSet): void;
};

/** Each built set and its twin for the other side of Sharp. */
const twins = new WeakMap<WorldSet, WorldSet>();

/** Whether the world sets should be Sharp now. */
export function sharpWanted(): boolean {
  return worldFilterMode() === SHARP;
}

/** A fragment shader as a set builds it: rewritten for a Sharp set, as it is otherwise. Every variant a set builds later
 *  (the terrain's clip and snow programs) goes through here too. */
export function setFragment(set: { readonly sharp?: boolean }, fs: string): string {
  return set.sharp ? sharpenWorldFs(fs) : fs;
}

function twinOf(renderer: SharpRenderer, set: WorldSet, sharp: boolean): WorldSet {
  if (set.sharp === sharp) return set;
  let twin = twins.get(set);
  if (!twin) {
    twin = renderer._buildWorldSet({ ...set.source, sharp });
    twins.set(set, twin);
    twins.set(twin, set);
  }
  return twin;
}

/** Brings the classic and lane sets to the current filter, installing again whichever of them was installed. */
export function useSharpWorldSets(renderer: SharpRenderer, sharp: boolean = sharpWanted()): void {
  const installed = renderer._worldSet;
  const classic = renderer._classicSet;
  const lane = renderer._laneSet;
  renderer._classicSet = twinOf(renderer, classic, sharp);
  renderer._laneSet = lane ? twinOf(renderer, lane, sharp) : null;
  if (installed === classic && renderer._classicSet !== classic) renderer._installWorldSet(renderer._classicSet);
  if (lane && installed === lane && renderer._laneSet !== lane)
    renderer._installWorldSet(renderer._laneSet as WorldSet);
}

/** Installs the classic set and follows Video/MainFilterMode for the renderer's life. */
export function startWorldSets(renderer: SharpRenderer): void {
  renderer._installWorldSet(renderer._classicSet);
  onSettingChange((section: string, key: string) => {
    if (section === 'Video' && key === 'MainFilterMode') useSharpWorldSets(renderer);
  });
}
