// BR1 - DAGGERFALL ENHANCED (2026-09-13, Mac: "I want to rebrand across
// the board as Daggerfall Enhanced ... Daggerfall Enhanced / An
// open-source reimplementation of The Elder Scrolls II: Daggerfall. We
// need to tackle any javascript mention across the website, game, and
// note this in the bible").
//
// THE NAME HAD NO PIN AT ALL. The rebrand touched nine surfaces - the
// landing page's title, wordmark and cards, the game page, the PWA
// manifest, the Electron shell's product name and window title, the
// About panel, the two document.title writers - and the whole suite
// stayed green through every one of them, which is the definition of an
// unguarded law. A name that lives in nine files and is checked in none
// drifts the moment somebody edits eight.
//
// So this file is the name's one home. There is no brand module to
// import because three of the surfaces are static HTML and one is a
// JSON manifest; the constants below are the source, and every surface
// is asserted against them.
//
// It also pins what did NOT change, and why. The GitHub repository
// (Lattymoy/daggerfall-js-source), the live domain (daggerfalljs.dev)
// and the desktop app's identifier (dev.daggerfalljs.app) still carry
// the old spelling. Those are not branding, they are keys other systems
// hold: renaming the repo breaks every link in the bible and every
// release URL, changing the domain breaks the site, and changing the
// appId orphans every installed copy from its updates - an install-over
// becomes a second app beside the first. Each is a move outside this
// tree, so each is pinned as deliberately unchanged rather than left to
// look like an oversight.
//
// BR4 - DAGGERFALL ONLINE (2026-09-27, Mac: "I want to rebrand Daggerfall:
// Enhanced to Daggerfall Online across every surface of the game and
// website. The logo attached is the new temporary logo ... (Don't forget
// about the intro video also)"). The same surfaces again, pinned HERE
// again: NAME below is the only line that says what the product is called,
// and the old name is swept for in both its whole and its split forms.
// The logo is Mac's own transparent cut, drawn with no blend mode.
//
// BR5 - DFO ONLINE (2026-10-11, Mac: "So next up I want to replace the current
// daggerfall online logo anywhere it's present with this logo. I want to
// comprehensively scan the repo, ingame, etc for any mentions of
// daggerfall/daggerfall online and change it to DFO Online/DFO. We are
// rebranding for our own sake and I want to do this right"; asked how far, he
// chose to MINIMIZE the original game's name too). Three laws now, each
// pinned below: the PRODUCT is DFO Online (DFO where a label is short); the
// ORIGINAL GAME is named only where it must be - the files a player brings,
// the credits and the licence, the trademark notice, and the world's own
// places, which are the game's and not the product's; everywhere else a
// player reads "the original game" or "classic". And the KEYS other systems
// hold keep their spelling, as BR1 ruled - each is listed with what moving it
// would break.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

/** The name, its short form, its form in a file name, and the one sentence
 *  that says what it is - which names no other game (BR5). */
const NAME = 'DFO Online';
const SHORT_NAME = 'DFO';
const FILE_NAME = 'DFO-Online';
const TAGLINE = 'An open-source reimplementation of a classic 1996 RPG';

test('BR1: no surface still says the old name', () => {
  // git grep, so the sweep is over what is TRACKED - dist/ is a build
  // output and node_modules is not ours.
  // git grep exits 1 when it finds NOTHING, which is the passing case.
  let hits = '';
  try {
    hits = execFileSync('git', ['grep', '-n', '-E', 'Daggerfall ?JavaScript|DaggerfallJS|Daggerfall JS\\b', '--', ':!bible', ':!test/ui/brand.test.js'],
      { cwd: root, encoding: 'utf8' }).trim();
  } catch (e) {
    assert.equal(e.status, 1, `git grep failed: ${e.stderr || e.message}`);
  }
  // THE ONE EXEMPTION, and it is a path not a name: the desktop shell's
  // storage root keeps the folder the shipped versions created, so the
  // old spelling appears there on purpose. It is pinned below.
  const survivors = hits.split('\n').filter((l) => l && !/appData/.test(l)).join('\n');
  assert.equal(survivors, '', `the old name survives:\n${survivors}`);

  // ...and the split form the adjacency sweep above is blind to.
  let split = '';
  try {
    split = execFileSync('git', ['grep', '-n', '-E', "<small>JavaScript</small>|el\\('small', null, 'JavaScript'\\)", '--', ':!test/ui/brand.test.js'],
      { cwd: root, encoding: 'utf8' }).trim();
  } catch (e) {
    assert.equal(e.status, 1, `git grep failed: ${e.stderr || e.message}`);
  }
  assert.equal(split, '', `a wordmark still spells the old name across two elements:\n${split}`);
});

test('BR4: no surface still says the old name - whole, or split across a wordmark', () => {
  // The BR1 sweep, for the name BR1 gave it. Case-sensitive, so Mac's
  // lower-case "keep the daggerfall Enhanced title" (the landing page's
  // and its test's quote of him) is no hit; the capitalised survivors are
  // named below. The bible is the record of what the project was called
  // when, and is not swept.
  let hits = '';
  try {
    // Nor are the mutant records: a record's `new` is the old name ON
    // PURPOSE - it is how tools/mutants/br4.json proves this sweep fails.
    hits = execFileSync('git', ['grep', '-n', '-E', 'Daggerfall ?Enhanced|DaggerfallEnhanced', '--', ':!bible', ':!test/ui/brand.test.js', ':!tools/mutants'],
      { cwd: root, encoding: 'utf8' }).trim();
  } catch (e) {
    assert.equal(e.status, 1, `git grep failed: ${e.stderr || e.message}`);
  }
  // THE SURVIVORS ARE WORDS SOMEONE SAID OR WROTE DOWN AT THE TIME, each
  // named: a player's Discord question (REL2), Mac's BR3 ruling as the
  // landing test quotes it, and REL2's record of the file the release
  // actually carried. None is a surface. (The patch notes announcing the
  // rename were a fourth until REL6 took notes out of the tree. The sweep
  // reads git's INDEX: the first run of this pin went green with those
  // notes and br4.json on disk but not yet added, and red in CI on the
  // commit that carried them.)
  const SAID = [
    /^test\/tooling\/relwin1\.test\.js:[23]:\/\/ /,
    /^test\/tooling\/relwin1\.test\.js:9:\/\/ `artifactName`, so both wrote DaggerfallEnhanced-<v>-win-x64\.exe/,
    /^test\/ui\/enhanced\/landing\.test\.js:\d+:\s*\/\/ logo to the original Daggerfall Enhanced text"\)/,
  ];
  const survivors = hits.split('\n').filter((l) => l && !SAID.some((re) => re.test(l))).join('\n');
  assert.equal(survivors, '', `the old name survives:\n${survivors}`);

  let split = '';
  try {
    split = execFileSync('git', ['grep', '-n', '-E', "<small>Enhanced</small>|el\\('small', null, 'Enhanced'\\)", '--', ':!bible', ':!test/ui/brand.test.js', ':!tools/mutants'],
      { cwd: root, encoding: 'utf8' }).trim();
  } catch (e) {
    assert.equal(e.status, 1, `git grep failed: ${e.stderr || e.message}`);
  }
  assert.equal(split, '', `a wordmark still spells the old name across two elements:\n${split}`);
});

