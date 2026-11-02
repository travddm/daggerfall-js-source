// The critical strike's numbers under the overhaul, in a module of their own because combat/pcaao.js is over the line
// ceiling. The combat card (combat/combatStats.js) reads the same constants as the core.
const F = Math.fround; // every C# float here is a float32

// A departure from the mod, toward DFU. The mod's critical multiplies the blow by 1 + 0.05 a five points of Critical
// Strike (x2.0 at 100) and adds crit / 4 to the chance to hit. DFU's critical adds crit / 10 to the chance to hit and
// nothing to the damage. A critical keeps a slight edge over DFU: 1 + 0.025 a five points (x1.5 at 100, x1.55 at the
// skill's read of 110) on a one-in-four roll at 100, about +12% a blow, and DFU's crit / 10 to hit.
export const PCAAO_CRIT_DAMAGE_PER_FIVE = 0.025;
export const PCAAO_CRIT_HIT_DIVISOR = 10;

/** The blow's multiplier for a landed critical, from the Critical Strike skill as the blow reads it. */
export const pcaaoCritDamageMultiplier = (crit: number): number =>
  F(F(Math.trunc(crit / 5) * F(PCAAO_CRIT_DAMAGE_PER_FIVE)) + 1);
