// CHAT-TRADE + CHAT-RP. The Trade and LFG channels are the Language channel's shape twice over - a room each, joined by choice, the
// tab on the bar only while joined - and a line of roleplay is OOC's kind of mark: the speaker's own *asterisks*.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHAT_TABS, ChatLog, OPT_CHANNELS, isRpText, rpText, notJoinedText, optJoinedText, optJoinedSayText, optLeftText, optWaitText, alreadyJoinedText } from '../../src/net/chat.js';
import { CHAT_TRADE_ROOM, CHAT_LFG_ROOM, CHAT_ROOMS, isChatRoom, isRegionRoom, RELAY_VERSION } from '../../src/net/wire.js';
import { parseChatLine, CHANNEL_COMMANDS, HELP_LINES, JOIN_CHANNELS, badJoinText } from '../../src/net/chatCommands.js';
import { RP_COLOURS, CHANNEL_COLOURS, CHAT_GROUNDS, PING_GROUNDS, COLOURED_LINE, contrast } from '../../src/ui/chatColours.js';
import { bubbleLineOk } from '../../src/ui/nameLayer.js';
import { PREF_DEFAULTS } from '../../src/systems/uiPrefs.js';
import { ONLINE_PLAYERS_OWN_PREFS } from '../../src/systems/online/onlineLane.js';
import { GRIMOIRE_KIT_CSS } from '../../src/ui/grimoireDress.js';
import { CHAT_CSS, createChatPanel } from '../../src/ui/chatPanel.js';

const rd = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');

test('CHAT-TRADE wire: the Trade and LFG channels are two whitelisted rooms of their own, no region\'s; the version moved', () => {
  assert.deepEqual([CHAT_TRADE_ROOM, CHAT_LFG_ROOM], ['chat:trade', 'chat:lfg']);
  for (const room of [CHAT_TRADE_ROOM, CHAT_LFG_ROOM]) { assert.ok(CHAT_ROOMS.has(room), room); assert.ok(isChatRoom(room), room); assert.ok(!isRegionRoom(room), room); }
  assert.equal(isChatRoom('chat:trade.1'), false, 'a whitelist, not a prefix');
  assert.equal(RELAY_VERSION, 'world282');
});

test('CHAT-TRADE tabs: Trade and LFG ride rooms of their own and stand OFF the bar until joined - a player who never joins sees the bar as it was', () => {
  for (const [id, label] of [['trade', 'Trade'], ['lfg', 'LFG']]) {
    const tab = CHAT_TABS.find((t) => t.id === id);
    assert.deepEqual([tab.label, tab.room, tab.link, tab.hidden, tab.peekAll ?? false], [label, null, true, true, false], id);
  }
  assert.deepEqual(Object.fromEntries(Object.entries(OPT_CHANNELS).map(([k, v]) => [k, { ...v }])), {
    trade: { name: 'Trade', pref: 'chatTrade', room: CHAT_TRADE_ROOM },
    lfg: { name: 'LFG', pref: 'chatLfg', room: CHAT_LFG_ROOM },
  });
  const log = new ChatLog();
  assert.deepEqual(log.tabs.filter((t) => t.shown).map((t) => t.id), ['world', 'region', 'local'], 'the bar a new player sees');
  log.setShown('trade', true);
  assert.equal(log.select('trade'), true);
  log.setShown('trade', false);
  assert.equal(log.active, 'world', 'a tab left hands the front to the first still on the bar');
  assert.equal(PREF_DEFAULTS.chatTrade, false);
  assert.equal(PREF_DEFAULTS.chatLfg, false);
  for (const k of ['chatTrade', 'chatLfg']) assert.ok(ONLINE_PLAYERS_OWN_PREFS.includes(k), `${k}: the player's own online`);
  assert.ok(CHANNEL_COLOURS.trade && CHANNEL_COLOURS.lfg, 'a colour each');
});

