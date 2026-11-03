// THE ONE-TIME QUESTION SCREEN AND ITS ENHANCED PLUS FACE (ui/choiceScreen.js, ui/enhanced/enhancedChoiceFace.js).
// A question of making a character (Project Legacy's model is the live one) wears the Plus window on Enhanced Plus: the
// shell, the frame, a tile per answer; a shut answer is shown with its reason and answers nothing; the face follows the
// cursor and leaves when its draws stop. The classic skin keeps the canvas screen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ChoiceScreen } from '../../src/ui/choiceScreen.js';
import {
  CHOICE_FACE_ID,
  choiceFaceOwner,
  releaseChoiceFace,
  _setChoiceFaceClockForTests,
} from '../../src/ui/enhanced/enhancedChoiceFace.js';
import { _frameForTests, DRAW_FRAMES_UNDRAWN } from '../../src/ui/drawWatchdog.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const FONT = {
  fnt: { fixedHeight: 9, fixedWidth: 4, glyphWidth: () => 4 },
  tex: 'tex:font',
  cols: 16,
  rows: 16,
  cw: 8,
  ch: 8,
};
const CANVAS = { width: 640, height: 400 };
const recorder = () => ({
  quads: 0,
  drawScreenQuad() {
    this.quads++;
  },
});

function fakeNode(tag) {
  const n = {
    tagName: tag.toUpperCase(),
    children: [],
    parent: null,
    className: '',
    textContent: '',
    id: '',
    type: '',
    style: {},
    attrs: {},
    dataset: {},
    onclick: null,
    onpointerenter: null,
    disabled: false,
    append(...cs) {
      for (const c of cs) {
        c.parent = n;
        n.children.push(c);
      }
    },
    setAttribute(k, v) {
      n.attrs[k] = v;
    },
    remove() {
      if (n.parent) {
        n.parent.children.splice(n.parent.children.indexOf(n), 1);
        n.parent = null;
      }
      n.removed = true;
    },
  };
  n.classList = {
    toggle(c, on) {
      const set = new Set(n.className.split(/\s+/).filter(Boolean));
      if (on) set.add(c);
      else set.delete(c);
      n.className = [...set].join(' ');
    },
  };
  return n;
}
function fakeDocument() {
  const doc = { createElement: (t) => fakeNode(t) };
  doc.head = fakeNode('head');
  doc.body = fakeNode('body');
  doc.documentElement = fakeNode('html');
  const byId = (n, id) => {
    if (n.id === id) return n;
    for (const c of n.children) {
      const f = byId(c, id);
      if (f) return f;
    }
    return null;
  };
  doc.getElementById = (id) => byId(doc.head, id) ?? byId(doc.body, id);
  return doc;
}
const find = (n, cls, out = []) => {
  if (typeof n.className === 'string' && n.className.split(/\s+/).includes(cls)) out.push(n);
  for (const c of n.children ?? []) find(c, cls, out);
  return out;
};
function withPage(search, fn, { doc = false } = {}) {
  const hadLoc = Object.hasOwn(globalThis, 'location') ? globalThis.location : undefined;
  const hadDoc = Object.hasOwn(globalThis, 'document') ? globalThis.document : undefined;
  globalThis.location = { search };
  const d = doc ? fakeDocument() : null;
  if (d) globalThis.document = d;
  try {
    return fn(d);
  } finally {
    if (hadLoc === undefined) delete globalThis.location;
    else globalThis.location = hadLoc;
    if (hadDoc === undefined) delete globalThis.document;
    else globalThis.document = hadDoc;
  }
}

const FACE_TEXT = Object.freeze({
  eyebrow: 'A new character',
  title: 'Pick one',
  lead: 'Choose.',
  pick: 'Choose',
  hint: 'Click one',
});
const SHUT_NOTE = 'Offline characters only';
const option = (id, locked = false) =>
  Object.freeze({ id, title: id, locked, lockNote: locked ? SHUT_NOTE : null, lines: Object.freeze(['a line']) });
