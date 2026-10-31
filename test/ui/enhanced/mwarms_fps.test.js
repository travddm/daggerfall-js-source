// MWA1 + FPS1 (2026-09-11, RookieG's report via Mac: "morrowind arms
// did not work on first launch" / "we need an ingame fps counter").
// The pure halves EXECUTE; the DOM half runs against AUDIT 62's stub
// document; the hosts and the pane are text-pinned. Every pin names
// its mutant.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fpsStats, mountFpsCounter } from '../../../src/ui/fpsCounter.js';
import { autoBuildArms, armsStandFor, armIdentityOf } from '../../../src/combat/weapon/weaponRig.js';
import { PREF_DEFAULTS } from '../../../src/systems/uiPrefs.js';
import { morrowindCard, morrowindArmsLine, morrowindTroubleLines, MW_CARD_LINE } from '../../../src/ui/enhanced/enhancedMenu.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

// ---------------------------------------------------------------
// FPS1 - the numbers
// ---------------------------------------------------------------
test('FPS1 fpsStats: frames a second from the stamps, the mean frame, and the WORST frame a mean hides (mutant: worst dropped, or fps counted as stamps rather than intervals)', () => {
  const sixty = Array.from({ length: 61 }, (_, i) => i * (1000 / 60));   // 60 intervals across one second
  const s = fpsStats(sixty);
  assert.equal(s.fps, 60);
  assert.ok(Math.abs(s.meanMs - 1000 / 60) < 1e-9);
  assert.ok(Math.abs(s.worstMs - 1000 / 60) < 1e-9, 'a steady second: worst is the mean');
  // a steady 60 with ONE 90 ms hitch
  const hitch = [...sixty]; for (let i = 31; i < hitch.length; i++) hitch[i] += 90 - 1000 / 60;
  const h = fpsStats(hitch);
  assert.ok(Math.abs(h.worstMs - 90) < 1e-9, `the stutter is reported: ${h.worstMs}`);
  assert.ok(h.fps < 60 && h.fps >= 55, `and the second held fewer frames: ${h.fps}`);
  assert.deepEqual(fpsStats([]), { fps: 0, meanMs: 0, worstMs: 0 });
  assert.deepEqual(fpsStats([5]), { fps: 1, meanMs: 0, worstMs: 0 }, 'one stamp is one frame and no interval');
});

test('FPS1 mountFpsCounter: hidden while its switch is off, shown and written once a second while on, disposed cleanly (mutant: the switch read once at mount, or the element written while hidden)', () => {
  const prev = { d: globalThis.document };
  const made = [];
  const stubEl = () => {
    const n = { id: '', textContent: '', style: { cssText: '', display: '' }, children: [], appendChild(c) { this.children.push(c); return c; }, remove() { this.removed = true; } };
    made.push(n); return n;
  };
  globalThis.document = { createElement: stubEl, body: stubEl() };
  try {
    let on = false;
    const c = mountFpsCounter({ enabled: () => on, raf: null });   // no frame loop: the test drives tick
    assert.equal(c.el.style.display, 'none', 'hidden at mount');
    for (let t = 0; t <= 1000; t += 1000 / 60) c.tick(t);
    assert.equal(c.el.textContent, '', 'nothing is written while off');
    on = true;
    c.tick(1020);
    assert.equal(c.el.style.display, 'block', 'the switch is read on the tick, not at mount');
    for (let t = 1020 + 1000 / 60; t <= 2040; t += 1000 / 60) c.tick(t);
    assert.match(c.el.textContent, /^6\d fps\n1\d\.\d ms  worst \d+$/, `the second's numbers: ${JSON.stringify(c.el.textContent)}`);
    on = false;
    c.tick(2060);
    assert.equal(c.el.style.display, 'none', 'and off again at once');
    c.dispose();
    assert.equal(c.el.removed, true);
  } finally { globalThis.document = prev.d; }
});

