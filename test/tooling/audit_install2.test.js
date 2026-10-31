// AUDIT INSTALL, ROUND 2 (2026-09-29, Mac: "Audit this"): PR #429's
// install work read again by five fresh lanes - the launcher's lifecycle,
// security, the release pipeline and its notes, ARENA2 detection, and the
// tests, docs and the player's eye - after round 1's fixes had landed.
// Round 2 looked hardest at the fixes themselves. The worst finding was
// one of them: L1-5 kept a tag's text out of the build legs' scripts, and
// in doing so broke the Windows leg. Every finding a lane verified is
// fixed at its root and pinned here; the record, finding by finding, is
// bible/01-Overview/audits/Audit-Install.md ("Round 2"). Lane C's notes findings
// (C1, C4, E-48..E-51) pinned the PATCH-NOTES-*.md reader REL6 retired -
// the notes come off the pull requests now (test/tooling/rel4_release.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsModule, { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const rd = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

// ---- the workflows, read as GitHub reads them -------------------------------

const WORKFLOWS = readdirSync(new URL('../../.github/workflows/', import.meta.url)).filter((f) => f.endsWith('.yml')).sort();
/** A workflow's jobs, each from its two-space `name:` line to the next. */
const jobsOf = (wf) => [...wf.slice(wf.indexOf('\njobs:\n')).matchAll(/\n {2}([A-Za-z0-9_-]+):\n([\s\S]*?)(?=\n {2}[A-Za-z0-9_-]+:\n|$)/g)]
  .map((m) => ({ name: m[1], text: m[2] }));
/** A job's steps, each from its `      - ` line to the next. */
const stepsOf = (job) => {
  const at = job.indexOf('\n    steps:\n');
  return at < 0 ? [] : job.slice(at + '\n    steps:\n'.length).split(/\n(?= {6}- )/).filter((s) => /^ {6}- /.test(s));
};
/** A step's script: the inline value of its `run:`, or the block under it (the lines indented past the key). */
const runOf = (step) => {
  const lines = step.split('\n');
  const i = lines.findIndex((l) => /^ {6}(?:- | {2})run:/.test(l));
  if (i < 0) return null;
  const inline = lines[i].replace(/^ {6}(?:- | {2})run:\s*/, '');
  if (!/^[|>][-+]?\s*$/.test(inline)) return inline;
  const block = [];
  for (const l of lines.slice(i + 1)) {
    if (l.trim() && !/^ {9,}/.test(l)) break;
    block.push(l);
  }
  return block.join('\n');
};
const nameOf = (step) => /^ {6}(?:- | {2})name: (.*)$/m.exec(step)?.[1] ?? step.split('\n')[0].trim();

