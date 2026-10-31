// FIELD BUGS 2026-10-18d CRAFT-HOWTO - the Discord's #bug-reports, "No clue how to start crafting", MoonGeneral: "I've
// already found out really quickly how to do the gathering jobs ... But for the crafting side of this mechanic i have no
// clue on how to start it. When going to the professions tab when selecting a gathering quest besides it being easy to
// understand it has an extra explanation for every gathering skill, but when it comes to the crafting skills you no
// explanation there." Asked: "a bit more detailed piece about crafting in the tutorial ... something that helps new
// players know where to look", and "the crafting skill tabs in professions also should have an tutorial part for it
// just like the gathering skills".
//
// The Professions page said how each gathering profession gathers (GATHER_HOW, TOOL-SAID; Hunting's and Fishing's own)
// and of the five crafts only Provisioning's brew and Enchanting's disenchanting - Smithing, Building and Outfitting
// showed their cards and nothing else, and Provisioning never said Cooking. Now every craft's pane says where its
// stations stand and what they do (ui/professions/profPages.js CRAFT_HOW), and the Tutorials carry a Crafting page that
// pops with the first gather. The page is drawn for real over a stand-in book; the words are held to the law and the
// hosts' station questions they name.
import '../../chargenDom.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  PROFESSIONS, SAW_RECIPES, CURE_RECIPES, SMELT_RECIPES, MASON_RECIPES, COOK_FIRE, WEAVERS_STOCK, COUNTER_ONLY, trackOf, WEAVE_RECIPES, SPIN_RECIPES,
} from '../../../src/net/professionLaw.js';
import { RECIPES, COOKING_RECIPES, craftXp, cookXp } from '../../../src/net/recipeLaw.js';
import { xpSources, gradeNote } from '../../../src/ui/professions/craftHall.js';
import {
  setProfessionsPages, drawProfessionsPage, resetProfPages, CRAFT_HOW, GATHER_HOW, FISHING_HOW, ALCHEMY_HOW, ENCHANTING_HOW,
  MINING_GROUND_LINE, PROF_PAGE_SECTIONS,
} from '../../../src/ui/professions/profPages.js';
import { tutorialById, tutorialsIn, tutorialText } from '../../../src/systems/tutorials.js';
import { tutorialsMatching } from '../../../src/ui/tutorialsPane.js';
import { actionLabel } from '../../../src/systems/inputActions.js';

const src = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');

/** A stand-in book: every track at rank 0, the professions open - the shape the page reads (net/profBook.js). */
function standInBook() {
  const tracks = new Map(PROFESSIONS.map((p) => [p.id, { profession: p.id, xp: 0, rank: 0, specs: { 50: null, 100: null }, respec: null, free: [] }]));
  return {
    state: { open: true, day: 1, character: 'c', account: 'a', readAt: Date.now(), stores: new Map(), tracks, today: {}, caps: null, hunt: { hides: 0, high: 0 }, hauls: 0 },
    stale: () => false, refresh: async () => ({ ok: true }), track: (id) => tracks.get(trackOf(id)), choose: async () => ({ ok: true }),
  };
}
/** THE REAL PROFESSIONS PAGE with each profession chosen in turn: what its pane says before its cards - the paragraphs
 *  drawn on the pane itself (a card's "Chosen at 50." is the cards' own). */
function panes() {
  resetProfPages();
  setProfessionsPages({ book: standInBook(), name: (k) => k });
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const kit = { el, divider: (w) => el('h3', null, w), meter: () => el('div') };
  let root = null;
  const draw = () => { root?.remove?.(); root = el('div'); document.body.append(root); drawProfessionsPage(root, draw, kit); };
  const out = {};
  try {
    draw();
    for (const p of PROFESSIONS) {
      const row = [...root.querySelectorAll('button')].find((b) => b.className.split(/\s+/).includes('prof-row') && b.children[0]?.textContent === p.name);
      assert.ok(row, `${p.name}: a row on the page`);
      row.onclick();
      const pane = root.querySelector('.prof-pane');
      assert.equal(pane.querySelector('h3').textContent, p.name, `${p.name}: its pane`);
      out[p.id] = pane.children.filter((c) => c.tagName === 'P' && c.className === 'px-note').map((c) => c.textContent);
    }
  } finally { setProfessionsPages(null); resetProfPages(); root?.remove(); }
  return out;
}

