// PEER-BUZZ: a peer's stride
// machine was fed the WIRE's coordinates (AUDIT DROPS E5), and in the
// overworld the wire's frame is world coordinates - 32768 per map pixel
// against the scene's 819.2, forty scene units to one. Every 2.5 wire
// units was a step: forty-eight a second for a walker. The stride is
// measured in scene units now, and the floating-origin recentre rebases
// every peer machine, as EV1 rebases the local one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RemotePlayers } from '../../src/net/remotePlayers.js';
import { PIXEL_UNITS } from '../../src/net/wire.js';

const rd = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const SCENE_PER_PIXEL = 819.2;                       // world/streamingWorld.js: one map pixel of terrain in scene units
const WIRE_PER_SCENE = PIXEL_UNITS / SCENE_PER_PIXEL;   // 40: the overworld pose is in world coordinates
const rig = () => {
  const played = [];
  const rp = new RemotePlayers({ renderer: {}, deps: { fetchBytes: async () => null, palette: null, audio: { playOneShot: (clip, vol) => played.push({ clip, vol }) } }, compose: async () => null });
  return { rp, played };
};
const peer = (x, mv = 1) => ({ id: 'bob-0001', name: 'bob', shown: { x, y: 0, z: 0, yaw: 0, pitch: 0, mv, wd: 0, an: 0, fk: 0 }, look: null });
const toScene = (p) => [p.x / WIRE_PER_SCENE, p.y, p.z / WIRE_PER_SCENE];   // world.js onlineToScene's overworld arm, as a scale

test('PEER-BUZZ, driven: a peer walking at 3 scene units a second in the OVERWORLD makes a walker\'s cadence of steps - about one every 0.8 s - not forty-eight a second', () => {
  assert.equal(WIRE_PER_SCENE, 40, 'the overworld wire frame is forty scene units to one');
  const { rp, played } = rig();
  const opts = { bodyHeight: () => 2, eye: [0, 1.7, 0] };
  let wireX = 0; const FPS = 60, SECONDS = 5, SPEED = 3;
  for (let i = 0; i < FPS * SECONDS; i++) { wireX += SPEED * WIRE_PER_SCENE / FPS; rp.sync([peer(wireX)], toScene, opts); }
  const expected = SPEED * SECONDS / 2.5;   // WALK_STEP_INTERVAL
  assert.ok(played.length >= expected - 1 && played.length <= expected + 1, `${played.length} steps in ${SECONDS} s at ${SPEED} u/s - a walk is ~${expected} (the buzz was ${expected * WIRE_PER_SCENE})`);
  // and standing still is silent, whatever the frame
  const n = played.length;
  for (let i = 0; i < 60; i++) rp.sync([peer(wireX, 0)], toScene, opts);
  assert.equal(played.length, n, 'a standing peer takes no step');
});

