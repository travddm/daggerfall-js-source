// What a foe's retreat roll (DFU EnemyMotor.EvaluateMoveInForAttack, characters/enemy/enhanced-movement.ts) needs to
// know about a player it targets: which way the player faces, and whether a bow is out or the weapon is sheathed.
// Plain data keyed by player: LOCAL_PLAYER for the player at this keyboard, a peer's id for a player on another
// client. The writers stay where the facts live: the camera look (player/lookFilter.js) and the screen weapon
// (combat/playerWeapon.js) for the local player, and a peer's pose where the foe pools read it (the peer candidates in
// scenes/dungeonContext.js and scenes/exteriorFoes.js).

/** The key of the player at this keyboard. */
export const LOCAL_PLAYER = 'local';

export type PlayerStance = {
  /** The facing, in the camera's convention (forward = [sin yaw, 0, cos yaw]); null when nothing has said. */
  yaw: number | null;
  /** DFU's "player with bow or weapon not out": the screen weapon is a bow, or it is sheathed. */
  bowOrSheathed: boolean;
};

/** A player nobody has written: DFU cannot tell, so the foe treats the player as facing it with a weapon out, and its
 *  retreat roll runs as it does against any target. */
export const UNKNOWN_STANCE: Readonly<PlayerStance> = Object.freeze({ yaw: null, bowOrSheathed: false });

const stances = new Map<string, PlayerStance>();

function entryOf(id: string): PlayerStance {
  let stance = stances.get(id);
  if (!stance) {
    stance = { ...UNKNOWN_STANCE };
    stances.set(id, stance);
  }
  return stance;
}

export function writePlayerYaw(id: string, yaw: number | null): void {
  entryOf(id).yaw = Number.isFinite(yaw) ? yaw : null;
}

export function writePlayerBowOrSheathed(id: string, bowOrSheathed: boolean): void {
  entryOf(id).bowOrSheathed = bowOrSheathed === true;
}

/** A peer that left the room. */
export function forgetPlayerStance(id: string): void {
  stances.delete(id);
}

export function playerStanceOf(id: string): Readonly<PlayerStance> {
  return stances.get(id) ?? UNKNOWN_STANCE;
}
