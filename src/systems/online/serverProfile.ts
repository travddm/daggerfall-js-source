// The profile this page plays by, installed once before an online world boots (profileDoor.ts) and frozen for the page's
// life. `rule(name)` replaces an `isOnlinePage() ? A : B` branch; the lane's tables read `activePins()`. Online with
// nothing installed (a test) plays the official profile; single player plays each key's offline value.

import { OFFICIAL_PROFILE } from '../../net/profile/officialProfile.ts';
import { profileKeyOf, profileRuleErrors, resolveRules, type ProfileValue } from '../../net/profile/profileKeys.ts';
import { pageHas } from '../pageQuery.js';
import { t } from '../textManager.js';
import { setOnlineTimeScale, setSkyClock } from '../../net/world-time-scale.ts';

export type ProfilePins = {
  readonly prefs: Readonly<Record<string, boolean | string>>;
  readonly modKeys: Readonly<Record<string, Readonly<Record<string, ProfileValue>>>>;
  readonly wholeMods: Readonly<Record<string, readonly string[]>>;
};

type Installed = {
  readonly ph: string;
  readonly pins: ProfilePins;
  readonly rules: Readonly<Record<string, ProfileValue>>;
};

let installed: Installed | null = null;
const listeners: (() => void)[] = [];
const OFFICIAL_RULES = Object.freeze(resolveRules(OFFICIAL_PROFILE.rules));

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** What is wrong with a profile's pins: each table an object of the shape the lane reads. */
function pinErrors(pins: unknown): string[] {
  if (!isRecord(pins)) return ['pins is not an object'];
  const errors: string[] = [];
  if (!isRecord(pins.prefs) || !Object.values(pins.prefs).every((v) => typeof v === 'boolean' || typeof v === 'string'))
    errors.push('bad pins.prefs');
  if (!isRecord(pins.modKeys) || !Object.values(pins.modKeys).every(isRecord)) errors.push('bad pins.modKeys');
  const wholeOk = (v: unknown) => Array.isArray(v) && v.every((k) => typeof k === 'string');
  if (!isRecord(pins.wholeMods) || !Object.values(pins.wholeMods).every(wholeOk)) errors.push('bad pins.wholeMods');
  return errors;
}

/** Everything this build cannot play in a profile: its rules against the registry, then its pins. Empty when it can. */
export function profileErrors(profile: unknown): string[] {
  const errors = profileRuleErrors(profile);
  return errors.length ? errors : pinErrors((profile as { pins?: unknown }).pins);
}

const deepFreeze = <T>(v: T): T => {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    for (const x of Object.values(v)) deepFreeze(x);
    Object.freeze(v);
  }
  return v;
};

/**
 * Installs the server's profile for this page: validated (throws on a profile this build cannot play), frozen, and
 * announced to the lane. `ph` is the hash the relay named for it; this page's hellos carry it.
 */
export function installProfile(profile: unknown, ph: string): void {
  const errors = profileErrors(profile);
  if (errors.length) throw new Error(`profile refused: ${errors.join('; ')}`);
  const p = deepFreeze(structuredClone(profile)) as { pins: ProfilePins; rules?: Record<string, ProfileValue> };
  installed = Object.freeze({ ph, pins: p.pins, rules: Object.freeze(resolveRules(p.rules ?? {})) });
  for (const fn of listeners) fn();
}

/** The installed profile's hash, or null when nothing is installed. */
export const installedProfileHash = (): string | null => installed?.ph ?? null;

/** Does the hash a relay named (`ph` in its welcome) match this page's? A page with none installed matches none. */
export const profileMatches = (ph: unknown): boolean => (typeof ph === 'string' ? ph : null) === installedProfileHash();

/** The pins this page plays by: the installed profile's, else the official profile's. */
export const activePins = (): ProfilePins => installed?.pins ?? OFFICIAL_PROFILE.pins;

/** The words a page says when a room's welcome named another profile than the one it installed: the server was
 *  redeployed on other rules while the page was open (net/online.js refuseVersion). */
export const profileChangedText = (): string =>
  t('net.profile.changed', "The server's rules changed. Reload the page.");

/** Calls `fn` after every install, so the lane's tables follow the profile. */
export function onProfileInstalled(fn: () => void): void {
  listeners.push(fn);
}

/**
 * A rule's value on this page. Online: the installed profile's value, or the official profile's while nothing is
 * installed. Offline: the key's constant offline value, or undefined where the key's offline value is the player's own
 * setting (that setting's own read path answers it). Throws on a name the registry does not hold.
 */
export function rule(name: string, search?: string): ProfileValue | undefined {
  const key = profileKeyOf(name);
  if (!key) throw new Error(`no profile key ${name}`);
  if (installed) return installed.rules[name];
  if (pageHas('online', search ?? globalThis.location?.search ?? '')) return OFFICIAL_RULES[name];
  return typeof key.offline === 'object' ? undefined : key.offline;
}

/**
 * A rule's online value whatever this page's own query: the installed profile's, else the official profile's. For a law
 * that is handed `online` itself, as the trade prices are (systems/shopStock.js calculateTradePrice).
 */
export function onlineRule(name: string): ProfileValue | undefined {
  return rule(name, '?online');
}

// The clocks' TimeScales and whether the sky has a clock of its own are this page's profile's to say (net/world-time-scale.ts):
// the installed profile's, and the official profile's again after a reset.
onProfileInstalled(() => {
  setOnlineTimeScale(onlineRule('time.worldScale'));
  setSkyClock(onlineRule('time.skyClock'), onlineRule('time.skyScale'));
});

/** Tests: nothing installed. */
export function _resetProfileForTests(): void {
  installed = null;
  for (const fn of listeners) fn();
}
