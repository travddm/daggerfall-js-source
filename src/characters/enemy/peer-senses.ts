// A foe online runs on one client, its owner's, and its senses read every player in the room. DFU has one player, so
// its StealthCheck (EnemySenses.cs:618-657) and its first-meeting language roll (EnemySenses.cs:504-527) read that
// player's own skills. This module carries the same reads to a player on another client:
//
// - The player's client puts its live Stealth (`sk`) and its half-speed state (`hv`) on its pose.
// - The owner's foe reads them through the peer's target candidate (`stealthOf`, `halfSpeed`), and its record names the
//   classic minute of its last stealth check at that peer (`sc`).
// - The peer's client tallies its own Stealth on that minute, once a minute across all foes, as DFU tallies the player.
// - The first record that names the peer as the foe's target is the peer's first meeting. The peer rolls its own
//   language check with its own skills, and a success goes to the owner as a `calm` word, which stands the foe down.

import { SKILLS, skillValue, tallySkill } from '../../systems/skills.js';
import { stealthPoseFields, STEALTH_MINUTE_MOD } from '../../net/stealth-wire.ts';

type Entity = Parameters<typeof skillValue>[0] & { stealthCheckBox?: { minute: number } };

export type StealthPose = { sk?: number; hv?: 1 };

/** The pose fields a player's own client sends. Each is omitted at 0, the wire's omission law. */
export function stealthPoseOf(entity: Entity, movingLessThanHalfSpeed: boolean): StealthPose {
  return stealthPoseFields(skillValue(entity, SKILLS.Stealth), movingLessThanHalfSpeed ? 1 : 0);
}

/** A peer's stealth fields off its drawn pose, for the list of peers the foes read (scenes/world.js peersNear). */
export function stealthOfShown(shown: { sk?: unknown; hv?: unknown } | null | undefined): StealthPose {
  return stealthPoseFields(shown?.sk, shown?.hv);
}

/**
 * Copies a peer's latest pose fields onto its target candidate. The candidate answers the foe's motor through
 * `stealthOf: () => c.sk` and `halfSpeed: () => c.hv === 1`.
 */
export function readPeerStealth(c: { sk: number; hv: number }, pose: { sk?: unknown; hv?: unknown } | null): void {
  const fields = stealthPoseFields(pose?.sk, pose?.hv);
  c.sk = fields.sk ?? 0;
  c.hv = fields.hv ?? 0;
}

type Motor = { target?: { isPeer?: boolean } | null; peerStealthMinute?: number };

/** The fields a foe's record gains from this module: `sc` while the foe hunts a peer it has checked. */
export function stealthCheckRecord(ai: Motor | null): { sc?: number } {
  const sc = stealthCheckWire(ai);
  return sc === undefined ? {} : { sc };
}

/** The owner's `sc` for a foe's record: the minute of its last stealth check at the peer it hunts, else undefined. */
export function stealthCheckWire(ai: Motor | null): number | undefined {
  if (!ai || ai.target?.isPeer !== true) return undefined;
  const m = ai.peerStealthMinute;
  return Number.isInteger(m) && m >= 0 ? m % STEALTH_MINUTE_MOD : undefined;
}

/**
 * Tallies the player's Stealth once a classic minute, the minute DFU keeps as PlayerEntity.TimeOfLastStealthCheck. The
 * box is the one the local foes' senses use (scenes/shared.js sensesContext), so a local foe and a foe on another client
 * checking in the same minute tally once between them.
 */
export function tallyPeerStealth(
  entity: Entity,
  minute: number,
  tally: () => void = () => tallySkill(entity, SKILLS.Stealth),
): boolean {
  const box = (entity.stealthCheckBox ??= { minute: -1 });
  if (box.minute === minute) return false;
  box.minute = minute;
  tally();
  return true;
}

/** What one puppet remembers of its owner's records, for this module. */
export type PeerSensesState = { sc?: number; met?: boolean };

export type OwnerRecordDeps = {
  /** This client's player. */
  playerEntity: Entity;
  /** This client's classic minute (the shared clock online). */
  minute: number;
  /**
   * The host's language roll (scenes/hostCombat.js tryLanguagePacification) on the puppet's own copy of the foe, with
   * this client's player, its sheathed hand and its HUD line. It reads the first-meeting edge off the motor it is
   * handed.
   */
  rollLanguage: (edge: { justEncountered: boolean; isHostile: boolean }) => { pacified: boolean } | null;
  /** Sends the owner the word that its foe is pacified. */
  sendCalm: () => void;
};

/**
 * Reads one owner record for this client's player. `mine` is true when the record's target names this client. Returns
 * true when this client's roll pacified the foe.
 */
export function readOwnerRecord(
  state: PeerSensesState,
  record: { sc?: number },
  mine: boolean,
  deps: OwnerRecordDeps,
): boolean {
  if (!mine) return false;
  if (record.sc !== undefined && record.sc !== state.sc) {
    state.sc = record.sc;
    tallyPeerStealth(deps.playerEntity, deps.minute);
  }
  if (state.met) return false;
  state.met = true;
  // The roll reads the edge off the motor it is handed; the puppet's own motor runs no senses, so it gets one of its own.
  const edge = { justEncountered: true, isHostile: true };
  const out = deps.rollLanguage(edge);
  if (!out?.pacified) return false;
  deps.sendCalm();
  return true;
}

/** The owner's side of a `calm` word: the foe stands down as a pacified foe does (EnemySenses.cs:510). */
export function applyCalm(ai: { isHostile: boolean } | null | undefined, dead: boolean): boolean {
  if (!ai || dead || !ai.isHostile) return false;
  ai.isHostile = false;
  return true;
}

/** A puppet of another client's foe, as this module reads it. */
type Puppet = { dead?: boolean; _peerSenses?: PeerSensesState };

export type PeerSensesLinkDeps<F extends Puppet> = {
  playerEntity: Entity;
  /** Whether a streamed target ('.' the owner, a peer id, '' none) names this client's player. */
  isMe: (f: F, at: unknown) => boolean;
  /** This client's classic minute. */
  minute: () => number;
  /** The host's language roll on this puppet (OwnerRecordDeps.rollLanguage). */
  rollLanguage: (f: F, edge: { justEncountered: boolean; isHostile: boolean }) => { pacified: boolean } | null;
  /** Sends the puppet's owner a word about its foe, down the route its blows take. */
  send: (f: F, word: { calm: 1 }) => void;
};

/** One host's reader of its puppets' owner records: the hosts call `read` for each live record they apply. */
export function createPeerSensesLink<F extends Puppet>(
  deps: PeerSensesLinkDeps<F>,
): {
  read: (f: F, record: { d?: number; sc?: number }, at: unknown) => boolean;
} {
  return {
    read(f, record, at) {
      if (record.d === 1 || f.dead || !deps.isMe(f, at)) return false;
      f._peerSenses ??= {};
      return readOwnerRecord(f._peerSenses, record, true, {
        playerEntity: deps.playerEntity,
        minute: deps.minute(),
        rollLanguage: (edge) => deps.rollLanguage(f, edge),
        sendCalm: () => deps.send(f, { calm: 1 }),
      });
    },
  };
}
