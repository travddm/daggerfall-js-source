// DA10 (2026-09-29, Mac: "So this is an actual launcher now? Like
// warframe?" - and to the offer of one that stays open with a Play button,
// the latest patch notes and the player's options: "Yes please").
//
// THE LAUNCHER STAYS. DA8's window was a splash that went away by itself
// whenever it had nothing to ask; now it is the game's front door. It opens
// on every launch and waits for PLAY - held only while an update is being
// checked for, fetched or installed, or while the game has no files - with
// the patch notes as its news (NEW since the player last played, UPDATE on
// its way), the update in its status bar, and the player's own doors beside
// them: the game files, the saves folder, the update check, a reinstall.
//
// The state is pure (app/lib/launcherState.cjs) and driven here; the page
// and the shell's wiring are pinned by source; the real window is driven by
// tools/appShellProbe.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const L = require('../../app/lib/launcherState.cjs');
const rd = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const run = (state, ...events) => events.reduce(L.reduce, state);
const fresh = (over = {}) => L.initialState({ current: '0.1.4684', transport: 'updater', checkEnabled: true, arena2Dir: '/games/DF/DAGGER/ARENA2', ...over });

test('DA10: the launcher waits for Play on every launch - held only while an update is decided or the game has no files', () => {
  const current = run(fresh(), { type: 'check-none' });
  assert.equal(L.nextStep(current), 'wait', 'nothing to decide is no longer a reason to leave: the player presses Play');
  assert.equal(L.viewOf(current).play.enabled, true);
  // Play is held while an update is being decided...
  assert.equal(L.viewOf(fresh()).play.enabled, false, 'checking');
  const downloading = run(fresh(), { type: 'check-available', version: '0.1.4700' });
  assert.equal(L.viewOf(downloading).play.enabled, false, 'downloading');
  assert.equal(L.viewOf(run(downloading, { type: 'downloaded', version: '0.1.4700' })).play.enabled, false, 'installing');
  // ...or the game has no files
  const noFiles = run(fresh({ arena2Dir: null }), { type: 'found', found: [] }, { type: 'check-none' });
  assert.equal(L.viewOf(noFiles).play.enabled, false, 'no files, no Play - the card asks for them');
  // a press that is not allowed does nothing
  assert.equal(run(fresh(), { type: 'play' }).launch, null, 'Play pressed during the check is not a launch');
  assert.equal(run(noFiles, { type: 'play' }).launch, null);
  // Play: requested, then launched, then nothing more
  const played = run(current, { type: 'play' });
  assert.equal(played.launch, 'requested');
  assert.equal(L.nextStep(played), 'launch');
  const started = run(played, { type: 'launching' });
  assert.equal(L.nextStep(started), 'wait');
  const sv = L.viewOf(started);
  assert.equal(sv.status, 'Starting DFO Online');
  assert.equal(sv.play.enabled, false, 'one press, one game');
  // "Play without updating" is Play past a download - when the game has files; otherwise it only lets the download run on
  const past = run(downloading, { type: 'play-now' });
  assert.deepEqual([past.update.status, past.launch], ['background', 'requested']);
  const pastNoFiles = run(fresh({ arena2Dir: null }), { type: 'found', found: [] }, { type: 'check-available', version: '0.1.4700' });
  assert.deepEqual(L.viewOf(pastNoFiles).statusActions, [], 'no "Play without updating" while there is nothing to play');
  assert.equal(run(pastNoFiles, { type: 'play-now' }).launch, null);
});

