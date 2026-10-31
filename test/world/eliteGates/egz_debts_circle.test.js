// EG-ZP (2026-10-12, the Elite Gates arc; bible/11-Multiplayer/Elite-Gates.md section 29 - EVERY ALLOCATION HAS AN OWNER:
// "every exit path ... frees the hall's meshes, colliders, riders, telegraph buffers and reverb buffers, its fragments'
// with them"): THE CIRCLE'S MESHES FREED. The mode machine's circle (scenes/worldModes.js - its stand, THE SWAP, the band
// dress and egCircleDown, its own source) stood into a context built of the dungeon host's own teardown lines
// (scenes/dungeonContext.js `_teardowns`, `addTeardown`, the run in destroy()), over a counting renderer and the real
// collider: the context's end - the one door every way out of the Spire goes through - lets the whole circle go, once,
// its slots emptied before anything is freed, before the band dress it wore; the next stand builds anew.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { egCircleSpecs, egBandOfCircle, egSpecGive, EG_TEXT } from '../../../src/net/eliteGates/egLaw.js';
import { createEgSwap } from '../../../src/scenes/eliteGates/egSwap.js';
import { egCircleBuild, egCircleGates } from '../../../src/world/eliteGates/egCircleParts.js';
import { buildEgCircleModel, egCircleColliderTris, egCircleLights, egGateParts } from '../../../src/world/eliteGates/egHall.js';
import { realmArt } from '../../../src/world/superDungeon/sdRealmArt.js';
import { SD_REALM_ARCHIVE } from '../../../src/world/superDungeon/sdRealm.js';
import { identity } from '../../../src/world/mat4.js';
import { egBandArt, egBandArchive, EG_DRESS_RECORDS, EG_BAND_RECORDS } from '../../../src/world/eliteGates/egBandArt.js';
import { createEgOccluders } from '../../../src/scenes/eliteGates/egOcclude.js';
import { buildEgLookModel } from '../../../src/world/eliteGates/egLook.js';
import { Collider } from '../../../src/player/collider.js';
import { egBeatTellDown } from '../../../src/scenes/eliteGates/egSpan.js';   // AUDIT EG III (lane4 #4): the band dress's owner frees the Beats' pictures too
import { createEgGroundLook } from '../../../src/scenes/eliteGates/egGroundLook.js';   // EG-LOOK: the circle's ruin and its band's wreck, stood with it
import { buildEgVista } from '../../../src/world/eliteGates/egVista.js';
/** PIN MOVED (EG-LOOK THE WRECK - Elite-Gates-Look.md section 4, "one mesh a band ..., made once a band, freed with it"):
 *  the band's wreck (scenes/eliteGates/egWreckLook.js: its wings batched, the Spire's underside) outlives a circle of its band and goes
 *  with the band's dress at the breach's end (egBandsDown) - these meshes of it stay live after a context's end. */
const WRECK = ((v) => (v.wings.length ? 1 : 0) + (v.under ? 1 : 0))(buildEgVista(egBandOfCircle(4)));

const SEED = 12345;
const B = '0123456789abcdef';
const rd = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const between = (src, a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); assert.ok(i > 0 && j > i, `${a} .. ${b}`); return src.slice(i, j); };
const lineOf = (src, pred, what) => { const l = src.split('\n').find(pred); assert.ok(l, what); return l; };
// PIN MOVED (AUDIT EG V, e: L6-8, L6-9 - the worker's build is egCircleBuild: the parts, the circle's five specs, the band's
// dress when asked)
const syncWorker = () => {
  const w = { onmessage: null, onerror: null, postMessage(msg) { w.onmessage?.({ data: { t: 'built', id: msg.id, parts: egCircleBuild(msg) } }); }, terminate() {} };
  return w;
};

const eh = (c) => ({ b: B, seed: SEED, c, geo: 0 });
const circleBuckets = (ctx) => [...ctx.collider._buckets.keys()].filter((k) => k === 'eg:hall' || k.startsWith('eg:gate:')).sort();

test('EG-ZP THE CIRCLE LET GO WITH ITS CONTEXT (scenes/worldModes.js egCircleDown, handed to scenes/dungeonContext.js addTeardown; section 29): a circle stood - its mesh, its waystones\' mesh and each Rampart\'s portcullis, their draws and their buckets - is freed whole as the context it stands in is destroyed: every mesh once and no free twice, every draw of it gone, its floors\' and portcullises\' buckets off the collider, the dither pass holding nothing, its slots and lamps empty before the first free; a second end frees nothing; and only then the band dress it wore (mutants: the teardown never handed; the teardowns never run; the circle kept; the waystones kept; a portcullis kept; a draw of a freed mesh left; the floors left on the collider; the dither pass left holding it; a slot emptied after its free; the lamps kept)', () => {
  assert.equal(egCircleGates(SEED, 4).length, 2, 'circle 4 stands two Ramparts');
});