const question = (onAnswer, options = [option('first'), option('second')]) =>
  new ChoiceScreen(onAnswer, {
    options,
    text: { title: 'PICK ONE', lines: ['Choose.', 'It cannot be changed later.'] },
    faceText: FACE_TEXT,
  });

test('CHOICE-FACE: on Enhanced Plus the question wears the Plus window - the shell, the frame, a tile per answer', () => {
  _setChoiceFaceClockForTests(
    () => null,
    () => {},
  );
  withPage(
    '?skin=enhanced',
    (doc) => {
      const got = [];
      const q = question((id) => got.push(id), [option('first'), option('second', true)]);
      const r = recorder();
      q.draw(r, CANVAS, FONT);
      assert.equal(r.quads, 0, 'the canvas screen does not draw under the face');
      const root = doc.getElementById(CHOICE_FACE_ID);
      assert.ok(root, 'the face is on the page');
      assert.equal(choiceFaceOwner(), q);
      for (const cls of ['px-home', 'px-over', 'lvl-shell']) assert.ok(root.className.split(' ').includes(cls), cls);
      assert.equal(find(root, 'px-win').length, 1, 'the Plus window frame');
      assert.equal(find(root, 'px-gem').length, 4, 'its four corner gems');
      assert.equal(find(root, 'lvl-title')[0].textContent, FACE_TEXT.title);
      const tiles = find(root, 'lvl-opt');
      assert.equal(tiles.length, 2);
      assert.equal(tiles[1].disabled, true, 'a shut tile is disabled');
      assert.equal(find(tiles[1], 'lvl-lock')[0].textContent, SHUT_NOTE);
      assert.ok(tiles[0].className.includes('is-on'), 'the open tile is the chosen one');
      tiles[1].onclick();
      assert.deepEqual(got, [], 'the shut tile answers nothing even if clicked');
      tiles[0].onclick();
      assert.deepEqual(got, ['first']);
      assert.equal(choiceFaceOwner(), null, 'the face goes with the answer');
      assert.equal(root.removed, true);
    },
    { doc: true },
  );
});

test('CHOICE-FACE: the face follows the cursor, and leaves when its draws stop', () => {
  _setChoiceFaceClockForTests(null, null);
  withPage(
    '?skin=enhanced',
    (doc) => {
      const q = question(() => {});
      q.draw(recorder(), CANVAS, FONT);
      const tiles = find(doc.getElementById(CHOICE_FACE_ID), 'lvl-opt');
      assert.ok(tiles[0].className.includes('is-on'));
      q.input('down');
      q.draw(recorder(), CANVAS, FONT);
      assert.ok(
        tiles[1].className.includes('is-on') && !tiles[0].className.includes('is-on'),
        'the highlight moved with the key',
      );
      tiles[0].onpointerenter();
      q.draw(recorder(), CANVAS, FONT);
      assert.equal(q.cursor, 0, 'and with the pointer');
      _frameForTests(DRAW_FRAMES_UNDRAWN + 1);
      releaseChoiceFace(q);
      assert.equal(choiceFaceOwner(), null);
    },
    { doc: true },
  );
});

test('CHOICE-FACE: the classic skin keeps the canvas screen, a shut option saying why', () => {
  withPage('?skin=classic', () => {
    const q = question(() => {}, [option('first'), option('second', true)]);
    const r = recorder();
    q.draw(r, CANVAS, FONT);
    assert.ok(r.quads > 0, 'the canvas draws');
    assert.equal(choiceFaceOwner(), null, 'no face on the classic skin');
    assert.equal(q.cursor, 0);
    q.input('down');
    assert.equal(q.cursor, 0, 'the cursor skips the shut option');
  });
});

test('CHOICE-FACE: the Plus sheet dresses the face, and a phone stacks the tiles', () => {
  const css = read('src/ui/enhanced/enhancedPlusStyle.js');
  for (const rule of [
    '.lvl-shell',
    '.lvl-shell .px-win',
    '.lvl-opts',
    '.lvl-opt.is-on',
    '.lvl-opt:disabled',
    '.lvl-lock',
  ]) {
    assert.ok(css.includes(rule), rule);
  }
});
