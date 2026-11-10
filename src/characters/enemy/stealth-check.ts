// The player half of DFU's StealthCheck (EnemySenses.cs:633-650): the part that runs only when the foe's target is the
// player. The foe's motor (enemyMotor.js _stealthCheck) runs the rest: the distance gate, the once-a-minute guard and
// the roll against the target's live Stealth.

/** What the player half reads of the foe's motor. */
export type StealthMotor = { detected: boolean; hasEncounteredPlayer: boolean };

/** What the player half reads of the scene's senses context (scenes/shared.js sensesContext). */
export type StealthSenses = {
  movingLessThanHalfSpeed?: boolean;
  /** PlayerEntity.TimeOfLastStealthCheck: one box shared by every foe in the scene. */
  sharedStealth?: { minute: number } | null;
  tallyStealth?: () => void;
};

/**
 * The player half: a player moving under half speed is not checked on odd minutes, and an encountered player moving
 * faster is detected outright; otherwise the player's Stealth tallies once a minute across all foes. Returns the
 * check's answer when the half decides it, and undefined when the roll must run.
 */
export function playerHalfOfStealthCheck(
  ai: StealthMotor,
  senses: StealthSenses,
  gameMinutes: number,
): boolean | undefined {
  if (senses.movingLessThanHalfSpeed) {
    if ((gameMinutes & 1) === 1) return ai.detected;
  } else if (ai.hasEncounteredPlayer) {
    return true;
  }
  if (senses.sharedStealth && senses.sharedStealth.minute !== gameMinutes) {
    senses.tallyStealth?.();
    senses.sharedStealth.minute = gameMinutes;
  }
  return undefined;
}

/** The motor's per-peer state, beside DFU's per-player fields. */
export type PeerStealthMotor = {
  detected: boolean;
  /** The players on other clients this foe has met: DFU's hasEncounteredPlayer, one for each player. Made on first use. */
  peersMet?: Set<string>;
  /** The classic minute of the foe's last stealth check at a peer. The foe record carries it (peer-senses.ts). */
  peerStealthMinute?: number;
};

/** A player on another client as the foe's motor holds it (peer-candidates.ts). */
export type PeerTarget = { id: string; isPeer?: boolean; halfSpeed?: () => boolean };

/**
 * Records the first meeting with a peer, one for each peer, as DFU records the player's. Returns false for a target that
 * is not a peer. The peer rolls its own language check on its own client (peer-senses.ts).
 */
export function meetPeer(ai: PeerStealthMotor, target: PeerTarget): boolean {
  if (target.isPeer !== true) return false;
  (ai.peersMet ??= new Set()).add(target.id);
  return true;
}

/**
 * The player half for a player on another client, read off its pose: its half-speed skip and its encountered
 * fast-mover arm. Its Stealth tallies on its own client: this keeps the minute of the check for the foe record.
 */
export function peerHalfOfStealthCheck(
  ai: PeerStealthMotor,
  target: PeerTarget,
  gameMinutes: number,
): boolean | undefined {
  if (target.halfSpeed?.() === true) {
    if ((gameMinutes & 1) === 1) return ai.detected;
  } else if (ai.peersMet?.has(target.id)) {
    return true;
  }
  ai.peerStealthMinute = gameMinutes;
  return undefined;
}

/** The classic spawn band (enemyMotor.js wouldBeSpawnedInClassic), passed in because the motor imports this module. */
export type SpawnBand = (
  distance: number,
  yDiff: number,
  already: boolean,
  distanceType: number,
  playerInside: boolean,
) => boolean;

/** What the band gate reads of the foe's motor. */
export type StealthBandMotor = {
  wouldBeSpawned: boolean;
  _armedTargeting?: boolean;
  _targetCandidate?: { id?: unknown; isPeer?: boolean; feet?: ArrayLike<number>; height?: number } | null;
  _dist: number;
  feet: ArrayLike<number>;
  centreOffset: number;
  spawnDistanceType: number;
  playerInside: boolean;
  /** Each peer's own band latch, by peer id. Made on first use; the motor's holdFrame drops it. */
  peerSpawned?: Map<string, boolean> | null;
};

/**
 * StealthCheck's band gate (EnemySenses.cs: `if (!wouldBeSpawnedInClassic) return false`). DFU has one player, so the
 * band is always measured to the player the check is about. The motor's own `wouldBeSpawned` is measured to this
 * client's player, and other readers need it so. For a peer target the band is measured to that peer instead, with its
 * own latch, because the band has one edge for entering it and a wider one for leaving it.
 */
export function stealthBandHolds(ai: StealthBandMotor, band: SpawnBand): boolean {
  const c = ai._targetCandidate;
  if (!ai._armedTargeting || c?.isPeer !== true || typeof c.id !== 'string' || !c.feet) return ai.wouldBeSpawned;
  const yDiff = ai.feet[1] + ai.centreOffset - (c.feet[1] + (c.height ?? 0) / 2);
  const latch = (ai.peerSpawned ??= new Map());
  const now = band(ai._dist, yDiff, latch.get(c.id) === true, ai.spawnDistanceType, ai.playerInside);
  latch.set(c.id, now);
  return now;
}