test('DA10: the news - the latest releases\' patch notes, NEW since the player last played, UPDATE for one on its way', () => {
  const releases = [
    { tag_name: 'app-v0.1.4700', body: '# Patch Notes: The Launcher\n- Play.\n\n## What\'s Changed\n* a PR', published_at: '2026-09-29T18:02:00Z' },
    { tag_name: 'app-v0.1.4684', body: 'Fixes and improvements.', published_at: '2026-09-28T21:40:00Z' },
    { tag_name: 'app-v0.1.4670', body: 'Fixes and improvements.', published_at: '2026-09-28T19:00:00Z' },
    { tag_name: 'app-v0.1.4660', body: '# Patch Notes: Overworld\n- Walk.', published_at: '2026-09-28T12:10:00Z' },
    { tag_name: 'app-v0.1.4650', body: '# Patch Notes: Draft', draft: true },
    { tag_name: 'app-v0.1.4640', body: '# Patch Notes: Pre', prerelease: true },
    { tag_name: 'site-v9', body: '# not a release of the app' },
    { tag_name: 'app-v0.1.4613', body: '# Patch Notes: The Sea\n- Boats.', published_at: '2026-09-27T09:00:00Z' },
    null,
  ];
  const items = L.newsFrom(releases);
  assert.deepEqual(items.map((n) => n.version), ['0.1.4700', '0.1.4684', '0.1.4670', '0.1.4660', '0.1.4613'], 'published app releases, newest first');
  assert.equal(items[0].text, '# Patch Notes: The Launcher\n- Play.', 'as their patch notes - never the list of pull requests');
  assert.equal(items[0].date, '2026-09-29T18:02:00Z');
  assert.deepEqual(L.newsFrom({ message: 'API rate limit exceeded' }), [], 'an error body is no news');
  // the panel: marked, dated, and the bare placeholder listed only when it is the player's own version
  const s = fresh({ news: items, lastPlayed: '0.1.4613' });
  const v = L.viewOf(s).news;
  assert.deepEqual(v.items.map((n) => [n.version, n.badge]),
    [['0.1.4700', 'update'], ['0.1.4684', 'new'], ['0.1.4670', 'new'], ['0.1.4660', 'new'], ['0.1.4613', null]],
    'UPDATE past this copy; NEW for (last played, this copy]; the one played before, unmarked');
  assert.equal(v.items[0].date, '29 Sep 2026');
  const v2 = L.viewOf(fresh({ news: items, lastPlayed: '0.1.4684' })).news;
  assert.deepEqual(v2.items.map((n) => [n.version, n.badge]), [['0.1.4700', 'update'], ['0.1.4660', null], ['0.1.4613', null]],
    'a placeholder release that is neither new nor coming says nothing - it is not listed');
  // a copy with a config.json from before DA10 has no lastPlayed: the build it runs is new to that player
  assert.deepEqual(L.viewOf(fresh({ news: items, returning: true })).news.items.filter((n) => n.badge === 'new').map((n) => n.version), ['0.1.4684']);
  assert.deepEqual(L.viewOf(fresh({ news: items })).news.items.filter((n) => n.badge === 'new'), [], 'a first run has nothing new - everything is');
  // when no release says anything, one line stands for them all
  const bare = L.newsFrom(releases.slice(1, 3));
  assert.deepEqual(L.viewOf(fresh({ current: '0.1.4700', news: bare, lastPlayed: '0.1.4700' })).news.items.map((n) => n.version), ['0.1.4684']);
  const many = Array.from({ length: 12 }, (_, i) => ({ version: `0.1.${5000 + i}`, date: '', text: `# Patch Notes: ${i}` })).reverse();
  assert.equal(L.viewOf(fresh({ current: '0.1.5011', news: many })).news.items.length, L.NEWS_MAX);
  // the panel is never blank: it says why
  assert.equal(L.viewOf(fresh()).news.note, 'Loading the patch notes');
  assert.match(L.viewOf(run(fresh(), { type: 'news-failed' })).news.note, /could not be loaded/);
  assert.match(L.viewOf(fresh({ checkEnabled: false })).news.note, /update check, which is off/);
  assert.equal(L.viewOf(run(fresh(), { type: 'news', items: [] })).news.note, 'No patch notes yet.');
  assert.equal(L.viewOf(run(fresh({ news: items }), { type: 'news-failed' })).news.note, '', 'the kept list stays up when GitHub does not answer');
  assert.equal(L.viewOf(fresh({ news: items })).news.note, '', 'and shows while the next one is asked for');
});