test('CHAT-TRADE commands: /trade, /tr and /lfg say a line on their channel; /join and /leave name trade or lfg, any case, and nothing else; /help lists them', () => {
  assert.deepEqual(parseChatLine('/trade WTB iron ingots'), { kind: 'channel', tab: 'trade', text: 'WTB iron ingots', wrap: null });
  assert.deepEqual(parseChatLine('/tr WTS dwarven sword'), { kind: 'channel', tab: 'trade', text: 'WTS dwarven sword', wrap: null });
  assert.deepEqual(parseChatLine('/lfg 2 more for Privateer\'s Hold'), { kind: 'channel', tab: 'lfg', text: '2 more for Privateer\'s Hold', wrap: null });
  assert.deepEqual(parseChatLine('/trade'), { kind: 'empty', name: 'trade' });
  assert.deepEqual(parseChatLine('/lfg'), { kind: 'empty', name: 'lfg' });
  assert.deepEqual(parseChatLine('/join trade'), { kind: 'join', chan: 'trade' });
  assert.deepEqual(parseChatLine('/JOIN LFG'), { kind: 'join', chan: 'lfg' });
  assert.deepEqual(parseChatLine('/join #lfg'), { kind: 'join', chan: 'lfg' });
  assert.deepEqual(parseChatLine('/leave trade'), { kind: 'leave', chan: 'trade' });
  assert.deepEqual(parseChatLine('/join world'), { kind: 'join', chan: '' }, 'the World is never left');
  assert.deepEqual(parseChatLine('/join'), { kind: 'join', chan: '' });
  assert.deepEqual(JOIN_CHANNELS, ['trade', 'lfg']);
  assert.equal(badJoinText('join'), '/join takes trade or lfg: /join trade.');
  for (const id of JOIN_CHANNELS) assert.ok(CHANNEL_COMMANDS.some((c) => c.tab === id), id);
  assert.ok(HELP_LINES.includes('/trade or /tr <text> - to the Trade channel: buying, selling, swapping'));
  assert.ok(HELP_LINES.includes('/lfg <text> - to the LFG channel: looking for a group or more players'));
  assert.ok(HELP_LINES.some((l) => l.startsWith('/join trade, /join lfg')));
  assert.equal(notJoinedText('trade'), 'You are not in the Trade channel. /join trade joins it.');
  assert.equal(optJoinedText('lfg'), 'LFG channel joined. /leave lfg leaves it.');
  assert.equal(optLeftText('trade'), 'Trade channel left.');
  assert.equal(alreadyJoinedText('lfg'), 'You are already in the LFG channel. /leave lfg leaves it.', 'AUDIT CHAT-TRADE A5');
  assert.match(rd('src/scenes/world.js'), /note\(on \? alreadyJoinedText\(cmd\.chan\) : notJoinedText\(cmd\.chan\)\)/);
  assert.equal(optWaitText('lfg'), 'The LFG channel is still opening. Try again in a moment.');
  assert.equal(optJoinedSayText('trade'), 'Trade channel joined. Press Enter to speak. /leave trade leaves it.');
  // L10N4: the new words are the text core's, READ WHEN SHOWN - a getter on the tab's hint and the /help rows, never a string
  // the boot's import froze in whatever language it found
  for (const id of JOIN_CHANNELS) assert.equal(typeof Object.getOwnPropertyDescriptor(CHAT_TABS.find((x) => x.id === id), 'hint').get, 'function', `${id}'s hint`);
  for (const id of JOIN_CHANNELS) assert.equal(typeof Object.getOwnPropertyDescriptor(CHANNEL_COMMANDS.find((c) => c.tab === id), 'help').get, 'function', `${id}'s help`);
  const rp = HELP_LINES.findIndex((l) => l.startsWith('/rp '));
  assert.equal(typeof Object.getOwnPropertyDescriptor(HELP_LINES, rp).get, 'function', '/rp\'s row');
  assert.ok(Object.isFrozen(HELP_LINES) && Array.isArray(HELP_LINES));
  assert.match(rd('src/net/siege/siegeSession.js'), /isBattleLeaveCommand = \(text\) => \/\^\\\/leave\$\/i\.test/, 'a bare /leave is still the battle\'s');
});

