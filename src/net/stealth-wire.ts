// The wire's law for the stealth fields (characters/enemy/peer-senses.ts). A leaf: the relay bundles it with
// net/wire.js, so it imports nothing.
//
// - A pose carries `sk`, the player's live Stealth (1 to 100), and `hv`, 1 while the player moves under half speed. Each
//   is omitted at 0, so a pose without them keeps the bytes it had.
// - A foe record carries `sc`, the classic minute (mod 2^16) of the foe's last stealth check at the peer its `g` names.

/** The highest live Stealth the pose carries. A skill stops at 100 (DaggerfallSkills.MaxSkillValue). */
export const STEALTH_WIRE_MAX = 100;
/** `sc` is a classic minute modulo this. */
export const STEALTH_MINUTE_MOD = 0x10000;

/** The pose's stealth fields as the room relays them: whole, bounded, and omitted at 0. */
export function stealthPoseFields(sk: unknown, hv: unknown): { sk?: number; hv?: 1 } {
  const live = typeof sk === 'number' && Number.isFinite(sk) && sk > 0 ? Math.min(STEALTH_WIRE_MAX, Math.floor(sk)) : 0;
  return { ...(live > 0 ? { sk: live } : {}), ...(hv === 1 ? { hv: 1 as const } : {}) };
}

/**
 * A foe record's `sc` as the reader takes it. A value outside the law is dropped, not the record: the field only times a
 * Stealth tally, and the rest of the record stands without it.
 */
export function stealthMinuteField(sc: unknown): { sc?: number } {
  return Number.isInteger(sc) && (sc as number) >= 0 && (sc as number) < STEALTH_MINUTE_MOD ? { sc: sc as number } : {};
}
