// The room's memory that follows a welcome. A relay leaves a memory larger than one piece out of a joiner's welcome
// (`"world":null,"wf":1`) and sends it after, in pieces, as `{t:'world', wf:1, id, data}` (server/src/bulk-outbox.ts).
// The joiner takes that frame whoever hosts by the time it lands, as it took the welcome's own memory. Until it lands,
// the joiner publishes no memory of its own: as a new host it would write a room without the stored doors and
// containers over the stored one.

/** How long a joiner waits for the memory its welcome promised before it publishes its own anyway. */
export const WORLD_FOLLOW_WAIT_MS = 15_000;

/** What these functions read and write on the session (net/online.js OnlineSession). */
export type WorldFollowSession = {
  host: string | null;
  id: string | null;
  /** The session clock's time until which a promised memory is awaited; 0 when none is. */
  worldFollowsUntil?: number;
  onWorld?: ((world: object) => void) | null;
  _now(): number;
  _deliver(kind: string, run: () => void): void;
};

type WorldFrame = { world?: unknown; wf?: unknown; id?: unknown; data?: unknown };

const isMemory = (value: unknown): value is object => !!value && typeof value === 'object' && !Array.isArray(value);

/** A primary room's welcome: delivers the memory it carries, or notes that one follows. */
export function welcomeWorld(session: WorldFollowSession, welcome: WorldFrame): void {
  session.worldFollowsUntil = welcome.wf === 1 ? session._now() + WORLD_FOLLOW_WAIT_MS : 0;
  const world = welcome.world;
  if (isMemory(world)) session._deliver('world', () => session.onWorld?.(world));
}

/**
 * Whether a primary room's world frame is taken: the host's memory, never my own back, or the memory my welcome
 * promised. Taking the promised one ends the wait.
 */
export function worldFrameTaken(session: WorldFollowSession, frame: WorldFrame): boolean {
  if (!isMemory(frame.data) || typeof frame.id !== 'string') return false;
  if (frame.wf === 1) {
    if (!worldFollowOwed(session)) return false;
    session.worldFollowsUntil = 0;
    return true;
  }
  return frame.id === session.host && frame.id !== session.id;
}

/** Whether the memory my welcome promised has not landed yet, inside the wait. */
export function worldFollowOwed(session: WorldFollowSession): boolean {
  return (session.worldFollowsUntil ?? 0) > session._now();
}
