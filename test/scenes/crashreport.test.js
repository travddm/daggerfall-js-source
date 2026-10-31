// THE CRASH LINE (2026-08-21). A player's crash report arrived with
// frames and NO message - "drawMesh@https://.../main.js:404:11594" -
// because the overlay printed `err.stack` alone and SpiderMonkey's
// stack is frames ONLY, while V8's begins with "Name: message". The
// overlay had been making a browser-dependent decision it did not know
// it was making, and it cost the one line that says what was null.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crashText } from '../../src/ui/crashText.js';
import { Renderer } from '../../src/render/renderer.js';

test('crash report: a FIREFOX stack still names the error', () => {
  // SpiderMonkey: frames only, no message anywhere in `stack`.
  const err = new TypeError('mesh is null');
  err.stack = 'drawMesh@https://x/assets/main.js:404:11594\nre@https://x/assets/main.js:489:35808';
  const out = crashText(err);
  assert.match(out, /^TypeError: mesh is null\n/, 'the message leads, always');
  assert.match(out, /drawMesh@/, 'and the frames survive');
});

test('crash report: a CHROME stack is not printed twice', () => {
  // V8 folds the message into `stack`; printing our head as well would
  // duplicate it.
  const err = new TypeError('mesh is null');
  err.stack = 'TypeError: mesh is null\n    at drawMesh (https://x/main.js:404:11)';
  const out = crashText(err);
  assert.equal(out.match(/mesh is null/g).length, 1);
  assert.match(out, /at drawMesh/);
});

test('crash report: the shapes that are not Errors at all', () => {
  // A rejection can carry anything. None of these may render as
  // "undefined" or throw inside the reporter.
  assert.equal(crashText(null), 'unknown error');
  assert.equal(crashText(undefined), 'unknown error');
  assert.equal(crashText('a string reason'), 'a string reason');
  assert.equal(crashText({ message: 'bare object' }), 'bare object');
  assert.match(crashText(new Error('')), /Error/);
  // and a stack that is not a string (some hosts hand back an object)
  const odd = new Error('odd'); odd.stack = { frames: [] };
  assert.equal(crashText(odd), 'Error: odd');
});

test('crash report: an error with NO stack still gets coordinates', () => {
  // window.onerror carries filename/lineno/colno even when `error` is
  // stripped (a cross-origin script), and they are the only location
  // left - the overlay used to drop them.
  const out = crashText({ name: 'TypeError', message: 'x is null' },
    { filename: 'https://x/main.js', lineno: 404, colno: 11594 });
  assert.equal(out, 'TypeError: x is null\nat https://x/main.js:404:11594');
});

// ---------------------------------------------------------------
// THE CRASH ITSELF: drawMesh must not kill the frame loop
// ---------------------------------------------------------------
test('drawMesh: an absent mesh costs a MODEL, never the run', () => {
  // The reported stack was drawMesh <- one caller: `gl.bindVertexArray(mesh.vao)`
  // on a null mesh threw out of the frame loop, requestAnimationFrame
  // stopped, and the whole scene died for ONE model the player's
  // ARCH3D did not carry. NEVER TRAPS says that costs the model.
  //
  // Renderer needs a real WebGL2 context, so drive the real method
  // against a `this` that records every gl call: the point of the pin
  // is that it touches NOTHING when the mesh is bad.
  const calls = [];
  const gl = new Proxy({}, {
    get: (_, prop) => {
      if (prop === 'TRIANGLES' || prop === 'UNSIGNED_INT' || prop === 'TEXTURE_2D'
        || prop === 'TEXTURE0' || prop === 'TEXTURE1') return prop;
      return (...args) => calls.push([prop, ...args]);
    },
  });
  const self = Object.assign(Object.create(Renderer.prototype),
    { gl, program: 'P', uModel: 'M', textures: new Map(), emissionTextures: new Map(), _blackTex: 'black' });
  const warns = [];
  const realWarn = console.warn;
  console.warn = (...a) => warns.push(a[0]);
  try {
    const m = new Float32Array(16);
    for (const bad of [null, undefined, {}, { vao: 1 }, { vao: 1, subMeshes: [] }]) {
      calls.length = 0;
      assert.doesNotThrow(() => Renderer.prototype.drawMesh.call(self, bad, m, null),
        `drawMesh threw on ${JSON.stringify(bad)}`);
      assert.deepEqual(calls, [], 'and it touched no GL state on the way out');
    }
    // ONE warning per distinct shape, not one per frame - sixty a
    // second would be its own kind of broken.
    const before = warns.length;
    for (let i = 0; i < 100; i++) Renderer.prototype.drawMesh.call(self, null, m, null);
    assert.equal(warns.length, before, 'the warning does not repeat');
    assert.ok(warns.some((w) => /drawMesh skipped/.test(w)), `it did warn: ${warns}`);
  } finally { console.warn = realWarn; }
});

