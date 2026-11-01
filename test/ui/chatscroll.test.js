// CHAT-SCROLL.
//
// node has no layout engine, so chat1's fake DOM reports whatever it is told. This file's fake LAYS OUT: a line is
// as tall as its text wraps (18px a row of 44 characters, badge parts included), the list's scrollHeight is the sum
// of its lines, its box is 100px, and scrollTop is clamped the way an engine clamps it. That is what the three
// failures need: a hidden box that forgets its place (the engines that drop a display:none scroller's offset), a
// badge that wraps a line after the list scrolled, and a reader who scrolled up.
import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ChatLog } from '../../src/net/chat.js';
import { createChatPanel } from '../../src/ui/chatPanel.js';

const LINE_PX = 18, WRAP_CHARS = 44, BOX_PX = 100;
const textOf = (n) => (n.children.length ? n.children.map(textOf).join('') : String(n.textContent ?? ''));
function fakeNode(tag, doc) {
  let top = 0;
  const n = {
    tagName: tag.toUpperCase(), children: [], parent: null, className: '', textContent: '', id: '', value: '', type: '',
    style: {}, dataset: {}, attrs: {}, listeners: new Map(),
    append(...cs) { for (const c of cs) { if (c.parent) c.remove(); c.parent = n; n.children.push(c); } },
    replaceChildren(...cs) { for (const c of n.children) c.parent = null; n.children = []; n.append(...cs); },
    setAttribute(k, v) { n.attrs[k] = v; },
    addEventListener(t, fn) { if (!n.listeners.has(t)) n.listeners.set(t, []); n.listeners.get(t).push(fn); },
    removeEventListener() {},
    fire(t, e = {}) { const ev = { type: t, target: n, preventDefault() {}, stopPropagation() {}, ...e }; for (const fn of n.listeners.get(t) ?? []) fn(ev); return ev; },
    focus() {}, blur() {},
    remove() { if (n.parent) { n.parent.children.splice(n.parent.children.indexOf(n), 1); n.parent = null; } },
    get offsetHeight() { return LINE_PX * Math.max(1, Math.ceil(textOf(n).length / WRAP_CHARS)); },
    get scrollHeight() { return Math.max(BOX_PX, n.children.reduce((s, c) => s + c.offsetHeight, 0)); },
    clientHeight: BOX_PX,
    get scrollTop() { return top; },
    set scrollTop(v) { const was = top; top = Math.max(0, Math.min(Number(v) || 0, n.scrollHeight - BOX_PX)); if (top !== was) n.fire('scroll'); },
  };
  return n;
}
function fakeDocument() {
  const doc = {};
  doc.createElement = (tag) => fakeNode(tag, doc);
  doc.head = fakeNode('head', doc); doc.body = fakeNode('body', doc);
  doc.getElementById = () => null;
  return doc;
}
const fakeWindow = () => ({ addEventListener() {}, removeEventListener() {} });
const find = (n, cls, out = []) => { if (String(n.className).split(/\s+/).includes(cls)) out.push(n); for (const c of n.children) find(c, cls, out); return out; };
const one = (n, cls) => find(n, cls)[0];

function rig({ badges = false, badge = null } = {}) {
  const log = new ChatLog();
  const doc = fakeDocument();
  const panel = createChatPanel({ log, onSend: () => true, overlay: () => false, action: () => null, doc, win: fakeWindow(), touch: false,
    badgeOf: badge ?? (badges ? () => ({ title: 'founder', glyphs: ['sprout'] }) : null) });
  const root = doc.body.children[0];
  const list = one(root, 'dfchat-list');
  let n = 0;
  const say = (k = 1, text = null) => { for (let i = 0; i < k; i++, n++) log.push('world', { id: 'pabcdefgh0001', name: 'Bran', text: text ?? `line ${n}` }); panel.render(); };
  const atNewest = () => list.scrollTop >= list.scrollHeight - BOX_PX - 1;
  return { log, panel, root, list, say, atNewest };
}

test('CHAT-SCROLL: an open lands on the newest line - after lines arrived while closed, after the reader had scrolled up before closing, and on an engine that drops a hidden scroller\'s place (the list reads as "scrolled to the top" on its first paint back) (mutants: the open paint measuring the hidden box; the open forgetting to land)', () => {
  const { panel, list, say, atNewest } = rig();
  say(30);
  panel.open(); panel.render();
  assert.ok(atNewest(), 'the first open');
  panel.close(); say(6); panel.open(); panel.render();
  assert.ok(atNewest(), 'lines that arrived while closed: the open shows them');
  // the reader scrolls up, closes, and comes back
  list.scrollTop = 0; panel.render();
  assert.equal(list.scrollTop, 0, 'open: a reader who scrolled up is left there (AUDIT CHAT C8)');
  panel.close(); say(2); panel.open(); panel.render();
  assert.ok(atNewest(), 'but an OPEN is a new look: the newest line, not the old place');
  // the engine that forgets: the box was display:none, and on the first paint back it reads 0
  panel.close(); say(3); list.scrollTop = 0; panel.open(); panel.render();
  assert.ok(atNewest(), 'a hidden box that dropped its place is not read as the reader\'s choice');
});

test('CHAT-SCROLL: while open, a reader who scrolled up keeps their place and the lines that came in under them are counted on a bar under the list; the bar takes them to the newest line, and scrolling down on their own clears it; a tab change reads from its newest line (mutants: the count not kept; the bar left standing at the bottom)', () => {
  const { panel, root, list, say, atNewest } = rig();
  say(20);
  panel.open(); panel.render();
  const jump = one(root, 'dfchat-jump');
  assert.equal(jump.className, 'dfchat-jump', 'nothing unseen: no bar');
  list.scrollTop = 10; panel.render();
  say(3);
  assert.equal(list.scrollTop, 10, 'not yanked');
  assert.equal(jump.className, 'dfchat-jump on');
  assert.equal(jump.textContent, '3 new. Jump to newest');
  say(2);
  assert.equal(jump.textContent, '5 new. Jump to newest', 'the count grows with what arrives');
  jump.fire('click');
  assert.ok(atNewest(), 'the bar takes the reader down');
  assert.equal(jump.className, 'dfchat-jump', 'and goes');
  list.scrollTop = 0; panel.render(); say(2);
  assert.equal(jump.className, 'dfchat-jump on');
  list.scrollTop = list.scrollHeight;   // the reader scrolls down on their own (the fake fires the element's scroll)
  assert.equal(jump.className, 'dfchat-jump', 'reaching the bottom clears it');
  panel.close();
  assert.equal(jump.className, 'dfchat-jump', 'a closed panel draws no bar');
});

