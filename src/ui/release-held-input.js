// @ts-check
// A key or a mouse button held when the window loses focus never sends its release: the browser hands the keyup to
// whatever has focus then. Without this the player walks on, or runs on a held Shift, until the key is pressed again.
import { MOUSE_CODES } from './input.js';

/**
 * @typedef {object} HeldInputWiring
 * @property {{ addEventListener: (type: string, listener: () => void) => void }} target the window
 * @property {{ addEventListener: (type: string, listener: () => void) => void, visibilityState: string } | null} [doc]
 *   the document: a hidden tab loses its releases too
 * @property {Set<string>} held the host's held key codes, mouse buttons as `ui/input.js` names them
 * @property {(code: string) => void} releaseKey the host's release of a key
 * @property {(button: number) => void} releaseButton the host's release of a mouse button, by `MouseEvent.button`
 */

/**
 * Releases every held key and button when the window loses focus or the tab is hidden, through the host's own release
 * paths. Answers the release, for a caller that loses focus some other way.
 * @param {HeldInputWiring} wiring
 * @returns {() => void}
 */
export function releaseHeldInputOnBlur({ target, doc = null, held, releaseKey, releaseButton }) {
  const releaseAll = () => {
    for (const code of [...held]) {
      const button = MOUSE_CODES.indexOf(code);
      if (button < 0) releaseKey(code);
      else releaseButton(button);
    }
  };
  target.addEventListener('blur', releaseAll);
  doc?.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'hidden') releaseAll();
  });
  return releaseAll;
}
