// @ts-check
// SRV-N.
//
// THE BUILD (the client, on GitHub Pages) is deployed by CI on every merge to main - several times a day. Nothing
// restarts and nothing drops; the player simply keeps running code we have replaced, and a tab held open across a
// deploy eventually asks for a hashed chunk that has been DELETED (`systems/staleChunk.js`). So the page asks the site
// which build it serves, and says so once, in the chat window, when it is not this one.
//
// The build's tag is one we already know: `buildTag.js` BUILD_TAG is stamped into this very bundle, and vite stamps the
// same sha into every built page's <meta name="build-tag">. So the live page's tag is compared against our own directly.
//
// THE RELAY needs no notice here. The client and the relay ship as one pair, and a welcome that names another
// RELAY_VERSION is refused by the session itself (net/online.js refuseVersion: its status line tells the player to
// reload), so a page never runs against a relay of another version.
//
// Not a DFU member: Daggerfall Unity is not deployed to anybody.
// Ledger A row (ONLINE).
import { t } from '../systems/textManager.js';   // L10N4: the notice in the player's language

/** What a new client build says. It does NOT reload for them - a reload
 *  mid-dungeon costs whatever is not saved, and that is the player's
 *  call to make, not ours. It says what to do first. */
export const BUILD_UPDATE_TEXT = 'A new version of the game has been released. Save your game, then reload the page to pick it up.';
/** L10N4: BUILD_UPDATE_TEXT as the player reads it. */
export const buildUpdateText = () => t('net.update.build', BUILD_UPDATE_TEXT);

/** How often a running tab asks the site which build it is serving, ms.
 *  Long on purpose: the answer changes a few times a day at most, the
 *  cost of being late is a stale tab and not a broken one, and a shorter
 *  poll would put every open tab on the CDN for nothing. */
export const BUILD_POLL_MS = 10 * 60 * 1000;

/** How long the build poll waits for the site before giving up, ms. A
 *  request that never settles used to disable the poll for the whole
 *  session (AUDIT-SRVN F3, the other half). */
export const BUILD_FETCH_TIMEOUT_MS = 15_000;

/** @type {Set<string>} every foreign build tag already announced. */
const _buildTold = new Set();

/**
 * The commit a built page was stamped with, or null on a page built
 * before the stamp existed. `vite.config.js` writes the tag into every
 * built page as <meta name="build-tag">; attribute order is not assumed.
 *
 * ONE HOME. `tools/verify-deploy.mjs` asks this same question of the
 * same tag from node, and used to carry its own copy of the regex. Two
 * spellings of one rule is two chances to disagree about what a deploy
 * is, which is precisely the shape half of this month's findings had.
 *
 * @param {unknown} html
 * @returns {string|null}
 */
export function buildTagOf(html) {
  const tag = String(html ?? '').match(/<meta[^>]*\sname="build-tag"[^>]*>/i)?.[0];
  return tag?.match(/\scontent="([^"]*)"/i)?.[1] || null;
}

/**
 * The site is serving `liveTag`; this bundle is `mine`. Answers:
 *
 *   'unknown' - one side has no tag. A dev server's page is unstamped,
 *               and so is a fetch that failed. Silent.
 *   'current' - the site is serving us. The ordinary answer.
 *   'told'    - a newer build, already announced once. The poll keeps
 *               running (the next deploy is a different tag again) and
 *               keeps quiet.
 *   'changed' - a build we have not announced. SAY SO, once.
 *
 * @param {unknown} liveTag
 * @param {unknown} mine
 * @returns {'unknown'|'current'|'told'|'changed'}
 */
export function buildUpdateSeen(liveTag, mine) {
  const live = String(liveTag ?? '').trim();
  const own = String(mine ?? '').trim();
  if (!live || !own) return 'unknown';
  if (live === own) return 'current';
  if (_buildTold.has(live)) return 'told';
  _buildTold.add(live);
  return 'changed';
}

/**
 * Ask the site which build it is serving. Answers null for every way
 * this can fail - offline, a 404, a body that is not a built page - and
 * `buildUpdateSeen` reads null as 'unknown', so a flaky network is
 * quiet rather than alarming.
 *
 * `cache: 'no-store'` is the whole point of the call: the page in the
 * tab came OUT of the browser's cache, and a cached answer here would
 * hand back the very tag we are trying to compare against.
 *
 * @param {string} url
 * @param {((url: string, init?: any) => Promise<any>)|null} [fetchImpl]
 * @returns {Promise<string|null>}
 */
export async function fetchLiveBuildTag(url, fetchImpl = null, timeoutMs = BUILD_FETCH_TIMEOUT_MS) {
  const f = fetchImpl ?? (typeof globalThis !== 'undefined' ? globalThis.fetch : null);
  if (typeof f !== 'function' || !url) return null;
  try {
    // AUDIT-SRVN F3: a request that never settles is a promise that never
    // settles. The caller's own re-entry gate is what makes that
    // survivable, but leaking one socket per poll is not, so the request
    // is CANCELLED rather than abandoned. Guarded because a host without
    // `AbortSignal.timeout` should poll, not throw.
    const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(timeoutMs) : undefined;
    const res = await f(url, { cache: 'no-store', signal });
    if (!res?.ok) return null;
    return buildTagOf(await res.text());
  } catch { return null; }
}

/** The tests drive a fresh page per case. */
export function resetUpdateNotice() {
  _buildTold.clear();
}
