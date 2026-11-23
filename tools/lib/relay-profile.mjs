// The load harness's bots install the relay's server profile before they connect, as a page does at its front door
// (src/systems/online/profileDoor.ts openProfileDoor). A hello carries the installed profile's hash, and the relay
// refuses a hello whose hash is not its own, so a bot without the profile is refused at every room.
import { profileHashOf } from '../../src/net/profile/profileHash.ts';
import { installProfile, profileErrors } from '../../src/systems/online/serverProfile.ts';

/**
 * Fetches the profile of the relay on 127.0.0.1:`relayPort`, checks it as the front door does, and installs it for
 * this thread's sessions. Throws when the relay answers no profile this build can play.
 * @returns {Promise<string>} the installed profile's hash
 */
export async function installRelayProfile(relayPort, fetchImpl = globalThis.fetch) {
  const res = await fetchImpl(`http://127.0.0.1:${relayPort}/profile`);
  if (!res.ok) throw new Error(`the relay answered ${res.status} for its profile`);
  const body = await res.json();
  const errors = profileErrors(body?.profile);
  if (errors.length) throw new Error(`the relay's profile cannot be played by this build: ${errors.join('; ')}`);
  const ph = await profileHashOf(body.profile);
  if (ph !== body.ph) throw new Error(`the relay names its profile ${body.ph}, but it hashes to ${ph}`);
  installProfile(body.profile, ph);
  return ph;
}
