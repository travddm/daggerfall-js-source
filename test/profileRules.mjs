// Tests that play by a server profile other than the official one: the official profile with some rule keys written
// (net/profile/profileKeys.ts), installed for one test and removed after it.
import { OFFICIAL_PROFILE } from '../src/net/profile/officialProfile.ts';
import { installProfile, _resetProfileForTests } from '../src/systems/online/serverProfile.ts';

/**
 * Installs the official profile with `rules` written into it, for the test `t`, and removes it when the test ends.
 * @param {{ after: (fn: () => void) => void }} t the test's context
 * @param {Record<string, boolean | number | string>} rules
 */
export function playByRules(t, rules) {
  installProfile({ ...OFFICIAL_PROFILE, rules }, 'test-profile');
  t.after(() => _resetProfileForTests());
}

/**
 * Installs the official profile with `rules` written into it for the rest of the test file. Each file runs in its own
 * process, so nothing needs removing. For a file whose pins stand on one sky: constants computed at the top of the file
 * (a sky day's number) read the profile, and a per-test install comes too late for them.
 * @param {Record<string, boolean | number | string>} rules
 */
export function playFileByRules(rules) {
  installProfile({ ...OFFICIAL_PROFILE, rules }, 'test-profile');
}
