// AUDIT 68 (2026-09-24), cluster "worldjs" - src/scenes/world.js.
// The whole-tree sweep's pins for the streaming host: every assertion
// here failed on the base (ad238de0) and passes after the fix. Where the
// host needs a browser, the host's OWN source text is lifted and run over
// stubs, so a revert runs inside the assertion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createPlayerMagic } from '../../src/scenes/hostMagic.js';
import { liveEnchantFoeSinks } from '../../src/scenes/shared.js';
import { hostText } from '../hostText.mjs';   // HOST-SPLIT 2: the world host whole

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

/** The text from `from` up to (and including) the first `to` after it. */
function lift(src, from, to) {
  const i = src.indexOf(from);
  assert.ok(i >= 0, `lift: ${from.slice(0, 60)} is gone`);
  const j = src.indexOf(to, i);
  assert.ok(j > i, `lift: no ${JSON.stringify(to)} after ${from.slice(0, 60)}`);
  return src.slice(i, j + to.length);
}
/** The one line starting (after indentation) with `head`, inside the
 *  block that opens at `within`. */
function lineIn(src, within, head) {
  const i = src.indexOf(within);
  assert.ok(i >= 0, `lineIn: ${within} is gone`);
  const k = src.indexOf(`\n${head}`, i);
  assert.ok(k > i, `lineIn: no ${head.trim()} under ${within}`);
  return src.slice(k + 1, src.indexOf('\n', k + 1));
}

// ---- X4: the cast engine's provenance reaches the sinks ----------------

const blast = { name: 'Blast', index: 91, element: 4, rangeType: 4, effects: [{ type: 4, subType: 0, magnitudeBaseLow: 10, magnitudeBaseHigh: 10, magnitudeLevelBase: 0, magnitudeLevelHigh: 0, magnitudePerLevel: 1, durationBase: 0, durationMod: 0, durationPerLevel: 1, chanceBase: 0, chanceMod: 0, chancePerLevel: 1 }] };
const mkEntity = () => ({ level: 1, health: 40, maxHealth: 40, magicka: 0, maxMagicka: 0, skills: new Array(40).fill(30), stats: { willpower: 30 }, career: {}, activeEffects: [] });
const mkFoe = (x) => ({ dead: false, ai: { feet: [x, 0, 0] }, entity: mkEntity() });

/** The REAL engine, handed a host's own sinks door. */
function engineOver(door, foes) {
  const player = { isPlayer: true, level: 1, health: 100, maxHealth: 100, magicka: 500, maxMagicka: 500, skills: new Array(40).fill(50), skillUses: new Array(40).fill(0), stats: { intelligence: 50, willpower: 50, endurance: 50 }, career: {}, activeEffects: [] };
  return createPlayerMagic({
    renderer: { createBillboardBatch: () => ({}), destroyBillboardBatch: () => {} },
    audio: { playOneShot() {}, play3d() {}, playOneShotId() {}, play3dId() {} },
    getTexture: async () => ({ getSize: () => [16, 16], getScale: () => [0, 0] }),
    uploadRecord() {}, uploadRecordFrame() {}, collider: { raycast: () => Infinity },
    playerEntity: player,
    playerSinks: { hurt() {}, heal() {}, drainMagicka() {}, restoreMagicka() {}, drainFatigue() {}, restoreFatigue() {}, say: () => {} },
    say: () => {}, surfacePlayer() {},
    foes: () => foes, foeSinks: door,
    absorbCtx: () => ({ inside: false, day: true }), rolls: () => 0.99,
  });
}

/** A street host's cast-engine door, mounted from its own source: its
 *  `foeSinks`, its `enchantFoeSinks` router and the door the engine is
 *  handed, over the real shared.liveEnchantFoeSinks. */
