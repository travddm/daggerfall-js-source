// DA8.
//
// THE LAUNCHER IS THE SHELL'S FIRST WINDOW, not a second program: a
// separate launcher would make no update smaller - it would only add a
// thing to install, sign and update (what an update costs is DA13's: the
// game's own channel, the files that changed). The window checks for an update and
// installs it BEFORE play where this copy can (a client a protocol behind
// the relay is what install-on-quit left a player with, several times a
// day), finds the player's Daggerfall files (DA9), shows what changed, and
// hands over to the game at its first paint. An update that lands later is
// told in the game and offered from the File menu.
//
// The state and every screen are pure (app/lib/launcherState.cjs) and
// driven here; the page and the shell's wiring are pinned by source; the
// real window is driven by tools/appShellProbe.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { updateReadyText, listenForShellUpdates } from '../../src/systems/shellUpdates.js';

const require = createRequire(import.meta.url);
const L = require('../../app/lib/launcherState.cjs');
const rd = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const run = (state, ...events) => events.reduce(L.reduce, state);
const fresh = (over = {}) => L.initialState({ current: '0.1.4613', transport: 'updater', checkEnabled: true, arena2Dir: '/games/DF/DAGGER/ARENA2', ...over });

test('DA8: the updater transport installs BEFORE play - check, download (shown), install, and the app reopens', () => {
  let s = fresh();
  assert.equal(s.update.status, 'checking');
  assert.equal(L.nextStep(s), 'wait', 'nothing starts while the check is out');
  s = run(s, { type: 'check-available', version: '0.1.4684', total: 4.6e6 });
  assert.equal(s.update.status, 'downloading');
  assert.equal(L.nextStep(s), 'wait');
  s = run(s, { type: 'progress', percent: 62.4, transferred: 2.9e6, total: 4.6e6 });
  let v = L.viewOf(s);
  assert.equal(v.status, 'Downloading v0.1.4684');
  assert.deepEqual(v.progress, { percent: 62.4, label: '2.9 of 4.6 MB' });
  assert.equal(v.play.enabled, false, 'DA10: Play waits for the update');
  assert.deepEqual(v.statusActions.map((a) => a.id), ['play-now'], 'the one way past it: play now, update at quit');
  assert.ok(!v.statusActions[0].primary, 'and it is NOT the default - Enter does not skip the update');
  s = run(s, { type: 'downloaded', version: '0.1.4684' });
  assert.equal(s.update.status, 'installing');
  assert.equal(L.nextStep(s), 'install');
  v = L.viewOf(s);
  assert.equal(v.status, 'Installing v0.1.4684');
  assert.match(v.detail, /closes and reopens by itself/, 'the player is told the app comes back on its own');
  assert.deepEqual(v.statusActions, [], 'nothing to press - it is happening');
  assert.equal(v.play.enabled, false);
  // an installer that never took over does not strand the player on "Installing" - AUDIT INSTALL L2-3: and it is
  // said, with the installer to run by hand (it tries again at quit, DA7)
  s = run(s, { type: 'install-failed' });
  assert.equal(s.update.status, 'stuck');
  assert.equal(L.viewOf(s).play.enabled, true, 'Play is free');
  assert.deepEqual(L.viewOf(s).statusActions.map((a) => a.id), ['reinstall']);
});

test('DA8: silence is not a reason to wait - an error, a timeout, or no check at all frees Play; a download is never cut off', () => {
  for (const ev of ['check-failed', 'check-timeout']) {
    const s = run(fresh(), { type: ev });
    assert.equal(s.update.status, 'offline', ev);
    assert.equal(L.viewOf(s).play.enabled, true, `${ev}: Play`);
  }
  assert.equal(L.viewOf(run(fresh(), { type: 'check-none' })).play.enabled, true);
  const midDownload = run(fresh(), { type: 'check-available', version: '0.1.4684' }, { type: 'check-timeout' });
  assert.equal(midDownload.update.status, 'downloading', 'a timeout never cuts off a download the player can see');
  const skipped = run(fresh(), { type: 'check-available', version: '0.1.4684' }, { type: 'play-now' }, { type: 'downloaded', version: '0.1.4684' });
  assert.equal(skipped.update.status, 'background', 'after "Play without updating" a finished download does not install from under the player');
  assert.equal(L.nextStep(skipped), 'launch', 'and the one click played');
  const off = fresh({ checkEnabled: false });
  assert.equal(off.update.status, 'skipped', 'the toggle, the File-menu checkbox and the probe env (DA6\'s gates)');
  assert.equal(L.viewOf(off).play.enabled, true);
  assert.ok(L.CHECK_TIMEOUT_MS >= 5000 && L.CHECK_TIMEOUT_MS <= 10000, `a slow check is waited on, a dead one is not (${L.CHECK_TIMEOUT_MS} ms)`);
  assert.equal(L.RECHECK_MS, 60 * 60 * 1000, 'a running copy asks again within the hour');
});

test('DA8: the notice transport offers its own file beside Play - Download it, or play this version', () => {
  let s = fresh({ transport: 'notice' });
  s = run(s, { type: 'check-available', version: '0.1.4684', download: 'https://github.com/Lattymoy/daggerfall-js-source/releases/latest/download/DFO-Online-mac-arm64.dmg' });
  assert.equal(s.update.status, 'notice');
  assert.equal(L.nextStep(s), 'wait', 'the player decides');
  const v = L.viewOf(s);
  assert.equal(v.status, 'Version 0.1.4684 is out');
  assert.match(v.detail, /^You have v0\.1\.4613\./);
  assert.deepEqual(v.statusActions.map((a) => [a.id, !!a.primary]), [['download', true]]);
  assert.equal(v.play.enabled, true, 'DA10: this version plays - Play is the other answer');
  assert.equal(s.update.download.endsWith('/DFO-Online-mac-arm64.dmg'), true, 'REL5: the file, not a page of eleven');
});

