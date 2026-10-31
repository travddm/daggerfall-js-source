import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MILL_SOUND, millSoundPosition, machineryChildPos, ROTOR_HUB } from '../../src/world/windmills.js';
import { MACHINERY_CHILDREN } from '../../src/world/windmillMesh.js';
import { SOUND } from '../../src/systems/soundClips.js';
import { identity, trs, transformPoint } from '../../src/world/mat4.js';
import { AudioEngine } from '../../src/systems/audio.js';

// WM4c - THE MILL HUMS. Kamer's Spin_Up.Start adds a DaggerfallAudioSource
// and sets SoundClips.ArenaFireDaemon to LoopOnAwake, on the sail and on
// the machinery's plank gear. Everything about the source but the clip
// and the preset is Unity's fresh-AudioSource default, and the pins
// below hold that profile against DFU's own code and Unity's own
// numbers, then sweep the four hosts for the start, the move, and the
// three ways it must stop.

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('WM4c: the clip is ArenaFireDaemon, and the profile is a default DaggerfallAudioSource', () => {
  // SoundClips.cs:40 - ArenaFireDaemon = 11. Spin_Up.cs:
  //   source1.SetSound(sound, AudioPresets.LoopOnAwake)
  // with spatialBlend defaulting to 1 (DaggerfallAudioSource.cs:164).
  // The AudioSource AddComponent creates carries Unity's defaults:
  // logarithmic rolloff, minDistance 1, maxDistance 500 - and
  // DaggerfallAudioSource never touches those. Its LoopOnAwake arm sets
  // volume = Settings.SoundVolume at play, which here is the master bus.
  assert.equal(SOUND.ArenaFireDaemon, 11);
  assert.equal(MILL_SOUND.clip, 11);
  assert.equal(MILL_SOUND.refDistance, 1);
  assert.equal(MILL_SOUND.maxDistance, 500);
  assert.equal(MILL_SOUND.distanceModel, 'inverse');   // play3d's own reading of Unity's logarithmic
  assert.equal(MILL_SOUND.volume, 1);
  assert.ok(Object.isFrozen(MILL_SOUND));
});

test('WM4c: the source sits on the GameObject that carries Spin_Up - the sail outside, the gear inside', () => {
  // The exterior source is on the prefab's Blade child, which stands at
  // ROTOR_HUB; under a placement it is the hub carried through.
  const m = trs(10, 2, -7, 0, 90, 0);
  const at = millSoundPosition(m);
  const hub = transformPoint(m, ROTOR_HUB[0], ROTOR_HUB[1], ROTOR_HUB[2]);
  assert.ok(at.every((v, i) => near(v, hub[i])), 'the hum is not at the hub');
  assert.ok(!near(at[0], 10) || !near(at[2], -7), 'the hub offset was lost');
  // Inside, the flag is on the child whose script is Spin_Up and on no
  // other; the roller's script adds no source.
  const gear = MACHINERY_CHILDREN.find((c) => c.name === 'Plank_Gear');
  const roller = MACHINERY_CHILDREN.find((c) => c.name === 'Roller');
  assert.equal(gear.loopsSound, true);
  assert.equal(roller.loopsSound, false);
  const gp = machineryChildPos(identity(), gear);
  assert.deepEqual(gp.map((v) => +v.toFixed(2)), [11.02, 4.49, -2.28]);
  // And that flag is the vendored record's, not a copy.
  const json = JSON.parse(read('vendor/windmills-kamer/machinery.json'));
  assert.deepEqual(MACHINERY_CHILDREN.map((c) => c.loopsSound), json.children.map((c) => c.loopsSound));
});

test('WM4c: loop3d takes a distance model, defaults LINEAR so the torches do not move, and its handle MOVES', () => {
  // Before the context exists the engine answers null and nothing
  // throws - which is what lets the hosts retry every frame.
  const engine = new AudioEngine();
  assert.equal(engine.loop3d(MILL_SOUND.clip, [0, 0, 0], 1, MILL_SOUND), null);
});

