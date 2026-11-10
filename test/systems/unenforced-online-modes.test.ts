// Online, the modes online play does not enforce yet are not created. The picker side is in
// test/ui/charactermodechoice.test.js.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UNENFORCED_ONLINE_MODES, withoutUnenforcedModes } from '../../src/systems/unenforced-online-modes.ts';
import { CHARACTER_MODES, creatableModes } from '../../src/net/modeLaw.js';

test('every unenforced mode is a mode, and Classic and Legacy are not among them', () => {
  for (const mode of UNENFORCED_ONLINE_MODES) assert.ok(CHARACTER_MODES.includes(mode), mode);
  assert.ok(!UNENFORCED_ONLINE_MODES.includes('classic'));
  assert.ok(!UNENFORCED_ONLINE_MODES.includes('legacy'));
});

test('a profile that offers every mode still creates only Classic and Legacy once the unenforced modes are hidden', () => {
  const everything = { hardcore: true, legacy: true, ironman: true, hardcore_ironman: true };
  assert.deepEqual(creatableModes(withoutUnenforcedModes(everything)), ['classic', 'legacy']);
  assert.deepEqual(
    creatableModes(withoutUnenforcedModes({ legacy: false })),
    ['classic'],
    'the profile still turns Legacy off',
  );
});
