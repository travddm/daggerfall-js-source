// @ts-check
// CHARACTER MODES: the law both ends share (docs/systems/character-modes.md). A character picks one mode at creation.
// A mode is two switches: how death works (`classic`, `hardcore`, `legacy`) and whether the character is Ironman (no
// player trade, no groups). The account service stores the mode on the realm character, signs its code into the
// identity token (`md`), and the relay reads it from there; a client field is never read for enforcement.
//
// PURE: no DOM, no storage, no clock. The relay bundles this file, so it imports nothing.

/** Every mode, in the order the picker lists them. */
export const CHARACTER_MODES = Object.freeze(['classic', 'hardcore', 'legacy', 'ironman', 'hardcore_ironman']);

/** The mode of a character that was never asked: DFU's rules. */
export const DEFAULT_MODE = 'classic';

/** The token's `md` codes. Fixed once shipped: a code is never reused for another mode. */
export const CHARACTER_MODE_CODES = Object.freeze({
  classic: 0,
  hardcore: 1,
  legacy: 2,
  ironman: 3,
  hardcore_ironman: 4,
});

/** @param {unknown} m */
export const isMode = (m) => typeof m === 'string' && Object.hasOwn(CHARACTER_MODE_CODES, m);

/** The token code of a mode. */
export const codeOf = (/** @type {string} */ m) =>
  isMode(m)
    ? CHARACTER_MODE_CODES[/** @type {keyof typeof CHARACTER_MODE_CODES} */ (m)]
    : CHARACTER_MODE_CODES[DEFAULT_MODE];

/** A token's `md` claim read back: the mode, or null for a value outside the codes. */
export function modeOfCode(/** @type {unknown} */ md) {
  return (
    CHARACTER_MODES.find((m) => CHARACTER_MODE_CODES[/** @type {keyof typeof CHARACTER_MODE_CODES} */ (m)] === md) ??
    null
  );
}

/** A death online is final: Hardcore and Hardcore Ironman. (Project Legacy's Bloodline is final by its own law.) */
export const permadeath = (/** @type {unknown} */ m) => m === 'hardcore' || m === 'hardcore_ironman';

/** No trade with other players, no parties, no shared group content. */
export const ironman = (/** @type {unknown} */ m) => m === 'ironman' || m === 'hardcore_ironman';

/** The family system plays this character (Project Legacy). */
export const legacy = (/** @type {unknown} */ m) => m === 'legacy';

/** The modes the picker offers. Project Legacy's master switch off hides the Legacy mode and refuses it at creation. */
export const creatableModes = (/** @type {boolean} */ legacySwitchOn) =>
  CHARACTER_MODES.filter((m) => m !== 'legacy' || legacySwitchOn);

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
  CHARACTER_MODES.filter((to) => canDrop(from, to, at));

/** A token's mode claims, whole: `md` only beside a realm character (`rc` 1) and only a non-Classic code of the table. */
export const modeClaimsOk = (/** @type {any} */ c) => c?.md === undefined || (c.rc === 1 && c.md !== 0 && modeOfCode(c.md) !== null);

/** The token code the mint signs for a character's mode: none for Classic (the bytes as before) or a value that is no mode. */
export const tokenCodeOf = (/** @type {unknown} */ m) => (isMode(m) && m !== DEFAULT_MODE ? codeOf(/** @type {string} */ (m)) : null);

/** The mode a create request means: the one it names, else the build from before the modes - a line's birth is the
 *  Legacy mode, any other Classic. The caller still checks it with `isMode`. */
export const modeOfRequest = (/** @type {unknown} */ named, /** @type {boolean} */ born) => (named == null ? (born ? 'legacy' : DEFAULT_MODE) : named);
