// Whether an entity has a live effect of a kind, moved out of systems/effects.js (which re-exports it) so the foe AI
// can read a target's paralysis (characters/enemy/enhanced-movement.ts) without importing effects.js, whose imports
// lead back to the enemy motor.

type EffectEntry = { kind: string; ended?: boolean };

/** presence = active; expired entries End on the NEXT tick pass (DFU shape). HELD-CONCEAL: an ENDED entry is not -
 *  DoConstantEffects runs no ConstantEffect once HasEnded (EntityEffectManager.cs:1693-1694), so it sets no flag. A worn
 *  item's concealment a blow broke stands ended on its item until the reroll (concealment.js). */
export const hasActiveEffect = (entity: { activeEffects?: EffectEntry[] } | null | undefined, kind: string): boolean =>
  !!entity?.activeEffects?.some((a) => a.kind === kind && !a.ended);
