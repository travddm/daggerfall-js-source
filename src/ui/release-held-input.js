// @ts-check
// The world host's key and mouse-button releases, bound once. A key or a button held when the window loses focus never
// sends its release: the browser hands the keyup to whatever has focus then. Without the focus-loss release the player
// walks on, or runs on a held Shift, until the key is pressed again.
import { MOUSE_CODES, noteKeyUp } from './input.js';

/**
 * @typedef {{ addEventListener: (type: string, listener: (e: any) => void) => void }} EventSource
 */

/**
 * Binds the keyup release: the key leaves `held`, its edge is noted, then the host's `released(code)` (what any release
 * does) and `keyUp(e)` (what only a real keyup does, such as the open window's key-up). Answers the release by code,
 * for a release with no keyup.
 * @param {{ target: EventSource, held: Set<string>, edges: () => any, released: (code: string) => void,
 *   keyUp: (e: KeyboardEvent) => void }} wiring
 * @returns {(code: string) => void}
 */
export function bindKeyRelease({ target, held, edges, released, keyUp }) {
  const releaseKey = (code) => {
    held.delete(code);
    noteKeyUp(edges(), code);
    released(code);
  };
  target.addEventListener('keyup', (e) => {
    releaseKey(e.code);
    keyUp(e);
  });
  return releaseKey;
}

/**
 * Binds the mouseup release to the host's `released(e)`, and releases every held key and button when the window loses
 * focus or the tab is hidden: a key through `releaseKey`, a button through `released({ button })`. The open window
 * hears no key-up then, so a window that closes on a key's release stays open.
 * @param {{ target: EventSource, doc?: (EventSource & { visibilityState: string }) | null, held: Set<string>,
 *   releaseKey: (code: string) => void, released: (e: { button: number }) => void }} wiring
 * @returns {() => void} the focus-loss release
 */
export function bindButtonRelease({ target, doc = null, held, releaseKey, released }) {
  target.addEventListener('mouseup', released);
  const releaseAll = () => {
    for (const code of [...held]) {
      const button = MOUSE_CODES.indexOf(code);
      if (button < 0) releaseKey(code);
      else released({ button });
    }
  };
  target.addEventListener('blur', releaseAll);
  doc?.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'hidden') releaseAll();
  });
  return releaseAll;
}
