// @ts-check
// CHARACTER MODES: the law both ends share (docs/systems/character-modes.md). A character picks one mode at creation.
// A mode is two switches: how death works (`classic`, `hardcore`, `legacy`) and whether the character is Ironman (no
// player trade, no groups). The account service stores the mode on the realm character, signs its code into the
// identity token (`md`), and the relay reads it from there; a client field is never read for enforcement.
//
// PURE: no DOM, no storage, no clock. The relay bundles this file, so it imports nothing.

/** Every mode, in the order the picker lists them. */
export const MODES = Object.freeze(['classic', 'hardcore', 'legacy', 'ironman', 'hardcore_ironman']);

/** The mode of a character that was never asked: DFU's rules. */
export const DEFAULT_MODE = 'classic';

/** The token's `md` codes. Fixed once shipped: a code is never reused for another mode. */
export const MODE_CODES = Object.freeze({ classic: 0, hardcore: 1, legacy: 2, ironman: 3, hardcore_ironman: 4 });

/** @param {unknown} m */
export const isMode = (m) => typeof m === 'string' && Object.hasOwn(MODE_CODES, m);

/** The token code of a mode. */
export const codeOf = (/** @type {string} */ m) =>
  isMode(m) ? MODE_CODES[/** @type {keyof typeof MODE_CODES} */ (m)] : MODE_CODES[DEFAULT_MODE];

/** A token's `md` claim read back: the mode, or null for a value outside the codes. */
export function modeOfCode(/** @type {unknown} */ md) {
  return MODES.find((m) => MODE_CODES[/** @type {keyof typeof MODE_CODES} */ (m)] === md) ?? null;
}

/** Whether a token may carry this `md`: absent, or a whole code of a mode. */
export const modeClaimOk = (/** @type {unknown} */ md) => md === undefined || modeOfCode(md) !== null;

/** A death online is final: Hardcore and Hardcore Ironman. (Project Legacy's Bloodline is final by its own law.) */
export const permadeath = (/** @type {unknown} */ m) => m === 'hardcore' || m === 'hardcore_ironman';

/** No trade with other players, no parties, no shared group content. */
export const ironman = (/** @type {unknown} */ m) => m === 'ironman' || m === 'hardcore_ironman';

/** The family system plays this character (Project Legacy). */
export const legacy = (/** @type {unknown} */ m) => m === 'legacy';

/** The modes the picker offers. Project Legacy's master switch off hides the Legacy mode and refuses it at creation. */
export const creatableModes = (/** @type {boolean} */ legacySwitchOn) =>
  MODES.filter((m) => m !== 'legacy' || legacySwitchOn);

/**
 * Whether a character may change from one mode to another. A mode can only be loosened, never tightened; Legacy is
 * neither gained nor dropped; a dead character changes nothing. Dropping a mode to itself is not a change.
 * @param {unknown} from @param {unknown} to @param {{ dead?: boolean }} [at]
 */
export function canDrop(from, to, { dead = false } = {}) {
  if (dead || !isMode(from) || !isMode(to) || from === to) return false;
  return DROPS[/** @type {keyof typeof DROPS} */ (from)]?.includes(/** @type {string} */ (to)) ?? false;
}

const DROPS = Object.freeze({
  classic: [],
  legacy: [],
  hardcore: ['classic'],
  ironman: ['classic'],
  hardcore_ironman: ['hardcore', 'ironman', 'classic'],
});

/** The modes a character may drop to now. */
export const dropsFrom = (/** @type {unknown} */ from, /** @type {{ dead?: boolean }} */ at = {}) =>
  MODES.filter((to) => canDrop(from, to, at));