test('drawMesh: a GOOD mesh still draws - the guard is not a mute button', () => {
  const calls = [];
  const gl = new Proxy({}, {
    get: (_, prop) => (['TRIANGLES', 'UNSIGNED_INT', 'TEXTURE_2D', 'TEXTURE0', 'TEXTURE1'].includes(prop)
      ? prop
      : (...args) => calls.push([prop, ...args])),
  });
  const self = Object.assign(Object.create(Renderer.prototype), {
    gl, program: 'P', uModel: 'M', _blackTex: 'black',
    textures: new Map([['100_2', 'tex']]), emissionTextures: new Map(),
    // AUDIT 39 F49 added the next line: an auto-emissive record's mask
    // wears Color.white while a window's wears the window style, so the
    // draw path picks the emission colour per sub-mesh.
    emissionWhite: new Set(), _windowEmission: new Float32Array([0, 0, 0]),
    _texGen: 1, stats: { draws: 0, programBinds: 0, vaoBinds: 0, texBinds: 0 },   // EV2: the cache stamp + the counters the draw path keeps
  });
  const mesh = { vao: 'VAO', subMeshes: [{ textureArchive: 100, textureRecord: 2, primitiveCount: 4, startIndex: 6 }] };
  Renderer.prototype.drawMesh.call(self, mesh, new Float32Array(16), null);
  assert.deepEqual(calls.find((c) => c[0] === 'drawElements'),
    ['drawElements', 'TRIANGLES', 12, 'UNSIGNED_INT', 24], 'count x3 and byte offset x4');
  assert.ok(calls.some((c) => c[0] === 'bindVertexArray' && c[1] === 'VAO'));
});

// ---------------------------------------------------------------
// THE PRODUCER THE HUNT FOUND: a null MATRIX, not a null mesh
// ---------------------------------------------------------------
test('drawMesh: a null MATRIX is skipped too - the argument that actually threw', () => {
  // The first version of the guard checked only the mesh, and the
  // crash from the field was `uniformMatrix4fv(uModel, false, null)`:
  // Float32List is a NON-NULLABLE WebIDL union, so null throws. It is
  // one statement below the mesh check, inside the same function, so
  // the minified frame is identical - the guard read as though it
  // covered the reported crash while the real producer walked past it.
  const calls = [];
  const gl = new Proxy({}, {
    get: (_, prop) => (['TRIANGLES', 'UNSIGNED_INT', 'TEXTURE_2D', 'TEXTURE0', 'TEXTURE1'].includes(prop)
      ? prop
      : (...args) => calls.push([prop, ...args])),
  });
  const self = Object.assign(Object.create(Renderer.prototype), {
    gl, program: 'P', uModel: 'M', _blackTex: 'black',
    textures: new Map([['100_2', 'tex']]), emissionTextures: new Map(),
    // AUDIT 39 F49 added the next line: an auto-emissive record's mask
    // wears Color.white while a window's wears the window style, so the
    // draw path picks the emission colour per sub-mesh.
    emissionWhite: new Set(), _windowEmission: new Float32Array([0, 0, 0]),
    _texGen: 1, stats: { draws: 0, programBinds: 0, vaoBinds: 0, texBinds: 0 },   // EV2: the cache stamp + the counters the draw path keeps
  });
  const mesh = { vao: 'VAO', subMeshes: [{ textureArchive: 100, textureRecord: 2, primitiveCount: 4, startIndex: 6 }] };
  const realWarn = console.warn; console.warn = () => {};
  try {
    for (const bad of [null, undefined]) {
      calls.length = 0;
      assert.doesNotThrow(() => Renderer.prototype.drawMesh.call(self, mesh, bad, null));
      assert.deepEqual(calls, [], 'a good mesh with no matrix still touches no GL state');
    }
  } finally { console.warn = realWarn; }
});