test('CRAFT-HOWTO THE PAGE: every profession\'s pane says how it is done - each craft its CRAFT_HOW words where a gathering one\'s stand (Provisioning its brew and then its cooking, Enchanting its disenchanting), every gatherer as before; no profession of the ten without one (mutants: Smithing\'s, Building\'s, Outfitting\'s and the cooking line dropped; the crafts\' branch, the brew, the disenchanting, the three gatherers\', Hunting\'s and Fishing\'s dropped)', () => {
  const said = panes();
  assert.deepEqual(Object.keys(said), PROFESSIONS.map((p) => p.id), 'the ten, every one drawn');
  // CRAFT-HALL: a pane's last note is its grade note where it has one (craftHall.js gradeNote), after the how-to
  for (const p of PROFESSIONS) if (gradeNote(p.id, 0)) assert.equal(said[p.id].pop(), gradeNote(p.id, 0), `${p.name}: its grade note last`);
  assert.deepEqual(said, {
    mining: [GATHER_HOW.mining, MINING_GROUND_LINE],
    logging: [GATHER_HOW.logging],
    herbalism: [GATHER_HOW.herbalism],
    hunting: [said.hunting[0]],
    fishing: [FISHING_HOW],
    smithing: [CRAFT_HOW.smithing()],
    building: [CRAFT_HOW.building()],
    outfitting: [CRAFT_HOW.outfitting()],
    provisioning: [ALCHEMY_HOW, CRAFT_HOW.provisioning()],
    enchanting: [ENCHANTING_HOW(0)],
  });
  assert.match(said.hunting[0], /^With a Skinning Knife in your pack, you can skin a creature you killed\./, 'PIN MOVED (VOICE2): Hunting\'s own words');
  // a craft's words are the table's, every one a paragraph of its own (the four crafts the brew and the item maker leave)
  assert.deepEqual(Object.keys(CRAFT_HOW), ['smithing', 'building', 'outfitting', 'provisioning']);
  for (const p of PROFESSIONS.filter((x) => x.kind === 'crafting')) {
    assert.ok(said[p.id].length >= 1 && said[p.id].every((w) => w.length > 120), `${p.name}: a how-to, not a word`);
    assert.doesNotMatch(said[p.id].join(' '), /not practised|daggerfall|\bDFU\b/i, `${p.name}: practised, and the old game unnamed`);
  }
});

/** A shop type's words, as the page says them, and as the Tutorials' list says them.
 *  names the shops as the list does (Weaponsmiths), not one shop's (a Weaponsmith's), to say it within forty words. */
const SHOP_WORDS = Object.freeze({
  WeaponSmith: ['Weaponsmiths', 'Weaponsmiths'], Armorer: ['Armorers', 'Armorers'], FurnitureStore: ['Furniture Stores', 'Furniture Stores'],
  ClothingStore: ['Clothing Stores', 'Clothing Stores'], GeneralStore: ['General Stores', 'General Stores'], PawnShop: ['Pawn Shops', 'Pawn Shops'],
  GemStore: ['Gem Stores', 'Gem Stores'], Alchemist: ['Alchemists', 'Alchemists'],
  GuildHall: ['Mages Guild halls', 'Mages Guilds'],   // POTION-DOOR: the Mages Guild's hall an alchemy station (alchemyHere); the tutorial's list within its sixty words
});
/** Each craft's how-to by the station questions it names. */
const HOW_OF = () => ({
  forgeHere: CRAFT_HOW.smithing(), jewellerHere: CRAFT_HOW.smithing(), workbenchHere: CRAFT_HOW.building(), masonHere: CRAFT_HOW.building(),
  loomHere: CRAFT_HOW.outfitting(), alchemyHere: ALCHEMY_HOW,
});

