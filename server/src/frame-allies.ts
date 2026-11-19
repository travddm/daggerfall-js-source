// The allies a foes frame names, as the relay's record strip reads them. The lists are the sender's own word, so a name
// on one never vouches for a record by itself: it only spares the record a check that a real ally could fail.

import { FOE_BOUND } from '../../src/net/foeBounds.js';

/** The record numbers a frame names as the sender's allies. */
export type FrameAllies = {
  /** Allied watchmen (`al`). */
  watch: Set<unknown>;
  /** Crew on a deck (`cw`). */
  crew: Set<unknown>;
  /** Companions and summons (`cp`). */
  companions: Set<unknown>;
};

type AllyRecord = { i?: unknown; t?: unknown };
type AllyFrame = { al?: unknown; cw?: unknown; cp?: unknown };

const idsOf = (list: unknown): Set<unknown> => new Set(Array.isArray(list) ? list : []);

/** Whether a mobile type is a class foe (a person), not a monster. */
const isClassType = (type: unknown): boolean => Number.isInteger(type) && Number(type) >= 128 && Number(type) <= 146;

/** The ally lists of a foes frame. */
export function frameAllies(frame: AllyFrame): FrameAllies {
  return { watch: idsOf(frame.al), crew: idsOf(frame.cw), companions: idsOf(frame.cp) };
}

/** Whether the frame names the record as an ally in a way its readers honour. A reader stands an `al` record as an ally
 *  only when it is a watchman, so the relay reads `al` the same way. */
export function namedAlly(record: AllyRecord, allies: FrameAllies): boolean {
  if (allies.crew.has(record.i) || allies.companions.has(record.i)) return true;
  return allies.watch.has(record.i) && record.t === FOE_BOUND.watch;
}

/**
 * Whether the record skips the health bound. Only a class-type ally does: a companion carries its health from place to
 * place, and that health may come from a roll at a higher level than the one its record now states (a mentored party
 * stands its foes at a lower level). A monster's bound does not depend on its level, so a monster ally, a summon above
 * all, is held to it like any foe.
 */
export function skipsHealthBound(record: AllyRecord, allies: FrameAllies): boolean {
  return isClassType(record.t) && namedAlly(record, allies);
}

/**
 * Whether the record may ride with no spawn grant from a sender that stands on grants. A companion or a summon (`cp`)
 * may not: every one stands through the pool's spawn, which asks an ally grant for it, so one with no grant was never
 * stood by that spawn. Crew on a deck and allied watchmen keep the pass.
 */
export function ridesWithoutGrant(record: AllyRecord, allies: FrameAllies): boolean {
  if (allies.companions.has(record.i)) return false;
  return namedAlly(record, allies);
}
