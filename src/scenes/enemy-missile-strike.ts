// What a foe's spell missile strikes above ground and in buildings.
//
// DFU's missile (DaggerfallMissile.DoCollision) lands on the body it meets. A foe aims its missile at its own target
// (DaggerfallMissile aims at the caster's EnemySenses target), so an ally's bolt at a monster, or a monster's bolt at
// an ally, must land on that monster or ally and not fly on through it into the player. The dungeon host resolves its
// enemy missiles the same way (dungeonContext.js updateMissiles, the aimed-foe arm): the missile remembers the foe it
// was loosed at, lands on that foe, and is tested against the player only when it was loosed at the player or its
// aimed foe has died.

import { missileHitsCapsule, missileHitsFoe, PLAYER_BODY_RADIUS } from '../systems/spellcast.js';
import { isPlayerTarget } from '../characters/enemy/enemyTargets.js';

/** The part of a foe record these tests read. */
export interface MissileFoe {
  dead?: boolean;
  /** Another player's foe, stood here as a puppet: its owner's world resolves what strikes it. */
  puppet?: unknown;
  /** A townsperson a monster hunts (livingWorld/quarry.js): a body with no spell entity and its own blow door. */
  civilian?: boolean;
  /** A fallen star's ward (starfall/starfallHost.js), the same shape as a townsperson. */
  starWard?: boolean;
  ai?: { feet?: number[]; height?: number; radius?: number; target?: unknown };
}

export interface EnemyMissile {
  pos: number[];
  aimFoe?: MissileFoe | null;
}

/** The player's body, or null when the player is not standing in this host. */
export interface PlayerBody {
  feet: number[] | null;
  height: number;
  /** A shipmate's missile flies past the player. */
  passesPlayer: boolean;
}

export const STRUCK_PLAYER = 'player';

/**
 * The foe a caster loosed its missile at, or null when its target is the player (a peer included) or nobody. A
 * puppet, a townsperson or a star's ward cannot take a spell's landing here, and DFU has no such targets, so a
 * missile at one keeps to the player-only test it had before.
 */
export function aimedFoeOf(casterFoe: MissileFoe | null | undefined): MissileFoe | null {
  const target = casterFoe?.ai?.target as MissileFoe | null | undefined;
  if (!target || isPlayerTarget(target)) return null;
  if (target.puppet || target.civilian || target.starWard) return null;
  return target;
}

/** The aimed foe it struck, STRUCK_PLAYER, or null while it flies on. */
export function enemyMissileStrike(
  missile: EnemyMissile,
  player: PlayerBody,
): MissileFoe | typeof STRUCK_PLAYER | null {
  const aimed = missile.aimFoe;
  if (aimed && !aimed.dead) return missileHitsFoe(missile.pos, aimed) ? aimed : null;
  if (!player.feet || player.passesPlayer) return null;
  return missileHitsCapsule(missile.pos, player.feet, player.height, PLAYER_BODY_RADIUS) ? STRUCK_PLAYER : null;
}
