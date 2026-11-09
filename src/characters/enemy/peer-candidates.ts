// The other players in this client's room as target candidates for the foes this client runs. The dungeon host and the
// exterior foe pool each held the same copy of this; it is one module now.
//
// The list is read once a frame off the world host. Each peer keeps one identity across frames, so the target
// machine's reference compares hold. A peer that is gone is dead to the machine (health 0, targetHealth's read) and
// is dropped.

/** A peer as the room reports it: its id, its feet in scene space, its capsule height and its concealment bits. */
export type PeerReport = { id?: unknown; feet?: unknown; height?: unknown; cv?: unknown };

export type PeerCandidate = {
  isPlayer: true;
  isPeer: true;
  id: string;
  feet: number[];
  height: number;
  health: number;
  cv: number;
  concealment: () => unknown;
};

export type PeerCandidatesDeps = {
  /** The room's peers this frame, or null when the client is in no room. */
  read: () => readonly PeerReport[] | null;
  /** The concealment flags of a pose's `cv` bits (systems/effects.js concealFlagsOfBits). */
  concealFlags: (bits: number) => unknown;
  /** The capsule height a peer without one stands at (player/motor.js CAPSULE_HEIGHT). */
  capsuleHeight: number;
};

export type PeerCandidates = {
  /** Every peer this frame. */
  all: () => PeerCandidate[];
  /** The peer with `id` this frame, or null. */
  byId: (id: unknown) => PeerCandidate | null;
  /** Starts a new frame, so the next read takes the room's list again. Returns the new frame number. */
  nextFrame: () => number;
};

export function createPeerCandidates({ read, concealFlags, capsuleHeight }: PeerCandidatesDeps): PeerCandidates {
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
    }
    for (const [id, c] of cands) {
      if (seen.has(id)) continue;
      c.health = 0;
      cands.delete(id);
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
