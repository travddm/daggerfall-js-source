// F5-QUESTS: on the enhanced skin F5 opens the
// pause window on its Stats page (PX27) - the SAME window Tab's dial opens through the host's pause door - and F5's
// door handed it the sheet's four buttons and nothing else. So on F5's copy the Quests tab said "The journal is not
// wired into this place yet" while Tab's listed every quest, Save and Load said there was no door, and Exit did
// nothing. Each host's pause bag is ONE arm now, spread by its pause door and handed to its sheet builder; the act
// and the slot seams are pauseDoor's own, shared by both doors; and routeKey's position applier rides F5 into the
// dungeon's bag as it rides Escape.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pauseMenuHooks, pauseMenuAct, pauseOpts } from '../../src/ui/pauseDoor.js';
import { routeAction } from '../../src/ui/input.js';

const rd = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

/** The `{...}` literal after `opener`, braces balanced past strings and comments. */
function literalBody(text, opener) {
  const i = text.indexOf(opener);
  assert.ok(i >= 0, `could not find ${opener}`);
  const open = text.indexOf('{', i + opener.length);
  let depth = 0;
  for (let k = open; k < text.length; k++) {
    const c = text[k];
    if (c === '/' && text[k + 1] === '/') { k = text.indexOf('\n', k); continue; }
    if (c === '/' && text[k + 1] === '*') { k = text.indexOf('*/', k) + 1; continue; }
    if (c === '\'' || c === '"' || c === '`') {
      const q = c;
      for (k++; k < text.length; k++) { if (text[k] === '\\') k++; else if (text[k] === q) break; }
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return text.slice(open, k + 1);
  }
  throw new Error(`unbalanced literal after ${opener}`);
}
const STUB = new Proxy(function stub() {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => 'STUB' : STUB), apply: () => STUB });
/** Build the literal with every free name resolved from `env`, or a stub. */
function mountLiteral(text, opener, env = {}) {
  const scope = new Proxy({ ...env }, {
    has: () => true,
    get: (t, k) => (k === Symbol.unscopables ? undefined : (k in t ? t[k] : STUB)),
  });
  // eslint-disable-next-line no-new-func
  return new Function('__scope', `with (__scope) { return (${literalBody(text, opener)}); }`)(scope);
}

test('F5-QUESTS: the pause window\'s one act and one slot routing, shared by both doors - down first, relock but on the way to the menu, a picked slot onto the host\'s own seams', () => {
  const seen = [];
  const hooks = pauseMenuHooks({
    quickSave: () => seen.push('quickSave'), quickLoad: () => seen.push('quickLoad'),
    saveAs: (n) => seen.push(`saveAs:${n}`), loadKey: (k) => seen.push(`loadKey:${k}`),
    relock: () => seen.push('relock'), exitToMenu: () => seen.push('exit'),
  }, () => ({ takePickedSaveName: () => 'Slot A', takePickedSaveKey: () => 7 }));
  const act = pauseMenuAct(hooks, () => seen.push('close'));
  act('save'); act('load'); act('exit'); act('resume');
  assert.deepEqual(seen, ['close', 'relock', 'saveAs:Slot A', 'close', 'relock', 'loadKey:7', 'close', 'exit', 'close', 'relock']);
  // nothing picked, or a host with no slot seams: the quick verbs
  const quick = [];
  const bare = pauseMenuHooks({ quickSave: () => quick.push('qs'), quickLoad: () => quick.push('ql'), saveAs: () => quick.push('saveAs') }, () => null);
  bare.quickSave(); bare.quickLoad();
  assert.deepEqual(quick, ['qs', 'ql']);
  // DISC22-B's return to the classic window is the act's too
  const back = [];
  pauseMenuAct({ onResume: () => back.push('back'), relock: () => back.push('relock') }, () => back.push('close'))('resume');
  assert.deepEqual(back, ['close', 'back']);
});

test('F5-QUESTS: F5 carries routeKey\'s position applier into the sheet, as Escape carries it into the pause door', () => {
  const got = [];
  assert.equal(routeAction('CharacterSheet', { toggleCharSheet: (o) => got.push(o) }, 'APPLIER'), true);
  assert.deepEqual(got, [{ setPlayerPos: 'APPLIER' }]);
  // the hosts that need none take none - the arrow ignores the bag
  assert.equal(routeAction('CharacterSheet', { toggleCharSheet: () => got.push('bare') }), true);
});