test('DA10: news.json is read as it was written - or as a hand, a crash or an older build left it', () => {
  const good = { version: '0.1.4700', date: '2026-09-29T18:02:00Z', text: '# Patch Notes: X' };
  assert.deepEqual(L.cachedNews({ items: [{ version: '0.1.4613', date: '', text: 'a' }, good] }).map((n) => n.version), ['0.1.4700', '0.1.4613'], 'newest first');
  assert.deepEqual(L.cachedNews({ items: [good, { version: 'garbage', text: 'x' }, { version: '0.1.1' }, null, 7] }), [good], 'only well-formed items');
  assert.deepEqual(L.cachedNews({ items: [{ ...good, date: 5 }] })[0].date, '', 'a date that is not a string is none');
  assert.deepEqual(L.cachedNews(null), []);
  assert.deepEqual(L.cachedNews({ items: 'nope' }), []);
  assert.equal(L.dateLabel('2026-01-02T23:59:59Z'), '2 Jan 2026');
  assert.equal(L.dateLabel('not a date'), '');
  assert.equal(L.dateLabel(undefined), '');
});

test('DA10: the status bar says where the launcher stands - updated, up to date, offline, off', () => {
  const v = (s) => [L.viewOf(s).status, L.viewOf(s).detail];
  assert.deepEqual(v(run(fresh({ lastPlayed: '0.1.4613' }), { type: 'check-none' })), ['Updated to v0.1.4684', 'What changed is in the patch notes.']);
  assert.deepEqual(v(run(fresh({ lastPlayed: '0.1.4684' }), { type: 'check-none' })), ['Up to date', '']);
  assert.deepEqual(v(run(fresh(), { type: 'check-none' })), ['Up to date', ''], 'a first run was not updated');
  assert.equal(v(run(fresh({ returning: true }), { type: 'check-none' }))[0], 'Updated to v0.1.4684');
  assert.equal(v(run(fresh(), { type: 'check-failed' }))[0], 'Could not check for updates');
  assert.equal(v(fresh({ checkEnabled: false }))[0], 'Update checks are off');
  assert.equal(v(run(fresh(), { type: 'check-available', version: '0.1.4700' }, { type: 'play-now' }))[0], 'Starting DFO Online');
  assert.equal(L.justUpdated(fresh({ lastPlayed: '0.1.4700' })), false, 'a copy older than the one last played (a reinstall) was not "updated"');
  assert.equal(L.viewOf(fresh()).busy, true, 'the gem breathes while it works');
  assert.equal(L.viewOf(run(fresh(), { type: 'check-none' })).busy, false, 'and holds still when it waits on the player');
});

test('DA10: the options - the game files and their door, the update check\'s switch', () => {
  assert.deepEqual(L.viewOf(fresh()).options.files, { path: '/games/DF/DAGGER/ARENA2', note: '', label: 'Change folder' });
  assert.deepEqual(L.viewOf(fresh({ arena2Dir: null, inGamePicker: true })).options.files, { path: '', note: 'Chosen in the game', label: 'Choose folder' });
  assert.deepEqual(L.viewOf(fresh({ arena2Dir: null })).options.files, { path: '', note: 'Not set yet', label: 'Choose folder' });
  // the Game files door re-points at any time - and a folder picked later is the one shown
  const repointed = run(run(fresh(), { type: 'check-none' }), { type: 'picked', dir: '/new/ARENA2' });
  assert.deepEqual([repointed.setup.status, L.viewOf(repointed).options.files.path], ['ready', '/new/ARENA2']);
  assert.equal(run(fresh(), { type: 'check-none' }, { type: 'play' }, { type: 'launching' }, { type: 'picked', dir: '/late' }).setup.dir, '/games/DF/DAGGER/ARENA2', 'not once the game is starting');
  // the switch: shown as the config holds it; turned on with the check off, it checks now
  assert.equal(L.viewOf(fresh({ checkEnabled: false, checkOnLaunch: false })).options.checkOnLaunch, false);
  assert.equal(L.viewOf(run(fresh(), { type: 'check-on-launch', on: false })).options.checkOnLaunch, false);
  const on = run(fresh({ checkEnabled: false, checkOnLaunch: false }), { type: 'check-on-launch', on: true }, { type: 'check-start' });
  assert.deepEqual([on.update.status, on.news.status, on.checkOnLaunch], ['checking', 'loading', true]);
  assert.equal(run(run(fresh(), { type: 'check-none' }), { type: 'check-start' }).update.status, 'current', 'a check already answered is not asked again');
});

