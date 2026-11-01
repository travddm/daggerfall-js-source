// WB9g - DAGON'S FIRE, COMPILED, LINKED AND DRAWN IN A REAL BROWSER.
//
// node holds the aura's law (test/net/wb9g_insignia.test.js: who is drawn, the clock's wrap, the pass over a fake GL); what
// node cannot answer is whether the GLSL COMPILES and LINKS in a real WebGL2 context, and whether what it draws is the
// fire it says: the ring burning at its radius and dim inside it, nothing past its edge, flames standing up out of it,
// no seam where the angle's noise closes behind the wearer, no jump where the clock wraps, and nothing at all before it
// has kindled. So: the repo's own module served as it is (no bundler), a grey floor drawn by a stand-in shader, the pass
// drawn by its own class over it, and the frame read back.
//
//     node tools/auraProbe.mjs [--shots <dir>]     (writes aura.png / aura_side.png / wings_back.png /
//                                                   maelstrom_top.png / maelstrom_side.png there)
//
// SERPENT5 (2026-10-15; AUDIT WORLD-REWARDS D3 - the interpreter had been its only reader): and THE MAELSTROM, the ninth -
// from above, foam where node's law (maelstromArmAngle, on the aura's own clock) stands its arms and the water darker
// between them; its eye open water; no jump at the wrap; nothing before it kindles; from the side, its curl at the lip.
import { chromium } from 'playwright';
import { AURA_LIFT_M, MAELSTROM_R, MAELSTROM_ARMS, maelstromArmAngle, auraClock } from '../src/render/auraRing.js';   // SERPENT5 (AUDIT WORLD-REWARDS D3): the Maelstrom
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const shotsAt = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
const out = []; const check = (n, ok, d = '') => { out.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${d ? ` - ${d}` : ''}`); };

const PAGE = `<!doctype html><html><body style="margin:0;background:#000"><canvas id=c width=640 height=480></canvas><script type=module>
import { AuraRingRenderer, AURA_KINDS, AURA_RING_R, AURA_CLOCK_PERIOD } from '/src/render/auraRing.js';
const gl = document.getElementById('c').getContext('webgl2', { alpha: false, preserveDrawingBuffer: true });
const vs = \`#version 300 es
layout(location=0) in vec2 p; uniform mat4 vp; void main(){ gl_Position = vp * vec4(p.x, 0.0, p.y, 1.0); }\`;
const fs = \`#version 300 es
precision highp float; uniform float lit; out vec4 o; void main(){ o = vec4(vec3(0.08, 0.075, 0.07) * lit, 1.0); }\`;
const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr);
const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-20, -20, 20, -20, 20, 20, -20, -20, 20, 20, -20, 20]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.bindVertexArray(null);
let pass = null, err = null;
try { pass = new AuraRingRenderer(gl); } catch (e) { err = String(e.message ?? e); }
const persp = (f, a, n, fa) => { const t = 1 / Math.tan(f / 2); return new Float32Array([t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (fa + n) / (n - fa), -1, 0, 0, 2 * fa * n / (n - fa), 0]); };
const look = (e, c) => { const u = [0, 1, 0]; const z = [e[0] - c[0], e[1] - c[1], e[2] - c[2]]; let l = Math.hypot(...z); z.forEach((v, i) => { z[i] = v / l; }); const x = [u[1] * z[2] - u[2] * z[1], u[2] * z[0] - u[0] * z[2], u[0] * z[1] - u[1] * z[0]]; l = Math.hypot(...x); x.forEach((v, i) => { x[i] = v / l; }); const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]]; return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -(x[0] * e[0] + x[1] * e[1] + x[2] * e[2]), -(y[0] * e[0] + y[1] * e[1] + y[2] * e[2]), -(z[0] * e[0] + z[1] * e[1] + z[2] * e[2]), 1]); };
const mul = (a, b) => { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
// AURA-SPLIT (#1143): every look a program of its own, built here whatever the driver says. No comment goes mid-line in
// the object below: inside the page's script it would end the literal early.
window.probe = { err, linked: pass ? AURA_KINDS.every((k) => { const P = pass.programOf(k, true); return !!P && gl.getProgramParameter(P.prog, gl.LINK_STATUS); }) : false, ringR: AURA_RING_R, period: AURA_CLOCK_PERIOD };
/** Draw the floor and the aura at the origin from \`eye\` at \`t\` seconds, kindled \`kindle\`; read back \`pts\` (world). */
window.draw = (eye, t, kindle, pts, aura, at = [0, 0.2, 0], yaw = 0, lit = 1, extra = null, opts = {}) => {   // \`opts\` - strict (a point off the canvas throws, never reads black), mirror (the game's own projection and CW front face), none (the same frame with no aura at all)   // \`at\` - where the eye looks (the first person looks level); the wearer's facing, and the floor lit brighter
  const proj = persp(0.9, 640 / 480, 0.05, 100), view = look(eye, at);
  if (opts.mirror) proj[0] = -proj[0];   // world/mat4.js mirrorProjectionX: the frame as the game shows it
  const vp = mul(proj, view);
  gl.enable(gl.DEPTH_TEST); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  if (lit !== 1) gl.disable(gl.CULL_FACE);   // the lit floor drawn whichever way it faces (the pass leaves culling on behind it)
  gl.useProgram(pr); gl.uniformMatrix4fv(gl.getUniformLocation(pr, 'vp'), false, vp); gl.uniform1f(gl.getUniformLocation(pr, 'lit'), lit); gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLES, 0, 6); gl.bindVertexArray(null);
  if (opts.mirror) gl.frontFace(gl.CW);   // the renderer's own front face under the mirror
  pass.draw(opts.none ? [] : [{ at: [0, 0, 0], seed: 0.37, kindle, aura, yaw, ...(extra ?? {}) }], proj, view, new Float32Array(eye), t, null);
  gl.frontFace(gl.CCW);   // \`extra\` the wearer's swing and pose
  const px = (w) => {
    const c = [0, 1, 2, 3].map((r) => vp[r] * w[0] + vp[4 + r] * w[1] + vp[8 + r] * w[2] + vp[12 + r]);
    const x = Math.round((c[0] / c[3] * 0.5 + 0.5) * 640), y = Math.round((c[1] / c[3] * 0.5 + 0.5) * 480);
    if (opts.strict && (!(c[3] > 0) || x < 0 || x > 639 || y < 0 || y > 479)) throw new Error(\`a point off the canvas: \${w} at \${x},\${y}\`);
    const o = new Uint8Array(4); gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, o); return Array.from(o);
  };
  return { error: gl.getError(), drawn: pass.drawn, px: pts.map(px) };
};
window.ready = true;
</script></body></html>`;

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/probe/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(PAGE); return; }   // not the root: U60 keeps that the landing page's
  const f = join(ROOT, url);
  if (!f.startsWith(ROOT) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': extname(f) === '.js' ? 'text/javascript' : extname(f) === '.json' ? 'application/json' : 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});   // a browser of the machine's own, as brokerProbe.mjs takes one
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/probe/`);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 20000 });
  const p = await page.evaluate(() => window.probe);
  check('the pass builds', !p.err, p.err ?? '');
  check('its program links in a real WebGL2', p.linked === true);
  const lum = (c) => c[0] + c[1] + c[2];
  const R = p.ringR, above = [0, 3.2, 3.2];
  // round the ring at 24 bearings, the centre, and past the edge
  const ring = Array.from({ length: 24 }, (_, i) => { const a = (i / 24) * Math.PI * 2; return [Math.cos(a) * R, 0.05, Math.sin(a) * R]; });
  const top = await page.evaluate(([eye, pts]) => window.draw(eye, 3.5, 1, pts), [above, [...ring, [0, 0.05, 0], [2.2, 0.05, 0], [0, 0.05, -2.2]]]);
  if (shotsAt) await page.locator('#c').screenshot({ path: join(shotsAt, 'aura.png') });
  check('no GL error drawing it', top.error === 0 && top.drawn === 1, `error ${top.error}, drawn ${top.drawn}`);
  const ringLum = top.px.slice(0, 24).map(lum), mean = ringLum.reduce((a, b) => a + b, 0) / 24;
  check('the ring burns round the feet', mean > 180 && ringLum.filter((v) => v > 90).length >= 18, `mean ${mean.toFixed(0)}: ${ringLum.join(' ')}`);
  const reds = top.px.slice(0, 24).filter((c) => c[0] > c[2] * 1.4).length;
  check('in fire\'s colours - red over blue', reds >= 20, `${reds}/24`);
  check('dim within it, dark past its edge', lum(top.px[24]) < mean / 2 && lum(top.px[25]) < 60 && lum(top.px[26]) < 60, `${JSON.stringify(top.px.slice(24))}`);
  // the seam where the angle wraps (the -x axis): from straight above, on the ground inside the flames' wall, the fire
  // either side of it differs no more than the fire beside it does - at three moments, three rings in
  const over = [0, 3.4, 0.001], rr = [R - 0.06, R - 0.1, R - 0.14];
  let dSeam = 0, dNear = 0;
  for (const t of [2.5, 7.25, 31.75]) {
    const pts = rr.flatMap((r) => [[-r, 0.05, -0.02], [-r, 0.05, 0.02], [Math.cos(2.2) * r, 0.05, Math.sin(2.2) * r], [Math.cos(2.2 + 0.047) * r, 0.05, Math.sin(2.2 + 0.047) * r]]);
    const got = await page.evaluate(([eye, pts, tt]) => window.draw(eye, tt, 1, pts), [over, pts, t]);
    for (let k = 0; k < rr.length; k++) { dSeam += Math.abs(lum(got.px[k * 4]) - lum(got.px[k * 4 + 1])); dNear += Math.abs(lum(got.px[k * 4 + 2]) - lum(got.px[k * 4 + 3])); }
  }
  check('no seam behind the wearer where the ring closes', dSeam <= Math.max(90, dNear * 2), `across the seam ${dSeam}, beside it ${dNear} (summed over nine pairs)`);
  // the clock's wrap: a breath before it and a breath after, the same fire
  const wrapPts = ring.slice(0, 12);
  const before = await page.evaluate(([eye, pts, t]) => window.draw(eye, t, 1, pts), [above, wrapPts, p.period - 1 / 240]);
  const after = await page.evaluate(([eye, pts, t]) => window.draw(eye, t, 1, pts), [above, wrapPts, 1 / 240]);
  const jump = before.px.map((c, i) => Math.abs(lum(c) - lum(after.px[i])));
  check('no jump where the clock wraps', Math.max(...jump) <= 45, jump.join(' '));
  // the flames stand up out of the ring (from the side, a point a quarter up the flame at the near side)
  const side = await page.evaluate(([eye, pts]) => window.draw(eye, 3.5, 1, pts), [[0, 0.9, 3.4], [[0, 0.14, R], [0, 0.14, R + 0.8], [0, 1.2, R]]]);
  if (shotsAt) await page.locator('#c').screenshot({ path: join(shotsAt, 'aura_side.png') });
  check('flames stand up out of it', lum(side.px[0]) > lum(side.px[1]) + 60 && lum(side.px[2]) < 60, JSON.stringify(side.px));
  const cold = await page.evaluate(([eye, pts]) => window.draw(eye, 3.5, 0, pts), [above, ring.slice(0, 6)]);
  check('unkindled, nothing burns', cold.px.every((c) => lum(c) < 70), JSON.stringify(cold.px));
  // over a floor lit bright enough that light over it can be told from it: 0.08 * 6 is a mid grey
  const LIT = 6;
  // ── SERAPH-WINGS: THE SERAPH WINGS ──
  // from behind, over the wLitNow floor: gold light out to either side of the wearer and over the head, gold in colour,
  // nothing wPast their reach; flowing (another moment, another picture) and the same at the wrap; nothing unkindled and
  // less half kindled; from the wearer's own eye looking wAhead nothing over the view; as the game mirrors it, the same
  const wg = (eye, t, k, pts, at, swOpts = {}) => page.evaluate(([e, tt, kk, ps, a, l, o]) => window.draw(e, tt, kk, ps, 'seraphwings', a, 0, l, null, { strict: true, ...o }), [eye, t, k, pts, at, LIT, swOpts]);
  const wBehind = [0, 1.6, -4.6], wAt = [0, 1.5, 0];
  const wGrid = Array.from({ length: 41 * 28 }, (_, i) => [-2 + (i % 41) * 0.1, 0.4 + Math.floor(i / 41) * 0.1, -0.35]);   // WINGS-FIT: every 0.1 m - slim strands fall between a coarser grid's points
  const wBare = await wg(wBehind, 13.2, 1, wGrid, wAt, { none: true }), wWhole = await wg(wBehind, 13.2, 1, wGrid, wAt);
  if (shotsAt) await page.locator('#c').screenshot({ path: join(shotsAt, 'wings_back.png') });
  check('the wings draw without a GL error', wWhole.error === 0 && wWhole.drawn === 1, `error ${wWhole.error}, drawn ${wWhole.drawn}`);
  const wLit = (f) => f.px.map((c, i) => lum(c) > lum(wBare.px[i]) + 60);
  const wLitNow = wLit(wWhole), wSide = (pred) => wGrid.filter((q, i) => wLitNow[i] && pred(q)).length;
  // WINGS-FIT: slim, shorter strands with dark between them (the old blaze lit 12 a side on a grid twice as coarse) - out
  // past the shoulders either side, and over the crown of the rest pose (1.88 m)
  check('gold light out to either side of the wearer and over the head', wSide((q) => q[0] < -0.5) >= 4 && wSide((q) => q[0] > 0.5) >= 4 && wSide((q) => q[1] > 1.95) >= 4, `left ${wSide((q) => q[0] < -0.5)}, right ${wSide((q) => q[0] > 0.5)}, over the head ${wSide((q) => q[1] > 1.95)}`);
  const wGolds = wWhole.px.filter((c, i) => wLitNow[i]), wGoldN = wGolds.filter((c) => c[0] >= c[1] && c[1] >= c[2]).length, wWarm = wGolds.filter((c) => c[0] > c[2] + 20).length;
  check('in gold - red over green over blue, white only where it burns hottest', wGoldN === wGolds.length && wWarm >= wGolds.length * 0.6, `${wGoldN} gold or white, ${wWarm} warm, of ${wGolds.length}`);
  const wPast = [[1.8, 1.4, -0.35], [-1.8, 1.4, -0.35], [1.7, 0.6, -0.35], [-1.6, 2.7, -0.35]];   // WINGS-FIT: their shorter reach (1.3 m; at 2.2 m these lay inside it)
  const wPBare = await wg(wBehind, 13.2, 1, wPast, wAt, { none: true }), wPWhole = await wg(wBehind, 13.2, 1, wPast, wAt);
  check('nothing past their reach', wPWhole.px.every((c, i) => Math.abs(lum(c) - lum(wPBare.px[i])) < 12), wPWhole.px.map(lum).join(' '));
  const wLater = await wg(wBehind, 14.7, 1, wGrid, wAt), wFlow = wWhole.px.reduce((a, c, i) => a + Math.abs(lum(c) - lum(wLater.px[i])), 0);
  check('flowing - another moment, another picture', wFlow > 2000, `${wFlow}`);
  const wB = await wg(wBehind, p.period - 1 / 240, 1, wGrid, wAt), wA = await wg(wBehind, 1 / 240, 1, wGrid, wAt);
  const swWJump = Math.max(...wB.px.map((c, i) => Math.abs(lum(c) - lum(wA.px[i]))));
  const wMidA = await wg(wBehind, 60 - 1 / 240, 1, wGrid, wAt), wMidB = await wg(wBehind, 60 + 1 / 240, 1, wGrid, wAt);
  const wStep = Math.max(...wMidA.px.map((c, i) => Math.abs(lum(c) - lum(wMidB.px[i]))));
  check('no jump where the clock wraps - no more than their own motion over the same moment', swWJump <= Math.max(45, 1.5 * wStep + 10), `${swWJump} at the wrap, ${wStep} mid-clock`);
  const wCold = await wg(wBehind, 13.2, 0, wGrid, wAt), swWHalf = await wg(wBehind, 13.2, 0.5, wGrid, wAt);
  const wHalfN = wLit(swWHalf).filter(Boolean).length, wWholeN = wLitNow.filter(Boolean).length;
  check('unkindled nothing, half kindled less', wCold.px.every((c, i) => Math.abs(lum(c) - lum(wBare.px[i])) < 6) && wHalfN > 0 && wHalfN < wWholeN * 0.7, `half ${wHalfN} of ${wWholeN}`);
  const wAhead = [[0, 1.6, 2], [0.6, 1.9, 2], [-0.6, 1.3, 2], [0.9, 1.6, 2.5], [-0.9, 1.6, 2.5]];
  const wFpBare = await wg([0, 1.7, 0.05], 13.2, 1, wAhead, [0, 1.65, 3], { none: true }), wFp = await wg([0, 1.7, 0.05], 13.2, 1, wAhead, [0, 1.65, 3]);
  check('from the wearer\'s own eye looking ahead, nothing over the view', wFp.px.every((c, i) => Math.abs(lum(c) - lum(wFpBare.px[i])) < 6), wFp.px.map(lum).join(' '));
  const wm = await wg(wBehind, 13.2, 1, wGrid, wAt, { mirror: true }), wLitM = wm.px.map((c, i) => lum(c) > lum(wBare.px[i]) + 60).filter(Boolean).length;
  check('as the game mirrors it, the same light', wm.error === 0 && Math.abs(wLitM - wWholeN) <= wWholeN * 0.25, `${wLitM} vs ${wWholeN}`);
  // ── SERPENT5: THE MAELSTROM (AUDIT WORLD-REWARDS D3: the real GL's own word, beside the interpreter's) ──
  const ms = (eye, t, k, pts, at) => page.evaluate(([e, tt, kk, ps, a]) => window.draw(e, tt, kk, ps, 'maelstrom', a, 0, 1, null, { strict: true }), [eye, t, k, pts, at]);
  const msEye = [0, 3.4, 0.001], msAt = [0, 0, 0], msT = 21.7;
  const msG = (r, a) => [Math.cos(a) * r, AURA_LIFT_M, Math.sin(a) * r];
  const armPts = [], gapPts = [];
  for (const r of [0.35, 0.55, 0.7]) for (let k = 0; k < MAELSTROM_ARMS; k++) { const a = maelstromArmAngle(r, auraClock(msT), k); armPts.push(msG(r, a)); gapPts.push(msG(r, a + Math.PI / MAELSTROM_ARMS)); }
  const msPts = [...armPts, ...gapPts, msG(0.06, 0.4), msG(0.06, 2.5)];
  const msBare = await page.evaluate(([e, tt, ps, a]) => window.draw(e, tt, 1, ps, 'maelstrom', a, 0, 1, null, { strict: true, none: true }), [msEye, msT, msPts, msAt]);
  const msWhole = await ms(msEye, msT, 1, msPts, msAt);
  if (shotsAt) await page.locator('#c').screenshot({ path: join(shotsAt, 'maelstrom_top.png') });
  check('the maelstrom draws without a GL error', msWhole.error === 0 && msWhole.drawn === 1, `error ${msWhole.error}, drawn ${msWhole.drawn}`);
  const lift = (i) => lum(msWhole.px[i]) - lum(msBare.px[i]), nA = armPts.length;
  check('foam where its arms stand at the clock\'s own turn, the water between them darker', armPts.every((_, i) => lift(i) > lift(nA + i) + 40), armPts.map((_, i) => `${lift(i)}/${lift(nA + i)}`).join(' '));
  check('its eye open water', lift(2 * nA) < 20 && lift(2 * nA + 1) < 20, `${lift(2 * nA)} ${lift(2 * nA + 1)}`);
  const msB = await ms(msEye, p.period - 1 / 240, 1, msPts, msAt), msA = await ms(msEye, 1 / 240, 1, msPts, msAt);
  const msJump = Math.max(...msB.px.map((c, i) => Math.abs(lum(c) - lum(msA.px[i]))));
  check('no jump where the clock wraps', msJump <= 45, `${msJump}`);
  const msCold = await ms(msEye, msT, 0, msPts, msAt);
  check('unkindled, nothing stands', msCold.px.every((c, i) => lum(c) - lum(msBare.px[i]) < 10), `${Math.max(...msCold.px.map((c, i) => lum(c) - lum(msBare.px[i])))}`);
  const msSide = await ms([0, 0.6, 3.2], msT, 1, [[0, AURA_LIFT_M + 0.09, MAELSTROM_R]], [0, 0.2, 0]);
  if (shotsAt) await page.locator('#c').screenshot({ path: join(shotsAt, 'maelstrom_side.png') });
  check('from the side, its curl stands at the lip', msSide.error === 0 && lum(msSide.px[0]) > 60, `${lum(msSide.px[0])}`);
  check('no page error', errs.length === 0, errs.join('; '));
} finally {
  await browser.close();
  server.close();
}
const failed = out.filter((o) => !o).length;
console.log(`\n${out.length - failed}/${out.length} checks passed`);
process.exit(failed ? 1 : 0);
