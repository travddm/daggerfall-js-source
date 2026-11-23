// HOLD-STEP. The Enhanced Plus spell maker's spinners: a held button repeats its press - after 400 ms, then
// every 100, then every 40 - and the value between the buttons is a field a number is typed into, set by the step's
// own law (clamped to the spinner's range, the magnitude pair rule, the cost). Never DFU's (UpDownSpinner steps once a
// click); the classic window keeps its click. Measured in Chromium over the port (a scratch probe): a 1.2 s hold is
// nine repeats and its release adds none, a 0.2 s press is one step, 42 and 7 typed set, "abc" and Escape put the
// value back, a disabled spinner has no field.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HOLD_REPEAT, holdRepeatDelay, typedSpinValue } from '../../../src/ui/enhanced/enhancedPort.js';
import { setSetting, blankEffectSettings, SPINNER_RANGES, SPELLBOOK_TEMPLATE_INDEX } from '../../../src/systems/spell/spellMaker.js';
import { SpellMakerWindow, SPELL_MAKER_RECTS } from '../../../src/ui/spell/spellMakerWindow.js';
import { spellMakerGroups, spellMakerSubgroups } from '../../../src/systems/spell/spellEffects.js';
import { PORT_SPECS } from '../../../src/ui/enhanced/enhancedPorts.js';

const rd = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const editorOn = (group, subgroup) => {
  const w = new SpellMakerWindow({ entity: { name: 'S', level: 1, stats: {}, skills: [50], maxMagicka: 40, goldPieces: 100000,
    items: [{ group: 'MiscItems', templateIndex: SPELLBOOK_TEMPLATE_INDEX }], spells: [] } });
  const [x, y] = SPELL_MAKER_RECTS.addEffect;
  w.click(x + 1, y + 1);
  w.picker.selectedIndex = spellMakerGroups().indexOf(group);
  w.picker.input('Enter');
  w.picker.selectedIndex = spellMakerSubgroups(group).findIndex((e) => e.subgroup === subgroup);
  w.picker.input('Enter');
  return w;
};

test('HOLD-STEP: the hold\'s clock - the first repeat after 400 ms, then every 100, every 40 after ten; 1 to 100 in under five seconds', () => {
  assert.deepEqual({ ...HOLD_REPEAT }, { delay: 400, every: 100, fast: 40, fastAfter: 10 });
  assert.deepEqual([0, 1, 9, 10, 50].map(holdRepeatDelay), [400, 100, 100, 40, 40]);
  let t = 0;
  for (let n = 0; n < 99; n++) t += holdRepeatDelay(n);
  assert.ok(t < 5000, `a whole 1-100 field in ${t} ms`);
});

test('HOLD-STEP: a typed value is one to three digits, or nothing - and the step\'s law sets it: clamped to the range, the pair rule', () => {
  assert.deepEqual(['42', ' 7 ', '100', '0'].map(typedSpinValue), [42, 7, 100, 0]);
  for (const bad of ['', 'abc', '1000', '-5', '3.5', '1e2', null, undefined]) assert.equal(typedSpinValue(bad), null, String(bad));
  const s = blankEffectSettings();
  assert.equal(setSetting(s, 'durationBase', 500).durationBase, SPINNER_RANGES.durationBase[1], 'clamped to 60');
  assert.equal(setSetting(s, 'chanceBase', 0).chanceBase, 1, 'and to the floor');
  const m = setSetting(s, 'magnitudeBaseLow', 80);
  assert.deepEqual([m.magnitudeBaseLow, m.magnitudeBaseHigh], [80, 80], 'raising the minimum drags the maximum');
  assert.equal(s.magnitudeBaseLow, 1, 'the settings handed in are not written');
});

test('HOLD-STEP: the editor sets a typed value where its spinner steps - refused where it is off - and the spinner carries the field', () => {
  const w = editorOn('Damage', 'Health');   // magnitude only
  const ed = w.editor;
  let changed = 0;
  ed.deps.onSettingsChanged = ((prev) => () => { changed++; prev?.(); })(ed.deps.onSettingsChanged);
  ed.setValue('magnitudeBaseHigh', 37);
  assert.equal(w.slots[0].settings.magnitudeBaseHigh, 37);
  assert.equal(changed, 1, 'the cost follows, as a step\'s does');
  ed.setValue('durationBase', 20);
  assert.equal(w.slots[0].settings.durationBase, 1, 'a disabled spinner takes no value');
  ed.setValue('magnitudeBaseHigh', NaN);
  assert.equal(w.slots[0].settings.magnitudeBaseHigh, 37, 'nor does not-a-number');
  // the port's view: each enabled spinner hands a setter and its range to the field
  const view = PORT_SPECS.spellMaker.view(w);
  const spins = view.blocks.filter((b) => b.type === 'group').flatMap((g) => g.blocks);
  const hi = spins.find((b) => b.label === 'Base max');
  assert.deepEqual([hi.min, hi.max, typeof hi.set], [1, 100, 'function']);
  hi.set(64);
  assert.equal(w.slots[0].settings.magnitudeBaseHigh, 64);
});