test('R2-B1: a step that reads a shell variable names its shell wherever a leg can be Windows - there `run` is PowerShell, and "$VERSION" is not the environment', () => {
  // L1-5 moved the version out of the stamp's script and into its
  // environment - right for bash, and silently wrong on windows-latest,
  // whose default shell is pwsh: "$VERSION" is an unset PowerShell
  // variable ($env:VERSION is the environment), npm got "" (or nothing),
  // the Windows leg failed or stamped 0.1.0, and `publish` - which needs
  // every leg - never ran. A script's dialect is the shell's, so any script
  // that reads a variable says which shell it is written for.
  let windowsJobs = 0;
  const unnamed = [];
  for (const f of WORKFLOWS) {
    const wf = rd(`.github/workflows/${f}`);
    const wfBash = /\ndefaults:\n {2}run:\n {4}shell: bash\n/.test(wf);
    for (const job of jobsOf(wf)) {
      if (!/\bwindows-(?:latest|\d+)\b/.test(job.text)) continue;
      windowsJobs++;
      const jobShell = wfBash || /\n {4}defaults:\n {6}run:\n {8}shell: \w+\n/.test(job.text);
      for (const step of stepsOf(job.text)) {
        const script = runOf(step);
        if (script === null || !/\$(?!\{\{)/.test(script)) continue;
        if (!jobShell && !/^ {8}shell: \w+/m.test(step)) unnamed.push(`${f} ${job.name}: "${nameOf(step)}"`);
      }
    }
  }
  assert.ok(windowsJobs >= 1, 'the desktop build has a Windows leg - this law is not vacuous');
  assert.deepEqual(unnamed, [], 'a script that reads a variable runs in whatever shell the leg defaults to');
  const build = jobsOf(rd('.github/workflows/release-desktop.yml')).find((j) => j.name === 'build');
  const stamp = stepsOf(build.text).find((s) => nameOf(s) === 'Stamp the version');
  assert.match(stamp, /^ {8}shell: bash$/m, 'the stamp is bash on every leg');
  assert.equal(runOf(stamp), 'npm version "$VERSION" --no-git-tag-version --allow-same-version', 'and reads the environment, never pasted text (L1-5)');
});

test('R2-B4: an action nobody at GitHub owns is pinned to a commit - the release job holds contents: write, and the launcher installs what it publishes', () => {
  const loose = [];
  let thirdParty = 0;
  for (const f of WORKFLOWS) {
    for (const m of rd(`.github/workflows/${f}`).matchAll(/^\s*(?:- )?uses: ([^\s#]+)(.*)$/gm)) {
      const [, ref, rest] = m;
      if (ref.startsWith('./') || ref.startsWith('actions/')) continue;
      thirdParty++;
      const [, sha] = /@([^@]+)$/.exec(ref) ?? [];
      if (!/^[0-9a-f]{40}$/.test(sha ?? '') || !/^\s+# v\d+\.\d+\.\d+$/.test(rest)) loose.push(`${f}: ${ref}${rest}`);
    }
  }
  assert.ok(thirdParty >= 1, 'softprops is third-party - this law is not vacuous');
  assert.deepEqual(loose, [], 'a tag can be moved under the job; a commit cannot - and the comment says which release it was');
  assert.match(rd('.github/workflows/release-desktop.yml'), /uses: softprops\/action-gh-release@3bb12739c298aeb8a4eeaf626c5b8d85266b0e65 # v2\.6\.2\n/,
    'the commit v2 and v2.6.2 both named (git ls-remote, 2026-09-29)');
});

test('R2-C2: a draft a failed run left at the tag is deleted before staging - softprops would keep it, with its old notes and its old commit', () => {
  const wf = rd('.github/workflows/release-desktop.yml');
  const publish = jobsOf(wf).find((j) => j.name === 'publish');
  const steps = stepsOf(publish.text);
  const guard = steps.findIndex((s) => nameOf(s) === 'The tag has no published release, and no draft left over');
  const stage = steps.findIndex((s) => /uses: softprops\/action-gh-release@/.test(s));
  assert.ok(guard >= 0 && stage > guard, 'the guard stands before anything is staged');
  const script = runOf(steps[guard]);
  // an ASSIGNMENT, so a listing that fails fails the step (bash -e) - a `for` over a failed $(...) would carry on
  assert.match(script, /\n\s*LEFT=\$\(gh api --paginate "repos\/\$GITHUB_REPOSITORY\/releases\?per_page=100" --jq '\.\[\] \| select\(\.draft and \.tag_name == env\.TAG\) \| \.id'\)\n/,
    'every page: softprops itself only scans two');
  assert.match(script, /for ID in \$LEFT; do\s*gh api -X DELETE "repos\/\$GITHUB_REPOSITORY\/releases\/\$ID" --silent/);
  assert.ok(script.indexOf('LEFT=') > script.indexOf("grep -q 'HTTP 404' lookup-error.txt"), 'only once the tag is known to have no published release');
  assert.match(steps[stage], /target_commitish: \$\{\{ github\.sha \}\}/, 'staged afresh, the tag is cut where these files were built (AUDIT 68)');
});

// ---- the launcher's fences ---------------------------------------------------

// ---- the release notes -------------------------------------------------------

// ---- ARENA2: every look at the disks off the main process (lane D) ---------------------------------------------

const L = createRequire(import.meta.url)('../../app/lib/launcherState.cjs');
const { looseRoots, detectArena2 } = createRequire(import.meta.url)('../../app/lib/arena2Detect.cjs');
const state = (over = {}) => L.initialState({ current: '0.1.4700', transport: 'updater', checkEnabled: false, ...over });
const apply = (s, ...events) => events.reduce(L.reduce, s);

test('R2-D4: the search goes on past its deadline, and a later find is added - never "go and get it" for a search cut short', () => {
  const looking = state();
  const none = apply(looking, { type: 'found', found: [], searching: true });
  assert.deepEqual([none.setup.status, none.setup.searching, L.viewOf(none).busy], ['none', true, true]);
  assert.match(L.viewOf(none).setup.detail, /^Still looking on slower drives - they are added here if they turn up\./);
  const late = apply(none, { type: 'found-more', found: { dir: '/mnt/steam/ARENA2', source: 'steam' } });
  assert.deepEqual([late.setup.status, late.setup.found.map((f) => f.dir)], ['found', ['/mnt/steam/ARENA2']]);
  assert.equal(L.viewOf(late).setup.found[0].primary, true, 'the one thing found is the card\'s answer');
  assert.deepEqual(apply(late, { type: 'found-more', found: { dir: '/mnt/steam/ARENA2', source: 'steam' } }).setup.found.length, 1, 'once');
  assert.equal(apply(late, { type: 'found-more', found: { dir: '/b/ARENA2', source: 'folder' } }).setup.found.length, 2);
  const refused = apply(none, { type: 'picked-bad', missing: null }, { type: 'found-more', found: { dir: '/c/ARENA2', source: 'gog' } });
  assert.deepEqual([refused.setup.status, refused.setup.found.length], ['bad', 1], 'offered on a refusal\'s card too');
  // once the player has chosen - a folder, or the game's own picker - a late find is nothing
  assert.equal(apply(apply(none, { type: 'picked', dir: '/x' }), { type: 'found-more', found: { dir: '/y', source: 'steam' } }).setup.found.length, 0);
  assert.equal(apply(none, { type: 'skip-setup' }).setup.searching, false);
  assert.equal(apply(none, { type: 'picked', dir: '/x' }).setup.searching, false, 'and the search is let go');
  const done = apply(none, { type: 'detect-done' });
  assert.equal(done.setup.searching, false);
  assert.doesNotMatch(L.viewOf(done).setup.detail, /Still looking/, 'concluded: the card says where to get it, plainly');
  assert.equal(L.viewOf(done).busy, false);
  assert.equal(apply(looking, { type: 'found-more', found: { dir: '/z', source: 'dfu' } }).setup.found.length, 0, 'before the deadline the finds are the shell\'s to hold');
});

test('R2-D5: on a Mac the privacy-guarded folders are read LAST - after ~/Games, as "only when nothing else was found" says', () => {
  const roots = looseRoots({ platform: 'darwin', home: '/Users/p', env: {} }, ['/Users/p/Downloads']);
  assert.deepEqual(roots.map((r) => [r.dir, r.guarded]), [
    ['/Users/p/Games', false], ['/Users/p/Downloads', true], ['/Users/p/Desktop', true], ['/Users/p/Documents', true],
  ]);
  assert.deepEqual(looseRoots({ platform: 'linux', home: '/h', env: {} }, []).map((r) => r.dir), ['/h/Downloads', '/h/Desktop', '/h/Documents', '/h/Games'], 'elsewhere the order stands');
  // run: the files in ~/Games, and not one guarded folder read on the way (each read would be a system prompt)
  const home = mkdtempSync(join(tmpdir(), 'r2-mac-'));
  try {
    const a2 = join(home, 'Games', 'Daggerfall', 'arena2');
    for (const d of [a2, join(home, 'Downloads'), join(home, 'Desktop'), join(home, 'Documents')]) fsModule.mkdirSync(d, { recursive: true });
    for (const n of ['ARCH3D.BSA', 'BLOCKS.BSA', 'MAPS.BSA', 'MONSTER.BSA', 'WOODS.WLD', 'TEXT.RSC', 'ART_PAL.COL']) writeFileSync(join(a2, n), 'x');
    const read = [];
    const fs2 = new Proxy(fsModule, { get: (t, k) => (k === 'readdirSync' ? (d, o) => { read.push(String(d)); return t.readdirSync(d, o); } : t[k]) });
    const found = detectArena2({ platform: 'darwin', home, env: {}, fs: fs2, regQuery: () => [] });
    assert.equal(found.length, 1);
    const guarded = read.filter((d) => ['Downloads', 'Desktop', 'Documents'].some((g) => d.startsWith(join(home, g))));
    assert.deepEqual(guarded, [], 'three prompts for files that were elsewhere');
  } finally { rmSync(home, { recursive: true, force: true }); }
});

// ---- the update lifecycle (lane A) ------------------------------------------------------------------------------

// ---- the launcher's page, run (lane E) ---------------------------------------------------------------------------
// app/launcher/launcher.js over app/launcher/index.html in test/launcherDom.mjs, fed views the real state makes

const view = (s) => L.viewOf(s);
const foundOne = () => apply(state(), { type: 'found', found: [{ dir: '/games/DF/DAGGER/ARENA2', source: 'steam' }] });

test('R2-E1: after the first run\'s card the focus is on PLAY - Enter plays (it stayed on the card\'s answer, hidden, and pressed nothing)', async () => {
  const { bootLauncher } = await import('../launcherDom.mjs');
  const p = bootLauncher();
  p.show(view(foundOne()));
  assert.equal(p.doc.activeElement.textContent, 'Use these files', 'the card\'s answer first');
  p.show(view(apply(foundOne(), { type: 'picked', dir: '/games/DF/DAGGER/ARENA2' })));
  assert.equal(p.$('setup').hidden, true);
  assert.equal(p.doc.activeElement.id, 'play', 'the answer taken, the card gone: Enter plays');
  // the player's own control keeps the focus: Play never takes it from a switch they are on (E-13)
  const q = bootLauncher();
  q.show(view(state({ arena2Dir: '/a', checkEnabled: true })));
  q.$('update-check').focus();
  q.show(view(apply(state({ arena2Dir: '/a', checkEnabled: true }), { type: 'check-none' })));
  assert.equal(q.doc.activeElement.id, 'update-check');
  // and a view that changes nothing it keys on moves nothing (E-14): the card's answer is not retaken on every view
  const r = bootLauncher();
  r.show(view(foundOne()));
  r.$('update-check').focus();
  r.show(view(foundOne()));
  assert.equal(r.doc.activeElement.id, 'update-check', 'the same card again leaves the focus where the player put it');
});

test('R2-E (L5-21, L5-12): the page redraws what changed and nothing else - a button under the pointer is never rebuilt between press and release', async () => {
  const { bootLauncher } = await import('../launcherDom.mjs');
  const p = bootLauncher();
  // a download: views many times a second, only the percent moving - "Play without updating" stays the same element
  const dl = (pct) => view(apply(state({ arena2Dir: '/a', checkEnabled: true }), { type: 'check-available', version: '0.1.4701', total: 100e6 }, { type: 'progress', percent: pct, transferred: pct * 1e6, total: 100e6 }));
  p.show(dl(10));
  const button = p.$('status-actions').children[0];
  const rebuilt = p.$('status-actions').replaced;
  for (const pct of [11, 12, 13]) p.show(dl(pct));
  assert.equal(p.$('status-actions').replaced, rebuilt, 'E-16: not rebuilt on every tick');
  assert.equal(p.$('status-actions').children[0], button);
  assert.equal(button.textContent, 'Play without updating');
  // E-17/E-18: the bar shows while there is progress, and says how far
  const track = p.doc.querySelector('#progress .track');
  assert.equal(p.$('progress').hidden, false);
  assert.equal(track.getAttribute('aria-valuenow'), '13');
  assert.equal(track.getAttribute('aria-valuetext'), '13.0 of 100.0 MB');
  p.show(view(state({ arena2Dir: '/a' })));
  assert.equal(p.$('progress').hidden, true, 'and hides when there is none');
  // E-15: the card is not rebuilt by a view that leaves it as it was
  const q = bootLauncher();
  q.show(view(foundOne()));
  const cardBuilds = q.$('setup-actions').replaced;
  q.show(view(foundOne()));
  assert.equal(q.$('setup-actions').replaced, cardBuilds);
  // E-19: the card and the news trade places; E-20: the switch shows the setting; E-22: the files door's own words
  assert.deepEqual([q.$('setup').hidden, q.$('news').hidden], [false, true]);
  q.show(view(state({ arena2Dir: '/games/ARENA2', checkEnabled: false, checkOnLaunch: false })));
  assert.deepEqual([q.$('setup').hidden, q.$('news').hidden], [true, false]);
  assert.equal(q.$('update-check').checked, false);
  q.show(view(state({ arena2Dir: '/games/ARENA2', checkEnabled: true })));
  assert.equal(q.$('update-check').checked, true);
  assert.equal(q.doc.querySelector('[data-act="choose-folder"]').textContent, 'Change folder');
  q.show(view(state({ inGamePicker: true })));
  assert.equal(q.doc.querySelector('[data-act="choose-folder"]').textContent, 'Choose folder');
  assert.equal(q.$('files').textContent, 'Chosen in the game');
});

// ---- the laws round 1 left unpinned (lane E's survivors) ---------------------------------------------------------

test('R2-E (E-01..E-12): the launcher state\'s own laws - timings a player can read, the right names, a fresh bar, the notes in order', () => {
  // E-01/E-02: "Installing" stays long enough to read, and an installer that never takes over frees Play soon after
  assert.ok(L.INSTALL_NOTICE_MS >= 1000 && L.INSTALL_NOTICE_MS <= 3000, `${L.INSTALL_NOTICE_MS} ms`);
  assert.ok(L.INSTALL_GIVEUP_MS > L.INSTALL_NOTICE_MS && L.INSTALL_GIVEUP_MS <= 30000, `${L.INSTALL_GIVEUP_MS} ms`);
  // E-03: each source by its own name
  assert.deepEqual(L.SOURCE_LABEL, { dfu: 'from Daggerfall Unity', steam: 'Steam', gog: 'GOG', folder: 'on this computer' });
  // E-04: a download tried again starts from nothing - not the failed one's percent and megabytes
  const failed = apply(state({ arena2Dir: '/a', checkEnabled: true }), { type: 'check-available', version: '0.1.4701', total: 100e6 },
    { type: 'progress', percent: 60, transferred: 60e6, total: 100e6 }, { type: 'download-failed' });
  const again = apply(failed, { type: 'check-available', version: '0.1.4701', total: 100e6 });
  assert.deepEqual([again.update.percent, again.update.transferred], [0, 0]);
  // E-12: before the first byte it says it is starting - never "0.0 of 0.0 MB"
  const starting = apply(state({ arena2Dir: '/a', checkEnabled: true }), { type: 'check-available', version: '0.1.4701' });
  assert.equal(view(starting).progress.label, 'Starting the download');
  // E-05: a stray refusal never sends a player whose files are set back to the card
  assert.equal(L.reduce(state({ arena2Dir: '/a' }), { type: 'picked-bad', missing: null }).setup.status, 'ready');
  // E-06: the news newest first, whatever order GitHub answers in (a hand re-cut of an old build is listed late)
  const news = L.newsFrom([{ tag_name: 'app-v0.1.4600', body: 'old' }, { tag_name: 'app-v0.1.4701', body: 'new' }, { tag_name: 'app-v0.1.4650', body: 'mid' }]);
  assert.deepEqual(news.map((n) => n.version), ['0.1.4701', '0.1.4650', '0.1.4600']);
  // E-07: the version under Play; E-11: a stuck install says it tries again at quit, and how to run it by hand
  assert.equal(view(state({ arena2Dir: '/a' })).version, 'v0.1.4700');
  const stuck = apply(state({ arena2Dir: '/a', checkEnabled: true, installFailedFor: '0.1.4701' }), { type: 'check-available', version: '0.1.4701' }, { type: 'downloaded', version: '0.1.4701' });
  assert.match(view(stuck).detail, /^Play this version - it tries again when you quit\. Or run the installer yourself/);
});

test('R2-E (E-43..E-47): the places a copy of Daggerfall is installed - each one run, not assumed', () => {
  const root = mkdtempSync(join(tmpdir(), 'r2-roots-'));
  const whole = (d) => { fsModule.mkdirSync(d, { recursive: true }); for (const n of ['ARCH3D.BSA', 'BLOCKS.BSA', 'MAPS.BSA', 'MONSTER.BSA', 'WOODS.WLD', 'TEXT.RSC', 'ART_PAL.COL']) writeFileSync(join(d, n), 'x'); return d; };
  try {
    // E-43: Daggerfall Unity's settings on Windows are in LocalLow (Unity's persistentDataPath), never Roaming
    const home = join(root, 'win');
    const dfu = whole(join(root, 'dfu-data', 'arena2'));
    fsModule.mkdirSync(join(home, 'AppData', 'LocalLow', 'Daggerfall Workshop', 'Daggerfall Unity'), { recursive: true });
    writeFileSync(join(home, 'AppData', 'LocalLow', 'Daggerfall Workshop', 'Daggerfall Unity', 'settings.ini'), `[Daggerfall]\nMyDaggerfallPath = ${join(root, 'dfu-data')}\n`);
    assert.deepEqual(detectArena2({ platform: 'win32', home, env: { USERPROFILE: home }, regQuery: () => [] }).map((f) => [f.source, f.dir]), [['dfu', fsModule.realpathSync(dfu)]]);
    // E-44: the registry's HKCU (Steam's own key) is read as HKEY_CURRENT_USER
    const reg = 'Windows Registry Editor Version 5.00\r\n\r\n[HKEY_CURRENT_USER\\Software\\Valve\\Steam]\r\n"SteamPath"="d:/games/steam"\r\n';
    assert.deepEqual(createRequire(import.meta.url)('../../app/lib/arena2Detect.cjs').regFileValues(reg, 'HKCU\\Software\\Valve\\Steam', 'SteamPath'), ['d:/games/steam']);
    // E-45/E-47: Flatpak's Steam and Heroic's GOG, on Linux
    const lin = join(root, 'lin');
    const flat = join(lin, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam', 'steamapps');
    fsModule.mkdirSync(flat, { recursive: true });
    writeFileSync(join(flat, 'appmanifest_1812390.acf'), '"AppState" { "installdir" "The Elder Scrolls Daggerfall" }');
    const steamA2 = whole(join(flat, 'common', 'The Elder Scrolls Daggerfall', 'DF', 'DAGGER', 'ARENA2'));
    const heroicA2 = whole(join(lin, 'Games', 'Heroic', 'Daggerfall', 'ARENA2'));
    const linFound = detectArena2({ platform: 'linux', home: lin, env: {}, regQuery: () => [] });
    assert.deepEqual(linFound.map((f) => [f.source, f.dir]), [['steam', fsModule.realpathSync(steamA2)], ['gog', fsModule.realpathSync(heroicA2)]]);
    // E-46: on Windows a folder reached down two spellings of one path is offered once (the disk ignores case)
    const winHome = join(root, 'w2');
    for (const pf of ['ProgramFiles', 'programfiles']) {
      const lib = join(root, pf, 'Steam', 'steamapps');
      fsModule.mkdirSync(lib, { recursive: true });
      writeFileSync(join(lib, 'appmanifest_1812390.acf'), '"AppState" { "installdir" "DF" }');
      whole(join(lib, 'common', 'DF', 'ARENA2'));
    }
    const twice = detectArena2({ platform: 'win32', home: winHome, env: { ProgramFiles: join(root, 'ProgramFiles'), 'ProgramFiles(x86)': join(root, 'programfiles') }, regQuery: () => [] });
    assert.equal(twice.length, 1, `one install, offered once (got ${twice.map((f) => f.dir).join(', ')})`);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

