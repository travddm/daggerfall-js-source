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
