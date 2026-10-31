// EG-LOOK (2026-10-15, Mac: "Literally everything, and no band aids"; bible/11-Multiplayer/Elite-Gates-Look.md section 4,
// with section 1's wreck a band): THE WRECK, PINNED - each band's torn wings of the academy drifting in the haze about the
// hall the eye stands in, and the sealed Spire's underside hanging overhead (world/eliteGates/egVista.js), batched and turned on this
// screen (scenes/eliteGates/egWreckLook.js, scenes/eliteGates/egGroundLook.js). The laws, not the pixels: the wings are the band's own forms in
// the kit's records, each with its torn foundations under it; every wing stands where the page puts it - out from the hall,
// off its floors, out of its neighbours, inside the far plane from every floor and never behind the door or the Court's
// lord from one (measured against the halls the law lays); the underside is the stair's own model at the sky's angular
// size, hung from the eye; the band's wreck costs at most 8,000 triangles and six draws on both tiers; it is built pure,
// byte for byte the same in a worker; and the screen lays each wing turned exactly about its own axis, a dozen times a
// second of the shared clock at most, the phones' never.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import {
  buildEgVista, buildEgWingModel, buildEgVistaUnder, egVistaTurn, EG_VISTA_PLACES, EG_VISTA_WINGS, EG_VISTA_REACH, EG_VISTA_UNDER,
  EG_VISTA_UNDER_DRESS, EG_VISTA_RECORD, EG_VISTA_FORMS, EG_VISTA_LITE, EG_VISTA_BUDGET, EG_VISTA_HAZE, EG_VISTA_UV, EG_VISTA_METAL,
} from '../../../src/world/eliteGates/egVista.js';
import { buildEgUndersideModel, EG_UNDERSIDE } from '../../../src/world/eliteGates/egUndersideModel.js';
import { egWreckBatch, egWreckLay, createEgWreckLook, EG_WRECK_TURN_HZ } from '../../../src/scenes/eliteGates/egWreckLook.js';
import { createEgGroundLook } from '../../../src/scenes/eliteGates/egGroundLook.js';
import { EG_KIT_STYLE, EG_KIT_RECORD } from '../../../src/world/eliteGates/egKit.js';
import { egBandArchive, EG_KIT_MAP } from '../../../src/world/eliteGates/egBandArt.js';
import { EG_SKIES } from '../../../src/world/eliteGates/egLook.js';
import { egAtmosOf } from '../../../src/world/eliteGates/egAtmos.js';
import { EG_SKY_MOON } from '../../../src/render/eliteGates/egSkyMap.js';   // the Shade's moon, painted in its sky
import { egCircleSpecs, egBandOfCircle, EG_HALL_PITCH } from '../../../src/net/eliteGates/egLaw.js';
import { realmToDungeon } from '../../../src/net/superDungeon/sdBrain.js';
import { egLawSeam } from '../../../src/net/eliteGates/egLaw.js';

// PIN MOVED (THE ASCENT - THE ROOMS, LAW 9 - 2026-10-16): these pins measure spec law 8's halls - drawn where no law is named
// (net/eliteGates/egLaw.js egLawSeam - a test's seam, never a breach's: a breach draws its own law), the dress, the camera and the client
// as they were written over law 8's ground; LAW 9's dress is THE DRESS slice's (Elite-Gates-Ascent.md section 8) and its
// ground test/net/eliteGates/law9_rooms.test.js's
egLawSeam(8);

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const rd = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const TAU = Math.PI * 2, DEG = Math.PI / 180;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (len(a) * len(b)))));
const near = (a, b, e = 1e-4) => Math.abs(a - b) <= e;
const trisOf = (m) => m.indices.length / 3;
/** The underside's axis from the eye (EG_VISTA_UNDER's lean toward the course). */
const axis3 = (U) => [0, Math.cos(U.lean), Math.sin(U.lean)];
/** A packed model's triangles: corners, stored normal, uvs and record. */
function tris(m) {
  const out = [];
  for (const s of m.subMeshes) for (let i = s.startIndex; i < s.startIndex + s.primitiveCount * 3; i += 3) {
    const v = [0, 1, 2].map((k) => { const j = m.indices[i + k] * 3; return [m.positions[j], m.positions[j + 1], m.positions[j + 2]]; });
    const uv = [0, 1, 2].map((k) => { const j = m.indices[i + k] * 2; return [m.uvs[j], m.uvs[j + 1]]; });
    const j = m.indices[i] * 3;
    out.push({ v, uv, n: [m.normals[j], m.normals[j + 1], m.normals[j + 2]], rec: s.textureRecord, arch: s.textureArchive });
  }
  return out;
}
/** A wing's reach from its own middle (its sphere's radius - the turn keeps it). */
const reachOf = (m) => { let r = 0; for (let i = 0; i < m.positions.length; i += 3) r = Math.max(r, Math.hypot(m.positions[i], m.positions[i + 1], m.positions[i + 2])); return r; };
/** A hall's floors' eyes (the hall's own frame): every disc's middle and its rim at eight bearings, every band's ends and
 *  middle, every island - an eye's height over each. */
