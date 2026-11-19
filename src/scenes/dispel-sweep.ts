// Dispel Undead and Dispel Daedra: when the sweep starts.
//
// DFU's effects (DispelUndead.Start, DispelDaedra.Start) sweep the undead or daedra near the player each time the
// bundle lands on an entity, whatever the spell's target type. So a self-cast sweeps on the caster, and a touch or
// area spell (Banish Daedra, Holy Word) sweeps once for each foe it meets. A landing that was absorbed, reflected or
// resisted never reaches the effect, so applySpell returns no sweep for it.
//
// The host owns the nearby scan and the foe pool, so the sweep itself goes out through the host's onDispel.

/** What applySpell hands back for a creature dispel: the nearby-object group and the chance rolled per object. */
export interface DispelSweep {
  group: number;
  chance: number;
}

export interface DispelLanding {
  dispel?: DispelSweep | null;
}

export interface DispelCaster {
  /** The local player cast the spell. */
  mine?: boolean;
  /** Set when another player's cast landed on a foe this client runs. */
  peerCaster?: string | null;
}

/**
 * Start the sweep for one landing. A peer's landing sweeps in its caster's own world: the scan here is centred on
 * the local player, so it would sweep the wrong place.
 */
export function startDispelSweep(
  landing: DispelLanding | null | undefined,
  onDispel: ((sweep: DispelSweep) => void) | null | undefined,
  { mine = true, peerCaster = null }: DispelCaster = {},
): void {
  if (!landing?.dispel || !onDispel) return;
  if (!mine || peerCaster) return;
  onDispel(landing.dispel);
}