test('DA8/DA9: the first run - detection runs at once, and a folder is OFFERED, never taken silently', () => {
  const s = fresh({ arena2Dir: null });
  assert.equal(L.nextStep(s), 'detect', 'DA10: detection is local - the player chooses while the update is asked for');
  assert.equal(L.viewOf(s).setup.title, 'Looking for your Daggerfall files');
  const found = [{ dir: '/steam/DF/DAGGER/ARENA2', source: 'steam' }, { dir: '/home/me/.config/DFU/ARENA2', source: 'dfu' }];
  const withFound = run(s, { type: 'found', found }, { type: 'check-none' });
  assert.equal(withFound.setup.status, 'found');
  assert.equal(L.nextStep(withFound), 'wait', 'the player chooses');
  const v = L.viewOf(withFound);
  assert.equal(v.panel, 'setup');
  assert.equal(v.play.enabled, false, 'no files, no Play');
  assert.equal(v.setup.title, 'Found Daggerfall on this computer');
  assert.deepEqual(v.setup.found, [
    { index: 0, dir: '/steam/DF/DAGGER/ARENA2', from: 'Steam', primary: false },
    { index: 1, dir: '/home/me/.config/DFU/ARENA2', from: 'from Daggerfall Unity', primary: false },
  ], 'two finds: the player picks - neither is the card\'s answer');
  assert.deepEqual(v.setup.actions.map((a) => a.id), ['choose-folder', 'skip-setup']);
  assert.equal(L.viewOf(run(s, { type: 'found', found: found.slice(0, 1) })).setup.title, 'Found your Daggerfall files');
  // nothing found: where to get it, and the website's own picker - never a dead end
  const none = run(s, { type: 'found', found: [] }, { type: 'check-none' });
  assert.equal(none.setup.status, 'none');
  const nv = L.viewOf(none);
  assert.equal(nv.setup.title, 'Where is Daggerfall?');
  assert.deepEqual(nv.setup.actions.map((a) => [a.id, a.arg ?? null, !!a.primary]),
    [['choose-folder', null, true], ['open', 'steam', false], ['open', 'gog', false], ['skip-setup', null, false]]);
  // a partial folder says which files it lacks - A2-WHOLE's words
  const bad = run(none, { type: 'picked-bad', missing: ['ARCH3D.BSA', 'MAPS.BSA'] });
  assert.equal(L.viewOf(bad).setup.title, 'That folder is not a whole ARENA2');
  assert.match(L.viewOf(bad).setup.detail, /^It has no ARCH3D\.BSA, MAPS\.BSA\. .*DF\/DAGGER\/ARENA2/);
  assert.match(L.viewOf(run(none, { type: 'picked-bad', missing: null })).setup.detail, /^It holds no Daggerfall files\./);
  assert.equal(L.notArena2Detail(['MAPS.BSA']), L.viewOf(run(none, { type: 'picked-bad', missing: ['MAPS.BSA'] })).setup.detail, 'one set of words, card and menu alike');
  const picked = run(bad, { type: 'picked', dir: '/x/ARENA2' });
  assert.equal(picked.setup.status, 'ready');
  assert.equal(L.viewOf(picked).play.enabled, true);
  assert.equal(L.viewOf(run(none, { type: 'skip-setup' })).play.enabled, true, 'the in-page picker takes over, as on the website');
  // the probe's skip, and a whole folder already configured, ask nothing
  assert.equal(fresh({ arena2Dir: null, inGamePicker: true }).setup.status, 'skipped');
  assert.equal(run(fresh(), { type: 'found', found }).setup.status, 'ready', 'detection never runs over a configured folder');
});

test('DA8: the notes a player reads are the patch notes - never the list of pull requests', () => {
  const body = '# Patch Notes: The Sea\n\n- Boats.\n\n## What\'s Changed\n* A PR by @someone in https://x\n\n**Full Changelog**: https://y';
  assert.equal(L.playerNotes(body), '# Patch Notes: The Sea\n\n- Boats.');
  assert.equal(L.playerNotes('Fixes and improvements.\n\n**Full Changelog**: https://y'), 'Fixes and improvements.');
  assert.equal(L.playerNotes(null), '');
});

test('DA8: in the game - the update is a HUD line saying what the player can do; a browser tab hears nothing', () => {
  assert.equal(updateReadyText({ version: '0.1.4684', manual: false }),
    'DFO Online 0.1.4684 is ready. It runs the next time you start, or now from File > Restart to Update. Save first.');
  assert.equal(updateReadyText({ version: '0.1.4684', manual: true }),
    'DFO Online 0.1.4684 is out. Download it from the File menu when you are ready. Your saves stay where they are.');
  assert.match(updateReadyText({ version: '<img src=x>' }), /^A new version of DFO Online is ready\./, 'only a version\'s own shape is spoken');
  assert.equal(listenForShellUpdates(undefined, () => {}), false, 'a browser tab has no shell');
  assert.equal(listenForShellUpdates({}, () => {}), false, 'a shell too old to have the word');
  const said = [];
  let fire = null;
  assert.equal(listenForShellUpdates({ onUpdateReady: (cb) => { fire = cb; } }, (t) => said.push(t)), true);
  fire({ version: '0.1.4700', manual: false });
  assert.deepEqual(said, [updateReadyText({ version: '0.1.4700', manual: false })]);
});