// ---------------------------------------------------------------
// MWA1 - the arms at boot
// ---------------------------------------------------------------
test('MWA1 autoBuildArms: nothing without a made character or without the archives - MWA4: the attached files are the switch (mutant: any gate dropped)', async () => {
  const made = { chargenDone: true };
  assert.equal(await autoBuildArms(null, { dataCount: () => 1 }), null);
  assert.equal(await autoBuildArms({ chargenDone: false }, { dataCount: () => 1 }), null, 'the wizard has not run: race, sex and face are not known');
  assert.equal(await autoBuildArms(made, { dataCount: () => 0 }), null, 'no archives attached - Remove data is the off');
});

// ---------------------------------------------------------------
// MWA3 - the arm stands FOR the entity, not merely stands
// ---------------------------------------------------------------
// Mac, 2026-09-16: "my character who is an argonian uses a human
// morrowind model". fpArm is one module singleton for the session and
// autoBuildArms's last gate was `fpArm.ready()` - so whichever identity
// first reached a door (the wizard's character, an earlier save, a
// ?test preset) owned the arm, and a save loaded over it in-session
// kept that arm's race, sex and face; setWorn's equip-follow rebuilds
// spread lastBuildOpts and carried the stale identity forward. An
// Argonian on the human skeleton, no tail, until the pack's Off/On.
test('MWA3 armsStandFor: a standing arm counts only when its race, sex and face are the entity\'s own (mutant: any of the three dropped, or ready() alone)', () => {
  const argonian = { race: 'Argonian', gender: 'female', faceIndex: 3 };
  const forHer = { race: 'argonian', female: true, faceIndex: 3 };
  assert.equal(armsStandFor(argonian, { ready: () => true, builtFor: () => forHer }), true, 'her own arm stands');
  assert.equal(armsStandFor(argonian, { ready: () => false, builtFor: () => forHer }), false, 'no arm stands');
  assert.equal(armsStandFor(argonian, { ready: () => true, builtFor: () => null }), false, 'ready with no build record is not hers');
  assert.equal(armsStandFor(argonian, { ready: () => true, builtFor: () => ({ ...forHer, race: 'breton' }) }), false, 'a human\'s arm is not hers - the report');
  assert.equal(armsStandFor(argonian, { ready: () => true, builtFor: () => ({ ...forHer, female: false }) }), false, 'the male skeleton is not hers');
  assert.equal(armsStandFor(argonian, { ready: () => true, builtFor: () => ({ ...forHer, faceIndex: 4 }) }), false, 'another face is not hers');
  // PIN MOVED (PORTRAIT3D): and the curse's face - a vampire's body wears the race's vampire head
  assert.deepEqual(armIdentityOf({ race: 'DarkElf', gender: 'male', faceIndex: 7 }), { race: 'dark elf', female: false, faceIndex: 7, werewolf: false, vampire: false }, 'the identity third of armBuildOptsOf, in the ESM\'s own race spelling');
  assert.deepEqual(armIdentityOf(null), { race: null, female: false, faceIndex: 0, werewolf: false, vampire: false }, 'no entity, no identity - never a throw at a boot door');
});

test('MWA3 autoBuildArms: an arm standing for ANOTHER identity is no longer a reason to stand down - the load\'s door rebuilds (mutant: the gate reads ready() again)', async () => {
  const made = { chargenDone: true, race: 'Argonian', gender: 'male', faceIndex: 0 };
  let built = 0;
  const measure = async () => { built += 1; throw new Error('a test has no store - the gate is the pin, not the build'); };
  assert.equal(await autoBuildArms(made, { dataCount: () => 1, standing: () => true, measure, measured: () => null }), null, 'her own arm stands: nothing to do');
  assert.equal(built, 0);
  const res = await autoBuildArms(made, { dataCount: () => 1, standing: () => false, measure, measured: () => null });
  assert.equal(built, 1, 'another identity\'s arm (or none) stands: the door goes on to the build');
  assert.ok(res && res.ok === false, 'the build itself refuses in a test (no archives), which is a result, not null');
});

test('MWA1 pins: the hosts build at every door a made character arrives through - MWA4: with the files attached, no switch between (mutant: a door dropped, or the switch back)', () => {
  assert.equal(Object.hasOwn(PREF_DEFAULTS, 'mwArms'), false, 'MWA4: the switch is retired - the attached files are it');
  assert.equal(PREF_DEFAULTS.showFps, false, 'a diagnostic is off by default');
});

