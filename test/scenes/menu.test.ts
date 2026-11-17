// The classic saves picker shows a translation pack's rows as text. A pack the player installs can hold any row of
// Port_Strings and Internal_Strings; markup in one must be shown, never parsed into elements.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setLocale, patchLocaleTable, clearLocaleTables } from '../../src/systems/textManager.js';

// Loaded by a computed path: menu.js reaches modules that name DOM types, and the Node type pass has no DOM library.
const MENU_PATH: string = '../../src/scenes/menu.js';
const { buildClassicSavePicker } = (await import(MENU_PATH)) as {
  buildClassicSavePicker: (doc: { createElement(tag: string): unknown }) => FakeNode;
};

interface FakeNode {
  tag: string;
  text?: string;
  attrs: Record<string, string>;
  children: FakeNode[];
  textContent: string;
}

/** A document with just enough DOM for the picker. Setting `innerHTML` throws, so any parse of text as HTML fails. */
function fakeDocument() {
  const made: FakeNode[] = [];
  const textNode = (text: string): FakeNode => ({ tag: '#text', text, attrs: {}, children: [], textContent: text });
  const createElement = (tag: string) => {
    const n = {
      tag,
      attrs: {} as Record<string, string>,
      children: [] as FakeNode[],
      style: { cssText: '' },
      setAttribute(name: string, value: unknown) {
        n.attrs[name] = String(value);
      },
      append(...items: (FakeNode | string)[]) {
        for (const item of items) n.children.push(typeof item === 'string' ? textNode(item) : item);
      },
      set textContent(value: unknown) {
        n.children = [textNode(String(value))];
      },
      get textContent(): string {
        return n.children.map((c) => c.textContent).join('');
      },
      set innerHTML(_value: unknown) {
        throw new Error('the picker parsed text as HTML');
      },
    };
    made.push(n);
    return n;
  };
  return { made, createElement };
}

const find = (root: FakeNode, tag: string): FakeNode[] =>
  root.tag === tag ? [root] : root.children.flatMap((c) => find(c, tag));

const MARKUP = '<img src=x onerror="globalThis.pwned=1">';

test('a pack row holding markup is shown as text, and no element is made from it', () => {
  setLocale('xx');
  patchLocaleTable('xx', 'Port_Strings', [
    ['menu.classicLoad.title', `Title ${MARKUP}`],
    ['menu.classicLoad.pick', `Pick {game} ${MARKUP}`],
    ['menu.classicLoad.phone', `Phone {zip} ${MARKUP}`],
  ]);
  patchLocaleTable('xx', 'Internal_Strings', [['cancel', `Cancel ${MARKUP}`]]);
  try {
    const doc = fakeDocument();
    const ui: FakeNode = buildClassicSavePicker(doc);
    assert.equal(doc.made.filter((n) => n.tag === 'img').length, 0, 'no <img> was made');
    assert.equal(find(ui, 'h2')[0].textContent, `Title ${MARKUP}`);
    assert.equal(find(ui, 'button')[0].textContent, `Cancel ${MARKUP}`);
    const [pick, phone] = find(ui, 'p');
    assert.equal(pick.textContent, `Pick Daggerfall ${MARKUP}`);
    assert.equal(phone.textContent, `Phone .zip ${MARKUP}`);
  } finally {
    clearLocaleTables('xx');
    setLocale(null);
  }
});

test('in English the picker keeps its words, the bold words and its controls', () => {
  const ui: FakeNode = buildClassicSavePicker(fakeDocument());
  assert.equal(find(ui, 'h2')[0].textContent, 'Load Classic Save');
  assert.deepEqual(
    find(ui, 'b').map((b) => b.textContent),
    ['Daggerfall', '.zip'],
  );
  assert.equal(
    find(ui, 'p')[0].textContent,
    'Select your classic Daggerfall folder (the one with SAVE0-SAVE5 next to ARENA2), or drop it here. Your saves are read for this load only and are not stored.',
  );
  const inputs = find(ui, 'input');
  assert.deepEqual(
    inputs.map((i) => i.attrs.id),
    ['picksaves', 'picksaveszip'],
  );
  assert.ok('webkitdirectory' in inputs[0].attrs && 'multiple' in inputs[0].attrs);
  assert.equal(inputs[1].attrs.accept, '.zip,application/zip');
  assert.equal(find(ui, 'button')[0].attrs.id, 'cancelsaves');
  assert.equal(find(ui, 'p').at(-1)?.attrs.id, 'savemsg');
});
