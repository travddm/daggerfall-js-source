// @ts-check
// ═══════════════════════════════════════════════════════════════════
// CHARID1: A CHARACTER IS AN ID, NOT A NAME.
//
// A save's identity was (characterName, saveName) - SaveLoadManager's
// FindSaveFolderByNames, taken verbatim. So a NEW character who took
// the name of an old one, or the default name, or a name the player
// simply reused, wrote its first QuickSave over the old character's
// QuickSave and the old character was gone. DFU has the same seam; a
// browser port with one Quick Save per character and a Discord full of
// people naming their third Breton the same thing does not get to keep
// it.
//
// Every character carries an id now: minted at chargen (and for a
// character read out of a classic DOS save), carried on the entity and
// in the save envelope, written onto the slot card. A save's identity
// is (characterId, saveName). A new character never matches a card
// without its id, which is the whole fix.
//
// The three storage prefixes live here, the one module save.js and
// saveSlots.js both import without importing each other.

export const SAVE_DATA_PREFIX = 'dagger.save.';
export const SAVE_INFO_PREFIX = 'dagger.saveinfo.';
export const SAVE_SHOT_PREFIX = 'dagger.saveshot.';

/** a fresh id - the platform's UUID where it has one, a stamp and a
 *  random tail where it does not (an old WebView); never empty */
export function mintCharacterId() {
  try { const u = globalThis.crypto?.randomUUID?.(); if (u) return u; } catch { /* no crypto */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** the entity's id, minted onto it the first time anything asks */
export function characterIdOf(entity) {
  if (!entity) return null;
  if (typeof entity.characterId !== 'string' || !entity.characterId) entity.characterId = mintCharacterId();
  return entity.characterId;
}
