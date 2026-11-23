// Hardcore and Ironman are hidden online until their enforcement lands. Online, nothing yet makes a
// Hardcore death final or keeps an Ironman out of trade and groups, so offering them would promise rules the server
// does not keep. Offline the modes stay as they are. Take a mode out of this list in the pull request that enforces it.
//
// The relay bundles net/modeLaw.js, so this list lives here: the picker (systems/characterModes.js) and the account
// service's create check (server-account/src/realm.js) both read it.

/** The modes a character cannot be created in online, because online play does not enforce them yet. */
export const UNENFORCED_ONLINE_MODES: readonly string[] = Object.freeze(['hardcore', 'ironman', 'hardcore_ironman']);

/** The `offered` table (net/modeLaw.js creatableModes) with every unenforced mode turned off. */
export function withoutUnenforcedModes(offered: Record<string, boolean>): Record<string, boolean> {
  const hidden = Object.fromEntries(UNENFORCED_ONLINE_MODES.map((mode) => [mode, false]));
  return { ...offered, ...hidden };
}