function streetDoor(src, modes, seen) {
  const sinks = lift(src, '  const foeSinks = (g, fromPlayer = true) => ({', '\n  });');
  const router = lineIn(src, 'const _insidePool = () =>', '  const enchantFoeSinks = ');
  const door = lineIn(src, 'const magic = createPlayerMagic({', '    foeSinks: ');
  return new Function('liveEnchantFoeSinks', 'exteriorFoes', 'cityGuards', 'player', 'maxFatigue', 'modes', '_insidePool',
    `${sinks}\n${router}\nreturn ({\n${door}\n}).foeSinks;`)(
    liveEnchantFoeSinks,
    { damageFoe: (g, n, feet, kd, opts) => seen.push({ pool: 'encounter', n, fromPlayer: opts?.fromPlayer }) },
    { hurtGuard: (g, n, feet, kd, opts) => seen.push({ pool: 'watch', n, fromPlayer: opts?.fromPlayer }) },
    { pos: [0, 0, 0] }, () => 100, modes, () => modes.insideFoes());
}

/** An enemy mage's AreaAtRange burst at the player, beside a guard, through a street host's own door. */
function blastBesideGuard(host) {
  const seen = [];
  const guard = mkFoe(1);
  const mage = mkFoe(10); mage._encounter = true;
  const modes = { dungeonCtx: null, insideFoes: () => [], insideFoeSinksFor: () => null };
  const magic = engineOver(streetDoor(read(`src/scenes/${host}`), modes, seen), [guard, mage]);
  magic.explodeAt([0, 0.9, 0], blast, 1, [0, 0, 0], { entity: mage.entity, sinks: null }, { excludeFoe: mage });
  assert.deepEqual(seen, [{ pool: 'watch', n: 10, fromPlayer: false }],
    `${host}: the engine said "not the player" and the watch heard it - no handleAttackFromPlayer, no Murder on a kill`);
  seen.length = 0;
  magic.explodeAt([0, 0.9, 0], blast, 1, [0, 0, 0], null, { excludeFoe: mage });
  assert.deepEqual(seen, [{ pool: 'watch', n: 10, fromPlayer: true }], `${host}: and the player's own blast is still the player's`);
}

test('AUDIT 68 X4-foe-sink-provenance-dropped: world.js - an enemy\'s blast on a guard reaches the watch as the ENEMY\'s, not the player\'s', () => {
  blastBesideGuard('world.js');
});

test('AUDIT 68 X4-foe-sink-provenance-dropped: exterior.js - the town host\'s twin door carries it too', () => {
  blastBesideGuard('exterior.js');
});

test('AUDIT 68 X4-foe-sink-provenance-dropped: the router hands the provenance to every host\'s sinks, the interior and dungeon doors included', () => {
  const street = {}, room = {}, cell = {};
  const sinks = (tag) => (g, fp) => ({ tag, fp });
  const ctx = { foes: [cell], foeSinksFor: sinks('dungeon') };
  const pool = () => [room];
  assert.deepEqual(liveEnchantFoeSinks(street, ctx, sinks('exterior'), pool, sinks('inside'), false), { tag: 'exterior', fp: false });
  assert.deepEqual(liveEnchantFoeSinks(room, ctx, sinks('exterior'), pool, sinks('inside'), false), { tag: 'inside', fp: false });
  assert.deepEqual(liveEnchantFoeSinks(cell, ctx, sinks('exterior'), pool, sinks('inside'), false), { tag: 'dungeon', fp: false });
});

// ---- S22: a door in the SECOND copy of a repeated block is that copy's building ----

// ---- S22: the ship's boarding memory survives a recenter and a reload ----

// ---- S22: one world move at a time ----

// ---- S22: a failed road network is not a known one, and the retry keeps what it painted ----

// ---- S22: TL2's edge is the side the landing already faces ----

// ---- S17: the grass root takes the tile's real mean colour ----

