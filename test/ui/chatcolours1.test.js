// CHAT-LANG + CHAT-COLOURS + PING1 + NAME-INK. The players: "More chat channels per-language", "Chat
// color-coding per channel (i.e. White for Global, Green for Regional, Purple for Guild, Grey for Local)", "A unique
// color or alert for @name pings";, "make sure the colors are all good
// readable".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHANNEL_COLOURS, NAME_COLOURS, PING_COLOURS, CHAT_GROUNDS, PING_GROUNDS, contrast, channelRules, pipRules } from '../../src/ui/chatColours.js';
import { CHAT_TABS, ChatLog, mentions, langJoinedText, NO_LANG_TEXT } from '../../src/net/chat.js';
import { CHAT_LANGS, CHAT_LANG_PREFIX, chatLangRoom, isChatRoom, isRegionRoom, RELAY_VERSION } from '../../src/net/wire.js';
import { parseChatLine, CHANNEL_COMMANDS, HELP_LINES, LANG_LINES, unknownLangText } from '../../src/net/chatCommands.js';
import { PREF_DEFAULTS } from '../../src/systems/uiPrefs.js';
import { ONLINE_PLAYERS_OWN_PREFS } from '../../src/systems/online/onlineLane.js';
import { CHAT_CSS } from '../../src/ui/chatPanel.js';
import { GRIMOIRE_KIT_CSS } from '../../src/ui/grimoireDress.js';

const rd = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');

test('CHAT-COLOURS readable: every channel\'s, name\'s and mention\'s colour reads at 4.5:1 or better on its own ground - the darkest each can be - and on the mention\'s wash', () => {
  for (const tone of ['light', 'dark']) {
    for (const [k, c] of [...Object.entries(CHANNEL_COLOURS), ...Object.entries(NAME_COLOURS).map(([n, v]) => [`name.${n}`, v]), ['mention', PING_COLOURS.mention]]) {
      assert.ok(contrast(c[tone], CHAT_GROUNDS[tone]) >= 4.5, `${k} ${tone} ${c[tone]} on ${CHAT_GROUNDS[tone]}: ${contrast(c[tone], CHAT_GROUNDS[tone]).toFixed(2)}`);
      assert.ok(contrast(c[tone], PING_GROUNDS[tone]) >= 4.4, `${k} ${tone} ${c[tone]} on the wash ${PING_GROUNDS[tone]}: ${contrast(c[tone], PING_GROUNDS[tone]).toFixed(2)}`);
    }
  }
  assert.ok(contrast('#000000', '#ffffff') > 20.9 && Math.abs(contrast('#777777', '#ffffff') - 4.48) < 0.01, 'the measure is WCAG\'s');
});

test('CHAT-COLOURS hues: the four the players named keep their colours, every channel has one, and a name is never its words\' colour', () => {
  assert.deepEqual(Object.keys(CHANNEL_COLOURS).sort(), CHAT_TABS.map((t) => t.id).sort(), 'one colour a tab');
  const hue = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx - mn < 0.08) return null; const d = mx - mn; const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360; };
  assert.equal(hue(CHANNEL_COLOURS.world.light), null, 'World white');
  assert.ok(Math.abs(hue(CHANNEL_COLOURS.region.light) - 120) < 20, 'Region green');
  assert.ok(Math.abs(hue(CHANNEL_COLOURS.guild.light) - 265) < 25, 'Guild purple');
  assert.ok(hue(CHANNEL_COLOURS.local.light) === null || contrast(CHANNEL_COLOURS.local.light, '#b9b3a7') < 1.2, 'Local grey');
  for (const tone of ['light', 'dark']) {
    const words = Object.values(CHANNEL_COLOURS).map((c) => c[tone]);
    assert.equal(new Set(words).size, words.length, `${tone}: no two channels share a colour`);
    for (const n of ['other', 'mine']) assert.ok(!words.includes(NAME_COLOURS[n][tone]), `${tone}: a ${n} name is not any channel's words`);
  }
});