test('CRAFT-HOWTO THE WORDS ARE THE CODE\'S: each craft names the shops its stations\' questions answer and the home\'s own, the joinery and any fire; what the works make and what pays its XP is the law\'s (mutants: a shop dropped from Smithing\'s words; a home dropped from Outfitting\'s; the joinery dropped; a saw and a cure paying XP; the brew\'s carried goods unsaid)', () => {
  const how = HOW_OF();
  assert.match(ENCHANTING_HOW(0), /at an enchanting station, on the Crafting page\. Mages Guild halls and your home have one\./, 'PIN MOVED (PLAIN-TEXT): the station\'s places said plainly');
  assert.match(CRAFT_HOW.building(), /^Carpentry needs a workbench: Furniture Stores, joineries and your home have one\./, 'PIN MOVED (PLAIN-TEXT)');
  // the fire is any lit one, and nobody's to charge for
  assert.deepEqual(COOK_FIRE, { kind: 'fire', fee: 0 });
  assert.match(CRAFT_HOW.provisioning(), /^Cook at any lit fire: a campfire, a hearth or a brazier\. Stand close to the flame\./, 'PIN MOVED (PLAIN-TEXT)');
  // Stores page is the Holdings tab's. The key opens the Crafting page at a station, and that page says so, not each how-to.
  assert.deepEqual(PROF_PAGE_SECTIONS.map(([id]) => id), ['professions', 'crafting', 'stores']);
  for (const k of ['smithing', 'building', 'outfitting', 'provisioning']) assert.doesNotMatch(CRAFT_HOW[k](), /Stores page/, `${k}: worked on the Crafting page`);

  // THE WORKS: the forge's ingots of mined ore pay Smithing; a saw and a cure pay nothing, a mason's work Building
  const ingots = SMELT_RECIPES.filter((r) => r.out.startsWith('ingot:') && r.inputs.every((i) => /^(metal|ore):/.test(i.key)));
  assert.ok(ingots.length >= 8 && ingots.every((r) => trackOf(r.xp) === 'smithing'), 'the forge smelts the ore you mine, for Smithing XP');
  assert.match(CRAFT_HOW.smithing(), /It smelts ore into ingots; its anvil makes weapons, armor and tools, even from raw ore\./, 'PIN MOVED (PLAIN-TEXT)');
  const raises = (id) => Object.fromEntries(xpSources(id, 0));
  const pays = (v) => /^\d[\d,]* XP\b/.test(v ?? '');
  assert.ok(pays(raises('smithing')['Smelting an ingot']) && pays(raises('smithing')['A piece at the anvil or jeweler\'s bench']));
  assert.ok(SAW_RECIPES.length && SAW_RECIPES.every((r) => r.xp === null && r.station === 'workbench'), 'a saw pays no XP');
  assert.match(CRAFT_HOW.building(), /It saws logs into planks/);
  assert.equal(raises('building')['Sawing planks'], 'No XP');   // AUDIT FB1018D L1-5: each XP clause whole
  assert.ok(pays(raises('building')['A piece at the workbench']) && pays(raises('building')['A cut or mix at the mason\'s bench']));
  assert.ok(MASON_RECIPES.every((r) => trackOf(r.xp) === 'building' && r.station === 'mason'), 'the cut and the mix pay Building');
  assert.deepEqual(MASON_RECIPES.map((r) => r.id), ['cut:stone', 'mix:mortar']);
  assert.ok(CURE_RECIPES.length && CURE_RECIPES.every((r) => r.xp === null && r.station === 'loom' && r.inputs[0].key.startsWith('hide:')), 'a cure pays no XP');
  assert.match(CRAFT_HOW.outfitting(), /It cures hides into leather/);
  assert.equal(raises('outfitting')['Curing, weaving and spinning'], 'No XP');
  assert.ok(pays(raises('outfitting')['A piece at the loom']));
  assert.ok([...WEAVE_RECIPES, ...SPIN_RECIPES].every((r) => r.xp === null && r.station === 'loom'), 'a weave and a spin pay no XP');
  assert.match(CRAFT_HOW.outfitting(), /weaves Root Tendrils into Linen and spins furs into Wool/);
  assert.deepEqual([...new Set(WEAVE_RECIPES.filter((r) => r.out === 'cloth:linen').map((r) => r.inputs[0].key.slice(3)))], ['12'], 'Root Tendrils, template 12');
  assert.ok(SPIN_RECIPES.length && SPIN_RECIPES.every((r) => r.out === 'cloth:wool' && r.inputs[0].key.startsWith('hide:')), 'Wool from hides');
  // every piece a station makes pays its craft's track, a dish Provisioning's as a brew does, and Linen and Wool are bought
  // too (COUNTER_ONLY) - the Weavers' two, Linen a furnisher's counter's too (AUDIT FB1018D L1-9)
  for (const r of RECIPES) {
    assert.ok(['smithing', 'building', 'outfitting', 'provisioning'].includes(trackOf(r.profession)), `${r.id} is a craft's`);
    assert.ok(r.kind === 'dish' ? cookXp(0) > 0 : craftXp(r.tier, 0) > 0, `${r.id} pays its craft`);
  }
  assert.deepEqual(WEAVERS_STOCK.map((s) => s.key), ['cloth:linen', 'cloth:wool']);
  assert.ok(COUNTER_ONLY.includes('cloth:linen') && COUNTER_ONLY.includes('cloth:wool'));
  assert.match(CRAFT_HOW.outfitting(), /Weavers sell Linen and Wool too\.$/);
  // WOVEN-PAYS: cloth bought with silver earns no first-time bonus - said once, in What raises (CRAFT-HALL, PLAIN-TEXT)
  assert.ok(raises('outfitting')['Your first piece at each grade (not of cloth bought with silver)']);
  assert.ok(RECIPES.some((r) => r.kind === 'dish') && RECIPES.filter((r) => r.kind === 'dish').every((r) => trackOf(r.profession) === 'provisioning'), 'a dish pays Provisioning');
  assert.ok(pays(raises('provisioning')['Cooking a dish']) && raises('provisioning')['Your first of each dish and potion']);
  // a dish's goods: the meat a body gives, the net's fish, the herbs and the Basket's food
  const goods = new Set(COOKING_RECIPES.flatMap((r) => r.inputs.map((i) => i.key.split(':')[0] === 'food' ? i.key : 'herb')));
  assert.deepEqual([...goods].sort(), ['food:apple', 'food:egg', 'food:fish', 'food:meat', 'food:mushroom', 'food:orange', 'herb']);
  assert.match(CRAFT_HOW.provisioning(), /Dishes use the meat you skin, the fish you net, herbs and Basket finds, and go to your pack\.$/);
  assert.match(ALCHEMY_HOW, /from what you carry or store\./, 'PIN MOVED (PLAIN-TEXT): the brew\'s words reworded, the carried goods kept');
});

