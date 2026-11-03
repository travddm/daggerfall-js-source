// LEVEL-45:
// the character's level stops at 45, on Daggerfall's sum, and every readout says so.
// AUDIT FB1026d (C1, C2, C4, C5, E3): a level latched before the cap is let go at it - the load, the crossing online,
// both checks, the sheet's door and its rollout - and the windows are driven, not just the law.
// Mutants: tools/mutants/fb1026d_levelcap.json.
import { onlineLevelFor, onlineLevelConvert } from '../../src/systems/levelClimb.js';   // LEVEL-45 online: the conversion at the crossing
import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter } from '../../src/systems/chargen.js';
import { SKILLS, levelUpSkillSum } from '../../src/systems/skills.js';
import { LEVEL_CAP, atLevelCap, releaseCapLatch } from '../../src/systems/levelCap.js';
import { snapshotPlayer, restorePlayer } from '../../src/systems/save/save.js';
import { createCharSheetWindow, levelUpScreenFor } from '../../src/ui/charSheetDoor.js';
import { CharSheet } from '../../src/ui/charsheet.js';
import { checkForLevelUp, applyLevelUp, raiseSkills, calculatePlayerLevel } from '../../src/systems/advancement.js';
import { masterSkill } from '../../src/systems/masterSkills.js';
import { levelProgressPercent } from '../../src/ui/charsheet.js';
import { levelProgress, riseRibbon } from '../../src/ui/levelUp/levelUpView.js';
import { readFileSync } from 'node:fs';

const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const seq = (...v) => { let i = 0; return () => v[Math.min(i++, v.length - 1)]; };
const career = {
  name: 'W', hitPointsPerLevel: 12, advancementMultiplier: 1.0,
  strength: 60, intelligence: 40, willpower: 45, agility: 55, endurance: 60, personality: 40, speed: 50, luck: 50,
  primarySkills: [SKILLS.LongBlade, SKILLS.Axe, SKILLS.CriticalStrike],
  majorSkills: [SKILLS.BluntWeapon, SKILLS.Dodging, SKILLS.Jumping],
  minorSkills: [SKILLS.ShortBlade, SKILLS.Archery, SKILLS.Running, SKILLS.Swimming, SKILLS.Climbing, SKILLS.Medical],
};
const made = () => { const p = { isPlayer: true, reflexes: 2, items: [] }; createCharacter(p, career, 16, { rolls: seq(0) }); return p; };
const counted = [...career.primarySkills, ...career.majorSkills, ...career.minorSkills];

test('LEVEL-45 THE CAP: 45, and a sum far past it owes no level at 45 while one below it still does (mutants: the cap unread; the cap one higher)', () => {
  assert.equal(LEVEL_CAP, 45);
  const p = made();
  p.currentLevelUpSkillSum = p.startingLevelUpSkillSum + 2000;
  assert.ok(calculatePlayerLevel(p.startingLevelUpSkillSum, p.currentLevelUpSkillSum) > 100, 'the sum alone would owe a hundred levels');
  p.level = 44;
  assert.equal(checkForLevelUp(p), true);
  assert.equal(p.pendingLevel, 45);
  assert.equal(applyLevelUp(p, () => {}, seq(0.5)), true);
  assert.equal(p.level, 45);
  assert.equal(checkForLevelUp(p), false, 'at the cap: nothing owed');
  assert.equal(p.readyToLevelUp, false);
  assert.equal(atLevelCap(p), true);
});