function eyesOf(s) {
  const out = [];
  for (const d of s.discs) { out.push([d.x, d.y + 1.7, d.z]); for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; out.push([d.x + Math.cos(a) * d.r * 0.85, d.y + 1.7, d.z + Math.sin(a) * d.r * 0.85]); } }
  for (const b of s.bands) for (const z of [b.z0, (b.z0 + b.z1) / 2, b.z1]) out.push([b.x, b.y + 1.7, z]);
  for (const i of s.islands ?? []) out.push([i.x, (i.y ?? 0) + 1.7, i.z]);
  return out;
}
/** THE CONES the wreck keeps out of (Elite-Gates-Look.md section 4): from every floor at least `near` m from it, the line
 *  to the door (its doorway, 8 m) or to a Court's lord (14 m - EG_LORD_PRESENCE's tallest), widened by 4 degrees. */
const CONE = Object.freeze({ door: Object.freeze({ h: 8, near: 12 }), lord: Object.freeze({ h: 14, near: 24 }), pad: 4 * DEG });
/** The halls the places are held against: a band's circles on three breaches' seeds (and the Wellhead's deeper ones). */
const hallsOf = (b) => {
  const out = [];
  for (const seed of [7, 7926, 15845]) for (let c = 1; c <= 27; c++) if (egBandOfCircle(c) === b && (c <= 22 || c === 27)) out.push(...egCircleSpecs(seed, c, 0));
  return out;
};