test('AUDIT 68 S17-ground-mean-colour: a blade\'s root is the mean of the tile\'s own texels, off the color32 getColor32 mints - learned whenever the scene lacks it', async () => {
  const { tileMeanColour, grassRecordsOf, floorRecordsOf } = await import('../../src/render/labGrass.js');
  const { TextureFile } = await import('../../src/formats/textureFile.js');
  assert.equal(typeof tileMeanColour, 'function');
  // the producer: a real TextureFile over a palette where index 7 is (200,200,200) and 9 is (100,50,0)
  const t = new TextureFile();
  const pal = new Uint8Array(768);
  pal.set([200, 200, 200], 7 * 3); pal.set([100, 50, 0], 9 * 3);
  assert.ok(t.palette.load(pal));
  const bitmap = { width: 2, height: 1, data: new Uint8Array([7, 9]) };
  const near = (a, b) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-9, `${a} vs ${b}`));
  near(tileMeanColour(t.getColor32(bitmap, 0)), [150 / 255, 125 / 255, 100 / 255]);
  near(tileMeanColour(t.getColor32({ width: 1, height: 1, data: new Uint8Array([7]) }, 0)), [200 / 255, 200 / 255, 200 / 255]);
  // the host's learning, run - with the renderer's tile array ALREADY cached (it outlives the scene), so only the
  // learning runs. PIN MOVED (OW-HITCH): its home is scenes/groundSets.js (HOST-SPLIT), and it is run there whole, through
  // the door the build asks (loadGroundSet) rather than lifted out of the host's text
  const { createGroundSets } = await import('../../src/scenes/groundSets.js');
  const groundTex = { recordCount: 2, getDFBitmap: (r) => (r === 0 ? bitmap : { width: 1, height: 1, data: new Uint8Array([9]) }), getColor32: (b, a) => t.getColor32(b, a) };
  // GRASS-LIT2: the drawn set's means - a texture mod's tile set where one dresses the archive (null: none, the classic's);
  // AUDIT GRASS-LIT2 B2: taken at the upload, off the layers drawn - here the scene's own map of them
  const run = async (drawnMeans) => {
    const maps = { grassRecords: new Map(), floorRecords: new Map(), groundPuddles: new Map(), groundMeanColour: new Map(), groundDrawnMeans: new Map(drawnMeans ? [[302, drawnMeans]] : []) };
    let uploads = 0;
    const renderer = { tileArrays: new Map([[302, {}]]), applyGroundSharpness() {}, *uploadTileArraySteps() { uploads++; } };
    const sets = createGroundSets({ renderer, getTexture: async () => groundTex, labGrass: {}, breathe: async () => {}, ...maps });
    await sets.loadGroundSet(302, { tileArray() {} });
    assert.equal(uploads, 0, 'a cached array is not uploaded again');
    return maps;
  };
  let m = await run(null);
  assert.ok(m.floorRecords.has(302), 'the floor\'s records learned in the same step');
  assert.equal(m.groundPuddles.get(302)?.length, 2, 'and the puddle mask with them, off the same records');
  assert.ok(m.groundMeanColour.has(302), 'the scene learned the archive\'s colours though the tile array was the renderer\'s already');
  near(m.groundMeanColour.get(302)[0], [150 / 255, 125 / 255, 100 / 255]);
  near(m.groundMeanColour.get(302)[1], [100 / 255, 50 / 255, 0]);
  assert.ok(grassRecordsOf && floorRecordsOf);
  // a mod's tile set: the colours are ITS (the ground drawn), the records and the puddles still the classic file's
  const modTile = (r, g, b) => ({ width: 2, height: 2, colors: new Uint8Array([r, g, b, 255, r, g, b, 255, r, g, b, 255, r, g, b, 255]) });
  m = await run([modTile(30, 90, 20), modTile(60, 60, 60)].map(tileMeanColour));
  near(m.groundMeanColour.get(302)[0], [30 / 255, 90 / 255, 20 / 255]);
  near(m.groundMeanColour.get(302)[1], [60 / 255, 60 / 255, 60 / 255]);
  assert.equal(m.groundPuddles.get(302)?.length, 2);
});