test('LEVEL-45 THE REACH: a class whose six counted skills are mastered to 200 under the 3/2/1 masteries reaches the cap and stops there (mutant: the cap unread)', () => {
  const p = made();
  p._online = true;
  for (const s of counted) p.skills[s] = 100;
  for (const s of [SKILLS.LongBlade, SKILLS.Axe, SKILLS.CriticalStrike, SKILLS.BluntWeapon, SKILLS.Dodging, SKILLS.ShortBlade]) assert.equal(masterSkill(p, s).ok, true);
  for (const s of counted) p.skills[s] = 200;
  p.currentLevelUpSkillSum = levelUpSkillSum(p);
  const ceiling = calculatePlayerLevel(p.startingLevelUpSkillSum, p.currentLevelUpSkillSum);
  assert.ok(ceiling > LEVEL_CAP, `the 3/2/1 ceiling (${ceiling}) is past the cap, so the cap is what stops the climb`);
  p.level = 1; p.chargenDone = true; p.lastSkillCheckTime = 0;
  for (let i = 0; i < 80; i++) raiseSkills(p, (i + 1) * 1000, seq(0.5));   // headless: one level a pass
  assert.equal(p.level, LEVEL_CAP);
});

test('LEVEL-45 A LEVEL LATCHED BEFORE THE CAP IS NOT COMMITTED AT IT (mutant: the commit\'s gate dropped)', () => {
  const classic = made();
  classic.level = 45; classic.readyToLevelUp = true; classic.pendingLevel = 46;
  assert.equal(applyLevelUp(classic, () => {}, seq(0.5)), false);
  assert.deepEqual([classic.level, classic.readyToLevelUp, classic.pendingLevel], [45, false, null]);
});

test('LEVEL-45 THE READOUTS: the Level box and the level-up bar read whole at the cap, and a level below it reads its own fraction (mutant: a readout left measuring a next level)', () => {
  const p = made();
  p.level = 45;
  p.currentLevelUpSkillSum = p.startingLevelUpSkillSum + 7;
  assert.equal(levelProgressPercent(p), 100);
  assert.deepEqual(levelProgress(p, null), { now: 1, max: 1, label: 'Highest level reached', cap: true });
  // AUDIT FB1026d II C3: the window's bar says the label alone, no skill row counts toward a next level, and the Level page's lead says the cap
  assert.ok(riseRibbon(p).length > 0 && riseRibbon(p).every((r) => r.note === ''), 'no row\'s note at the cap');
  p.level = 44;
  assert.notEqual(levelProgressPercent(p), 100);
  assert.equal(levelProgress(p, null).label, 'Skill progress to next level');
  assert.ok(riseRibbon(p).some((r) => r.note !== ''), 'below it the rows say what counts');
});

const statSum = (e) => Object.values(e.stats).reduce((a, b) => a + b, 0);
/** A character at `level`, its save from before the cap owing the next (the old check latched it). */
const latched = (level = 50) => { const e = made(); e.level = level; e.readyToLevelUp = true; e.pendingLevel = level + 1; return e; };

test('LEVEL-45 A LEVEL LATCHED PAST THE CAP IS LET GO (AUDIT FB1026d C1): the load lets it go, F5 opens the sheet and never a level-up window that cannot close; the Oghma Infinium\'s latch is kept (mutants: the load\'s release; the door\'s; the rollout door\'s; the check\'s; the book\'s latch let go)', () => {
  // the load: a save that owes level 51
  const saved = JSON.parse(JSON.stringify(snapshotPlayer(latched())));
  assert.equal(saved.readyToLevelUp, true, 'the save carries the latch');
  const back = made();
  restorePlayer(back, saved);
  assert.deepEqual([back.level, back.readyToLevelUp, back.pendingLevel], [50, false, null], 'let go at the load');
  // the door, the latch set some other way (a page that loaded before this law): F5 opens the ordinary sheet
  const e = latched();
  const w = createCharSheetWindow({ entity: e });
  assert.ok(w instanceof CharSheet, `F5 opens the sheet (${w?.constructor?.name})`);
  assert.equal(e.readyToLevelUp, false);
  assert.equal(levelUpScreenFor(latched()), null, 'the Growth tab\'s and the enhanced face\'s door: nothing to roll out');
  // both checks let it go too
  const cc = made();
  cc.level = 45; cc.readyToLevelUp = true; cc.pendingLevel = 46;
  assert.equal(checkForLevelUp(cc), false);
  assert.deepEqual([cc.readyToLevelUp, cc.pendingLevel], [false, null], 'the sum\'s check');
  // the book: thirty points and no level, at the cap too
  const book = made();
  book.level = 45; book.readyToLevelUp = true; book.oghmaLevelUp = true;
  assert.equal(releaseCapLatch(book), false);
  assert.equal(checkForLevelUp(book), false);
  assert.equal(book.readyToLevelUp, true, 'the book\'s latch stands');
});