test('EG-LOOK THE WRECK\'S WINGS (world/eliteGates/egVista.js, Elite-Gates-Look.md sections 1 and 4): each band\'s wings are its own wreck (EG_KIT_STYLE), every form built with the one mesh kit in the kit\'s records under the band\'s archive, 200-1,500 triangles, every face wound to its stored normal, stood about its own middle and grown whole by its size; its torn foundations hang under it in the found record - every ledge facing down into the realm\'s light, the strata by depth, every broken tip in the haze; the Cairn\'s gems and the Shade\'s glass in the crystal record, the Wellhead\'s forges in the fixture\'s, the Galleries all marble and gold; the same bytes every build (mutants: a wing\'s normals left unturned by its heading; its size laid across but not up; a ledge facing up; a tip out of the haze; the Galleries\' forms swapped for the Cairn\'s; the metal wearing the picture\'s detail)', () => {
  assert.deepEqual({ ...EG_VISTA_RECORD }, { stone: EG_KIT_RECORD.wreck, found: EG_KIT_RECORD.found, glass: EG_KIT_RECORD.crystal, chain: EG_KIT_RECORD.chain, fire: EG_KIT_RECORD.fixture });
  assert.equal(EG_VISTA_UV.stone, EG_KIT_MAP[EG_KIT_RECORD.wreck].mU, 'the far stone at the art\'s own far law (world/eliteGates/egBandArt.js EG_KIT_MAP)');
  const FL = EG_KIT_MAP[EG_KIT_RECORD.fixture].bands;
  assert.deepEqual([...new Set(EG_KIT_STYLE.flatMap((s) => s.wreck))].sort(), [...EG_VISTA_FORMS].sort(), 'every form the kit names, and no other');
  const kit = new Set(Object.values(EG_VISTA_RECORD));
  for (let b = 0; b < 4; b++) {
    const forms = EG_VISTA_WINGS[b].map((w) => w.kind);
    assert.deepEqual([...new Set(forms)].sort(), [...new Set(EG_KIT_STYLE[b].wreck)].sort(), `band ${b}: its own wreck, every form of it`);
    assert.equal(forms.length, EG_VISTA_PLACES.length, 'a wing at every place');
    const recs = new Set();
    for (const [i, w] of EG_VISTA_WINGS[b].entries()) {
      const m = buildEgWingModel(b, w.kind, i + 1, 40, w.size), again = buildEgWingModel(b, w.kind, i + 1, 40, w.size);
      assert.deepEqual([m.positions, m.normals, m.uvs], [again.positions, again.normals, again.uvs], 'seeded: the same bytes every build');
      assert.ok(m.indices instanceof Uint32Array, 'THE ONE INDEX TYPE');
      const n = trisOf(m);
      assert.ok(n >= EG_VISTA_BUDGET.wing[0] && n <= EG_VISTA_BUDGET.wing[1], `band ${b} ${w.kind}: ${n} triangles, the page's 200-1,500`);
      const T = tris(m);
      for (const t of T) {
        assert.ok(kit.has(t.rec) && t.arch === egBandArchive(b), 'the kit\'s records under the band\'s archive');
        if (t.rec === EG_VISTA_RECORD.fire) {   // the fixture: the band's metal its body's one texel, a flame its flame band, a basket its grille
          const metal = t.uv.every(([u, v]) => u === Math.fround(EG_VISTA_METAL[b][0]) && v === Math.fround(EG_VISTA_METAL[b][1])), fire = t.uv.every(([, v]) => v >= FL.flame[0] && v <= FL.flame[1]), grille = t.uv.every(([, v]) => v >= FL.grille[0] && v <= FL.grille[1]);
          assert.ok(metal || fire || grille, `band ${b} ${w.kind}: the fixture worn in its bands`);
          if (fire) recs.add('flame');
        }
        recs.add(t.rec);
        assert.ok(dot(cross(sub(t.v[1], t.v[0]), sub(t.v[2], t.v[0])), t.n) > 0 && near(len(t.n), 1, 1e-4), `band ${b} ${w.kind}: the stored normal is the winding's`);
      }
      // stood about its own middle: the bounds' middle at its origin
      const lo = [0, 1, 2].map((k) => Math.min(...T.flatMap((t) => t.v.map((p) => p[k])))), hi = [0, 1, 2].map((k) => Math.max(...T.flatMap((t) => t.v.map((p) => p[k]))));
      assert.ok(near(lo[1] + hi[1], 0, 1e-3), 'its middle at its axis, up and down');
      // the torn foundations: under the rest of its stone, their ledges down, their strata by depth, their tips in the haze
      const found = T.filter((t) => t.rec === EG_VISTA_RECORD.found), stone = T.filter((t) => t.rec === EG_VISTA_RECORD.stone);
      assert.ok(found.length > 0 && stone.length > 0, `band ${b} ${w.kind}: its foundations under it`);
      const foundTop = Math.max(...found.flatMap((t) => t.v.map((p) => p[1]))), stoneFoot = Math.min(...stone.flatMap((t) => t.v.map((p) => p[1])));
      assert.ok(foundTop <= stoneFoot + 1e-3, `band ${b} ${w.kind}: the rock hangs under what it was torn up with`);
      for (const t of found) {
        if (Math.abs(t.n[1]) > 0.999) assert.ok(t.n[1] < 0, 'every ledge faces down, into the realm\'s light');
        for (const [, v] of t.uv) assert.ok(v >= 0 && v <= 1, 'the strata within the picture');
      }
      const foundFoot = Math.min(...found.flatMap((t) => t.v.map((p) => p[1])));
      assert.ok(found.every((t) => t.v.every((p, k) => p[1] > foundFoot + 1e-3 || t.uv[k][1] >= EG_VISTA_HAZE - 1e-6)), 'its lowest tip in the haze');
      assert.ok(found.some((t) => t.uv.some(([, v]) => v === 1) && t.uv.every(([, v]) => v >= EG_VISTA_HAZE - 1e-6)), 'its spires\' broken tips closed in the haze');
    }
    const has = (r) => recs.has(r);
    if (b === 0) assert.ok(!has(EG_VISTA_RECORD.glass) && !has(EG_VISTA_RECORD.chain) && has(EG_VISTA_RECORD.fire) && !has('flame'), 'the Galleries: marble and gold, no light of their own');
    if (b === 1) assert.ok(has(EG_VISTA_RECORD.glass) && has(EG_VISTA_RECORD.chain) && !has(EG_VISTA_RECORD.fire), 'the Cairn: its soul-gems, its tombs on their chains');
    if (b === 2) assert.ok(has(EG_VISTA_RECORD.glass) && !has(EG_VISTA_RECORD.chain) && !has('flame'), 'the Shade: its black glass, no fire');
    if (b === 3) assert.ok(has(EG_VISTA_RECORD.glass) && has('flame') && !has(EG_VISTA_RECORD.chain), 'the Wellhead: its basalt prisms, its forges aflame');
    recs.delete('flame');
    assert.ok(recs.size <= 4, `band ${b}: its wings in four records at most - four draws`);
  }
  // a heading turns the whole wing, its normals with it; a size grows it whole
  const a = buildEgWingModel(0, 'belltower', 5, 0), q = buildEgWingModel(0, 'belltower', 5, 90), big = buildEgWingModel(0, 'belltower', 5, 0, 1.5);
  for (let i = 0; i < a.positions.length; i += 3) {
    assert.ok(near(q.positions[i], a.positions[i + 2], 1e-3) && near(q.positions[i + 2], -a.positions[i], 1e-3) && near(q.positions[i + 1], a.positions[i + 1], 1e-3), 'turned a quarter about its own axis');
    assert.ok(near(q.normals[i], a.normals[i + 2], 1e-4) && near(q.normals[i + 2], -a.normals[i], 1e-4), 'its normals turned with it');
    for (let k = 0; k < 3; k++) assert.ok(near(big.positions[i + k], a.positions[i + k] * 1.5, 1e-3), 'grown whole by its size, across and up');
  }
});

