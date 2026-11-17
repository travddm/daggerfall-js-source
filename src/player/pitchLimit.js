// @ts-check
// How far the player's look may pitch up or down, and the guard that keeps it there.
//
// Every host turns the camera's yaw and pitch into a look direction,
// [sin(yaw) cos(pitch), sin(pitch), cos(yaw) cos(pitch)], and draws it with lookAt against world up. Past +/-90 degrees
// cos(pitch) turns negative: the heading swings round by 180 degrees and the view turns upside down. At the pole
// itself the heading is lost.
//
// Daggerfall Unity stops the look short of the pole: PlayerMouseLook's Pitch setter clamps to piover2 * .99
// (PlayerMouseLook.cs:68-74, 89.1 degrees). The head bob's nod and the hit recoil are Transform.Rotate calls on top of
// that look (HeadBobber.cs, CameraRecoiler.cs), which compose as quaternions and cannot flip it. The port adds both to
// the same Euler pitch instead, so they pass through clampPitch: each keeps the look inside PITCH_LIMIT and records only
// the share it really moved, which it gives back on the next frame.

/** PlayerMouseLook.cs:71-74: 0.99 of a right angle either way. */
export const PITCH_LIMIT = (Math.PI / 2) * 0.99;

/** The pitch held inside +/-PITCH_LIMIT. */
export function clampPitch(pitch) {
  return Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, pitch));
}