test('CHAT-COLOURS sheets: Plus colours a plain line\'s words by its channel under the switch, the kinds keep theirs; Grimoire writes the page\'s pair over its ink, the light pair over the world, the chat on the cream page', () => {
  const rule = channelRules('.x', 'light');
  assert.match(rule, /\.x \.dfchat-line\[data-ch="region"\]:not\(\.system\):not\(\.red\):not\(\.dm\):not\(\.ooc\):not\(\.me\):not\(\.roll\):not\(\.rp\) \.dfchat-text \{ color: #8fe28f; \}/);
  assert.ok(CHAT_CSS.includes(channelRules('.dfchat[data-colours="on"]', 'light')));
  assert.ok(CHAT_CSS.includes(pipRules('.dfchat[data-colours="on"]', 'light')));
  assert.match(CHAT_CSS, /\.dfchat-name \{ color: #f4b86c; font-weight: 600; \}/, 'NAME-INK: a stranger\'s name in its brass, never the bone of the words');
  assert.match(GRIMOIRE_KIT_CSS, /\.dfchat-box :is\(\.dfchat-name, \.dfchat-who-name\) \{ color: #7a170c !important; filter: none !important; \}/, 'on the page the page\'s red - no longer deepened into the ink');
  assert.match(GRIMOIRE_KIT_CSS, /\[style\*="115, 255, 115"\] \{ color: #0c491d !important;/, 'a party member\'s green, deepened by hand');
  assert.match(GRIMOIRE_KIT_CSS, /\[style\*="143, 208, 255"\] \{ color: #153d7c !important;/, 'a friend\'s blue');
  assert.match(GRIMOIRE_KIT_CSS, /body \.dfchat-box \{ background: var\(--grim-page/, 'the cream page');
  assert.ok(GRIMOIRE_KIT_CSS.includes(channelRules(':root[data-plus-dress="grimoire"] body .dfchat[data-colours="on"] .dfchat-box', 'dark', true)));
  assert.ok(GRIMOIRE_KIT_CSS.includes(channelRules(':root[data-plus-dress="grimoire"] body .dfchat[data-colours="on"] .dfchat-peek', 'light', true)));
});

test('PING1 mentions: @ and the whole name, any case, not run on into a longer word or out of an address; a one-letter name pings nobody', () => {
  assert.equal(mentions('hey @Bran look', 'Bran'), true);
  assert.equal(mentions('@bran!', 'Bran'), true);
  assert.equal(mentions('(@Bran)', 'Bran'), true);
  assert.equal(mentions('@Bran the Bold, here', 'Bran the Bold'), true);
  assert.equal(mentions('@Änne', 'Änne'), true);
  assert.equal(mentions('@Brandon hi', 'Bran'), false);
  assert.equal(mentions('mail@Bran', 'Bran'), false);
  assert.equal(mentions('Bran, hi', 'Bran'), false, 'an @ is the ask');
  assert.equal(mentions('@B', 'B'), false);
  assert.equal(mentions('@a.b', 'a.b'), true, 'a name is a literal, never a pattern');
  assert.equal(mentions('@axb', 'a.b'), false);
});

test('PING1 log: a line naming me is marked and counted on its tab until read, my own and the game\'s never; it stands over the world from any tab; the newest one\'s seq moves for the chime', () => {
  const log = new ChatLog({ now: () => 1000 });
  log.self = 'Bran';
  const a = log.push('region', { id: 'a', name: 'Ann', text: '@Bran come' });
  assert.equal(a.ping, true);
  assert.equal(log.pingSeq, a.seq);
  assert.equal(log.tab('region').pings, 1);
  assert.equal(log.pingTotal(), 1);
  assert.equal(log.push('world', { id: 'me', name: 'Bran', text: '@Bran talking to myself', mine: true }).ping, undefined, 'my own line');
  assert.equal(log.push('world', { text: '@Bran system', system: true }).ping, undefined, 'the game\'s');
  assert.equal(log.push('world', { id: 'c', name: 'C', text: 'no mention' }).ping, undefined);
  const peeked = log.peek().map((p) => p.line);
  assert.ok(peeked.includes(a), 'from the Region tab while the World is read');
  assert.ok(!peeked.some((l) => l.tab === 'region' && l !== a), 'the Region tab\'s other lines wait on its dot');
  log.setOpen(true); log.select('region');
  assert.equal(log.tab('region').pings, 0, 'read');
  log.push('region', { id: 'a', name: 'Ann', text: '@bran again' });
  assert.equal(log.tab('region').pings, 0, 'read as it arrives on the open tab');
  assert.ok(log.pingSeq > a.seq, 'and still chimed');
});

test('CHAT-LANG wire: one channel per language, keyed by its code under its own prefix, whitelisted, no region; the version moved', () => {
  assert.equal(Object.keys(CHAT_LANGS).length, 15);
  assert.equal(CHAT_LANGS.de, 'Deutsch');
  assert.equal(chatLangRoom('de'), `${CHAT_LANG_PREFIX}de`);
  assert.equal(chatLangRoom('xx'), null);
  assert.equal(chatLangRoom('toString'), null);
  for (const code of Object.keys(CHAT_LANGS)) { assert.ok(isChatRoom(chatLangRoom(code)), code); assert.ok(!isRegionRoom(chatLangRoom(code)), code); }
  assert.equal(isChatRoom('chat:lang.xx'), false);
  assert.equal(RELAY_VERSION, 'world285');
});

test('CHAT-LANG tab and commands: the Language tab rides a room of its own, off the bar until chosen; /lang lists, chooses and leaves; /lc says a line on it', () => {
  const tab = CHAT_TABS.find((t) => t.id === 'lang');
  assert.deepEqual([tab.label, tab.room, tab.link, tab.hidden], ['Lang', null, true, true]);
  assert.equal(PREF_DEFAULTS.chatLang, '');
  assert.equal(PREF_DEFAULTS.chatChannelColours, true);
  assert.equal(PREF_DEFAULTS.chatPingSound, true);
  for (const k of ['chatChannelColours', 'chatPingSound']) assert.ok(ONLINE_PLAYERS_OWN_PREFS.includes(k), `${k}: the player's own online`);
  assert.deepEqual(parseChatLine('/lang'), { kind: 'lang', code: '' });
  assert.deepEqual(parseChatLine('/lang DE'), { kind: 'lang', code: 'de' });
  assert.deepEqual(parseChatLine('/lang off'), { kind: 'lang', code: 'off' });
  assert.deepEqual(parseChatLine('/lc hallo zusammen'), { kind: 'channel', tab: 'lang', text: 'hallo zusammen', wrap: null });
  assert.ok(CHANNEL_COMMANDS.some((c) => c.tab === 'lang'));
  assert.ok(HELP_LINES.some((l) => l.startsWith('/lang de')));
  assert.match(LANG_LINES[1], /^en English · de Deutsch/);
  assert.equal(unknownLangText('xx'), 'There is no "xx" language channel. /lang lists them.');
  assert.equal(langJoinedText('Deutsch'), 'Language channel: Deutsch.');
  assert.ok(NO_LANG_TEXT.includes('/lang'));
});