test('EG-LOOK THE WRECK\'S COST AND ITS PURITY (Elite-Gates-Look.md sections 4 and 10): every band at most 8,000 triangles and six draws (the wings\' records and the underside\'s) on both tiers; the phones\' four wings never turn; the desktop\'s each turn in four to six minutes, every other one the other way; built pure in a worker (no DOM, no GL) byte for byte as on the page, its graph the band dress\'s plus the mesh kit and the underside\'s model - never the stair\'s clock (mutants: the phones\' wings turning; every wing the same way; a turn in a minute)', async () => {
  for (let b = 0; b < 4; b++) for (const lite of [false, true]) {
    const v = buildEgVista(b, { lite }), recs = new Set(v.wings.flatMap((w) => w.model.subMeshes.map((s) => s.textureRecord)));
    const tri = v.wings.reduce((s, w) => s + trisOf(w.model), 0) + trisOf(v.under.model);
    assert.ok(tri <= EG_VISTA_BUDGET.tris, `band ${b}${lite ? ' lite' : ''}: ${tri} triangles (at most 8,000)`);
    assert.ok(recs.size + v.under.model.subMeshes.length <= EG_VISTA_BUDGET.draws, `band ${b}: ${recs.size} + ${v.under.model.subMeshes.length} draws (at most six)`);
    assert.equal(v.wings.length, lite ? EG_VISTA_LITE : EG_VISTA_PLACES.length);
    v.wings.forEach((w, i) => {
      if (lite) { assert.equal(w.spin, 0, 'the phones\' wings still'); return; }
      const period = TAU / Math.abs(w.spin);
      assert.ok(period >= 180 && period <= 360 && w.spin === egVistaTurn(i), `a turn in ${period.toFixed(0)} s - a few minutes`);
      if (i) assert.ok(Math.sign(w.spin) !== Math.sign(v.wings[i - 1].spin), 'every other one the other way');
    });
  }
  // the swap's worker builds it: a worker with no DOM, the same bytes as here
  const url = new URL('../../../src/world/eliteGates/egVista.js', import.meta.url).href;
  const fromWorker = await new Promise((done, fail) => {
    const w = new Worker(`const { parentPort } = require('node:worker_threads'); import(${JSON.stringify(url)}).then((m) => { const v = m.buildEgVista(3); parentPort.postMessage({ dom: typeof document + typeof window, at: v.wings.map((x) => x.at), p: v.wings[5].model.positions, u: v.under.model.positions }); }, (e) => parentPort.postMessage({ error: String(e) }));`, { eval: true });
    w.once('message', (m) => { w.terminate(); done(m); }); w.once('error', fail);
  });
  const here = buildEgVista(3);
  assert.equal(fromWorker.error, undefined);
  assert.equal(fromWorker.dom, 'undefinedundefined', 'no DOM where it is built');
  assert.deepEqual([fromWorker.at, [...fromWorker.p], [...fromWorker.u]], [here.wings.map((x) => x.at), [...here.wings[5].model.positions], [...here.under.model.positions]], 'byte for byte the page\'s');
  // its graph: the band dress's, the mesh kit and the underside's model - never the stair's clock nor a screen's module
  const graph = (f, seen = new Set()) => { if (seen.has(f)) return seen; seen.add(f); for (const m of rd(f).matchAll(/^\s*(?:import|export)\s[^;]*?from\s+['"](\.[^'"]+)['"]/gm)) graph(resolve(dirname(resolve(ROOT, f)), m[1]).slice(ROOT.length + 1), seen); return seen; };
  const vista = graph('src/world/eliteGates/egVista.js'), dress = graph('src/world/eliteGates/egBandArt.js');
  assert.deepEqual([...vista].filter((f) => !dress.has(f)).sort(), ['src/world/eliteGates/egUndersideModel.js', 'src/world/eliteGates/egVista.js', 'src/world/eliteGates/meshKit.js']);
  assert.ok(![...graph('src/world/eliteGates/egCircleParts.js')].some((f) => /world\/eliteGates\/egLights\.js|world\/eliteGates\/egUnderside\.js|^src\/scenes\//.test(f)), 'the swap\'s worker loads no stair clock and no screen');
});

/** A renderer that records its meshes and their re-lays. */
function recordingRenderer() {
  const made = [], freed = [], lays = [];
  return {
    made, freed, lays,
    createMesh(model) { const g = { id: made.length, model }; made.push(g); return g; },
    destroyMesh(g) { freed.push(g); },
    updateMeshVertices(g, p, n) { lays.push({ g, p: Float32Array.from(p), n: Float32Array.from(n) }); },
  };
}

test('EG-LOOK THE WRECK ON THIS SCREEN (scenes/eliteGates/egWreckLook.js, scenes/eliteGates/egGroundLook.js): the band\'s wings batched in one mesh, a sub-mesh a record (four draws), and the underside its own; each wing laid exactly as Ry(spin t) Rx(tilt) about its place, at its Court place in a Court hall (the ground look tells it which); the mesh moved to the eye\'s hall by its matrix alone; re-laid at most EG_WRECK_TURN_HZ times a second of the shared clock, the phones\' never; the underside hung from the eye; every draw noShadow; a band held once, its meshes freed when another band stands and at the breach\'s end (mutants: a lay\'s turn misread; the Court places never laid; the turn never re-laid; the underside left at the hall; the underside never freed; every hall taken for a trial)', () => {
  const v = buildEgVista(1), B = egWreckBatch(v.wings);
  assert.deepEqual(B.model.subMeshes.map((s) => s.textureRecord), [...new Set(v.wings.flatMap((w) => w.model.subMeshes.map((s) => s.textureRecord)))].sort((a, c) => a - c), 'a sub-mesh a record, lowest first');
  assert.equal(B.owner.length, v.wings.reduce((s, w) => s + w.model.indices.length, 0), 'every wing\'s every corner');
  // the lay against the wings' own matrices
  for (const [t, court] of [[0, false], [77.25, false], [300, true]]) {
    egWreckLay(B, t, court);
    const seen = new Map();
    for (let k = 0; k < B.owner.length; k++) {
      const w = v.wings[B.owner[k]], r = w.spin * t, c = Math.cos(r), s = Math.sin(r), ct = Math.cos(w.tilt), st = Math.sin(w.tilt), at = court ? w.court : w.at;
      const x = B.src[k * 6], y = B.src[k * 6 + 1], z = B.src[k * 6 + 2];
      const lx = x, ly = ct * y - st * z, lz = st * y + ct * z;   // Rx(tilt)
      const want = [c * lx + s * lz + at[0], ly + at[1], -s * lx + c * lz + at[2]];   // then Ry(spin t), then the place
      for (let a = 0; a < 3; a++) assert.ok(near(B.model.positions[k * 3 + a], want[a], 1e-3), `t ${t}: laid about its own axis, at its ${court ? 'Court' : 'trial'} place`);
      seen.set(B.owner[k], Math.max(seen.get(B.owner[k]) ?? 0, Math.hypot(B.model.positions[k * 3] - at[0], B.model.positions[k * 3 + 1] - at[1], B.model.positions[k * 3 + 2] - at[2])));
    }
    for (const [i, r] of seen) assert.ok(near(r, reachOf(v.wings[i].model), 1e-2), 'turning, its sphere its own');
  }
  // the screen: two meshes, their draws noShadow; the turn re-laid a dozen times a second at most; the underside from the eye
  const R = recordingRenderer(), look = createEgWreckLook({ renderer: R });
  assert.equal(look.stand(1, v), true);
  assert.equal(R.made.length, 2, 'the wings\' one mesh and the underside\'s');
  assert.equal(R.made[0].model.subMeshes.length + R.made[1].model.subMeshes.length, look.stats().draws);
  assert.ok(look.stats().draws <= EG_VISTA_BUDGET.draws && look.draws().length === 2 && look.draws().every((d) => d.noShadow === true && !d.hidden));
  assert.equal(look.stand(1, v), false, 'a band held once');
  const eye = [530.5, 12, 40];
  for (let f = 0; f <= 600; f++) look.frame(eye, 525.6, 0, 60, 100 + f / 60);   // ten seconds at 60 frames
  assert.ok(R.lays.length >= 10 * EG_WRECK_TURN_HZ - 1 && R.lays.length <= 10 * EG_WRECK_TURN_HZ + 2, `${R.lays.length} lays in ten seconds of the clock`);
  const W = look.draws()[0].object.matrix, Um = look.draws()[1].object.matrix, u = v.under;
  assert.ok(near(W[12], 525.6) && W[13] === 0 && W[14] === 60 && W[0] === 1 && W[5] === 1, 'the wings moved to the hall by their matrix alone');
  assert.ok(near(Um[12], eye[0] + u.at[0]) && near(Um[13], eye[1] + u.at[1]) && near(Um[14], eye[2] + u.at[2]) && near(Um[0], u.scale) && near(Um[10], u.scale), 'the underside hung from the eye');
  const n = R.lays.length;
  look.frame(eye, 525.6, 0, 60, 100 + 600 / 60);
  assert.equal(R.lays.length, n, 'the same tick: nothing laid');
  look.frame(eye, 525.6, 0, 60, 100 + 600 / 60, true);
  assert.equal(R.lays.length, n + 1, 'a Court hall: laid at its Court places');
  egWreckLay(B, Math.floor((100 + 600 / 60) * EG_WRECK_TURN_HZ) / EG_WRECK_TURN_HZ, true);
  assert.deepEqual(R.lays.at(-1).p, B.model.positions, 'the Court\'s places, at the clock\'s tick');
  // the phones': laid once, never again
  const RL = recordingRenderer(), lite = createEgWreckLook({ renderer: RL, lite: true });
  lite.stand(2);
  for (let f = 0; f < 240; f++) lite.frame(eye, 0, 0, 0, f / 60);
  assert.equal(RL.lays.length, 0, 'the phones\' wreck never turns');
  // another band frees the held one's meshes first; the breach's end frees the rest
  look.stand(2);
  assert.deepEqual(R.freed.map((g) => g.id), [0, 1], 'another band\'s stand frees the held one');
  look.release();
  assert.deepEqual(R.freed.map((g) => g.id), [0, 1, 2, 3], 'the breach\'s end frees both');
  assert.deepEqual(look.draws(), []);
  // the ground look tells it a Court: stood in a circle, the eye in its Court hall lays the Court's places
  const RG = recordingRenderer(), ground = createEgGroundLook({ renderer: RG, lite: false }), specs = egCircleSpecs(7, 2, 0), court = specs.find((s) => s.lord);
  ground.stand(7, 2, 0);
  ground.frame(realmToDungeon(court.x0, 1.7, court.len / 2), 50);
  const G = egWreckBatch(buildEgVista(egBandOfCircle(2)).wings);
  egWreckLay(G, Math.floor(50 * EG_WRECK_TURN_HZ) / EG_WRECK_TURN_HZ, true);
  assert.deepEqual(RG.lays.at(-1).p, G.model.positions, 'the Court hall\'s wreck at its Court places');
  const trial = specs.find((s) => !s.lord);
  ground.frame(realmToDungeon(trial.x0, 1.7, trial.len / 2), 50);
  egWreckLay(G, Math.floor(50 * EG_WRECK_TURN_HZ) / EG_WRECK_TURN_HZ, false);
  assert.deepEqual(RG.lays.at(-1).p, G.model.positions, 'a trial\'s at its trial places');
  ground.release();
  assert.equal(RG.freed.length, RG.made.length, 'every mesh freed at the end');
});
