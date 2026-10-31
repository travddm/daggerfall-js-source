// HOLDINGS - THE
// HOLDINGS TAB and THE STABLE: the pause window's fourth tab and its rail (ui/enhanced/enhancedMenu.js
// pauseHoldings), what moved off the Stats rail onto it, the landings; Horse Cart and Cargo's summon answered and its
// new other half, Send away (systems/horse/horseCart.js summonTransport, sendTransportAway, renameHorse, stableView - the
// real runtime over test/hccWorld.mjs); the Stable page's words and acts (ui/holdingsPages.js); the one construction
// seam the two hosts share. The Fleet page is test/systems/naval/fleet.test.js's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeWorld } from '../../hccWorld.mjs';
import { WAGON_MODE, HORSE_MODE, TRANSPORT, HCC_TEXT } from '../../../src/systems/horse/horseCartLaw.js';
import {
  drawStablePage, stableWords, stableProviderFor, setHoldingsProvider, stablePageShown, resetHoldingsPages, _setHoldingsIconForTests, farWords,
  STABLE_PAGE_SECTIONS, HORSE_ART, WAGON_ART,
} from '../../../src/ui/holdingsPages.js';
import { CSA_ITEM_TEMPLATES } from '../../../src/systems/comeSailAway/comeSailAwayItems.js';
import { hostText } from '../../hostText.mjs';   // HOST-SPLIT 2 (AUDIT, the second read): its negatives read the host whole

const read = (p) => hostText(p);

