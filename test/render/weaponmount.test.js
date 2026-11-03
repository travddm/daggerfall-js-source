// WEAPON-MOUNT: DECOR2c hangs a weapon or a shield on the
// decal pass as its pack picture, under a white tint - and the decal pass is the BLOOD's. Both of its programs read
// the texel's red as a film's thickness and paint the tint through it (BLOOD3), so a hung sword came out a pale lit
// silhouette of itself: the picture's colours thrown away. A mount is a PICTURE now - the pass's own program with its
// switch on (`uPicture`): the texel is the colour, flat, no film, no relief. The real-GL proof is
// tools/bloodProbe.mjs's WEAPON-MOUNT rows (a green picture comes back green on both sets; drawn as a mark, white).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDecorRoom } from '../../src/scenes/decor/decorRoom.js';
import { settle } from '../decorFakes.mjs';
import { Renderer } from '../../src/render/renderer.js';

const rd = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('WEAPON-MOUNT: the room draws its mounts as PICTURES - drawDecalPicture, never the blood\'s drawDecals where the picture door stands', async () => {
  const calls = [];
  const textures = new Map();
  const tex = { recordCount: 40, getSize: () => ({ width: 16, height: 48 }), getScale: () => ({ width: 0, height: 0 }), getFrameCount: () => 1 };
  const pool = createDecorRoom({
    meshes: { getGpuMesh: async () => null, cpuModels: new Map() },
    renderer: {
      textures,
      createBillboardBatch: () => ({}), destroyBillboardBatch: () => {}, drawMesh: () => {},
      createDecalBatch: () => ({ id: 'mount' }), writeDecalSlot: () => true, destroyDecalBatch: () => {},
      drawDecals: (b, t) => calls.push(['film', b.id, t]),
      drawDecalPicture: (b, t) => calls.push(['picture', b.id, t]),
    },
    getTexture: async () => tex,
    uploadRecord: (a, r) => { textures.set(`${a}_${r}#ui`, `tex:${a}.${r}`); return '#ui'; },
    collider: () => null, origin: () => [0, 0, 0], roomLights: () => [],
  });
  pool.put({ id: 'm1', model: null, flat: [234, 12], item: { t: 120, g: 3, m: 7, v: null, a: null, p: null }, pos: [0, 1, 0], rot: [0, 0, 0], scale: 1, light: null, storage: false, paid: 0 });
  await settle();
  assert.equal(pool.drawMounts(), 1);
  assert.deepEqual(calls, [['picture', 'mount', 'tex:234.12']], 'a picture, not a film');
});

test('WEAPON-MOUNT: the renderer\'s picture door is the decal pass with its switch on for that one draw', () => {
  const seen = [];
  const fake = { _decalPicture: false, drawDecals(b, t) { seen.push([b, t, this._decalPicture]); } };
  Renderer.prototype.drawDecalPicture.call(fake, 'batch', 'tex');
  assert.deepEqual(seen, [['batch', 'tex', true]], 'on for the draw');
  assert.equal(fake._decalPicture, false, 'and off after it - a blood mark drawn next is a film');
  const thrower = { _decalPicture: false, drawDecals() { throw new Error('lost context'); } };
  assert.throws(() => Renderer.prototype.drawDecalPicture.call(thrower, 'b', 't'));
  assert.equal(thrower._decalPicture, false, 'off again even when the draw throws');
});

