// The other players in this client's room as target candidates for the foes this client runs. The dungeon host and the
// exterior foe pool each held the same copy of this; it is one module now.
//
// The list is read once a frame off the world host. Each peer keeps one identity across frames, so the target
// machine's reference compares hold. A peer that is gone is dead to the machine (health 0, targetHealth's read) and
// is dropped.

import { readPeerStealth } from './peer-senses.ts';

/**
 * A peer as the room reports it: its id, its feet in scene space, its capsule height, its concealment bits, and its live
 * Stealth and half-speed state.
 */
export type PeerReport = {
  id?: unknown;
  feet?: unknown;
  height?: unknown;
  cv?: unknown;
  sk?: unknown;
  hv?: unknown;
  yaw?: unknown;
  wd?: unknown;
};

/** Where a peer's stance goes for the foes' retreat roll (enemyMotor.js writePlayerYaw, writePlayerBowOrSheathed,
 *  forgetPlayerStance). Handed in by the host, so this module does not import the enemy motor. */
export type PeerStance = {
  /** The peer's facing and whether its weapon is sheathed (its pose's `wd` 0), each frame it is seen. */
  write: (id: string, yaw: unknown, sheathed: boolean) => void;
  /** The peer left the room. */
  forget: (id: string) => void;
};

export type PeerCandidate = {
  isPlayer: true;
  isPeer: true;
  id: string;
  feet: number[];
  height: number;
  health: number;
  cv: number;
  concealment: () => unknown;
  sk: number;
  hv: number;
  /** The live Stealth a foe's stealth roll reads (enemyMotor.js _stealthCheck). */
  stealthOf: () => number;
  /** Whether the peer moves under half speed (stealth-check.ts peerHalfOfStealthCheck). */
  halfSpeed: () => boolean;
};

export type PeerCandidatesDeps = {
  /** The room's peers this frame, or null when the client is in no room. */
  read: () => readonly PeerReport[] | null;
  /** The concealment flags of a pose's `cv` bits (systems/effects.js concealFlagsOfBits). */
  concealFlags: (bits: number) => unknown;
  /** The capsule height a peer without one stands at (player/motor.js CAPSULE_HEIGHT). */
  capsuleHeight: number;
  /** Where each peer's stance is written, or nothing. */
  stance?: PeerStance;
};

export type PeerCandidates = {
  /** Every peer this frame. */
  all: () => PeerCandidate[];
  /** The peer with `id` this frame, or null. */
  byId: (id: unknown) => PeerCandidate | null;
  /** Starts a new frame, so the next read takes the room's list again. Returns the new frame number. */
  nextFrame: () => number;
};

export function createPeerCandidates({ read, concealFlags, capsuleHeight, stance }: PeerCandidatesDeps): PeerCandidates {
  const cands = new Map<string, PeerCandidate>();
  let frame = 0;
  let readAt = -1;

  function all(): PeerCandidate[] {
    if (readAt === frame) return [...cands.values()];
    readAt = frame;
    const list = read() ?? null;
    if (!list) {
      for (const c of cands.values()) c.health = 0;
      cands.clear();
      return [];
    }
    const seen = new Set<string>();
    for (const q of list) {
      if (!q || typeof q.id !== 'string' || !Array.isArray(q.feet) || q.feet.length !== 3) continue;
      if (!q.feet.every(Number.isFinite)) continue;
      seen.add(q.id);
      let c = cands.get(q.id);
      if (!c) {
        const made: PeerCandidate = {
          isPlayer: true,
          isPeer: true,
          id: q.id,
          feet: [0, 0, 0],
          height: capsuleHeight,
          health: 1,
          cv: 0,
          // Its concealment, off its pose: EnemySenses.BlockedByIllusionEffect reads a peer as it reads any target.
          concealment: () => concealFlags(made.cv),
          sk: 0,
          hv: 0,
          stealthOf: () => made.sk,
          halfSpeed: () => made.hv === 1,
        };
        c = made;
        cands.set(q.id, c);
      }
      c.feet[0] = q.feet[0];
      c.feet[1] = q.feet[1];
      c.feet[2] = q.feet[2];
      c.height = typeof q.height === 'number' && Number.isFinite(q.height) && q.height > 0 ? q.height : capsuleHeight;
      c.health = 1;
      c.cv = Number(q.cv) | 0;
      stance?.write(q.id, q.yaw, q.wd === 0);
      readPeerStealth(c, q);
    }
    for (const [id, c] of cands) {
      if (seen.has(id)) continue;
      c.health = 0;
      cands.delete(id);
      stance?.forget(id);
    }
    return [...cands.values()];
  }

  return {
    all,
    byId: (id) => {
      all();
      return (typeof id === 'string' && cands.get(id)) || null;
    },
    nextFrame: () => ++frame,
  };
}