test('CHAT-TRADE host: each tab follows its choice - on the bar while joined, joined once the World link is welcomed, left when the choice is taken back; a line said to one not joined joins it and stays in the field', () => {
  const host = rd('src/scenes/world.js');
  assert.match(host, /const joined = optJoined\(id\);\n      chatLog\.setShown\(id, joined\);\n      const room = joined \? c\.room : null;/);
  assert.match(host, /if \(!room\) \{ chatLog\.setRoom\(id, null, null\); link\.leave\(\); continue; \}\n      if \(!chatLinks\.get\('world'\)\?\.welcomed\) continue;\n      chatLog\.setRoom\(id, room, c\.name\);\n      link\.join\(room\);/);
  assert.match(host, /chatLangFrame\(\);   \/\/ CHAT-LANG[^\n]*\n    chatOptFrame\(\);   \/\/ CHAT-TRADE/);
  assert.equal((host.match(/return why\(optWhy\(tabId\) \?\? optWaitText\(tabId\)\);/g) ?? []).length, 2, 'the line\'s door and the roll\'s');
  assert.match(host, /if \(\(tabId === 'trade' \|\| tabId === 'lfg'\) && !tab\?\.room\) return optWhy\(tabId\);/, 'the strip says why');
  assert.deepEqual(Object.keys(OPT_CHANNELS), ['trade', 'lfg'], 'the host\'s doors name the same two');
  assert.match(host, /if \(cmd\.kind === 'join' \|\| cmd\.kind === 'leave'\) \{\n          if \(!cmd\.chan\) \{ note\(badJoinText\(cmd\.kind\)\); return false; \}/);
  assert.match(host, /const optSet = \(id, on, \{ say = false \} = \{\}\) => \{\n    const c = OPT_CHANNELS\[id\];\n    if \(!c \|\| !chatLog\) return;\n    setPref\(c\.pref, !!on\);\n    chatOptFrame\(\);/, 'one door: the choice kept, the frame moving the tab at once');
  assert.match(host, /if \(optJoined\(cmd\.chan\) === on\) \{[^\n]*\}[^\n]*\n          optSet\(cmd\.chan, on\);/, '/join and /leave through it');
  assert.match(host, /channels: \{ list: \(\) => Object\.entries\(OPT_CHANNELS\)\.map\(\(\[id, c\]\) => \(\{ id, name: c\.name, hint: chatLog\?\.tab\(id\)\?\.hint \?\? '', joined: optJoined\(id\) \}\)\), set: \(id, on\) => optSet\(id, on\) \},/, 'and the picker through it');
  assert.match(host, /if \(cmd\.kind === 'channel' && Object\.hasOwn\(OPT_CHANNELS, cmd\.tab\) && !optJoined\(cmd\.tab\)\) \{\n          optSet\(cmd\.tab, true, \{ say: true \}\);\n          return false;\n        \}/);
  const at = host.indexOf("if (cmd.kind === 'channel' && Object.hasOwn(OPT_CHANNELS");
  assert.ok(at > 0 && at < host.indexOf("if (cmd.kind === 'channel') return chatSend("), 'the join comes before the channel\'s own send');
  const menu = rd('src/ui/enhanced/enhancedMenu.js');
  assert.match(menu, /prefRow\('chatTrade', t\('menu\.chat\.trade', 'Trade channel'\),/);
  assert.match(menu, /prefRow\('chatLfg', t\('menu\.chat\.lfg', 'LFG channel'\),/);
});

test('CHAT-RP mark: /rp wraps the words in single asterisks, and a whole line so wrapped is roleplay - not bold, not a lone star, not a line that only starts with one', () => {
  assert.deepEqual(parseChatLine('/rp draws her blade'), { kind: 'rp', text: '*draws her blade*' });
  assert.deepEqual(parseChatLine('/RP *bows low*'), { kind: 'rp', text: '*bows low*' }, 'the marks typed are not doubled');
  assert.deepEqual(parseChatLine('/rp'), { kind: 'empty', name: 'rp' });
  assert.deepEqual(parseChatLine('/rp ***'), { kind: 'empty', name: 'rp' }, 'nothing but marks is nothing to say');
  assert.equal(rpText('  hums a tune  '), '*hums a tune*');
  assert.equal(rpText('*bows* deeply'), '*bows deeply*', 'AUDIT CHAT-TRADE A3: a mark inside the line goes - the whole line is the roleplay');
  assert.equal(parseChatLine('/rp *bows*   low').text, '*bows low*');
  for (const t of ['*draws her blade*', '*a*', ' *waves* ', '*x * y*']) assert.equal(isRpText(t), true, t);
  for (const t of ['**bold**', '* *', '*', '*sighs', 'hi *x*', '*x *', '((ooc))', '']) assert.equal(isRpText(t), false, t);
  assert.ok(HELP_LINES.includes('/rp <text> - a roleplay line on this tab, in green italics: /rp draws her blade'));
  assert.match(rd('src/scenes/world.js'), /if \(cmd\.kind === 'rp'\) return chatSend\(tabId, cmd\.text, tabId, opts\);/, 'said on the tab it was typed on');
});

test('CHAT-RP line: the log draws a roleplay line as its own kind - read off the words, an action and an aside keep theirs, a line the game says is never one - and it stands over a head, being in character', () => {
  const log = new ChatLog({ now: () => 5 });
  const rp = log.push('local', { id: 'a', name: 'Ann', text: '*draws her blade*' });
  assert.equal(rp.kind, 'rp');
  assert.equal(log.push('world', { id: 'a', name: 'Ann', text: 'plain' }).kind, '');
  assert.equal(log.push('world', { id: 'a', name: 'Ann', text: '*waves*', me: true }).kind, 'me');
  assert.equal(log.push('world', { id: 'a', name: 'Ann', text: '((*brb*))' }).kind, 'ooc');
  assert.equal(log.push('world', { text: '*notice*', system: true }).kind, '');
  assert.equal(bubbleLineOk(rp), true);
});

test('CHAT-RP colour: green and leaning on every tab - the channel colours pass it by, it reads at 4.5:1 on Plus\'s box and on the Grimoire page, and over the world in the light green', () => {
  for (const tone of ['light', 'dark']) {
    assert.ok(contrast(RP_COLOURS[tone], CHAT_GROUNDS[tone]) >= 4.5, `${tone} ${RP_COLOURS[tone]}`);
    assert.ok(contrast(RP_COLOURS[tone], PING_GROUNDS[tone]) >= 4.4, `${tone} on the wash`);
  }
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(RP_COLOURS.light.slice(i, i + 2), 16));
  assert.ok(g > r && g > b, 'green');
  assert.notEqual(RP_COLOURS.light, CHANNEL_COLOURS.region.light, 'not the Region\'s');
  assert.ok(COLOURED_LINE.endsWith(':not(.rp)'));
  assert.ok(CHAT_CSS.includes(`.dfchat-line.rp .dfchat-text { font-style: italic; color: ${RP_COLOURS.light}; }`));
  assert.match(rd('src/ui/chatPanel.js'), /\$\{line\.kind === 'rp' \? ' rp' : ''\}/);
  assert.ok(GRIMOIRE_KIT_CSS.includes(`.dfchat-box .dfchat-line.rp .dfchat-text { color: ${RP_COLOURS.dark} !important; text-shadow: none !important; font-style: italic; }`));
  assert.ok(GRIMOIRE_KIT_CSS.includes(`.dfchat-peek .dfchat-line.rp .dfchat-text { color: ${RP_COLOURS.light} !important; }`));
});

// The panel headless - chatchan.test.js's fakes, the window's key listener kept so the field's Escape can be pressed.
function fakeNode(tag, doc) {
  const n = {
    tagName: tag.toUpperCase(), children: [], parent: null, className: '', textContent: '', id: '', value: '', title: '', placeholder: '',
    style: {}, dataset: {}, attrs: {}, listeners: new Map(), scrollTop: 0, scrollHeight: 100, clientHeight: 100,
    append(...cs) { for (const c of cs) { c.parent = n; n.children.push(c); } },
    replaceChildren(...cs) { n.children = []; n.append(...cs); },
    setAttribute(k, v) { n.attrs[k] = v; },
    addEventListener(t, fn) { if (!n.listeners.has(t)) n.listeners.set(t, []); n.listeners.get(t).push(fn); },
    removeEventListener() {},
    fire(t, e = {}) { const ev = { type: t, target: n, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {}, ...e }; for (const fn of n.listeners.get(t) ?? []) fn(ev); return ev; },
    focus() { doc.activeElement = n; }, blur() {},
    remove() { if (n.parent) { n.parent.children.splice(n.parent.children.indexOf(n), 1); n.parent = null; } },
  };
  return n;
}
function fakeDocument() {
  const doc = { activeElement: null };
  doc.createElement = (tag) => fakeNode(tag, doc);
  doc.head = fakeNode('head', doc); doc.body = fakeNode('body', doc);
  const byId = (n, id) => { if (n.id === id) return n; for (const c of n.children) { const f = byId(c, id); if (f) return f; } return null; };
  doc.getElementById = (id) => byId(doc.head, id) ?? byId(doc.body, id);
  return doc;
}
const find = (n, cls, out = []) => { if (String(n.className).split(/\s+/).includes(cls)) out.push(n); for (const c of n.children) find(c, cls, out); return out; };
const one = (n, cls) => find(n, cls)[0];

test('CHAT-TRADE picker (Mac: "There must be a better way to handle the new channels instead of a text command"): a + beside the tabs opens the channels joined by choice, each with its mark; a click joins or leaves it through the host\'s door; Escape in the field and the panel\'s close take the list down; no + without the host\'s channels', () => {
  const plain = fakeDocument();
  createChatPanel({ log: new ChatLog(), onSend: () => true, action: () => null, doc: plain, win: { addEventListener() {}, removeEventListener() {} }, touch: false });
  assert.equal(find(plain.body, 'dfchat-chan-add').length, 0, 'no channels from the host: no +');

  const doc = fakeDocument();
  const keys = [];
  const win = { addEventListener: (t, fn) => { if (t === 'keydown') keys.push(fn); }, removeEventListener() {} };
  const joined = { trade: false, lfg: true };
  const sets = [];
  const log = new ChatLog();
  const panel = createChatPanel({ log, onSend: () => true, action: () => null, doc, win, touch: false, social: { onToggle() {}, pending: () => 0 },
    channels: { list: () => [{ id: 'trade', name: 'Trade', hint: 'buy, sell', joined: joined.trade }, { id: 'lfg', name: 'LFG', hint: 'groups', joined: joined.lfg }], set: (id, on) => { sets.push([id, on]); joined[id] = on; } } });
  const root = doc.body.children[0];
  const bar = one(root, 'dfchat-tabs');
  const add = one(bar, 'dfchat-chan-add'), menu = one(bar, 'dfchat-chans');
  assert.deepEqual(bar.children.map((c) => c.className.split(' ')[0]), ['dfchat-tablist', 'dfchat-chan-add', 'dfchat-chans', 'dfchat-social'], 'beside the tabs, before Social - one glyph, no tab');
  assert.equal(add.textContent, '+');
  assert.deepEqual([add.attrs['aria-label'], add.attrs['aria-haspopup'], add.attrs['aria-expanded'], menu.attrs.role], ['Channels', undefined, 'false', 'group'], 'AUDIT CHAT-TRADE A2: a group of toggle buttons, as the emoji grid - no menu claimed whose keys it lacks');
  assert.equal(menu.className, 'dfchat-chans', 'shut');
  panel.open();
  add.fire('click');
  assert.equal(menu.className, 'dfchat-chans on');
  assert.equal(add.attrs['aria-expanded'], 'true');
  const rows = () => find(menu, 'dfchat-chan-row').map((r) => [r.dataset.chan, r.attrs['aria-pressed'], one(r, 'dfchat-chan-mark').textContent, one(r, 'dfchat-chan-name').textContent, one(r, 'dfchat-chan-hint').textContent]);
  assert.deepEqual(rows(), [['trade', 'false', '', 'Trade', 'buy, sell'], ['lfg', 'true', '\u2713', 'LFG', 'groups']]);
  find(menu, 'dfchat-chan-row')[0].fire('click');
  assert.deepEqual(sets, [['trade', true]], 'joined through the host');
  assert.deepEqual(rows().map((r) => r[1]), ['true', 'true'], 'and marked at once, the list still open');
  find(menu, 'dfchat-chan-row')[1].fire('click');
  assert.deepEqual(sets, [['trade', true], ['lfg', false]], 'and left');
  const input = one(root, 'dfchat-input');
  assert.equal(doc.activeElement, input, 'the caret back in the field');
  const esc = () => { for (const fn of keys) fn({ target: input, code: 'Escape', preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} }); };
  esc();
  assert.equal(menu.className, 'dfchat-chans', 'Escape takes the list down first');
  assert.equal(log.open, true, '...and leaves the chat open');
  add.fire('click');
  esc();
  esc();
  assert.equal(log.open, false, 'the next Escape closes the chat');
  panel.open(); add.fire('click');
  one(root, 'dfchat-close').fire('click');
  assert.equal(menu.className, 'dfchat-chans', 'the panel\'s close takes the list with it');
  assert.ok(CHAT_CSS.includes('.dfchat-chans.on { display: flex; }'));
});
