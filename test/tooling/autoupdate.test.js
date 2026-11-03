// DA7 - THE AUTO-UPDATER.
//
// REL3 made every merge a release and DA6's notice asked the player to
// download and install each one. Where the installer can replace itself
// - NSIS on Windows, AppImage on Linux, the two electron-builder already
// cuts - electron-updater now reads the release's latest.yml, downloads
// the new installer in the background and installs it when the app
// quits. macOS (an unsigned app cannot swap itself), the portable exe (a
// bare file in %TEMP% - it carries an app-update.yml all the same, so its
// launcher's own mark is the test: AUDIT INSTALL R2-C5), a Linux copy not
// running as its AppImage, and an unpackaged run keep the notice. The transport table is pure (app/lib/autoUpdate.cjs)
// and pinned by value; the wiring is pinned by source, because the
// three things that make the updater find anything at all live in three
// files that do not import each other: the shell's settings, the build's
// publish PROVIDER (without it electron-builder writes no latest.yml and
// no app-update.yml), and the workflow attaching that metadata to the
// release beside the installers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { updateTransport } = require('../../app/lib/autoUpdate.cjs');
const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('DA7: the transport table - an installed NSIS or AppImage copy updates in place; macOS, the portable exe and an unpackaged run keep the notice', () => {
  assert.equal(updateTransport({ packaged: true, platform: 'win32', portable: false }), 'updater', 'the NSIS install');
  assert.equal(updateTransport({ packaged: true, platform: 'linux', portable: false }), 'updater', 'the AppImage');
  assert.equal(updateTransport({ packaged: true, platform: 'win32', portable: true }), 'notice', 'the portable exe: a bare file, nothing to replace');
  assert.equal(updateTransport({ packaged: true, platform: 'win32', portable: true, configured: true }), 'notice', 'R2-C5: it DOES carry app-update.yml - its mark decides, first');
  assert.equal(updateTransport({ packaged: true, platform: 'linux', portable: false, appImage: false }), 'notice', 'R2-A10: not running as its AppImage - electron-updater declines to check at all');
  assert.equal(updateTransport({ packaged: true, platform: 'win32', portable: false, appImage: false }), 'updater', 'APPIMAGE is Linux\'s alone');
  assert.equal(updateTransport({ packaged: true, platform: 'darwin', portable: false }), 'notice', 'macOS: unsigned, cannot swap itself');
  assert.equal(updateTransport({ packaged: false, platform: 'win32', portable: false }), 'notice', 'electron . - no installed copy');
  assert.equal(updateTransport({ packaged: false, platform: 'linux', portable: false }), 'notice');
  // DERIVED: every packaged, non-portable, non-mac platform is the updater's - not a list of two
  for (const platform of ['win32', 'linux', 'freebsd', 'openbsd']) {
    assert.equal(updateTransport({ packaged: true, platform, portable: false }), 'updater', platform);
  }
});

test('DA7: the build - a publish PROVIDER (so latest.yml and app-update.yml are written), the updater a RUNTIME dependency, and the workflow attaches the metadata beside the installers', () => {
  const pkg = JSON.parse(read('app/package.json'));
  assert.deepEqual(pkg.build.publish, [{ provider: 'github', owner: 'Lattymoy', repo: 'daggerfall-js-source' }],
    'the provider names the repo the notice already reads; without a provider electron-builder writes no update metadata at all');
  assert.ok(pkg.dependencies?.['electron-updater'], 'a runtime dependency - electron-builder packs `dependencies`, never devDependencies');
  assert.ok(!pkg.devDependencies?.['electron-updater']);
  const wf = read('.github/workflows/release-desktop.yml');
  assert.match(wf, /run: npx electron-builder --publish never/, 'electron-builder uploads nothing itself; the publish job does');
  // REL4: a leg hands its files on (the run artifact), and ONE publish job attaches everything handed on
  const handOn = wf.slice(wf.indexOf('- name: Hand the installers on'), wf.indexOf('\n  publish:'));
  assert.match(handOn, /app\/release\/latest\*\.yml/, 'latest.yml and latest-linux.yml ride with the installers');
  assert.match(handOn, /app\/release\/\*\.blockmap/, 'and the blockmaps, or every update is a full download');
  const publish = wf.slice(wf.indexOf('\n  publish:'));
  assert.match(publish, /files: release\/\*/, 'the release carries every file the legs handed on');
  assert.match(publish, /node scripts\/desktopRelease\.mjs check release/, 'and publishes nothing when a manifest or blockmap is missing');
  // the tag shape the updater resolves: releases/latest's tag_name, whatever its prefix - DA6's parser is the same shape
  assert.match(wf, /TAG="app-v\$\{BASE\}\.\$\(git rev-list --count HEAD\)"/, 'REL3\'s tag is what the updater downloads latest.yml under');
});

