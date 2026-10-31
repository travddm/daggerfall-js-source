// WeaponBasics' Alignment, and nothing else.
//
// FPSWeapon.cs's three alignments (AlignLeft / AlignCenter /
// AlignRight) decide where a weapon image sits on the 320x200 surface,
// and four readers want them: fpsWeapon.js (which re-exports this, so
// its surface is unchanged and it is still the enum's front door),
// weaponWidget.js and shieldWidget.js.
//
// WW-LAB (2026-09-19): it is a LEAF. An enum of three integers had been
// living in a module that reaches the CIF reader, the inventory, the dye
// tables and - through nativePanel's HUD - the Morrowind arms and a
// vendored mod's mesh folder, so importing three integers cost four
// megabytes of .nif. Nothing here imports anything.
export const ALIGN = Object.freeze({ Left: 0, Center: 1, Right: 2 });
