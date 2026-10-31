// AUDIT INSTALL (2026-09-29, Mac: "Yes please and audit what we have so
// far"): the install, update and first-run work of PR #429 (REL4, REL5,
// DA8, DA9, DA10), read by five independent lanes - security, the update
// lifecycle, the release pipeline, ARENA2 detection, and the tests, docs
// and the player's eye. Every finding a lane verified is fixed at its root
// and pinned here or beside the slice it belongs to; the record, finding
// by finding, is bible/01-Overview/audits/Audit-Install.md.
//
// Pure halves are driven by execution; the shell's wiring and the release
// workflow are pinned by source (they run in Electron and on GitHub); the
// real windows are driven by tools/appShellProbe.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const L = require('../../app/lib/launcherState.cjs');
const D = require('../../app/lib/shellDialogs.cjs');
const { updateTransport } = require('../../app/lib/autoUpdate.cjs');
const rd = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const run = (state, ...events) => events.reduce(L.reduce, state);
const fresh = (over = {}) => L.initialState({ current: '0.1.4684', transport: 'updater', checkEnabled: true, arena2Dir: '/games/ARENA2', ...over });

// ---- lane 5 #1: the questions, and which answer does what ------------------

// ---- lane 2: the update lifecycle ------------------------------------------

// ---- lane 1: the launcher's fences, the unload guard ------------------------

// ---- lane 3 and lane 1: the release pipeline -------------------------------

test('L1-1/L1-5/L3-2/L3-5/L3-6: the release workflow - no token left behind, a tag of digits, nothing re-cut in place, "latest" never by default', () => {
  const wf = rd('.github/workflows/release-desktop.yml');
  const checkouts = wf.match(/- uses: actions\/checkout@v4/g) ?? [];
  // PIN MOVED (REL-FAST): the gate's checkout is verify.yml's now - its three checkouts held to the same law
  assert.equal(checkouts.length, 3);
  assert.equal((wf.match(/persist-credentials: false/g) ?? []).length, checkouts.length, 'EVERY checkout - nothing here pushes, and the publish job holds contents: write');
  const v = rd('.github/workflows/verify.yml');
  assert.equal((v.match(/- uses: actions\/checkout@v4/g) ?? []).length, 3);
  assert.equal((v.match(/persist-credentials: false/g) ?? []).length, 3, 'and the gate\'s - verify.yml - leaves no token behind either');
  assert.doesNotMatch(wf, /\$\{\{ needs\.version\.outputs\.version \}\}"? --no-git-tag-version|run: .*\$\{\{ (inputs|github\.ref_name|needs\.version)/, 'no tag or input text is pasted into a script');
  const publish = wf.slice(wf.indexOf('\n  publish:'));
  const guard = publish.indexOf('- name: The tag has no published release'), stage = publish.indexOf('uses: softprops/action-gh-release@');
  assert.ok(guard > 0 && stage > guard, 'the guard stands before anything is staged');
  assert.match(publish, /if gh api "repos\/\$GITHUB_REPOSITORY\/releases\/tags\/\$TAG" --silent 2>lookup-error\.txt; then\s*echo "::error::\$TAG is already published[^"]*"\s*exit 1\s*fi\s*grep -q 'HTTP 404' lookup-error\.txt \|\| \{ cat lookup-error\.txt >&2; exit 1; \}/);
  assert.match(publish, /if CURRENT=\$\(gh api "repos\/\$GITHUB_REPOSITORY\/releases\/latest" --jq \.tag_name 2>latest-error\.txt\); then :\s*elif grep -q 'HTTP 404' latest-error\.txt; then CURRENT=''\s*else cat latest-error\.txt >&2; exit 1\s*fi/,
    'only a 404 is "nothing is latest yet" - a 5xx fails the step rather than handing an old re-cut `latest`');
  assert.doesNotMatch(publish, /2>\/dev\/null \|\| true/);
});

test('L3-4: a build that is not a release carries no update metadata, and a copy without it never replaces itself', () => {
  const wf = rd('.github/workflows/release-desktop.yml');
  const build = wf.slice(wf.indexOf('\n  build:'), wf.indexOf('\n  publish:'));
  const step = build.slice(build.indexOf('- name: No updater in a build that is not a release'), build.indexOf('- name: Build installers'));
  assert.match(step, /if: needs\.version\.outputs\.tag == ''/, 'artifacts-only runs');
  assert.match(step, /p\.build\.publish=null;/, 'null EXPLICITLY - absent, electron-builder derives GitHub from `repository` and writes app-update.yml anyway');
  assert.ok(build.indexOf('- name: No updater in a build that is not a release') < build.indexOf('- name: Build installers'));
  assert.equal(updateTransport({ packaged: true, platform: 'win32', portable: false, configured: false }), 'notice');
  assert.equal(updateTransport({ packaged: true, platform: 'linux', portable: false, configured: false }), 'notice');
  assert.equal(updateTransport({ packaged: true, platform: 'win32', portable: false }), 'updater', 'a release build is configured by default');
});

// ---- lane 5: what the player reads -----------------------------------------

