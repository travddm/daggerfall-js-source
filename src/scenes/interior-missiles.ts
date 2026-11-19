// Spell missiles leave with the interior they fly in.
//
// DFU parents every spell missile to GameObjectHelper.GetBestParent() (EntityEffectManager.InstantiateSpellMissile),
// which is the interior while the player is inside. Leaving the building destroys the interior and every missile in
// it, the player's own included. The interior shares the street's cast engine, so its flights are cleared by hand.

/** The part of the cast engine this reads. */
export interface MissileEngine {
  clearMissiles(): void;
}

/** A host built without a cast engine has no missiles to clear. */
export function clearInteriorMissiles(magic: MissileEngine | null | undefined): void {
  magic?.clearMissiles();
}