// ---------------------------------------------------------------
// MWA4 - the assets card, reorganized
// ---------------------------------------------------------------
function cardDom() {
  const mk = (tag) => {
    const n = {
      tag, children: [], className: '', onclick: null, disabled: false, _text: '',
      get textContent() { return n._text + n.children.map((c) => c.textContent).join(''); },
      set textContent(v) { n._text = String(v); n.children.length = 0; },
      append(...cs) { for (const c of cs) n.children.push(c); },
      setAttribute() {},
    };
    return n;
  };
  return { createElement: mk };
}
const kids = (n, tag) => n.children.filter((c) => c.tag === tag);
function readCard(opts) {
  const prev = globalThis.document;
  globalThis.document = cardDom();
  try {
    const card = morrowindCard(opts);
    const [dl] = kids(card, 'dl');
    const rows = Object.fromEntries(kids(dl, 'dt').map((dt, i) => [dt.textContent, kids(dl, 'dd')[i].textContent]));
    const buttons = kids(card, 'div').flatMap((d) => kids(d, 'button'));
    return { card, rows, buttons: buttons.map((b) => b.textContent), primary: buttons.filter((b) => /primary/.test(b.className)).map((b) => b.textContent), lines: kids(card, 'p').map((p) => p.textContent) };
  } finally { globalThis.document = prev; }
}

test('MWA4 (before the merge: "reorganize the marrowind attachment selector, remove the on and off button (defunct) and only keep attach and remove data buttons. Only reduce the amount of over explaining text"): the card is a title, one line, the data and the arms, and Attach / Remove - nothing else while everything works (mutant: a button or a switch back, or a readout line)', () => {
  // nothing attached: the one door in, and it is the primary
  let c = readCard({ count: 0, armState: { active: false, reason: 'not built' } });
  assert.equal(kids(c.card, 'h3')[0].textContent, 'Morrowind assets');
  assert.deepEqual(c.lines, [MW_CARD_LINE], 'one line says what the files do');
  assert.deepEqual(c.rows, { Data: 'none attached' });
  assert.deepEqual(c.buttons, ['Attach data']);
  assert.deepEqual(c.primary, ['Attach data']);
  assert.equal(c.card.children.length, 4, 'title, line, readings, buttons - no switch rows');
  // attached and standing: the two buttons, the two readings, not one line more
  c = readCard({ count: 3, armState: { active: true, reason: 'built', notes: [], third: { ok: true }, esm: { raceIsThere: true } } });
  assert.deepEqual(c.rows, { Data: '3 archives attached', Arms: 'On' });
  assert.deepEqual(c.buttons, ['Attach data', 'Remove data'], 'Attach and Remove alone');
  assert.deepEqual(c.primary, [], 'nothing to urge once attached');
  assert.deepEqual(c.lines, [MW_CARD_LINE], 'no readout while everything works');
  // a build that did not stand says why - the reason on the card, beside the buttons (MWDIAG)
  c = readCard({ count: 1, armState: { active: false, reason: 'skeleton: no base_anim.nif', notes: ['torch: none'], third: { ok: false, stage: 'body', error: 'no records' }, esm: { raceIsThere: false, raceWanted: 'argonian', racesFound: ['breton', 'nord'] } } });
  assert.deepEqual(c.rows, { Data: '1 archive attached', Arms: 'skeleton: no base_anim.nif' });
  assert.deepEqual(c.lines.slice(1), [
    'Not in the arms: torch: none',
    'Third person refused - body: no records',
    'Your files carry no "argonian" body (they have: breton, nord).',
  ]);
  assert.equal(morrowindArmsLine({ active: false, reason: 'unloaded' }), 'Builds when you play', 'attached but not built yet: it builds at the next door');
  assert.deepEqual(morrowindTroubleLines(null), []);
  assert.ok(MW_CARD_LINE.length < 160, 'one line, not two paragraphs');
});