test('LEVEL-45 THE BOOK\'S LATCH ENDS AT A LOAD (AUDIT FB1026d II C2): restored in place over a game whose Oghma Infinium was read and left unspent, a save owing a level past the cap is let go, and one below it owes an ordinary level - never the book\'s thirty points with the book back in the pack (mutant: the latch kept across the load)', () => {
  const read = (e) => { e.readyToLevelUp = true; e.oghmaLevelUp = true; return e; };   // artifactEffects.js: the book read, the sheet left unspent
  const past = read(made());
  past.level = 45;
  restorePlayer(past, JSON.parse(JSON.stringify(snapshotPlayer(latched()))));
  assert.deepEqual([past.oghmaLevelUp, past.readyToLevelUp], [false, false], 'past the cap: the save\'s latch let go, the book\'s gone');
  assert.equal(levelUpScreenFor(past), null, 'and no rollout');
  const below = read(made());
  const saved = made();
  saved.level = 10;
  restorePlayer(below, JSON.parse(JSON.stringify(snapshotPlayer(saved))));
  assert.equal(below.oghmaLevelUp, false, 'below it: the book\'s latch gone with the game that read it');
  below.readyToLevelUp = true;
  assert.equal(checkForLevelUp(below) || below.readyToLevelUp, true);
  assert.notEqual(levelUpScreenFor(below)?.oghma, true, 'the next level is an ordinary one');
});

test('LEVEL-45 THE CLASSIC SHEET HANDS OUT NO POOL AT THE CAP, AND THE ONLINE CONVERSION LETS A LEVEL OWED PAST IT GO (AUDIT FB1026d C2): the rollout never mounts for a level latched past the cap, and a character at the cap owes nothing at its realm join (mutants: the rollout unguarded; the conversion\'s release)', () => {
  const e = made();
  e.level = 45; e.readyToLevelUp = true; e.pendingLevel = 46; e.pendingBonusPool = 6;
  const before = statSum(e);
  const sheet = new CharSheet(e, {}, seq(0.5));
  assert.equal(sheet.leveling, false, 'no rollout');
  for (let i = 0; i < 10; i++) sheet.input('plus');
  sheet.input('Escape');
  assert.deepEqual([statSum(e), e.level, e.readyToLevelUp], [before, 45, false], 'no free points, no level');
  // the realm join: a character at 50 with a level owed
  const snap = JSON.parse(JSON.stringify(snapshotPlayer(latched())));
  assert.equal(onlineLevelConvert(snap), true);
  assert.equal(snap.readyToLevelUp, false, 'no level owed online');
  // the level it has is held to what its skills earn online, and never above the cap
  assert.equal(snap.level, Math.min(50, onlineLevelFor(snap.startingLevelUpSkillSum, snap.currentLevelUpSkillSum)));
  assert.ok(snap.level <= 45);
});

test('LEVEL-45 PAST THE CAP (AUDIT FB1026d C5): a character kept above 45 owes no level, and its Level box says the cap as the cap (mutants: the cap read as one level; the box\'s cap text dropped)', () => {
  const c = made();
  c.level = 50; c.currentLevelUpSkillSum = c.startingLevelUpSkillSum + 2000;
  assert.equal(checkForLevelUp(c), false);
  const box = (e) => { const s = new CharSheet(e, {}, seq(0.5)); s._showLevel(); return s.child.lines.join(' '); };
  assert.equal(box(c), 'The highest level is 45: no more levels are gained.');
  c.level = 45;
  assert.equal(box(c), 'The highest level is 45: no more levels are gained.');
  c.level = 44;
  assert.match(box(c), /^Progress made to the next level: \d+%$/);
});