test('CRAFT-HOWTO THE TUTORIAL: a Crafting page among Professions & Survival, after Professions, popping with the first gather beside it - every station\'s shop named as the host answers it, the Stores page where the menu keeps it, found by the pane\'s search; the Professions page no longer says its key opens the Stores (mutants: the page moved off its group; a shop dropped from its list; the seam dropped; the Professions page\'s old words)', () => {
  const page = tutorialById('crafting');
  assert.ok(page, 'a Crafting page');
  assert.deepEqual(tutorialsIn('livelihood').map((p) => p.id), ['foraging', 'professions', 'crafting', 'survival']);
  assert.equal(page.title, 'Crafting');
  assert.equal(page.trigger, tutorialById('professions').trigger, 'when the first gather pops the two before it');
  const { body, points } = tutorialText(page, () => 'DOWN');
  const words = [...body, ...points].join(' ');
  // AUDIT FB1018D L1-6: by the key - "Menu > Holdings" is the Enhanced menu's alone (the Classic skin's Escape is DFU's
  // pause, no tabs), and the key opens the pages on either skin (ui/pauseDoor.js profPageAt)
  assert.match(body[0], /stand at a station and press \[DOWN\]: the Crafting page opens on it\. Cook at any fire\.$/);
  assert.doesNotMatch(words, /Menu >/);
  const list = { forgeHere: 'Forge:', loomHere: 'Loom:', workbenchHere: 'Workbench:', jewellerHere: 'Jeweler\'s bench:',   // PIN MOVED (VOICE2): American spelling (Voice.md rule 8)
  masonHere: 'Mason\'s bench:', alchemyHere: 'Alchemy:' };
  assert.match(words, /Workbench: Furniture Stores, joineries\./);
  assert.match(words, /Enchanting: Mages Guild halls\./);
  assert.match(words, /Your home can hold stations too\. Each crafting profession under \[DOWN\] says more\.$/);
  assert.deepEqual(tutorialsMatching('jeweler').map((p) => p.id), ['crafting'], 'PIN MOVED (VOICE2): the pane\'s search finds it, by its American spelling');
  const prof = tutorialText(tutorialById('professions'), () => 'DOWN').body.join(' ');
  assert.doesNotMatch(prof, /opens them and your Stores/);
  assert.match(prof, /\[DOWN\] opens them, and your stored goods are under Holdings > Stores in the same window\.$/);
  // AUDIT FB1018D L1-7: and the key's Controls row says the same - it opens the Professions page, the Stores a tab away
  assert.equal(actionLabel('Professions'), 'Open your Professions page, or the Crafting page at a station (online)');
});

test('CRAFT-HOWTO IN THE CATALOG: the new words are in the English catalog, the Crafting page\'s last point naming the key it fills (the l10n gate holds the rest)', () => {
  const keys = ['prof.page.how.smithing', 'prof.page.how.building', 'prof.page.how.outfitting', 'prof.page.how.cooking', 'prof.page.how.alchemy',
    'tutorials.crafting.title', 'tutorials.crafting.trigger', 'tutorials.crafting.body', 'tutorials.crafting.shops1', 'tutorials.crafting.shops2', 'tutorials.crafting.more'];
  const en = src('locales/en/Port_Strings.csv');
  for (const k of keys) assert.ok(en.includes(`\n${k},"`), `${k} in the English catalog`);
  assert.match(en, /\ntutorials\.crafting\.more,"[^\n]*\{Professions\}/, 'the key named as a key');
});