// ── a fake DOM, the Companions page's (test/systems/revenant/revenant_companions.test.js) ─────────────────────────────────────────────
function fakeEl(tag) {
  const classes = new Set();
  const n = {
    tag, children: [], attrs: {}, parent: null, title: '', isConnected: true, value: '', type: '', maxLength: 0,
    classList: { add: (...c) => c.forEach((x) => classes.add(x)), contains: (c) => classes.has(c), remove: (...c) => c.forEach((x) => classes.delete(x)) },
    get className() { return [...classes].join(' '); }, set className(v) { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach((x) => classes.add(x)); },
    _text: '', get textContent() { return n._text + n.children.map((c) => c.textContent ?? '').join(''); }, set textContent(v) { n._text = String(v ?? ''); },
    get firstChild() { return n.children[0] ?? null; },
    append(...cs) { for (const c of cs) { c.parent = n; n.children.push(c); } },
    setAttribute(k, v) { n.attrs[k] = v; },
  };
  return n;
}
const el = (t, cls, text) => { const n = fakeEl(t); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const kit = { el, divider: (t) => el('h4', 'px-divider', t), meter: (now, max) => el('div', 'px-meter', `${now}/${max}`) };
const buttons = (root, label) => { const out = []; const walk = (x) => { for (const c of x.children ?? []) { if (c.tag === 'button' && c.textContent === label) out.push(c); walk(c); } }; walk(root); return out; };
const byTag = (root, tag) => { const out = []; const walk = (x) => { for (const c of x.children ?? []) { if (c.tag === tag) out.push(c); walk(c); } }; walk(root); return out; };
_setHoldingsIconForTests(() => ({ src: 'data:x', w: 30, h: 30 }));
globalThis.document = undefined;

// ── the tab ──────────────────────────────────────────────────────────────────────────────────────────────────────────

// ── the runtime: summon answered, send away, the name ────────────────────────────────────────────────────────────────

test('HOLDINGS Summon answers its line rather than saying it (the page says it under the cards, the hotkey on the HUD - one body): the pair to the player\'s side; refused indoors, aboard, owning nothing, riding the horse alone', () => {
  const { w, rt, state } = makeWorld();
  assert.deepEqual(rt.summonTransport(), { ok: true, text: HCC_TEXT.summonedBoth });
  assert.equal(state().Mode, WAGON_MODE.Deployed);
  assert.equal(state().HorseMode, HORSE_MODE.HitchedToWagon);
  assert.deepEqual(w.said, [], 'answered, never said');
  rt.handleSummonTransport();
  assert.deepEqual(w.said, [HCC_TEXT.summonedBoth], 'the hotkey says the same body\'s line');
  w.inside = true;
  assert.deepEqual(rt.summonTransport(), { ok: false, text: HCC_TEXT.summonOutdoorsOnly });
  w.inside = false; w.ship = true;
  assert.equal(rt.summonTransport().text, HCC_TEXT.summonOutdoorsOnly);
  const none = makeWorld({ cart: false, horse: false });
  assert.deepEqual(none.rt.summonTransport(), { ok: false, text: HCC_TEXT.doNotOwnHorseOrWagon });
  const horse = makeWorld({ cart: false });
  horse.w.mode = TRANSPORT.Horse;
  assert.deepEqual(horse.rt.summonTransport(), { ok: false, text: HCC_TEXT.alreadyWithYou });
});

test('HOLDINGS Send away: whatever of the pair stands in the world leaves it - the wagon and horse back to the record the persistence\'s turning on makes (both WithPlayer), the presentations torn down; then mounted from the transport window, or summoned again (mutants: the out-check, the dismount refusal, the record)', () => {
  const { w, rt, state, step } = makeWorld();
  rt.summonTransport();
  step(5);
  assert.equal(rt.stableView().out, true);
  const changed = w.changed;
  assert.deepEqual(rt.sendTransportAway(), { ok: true, text: HCC_TEXT.sentBoth });
  assert.equal(state().Mode, WAGON_MODE.WithPlayer);
  assert.equal(state().HorseMode, HORSE_MODE.WithPlayer);
  assert.deepEqual([state().WorldX, state().WorldZ, state().HorseWorldX, state().HorseWorldZ], [0, 0, 0, 0]);
  assert.ok(w.changed > changed, 'the presentation told');
  assert.equal(rt.view().deployed, null, 'the parked wagon\'s presentation gone');
  assert.deepEqual(rt.sendTransportAway(), { ok: false, text: HCC_TEXT.alreadyAway }, 'nothing out: nothing sent');
  // stabled, the transport window mounts the cart from anywhere (the mod's WithPlayer law)
  assert.equal(rt.canUseTransport(TRANSPORT.Cart).allowed, true);
  // summoned again
  assert.equal(rt.summonTransport().ok, true);
  assert.equal(state().Mode, WAGON_MODE.Deployed);
  // a horse left waiting is sent too; riding, nothing is sent
  const h = makeWorld({ cart: false });
  h.rt.summonTransport();
  assert.equal(h.state().HorseMode, HORSE_MODE.LooseStationary);
  h.w.mode = TRANSPORT.Horse;
  assert.deepEqual(h.rt.sendTransportAway(), { ok: false, text: HCC_TEXT.sendAwayDismount });
  h.w.mode = TRANSPORT.Foot;
  assert.deepEqual(h.rt.sendTransportAway(), { ok: true, text: HCC_TEXT.sentHorse });
  assert.equal(h.state().HorseMode, HORSE_MODE.WithPlayer);
  assert.equal(h.state().Mode, WAGON_MODE.None, 'no wagon owned: none');
});

test('HOLDINGS Send away is refused indoors and aboard, owning nothing, and with physical persistence off (nothing stands in the world to send)', () => {
  const { w, rt } = makeWorld();
  rt.summonTransport();
  w.inside = true;
  assert.deepEqual(rt.sendTransportAway(), { ok: false, text: HCC_TEXT.sendAwayOutdoorsOnly });
  w.inside = false; w.ship = true;
  assert.deepEqual(rt.sendTransportAway(), { ok: false, text: HCC_TEXT.sendAwayOutdoorsOnly });
  assert.deepEqual(makeWorld({ cart: false, horse: false }).rt.sendTransportAway(), { ok: false, text: HCC_TEXT.doNotOwnHorseOrWagon });
  const off = makeWorld({ settings: { physicalPersistence: false } });
  off.rt.handleSettingsChanged();
  assert.deepEqual(off.rt.sendTransportAway(), { ok: false, text: HCC_TEXT.notInTheWorld });
});

test('HOLDINGS the horse renamed from the page by the prompt\'s own law (an empty name keeps the old one, the mod\'s length bound); no horse, no name', () => {
  const { rt } = makeWorld();
  assert.equal(rt.renameHorse('  Shadowmere  '), 'Shadowmere');
  assert.equal(rt.horseName, 'Shadowmere');
  assert.equal(rt.renameHorse('   '), 'Shadowmere', 'empty keeps it');
  assert.equal(rt.renameHorse('x'.repeat(60)).length, 31, 'HORSE_NAME_MAX');
  assert.equal(makeWorld({ horse: false }).rt.renameHorse('Nobody'), null);
});

test('HOLDINGS stableView: the pair as the page reads it - owned, its modes, a parked wagon\'s and a waiting horse\'s distance off the player in the scene\'s metres, the load', () => {
  const { w, rt, walk } = makeWorld();
  w.weight = 120;
  rt.summonTransport();
  walk(30, 90);
  const v = rt.stableView();
  assert.deepEqual({ ...v, wagonAt: undefined }, { persistence: true, transport: TRANSPORT.Foot, hasHorse: true, hasCart: true, horseName: '', wagonMode: WAGON_MODE.Deployed, horseMode: HORSE_MODE.HitchedToWagon,
    wagonStabled: false, horseStabled: false,     // WAGON-STABLED (
    wagonAt: undefined, horseAt: null, out: true, inside: false, onShip: false, kg: 120, limit: 750 });
  assert.ok(v.wagonAt >= 32 && v.wagonAt <= 33, `the wagon 2.5 m behind where it was summoned, 30 m walked: ${v.wagonAt}`);
});

// ── the page ─────────────────────────────────────────────────────────────────────────────────────────────────────────

test('HOLDINGS the Stable\'s words: each state of the pair a chip and a line - ridden, in harness, following, waiting how far, hitched to the parked wagon, parked, stabled (WAGON-STABLED: sent away), with you (the mod\'s WithPlayer never sent); the classic transport\'s with the mod off or the persistence off; none owned none drawn', () => {
  const view = (o) => ({ persistence: true, transport: TRANSPORT.Foot, hasHorse: true, hasCart: true, horseName: '', wagonMode: WAGON_MODE.WithPlayer, horseMode: HORSE_MODE.WithPlayer, wagonAt: null, horseAt: null, out: false, kg: 0, limit: 750, ...o });
  const at = (o) => stableWords({ hcc: true, hasHorse: true, hasCart: true, view: view(o) });
  assert.deepEqual([at({ transport: TRANSPORT.Horse }).horse.state, at({ transport: TRANSPORT.Cart }).horse.state, at({ transport: TRANSPORT.Cart }).wagon.state], ['Riding', 'In harness', 'Driving']);
  const team = at({ wagonMode: WAGON_MODE.FollowingPlayer, horseMode: HORSE_MODE.HitchedToWagon });
  assert.deepEqual([team.horse.state, team.wagon.state], ['Following', 'Following']);
  assert.deepEqual(at({ horseMode: HORSE_MODE.LooseStationary, horseAt: 42 }).horse, { state: 'Waiting', tone: 'is-away', line: 'Waiting where you left it, 42 m away.' });
  assert.equal(at({ wagonMode: WAGON_MODE.Deployed, horseMode: HORSE_MODE.HitchedToWagon, wagonAt: 1500 }).horse.line, 'Hitched to your parked wagon, 1.5 km away.');
  assert.equal(at({ wagonMode: WAGON_MODE.Deployed, wagonAt: null }).wagon.line, 'Parked away from here.');
  // WAGON-STABLED (
  // beside the player, and the next door parks it outside (test/systems/horse/fb1015_wagonstabled.test.js)
  assert.deepEqual([at({ horseStabled: true, wagonStabled: true }).horse.state, at({ horseStabled: true, wagonStabled: true }).wagon.state], ['Stabled', 'Stabled']);
  assert.deepEqual([at({}).horse.state, at({}).wagon.state], ['With you', 'With you']);
  assert.equal(stableWords({ hcc: false, hasHorse: true, hasCart: false }).horse.state, 'With you');
  assert.equal(stableWords({ hcc: false, hasHorse: true, hasCart: false }).wagon, null);
  assert.equal(stableWords({ hcc: true, hasHorse: false, hasCart: true, view: view({ persistence: false, hasHorse: false }) }).wagon.state, 'With you');
  assert.equal(farWords(999), '999 m away');
  assert.equal(farWords(1000), '1.0 km away');
});

test('HOLDINGS the Stable page over the real runtime through the hosts\' one seam (stableProviderFor): its two cards with their pictures (the items\' own art), the load\'s meter, Summon and its word under the cards, Send away once out, the horse renamed in place', () => {
  const { rt, state } = makeWorld();
  let on = true;
  setHoldingsProvider(stableProviderFor({ runtime: rt, on: () => on, hasHorse: () => true, hasCart: () => true }));
  assert.equal(stablePageShown(), true);
  assert.deepEqual(STABLE_PAGE_SECTIONS, [['stable', 'Stable']]);
  resetHoldingsPages();
  let re = 0;
  const draw = () => { const d = el('div', 'px-qdetail'); drawStablePage(d, () => { re++; }, kit); return d; };
  let d = draw();
  assert.match(d.textContent, /Your horse.*With you/);     // WAGON-STABLED (
  assert.match(d.textContent, /Your wagon.*With you/);
  assert.match(d.textContent, /0\/750/, 'the load against the wagon\'s limit');
  assert.equal(buttons(d, 'Send away').length, 0, 'nothing out to send');
  buttons(d, 'Summon')[0].onclick();
  assert.equal(state().Mode, WAGON_MODE.Deployed);
  d = draw();
  assert.match(d.textContent, new RegExp(HCC_TEXT.summonedBoth.replace('.', '\\.')));
  buttons(d, 'Send away')[0].onclick();
  d = draw();
  assert.match(d.textContent, /go back to the stable/);
  assert.equal(state().Mode, WAGON_MODE.WithPlayer);
  assert.match(d.textContent, /Your horse.*Stabled/);   // WAGON-STABLED: sent away, the cards say so
  assert.match(d.textContent, /Your wagon.*Stabled/);
  assert.equal(buttons(d, 'Send away').length, 0, 'nothing out to send');
  // the name, in place
  buttons(d, 'Rename horse')[0].onclick();
  d = draw();
  const field = byTag(d, 'input')[0];
  assert.equal(field.maxLength, 31);
  field.value = 'Bucephalus'; field.oninput();
  buttons(d, 'Name')[0].onclick();
  d = draw();
  assert.match(d.textContent, /Bucephalus/);
  assert.match(d.textContent, /Your horse is called Bucephalus\./);
  // the mod off: the classic transport's words, no acts
  on = false;
  d = draw();
  assert.match(d.textContent, /With you/);
  assert.equal(buttons(d, 'Summon').length, 0);
  assert.match(d.textContent, /Turn on Horse Cart and Cargo/);
  // nothing owned
  setHoldingsProvider(stableProviderFor({ runtime: rt, on: () => true, hasHorse: () => false, hasCart: () => false }));
  const none = makeWorld({ horse: false, cart: false });
  setHoldingsProvider(stableProviderFor({ runtime: none.rt, on: () => true, hasHorse: () => false, hasCart: () => false }));
  d = draw();
  assert.match(d.textContent, /You own no horse and no wagon\. A city's or town's Stable sells horses to ride, and its Wagon Yard carts and wagons/);   // MERCHANT-YARDS: the General Store no longer sells either; AUDIT Y6: a town with no room stands neither, so never "every"
  setHoldingsProvider(null);
  assert.equal(stablePageShown(), false);
});

test('HOLDINGS the pictures are the two items\' own (DFU\'s Horse 94 and Small Cart 93 inventory art); THE ONE CONSTRUCTION SEAM - both hosts that stand Horse Cart and Cargo build the Stable\'s provider through stableProviderFor, never their own', () => {
  const T = JSON.parse(read('src/characters/itemTemplates.json'));
  const row = (i) => T.find((t) => t.index === i);
  assert.deepEqual([row(94).playerTextureArchive, row(94).playerTextureRecord], [HORSE_ART.archive, HORSE_ART.record]);
  assert.deepEqual([row(93).playerTextureArchive, row(93).playerTextureRecord], [WAGON_ART.archive, WAGON_ART.record]);
  assert.ok(CSA_ITEM_TEMPLATES.length === 2);
  for (const host of ['src/scenes/world.js', 'src/scenes/exterior.js']) {
    const s = read(host);
    assert.match(s, /setHoldingsProvider\(\{\n    \.\.\.stableProviderFor\(\{ runtime: hccRuntime, on: hccOn,/, `${host} through the one seam`);
    assert.doesNotMatch(s, /summonTransport\(\)|sendTransportAway\(\)/, `${host} never calls the acts itself`);
  }
  // the FOUR HOSTS: the interiors and the dungeon stand no runtime of their own - the world host's provider answers
  // over them, and a summon or a send away there is refused by the runtime's own indoor law (pinned above)
  for (const host of ['src/scenes/worldModes.js', 'src/scenes/dungeonContext.js']) assert.doesNotMatch(read(host), /setHoldingsProvider/);
});
