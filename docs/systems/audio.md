# Audio

This page covers everything the game plays through the speakers: the Web Audio engine, Daggerfall's sound and music
archives, how a song is chosen, ambience, footsteps, combat voices, the game's own added sounds, and the volume
controls.

## Shape

| Part | Files | Role |
| --- | --- | --- |
| Engine | `src/systems/audio.js` | One `AudioContext`, the bus, one-shots, loops, beds, 3D panning, reverb, limiter |
| Sound archive | `src/formats/sndFile.js` | Reads `DAGGER.SND` (8-bit unsigned mono PCM, 11025 Hz) |
| Clip ids | `src/systems/soundClips.js` | Daggerfall Unity's `SoundClips` enum values (record indices), the subset in use |
| Music | `src/systems/music.js`, `src/systems/song/` | The music service, the song tables, the sequencer |
| Music archive | `src/formats/hmiFile.js` | Reads `MIDI.BSA` and its HMI songs |
| Synth | `src/systems/gmSynth.js` | An oscillator General MIDI bank that voices the songs |
| MIDI out | `src/systems/midiOut.js` | Sends the songs to a Web MIDI device instead of the synth |
| Ambience | `src/systems/ambientEffects.js`, `src/systems/animalAmbience.js`, `src/systems/betterAmbience.js` | Daggerfall's scene ambience, animal flats, the Better Ambience mod |
| Soundscape | `src/systems/soundscape/`, `src/scenes/soundscapeHost.js` | The game's own sea, shore, wild and town layers |
| Footsteps | `src/systems/footsteps.js`, `src/systems/immersiveFootsteps.js` | Daggerfall's stride and the Immersive Footsteps mod |
| Combat voices | `src/combat/combatVoices.js`, `src/characters/enemy/enemySounds.js` | Grunts, pain cries, enemy barks |
| Packs | `src/systems/soundReplacer.js`, `src/systems/musicReplacement.js` | Player-attached sound and music replacements |

Other modules play through the same engine: `src/systems/wind/windAudio.js`, `src/systems/gatherSounds.js`,
`src/player/climb/climbSounds.js`, `src/systems/naval/navalSounds.js`, `src/ui/uiClickSound.js` and more. Search
for imports of `src/systems/audio.js` to find them.

## The engine (`src/systems/audio.js`)

`audio` is the module singleton (`new AudioEngine()`). Every host calls `audio.ensure(fetchBytes)` at boot; it is
idempotent and memoises its boot promise.

- **Boot.** `_boot` creates the context at once, suspended, then loads `DAGGER.SND` through the data seam (`init`). The
  context exists before any gesture so the video player and the music have a clock. A missing `DAGGER.SND` disables
  sound effects only (`enabled = false`); music and video still run.
- **Gesture unlock.** `attachGestureResume` resumes the context on the first `pointerdown`, `keydown` or `touchstart`.
  Until then every play call is a silent no-op.
- **Decoding.** A record decodes lazily: `pcm8ToFloat32` maps byte `b` to `(b - 128) / 128`, and the `AudioBuffer`
  caches by index (`_buffer`). `registerSamples(key, samples, rate)` registers a buffer the game made itself under a
  string key; every play door then accepts that key as a clip.
- **Doors.** `playOneShot(index, volume, pitch)` (flat, at the ear), `play3d` / `play3dVoice` (positional), `loop`,
  `setLoop`, named beds (`setBed`, `setBed3d`, `fadeFar`), and `source()` (an `AudioSource`-shaped object for ported mod code).
  `playOneShotId` resolves a Daggerfall sound id to an index first.
- **Handedness.** The scene uses Daggerfall Unity's left-handed frame; Web Audio is right-handed. `audioFrame` negates
  z once for the listener and every source. Callers always pass scene coordinates.
- **Panning.** `PANNING_MODEL` is `'HRTF'`. `_panner` takes Unity-style `refDistance`, `maxDistance`,
  `distanceModel` and `rolloffFactor`.

### The bus

```
sources -> master (Sound Volume) -> listener bus -> [listener low-pass] -> limiter -> speakers
                 \-> reverb send -> convolver --/
music master (songPlayer.js) ------/
```

- `_out()` builds the master gain and the listener bus once per context. The master reads `Controls/SoundVolume` and
  re-levels over 50 ms when the setting changes (`_relevel`), so a slider moves sounds that are already playing.
- `setListenerLowPass(cutoffHz)` hangs a low-pass on the whole mix (underwater).
- Reverb: `setReverb(preset)` uses the presets in `src/systems/reverbPresets.js` (Unity's `AudioReverbPreset`
  numbers, with an impulse the game builds from them). `holdReverb` / `releaseReverb` let one owner hold the zone.
- The limiter (`_limiter`) is a `DynamicsCompressorNode` (`LIMITER`: -3 dB, 20:1), a trim that removes the
  compressor's make-up gain (`limiterTrim`), and a `WaveShaper` soft ceiling (`limitAmplitude`, `LIMIT_CEILING` 0.98).
  Everything under -3 dBFS passes unchanged. A context without these nodes plays straight to the speakers.

### Voice limit

`REAL_VOICES` is 32, the same count Daggerfall Unity's Unity project uses. `voiceRoom(live, level, max, flat)` decides
whether a one-shot plays:

- Under the limit, it plays.
- At the limit, a positional shot plays only if it is at least as loud at the ear (`distanceGain`) as the quietest
  positional voice. That voice fades out over `VOICE_FADE_S`.
- A flat shot (`playOneShot`, the player's own sounds) always plays and takes the quietest positional voice, or the
  quietest flat one when all are flat.
- Loops and beds do not count.

Unity makes excess voices virtual; the game drops them. Every one-shot chain is disconnected when it ends
(`_voiceKeep`), and stopped loops release all their nodes (`releaseNodes`). Do not add a play door that skips these:
leaked chains stall the context.

## Music

### Data path

`MIDI.BSA` holds Daggerfall's HMI songs. `src/formats/hmiFile.js` (`MidiBsaFile`, `HmiFile`) decodes them to a
tick-ordered event stream (`HMI_TICKS_PER_QUARTER` is 60). Daggerfall Unity ships pre-converted `.mid` files and a
SoundFont of its own, so there is nothing to port for the voice: `src/systems/gmSynth.js` is the game's own oscillator
bank behind `voiceSpec` / `percussionSpec`. Channel 9 is percussion.

`src/systems/song/songPlayer.js` (`SongPlayer`) is the sequencer: a lookahead pump (`LOOKAHEAD_SECONDS` 0.25, every
`TICK_INTERVAL_MS` 100), loops with a seam, and its own gain (`MUSIC_GAIN` times `Controls/MusicVolume`).
`AudioSongPlayer` plays a decoded replacement file instead.

### Selection

`src/systems/song/songManager.js` carries Daggerfall Unity's `SongManager` playlists verbatim, in the archive's
spelling (`GDAY___D.HMI`), duplicates included because they change the odds. `SongManager.update(context)` picks a
playlist from the environment (`musicEnvironment`, `MUSIC_ENV`): dungeon, wilderness or city by weather and night,
temples by alignment, taverns, shops, guilds, palaces, castles. `selectSong` uses the game's seeded `DFRandom`; a dungeon seeds it with `dungeonKey` (from the dungeon block's
`Unknown2` field and the region).

Each host builds one director with `createMusicDirector()` (`src/scenes/shared.js`) and calls `update(base, overlay)`
every frame. It reads `Audio/AlternateMusic` (the FM playlists) once at construction, as Daggerfall Unity does, so a
change applies at the next scene boot. Some features take the music first and skip the director while they hold it:
the sea's songs (`src/systems/soundscape/seaScore.js`), boss and arena scores. They register songs made in code with
`music.registerSong(name, song)`; a registered name answers before `MIDI.BSA`.

The intro film and both main menus play Daggerfall Unity's title song, `5STRONG.HMI` (`song_5strong`, the setup
wizard's `titleSongFile` in `DaggerfallUnitySetupGameWizard.cs`), with `03.HMI` as a stand-in for an archive without
it (`src/systems/titleMusic.js` `TITLE_SONGS`). Daggerfall's own `MIDI.BSA` has no `5STRONG` record (Daggerfall
Unity ships that song as a `.mid` file of its own), so with Daggerfall's data `03.HMI` plays. The front door does not ask for ARENA2, so on a first visit the intro
plays silently. The film runs on the shared AudioContext's clock, not the song's: its cue sheet
(`src/ui/intro/introCue.js`) has no beat in the title song to land on. The song plays at a lower level under the
Enhanced menu (`MENU_MUSIC_LEVEL`) and fades out when a game is chosen. Daggerfall Unity plays it at one level.

### The music service (`src/systems/music.js`)

`music` (`MusicService`) owns one player on the engine's context. A switch fades: the old song fades out over
`MUSIC_FADE_OUT_S` (1.5 s), then the next fades in over `MUSIC_FADE_IN_S` (1 s). Daggerfall Unity cuts instead; this
is a deliberate departure. The latest request during a fade wins, and `playing` stays true through the fade so the
director does not see a finished song.

- **Music packs.** `src/systems/musicReplacement.js` follows Daggerfall Unity's `SoundReplacement.TryImportSong`:
  when `Enhancements/AssetInjection` is on and the player has attached a folder, a file named after the song replaces
  it. It accepts several extensions (not only `.ogg`). Nothing is bundled.
- **MIDI out.** Settings > Audio > Music > MIDI out (uiPrefs `midiOut`). `MidiOutSongPlayer` is a `SongPlayer` that
  sends channel events to the device; it releases notes itself. The browser asks for MIDI access only on the first
  press of that row. Safari has no Web MIDI.

## Ambience

- **Scene ambience** (`src/systems/ambientEffects.js`): Daggerfall Unity's `AmbientEffectsPlayer` presets. Dungeon
  one-shots around the player, rain loop, storm thunder, sunny-day birds, night crickets. The crickets play less often
  than in Daggerfall Unity (a deliberate departure).
- **Animal flats** (`src/systems/animalAmbience.js`): every archive-201 animal flat within range rolls each classic
  tick and barks, in dungeons and towns alike. Horses follow Horse Volume, the others Animal Volume.
- **Better Ambience** (`src/systems/betterAmbience.js`): the mod by Joshua Steinhauer (joshcamas), MIT, sources and
  clips in `vendor/better-ambience/`. Ported: dungeon reverb, camera shake on damage, dungeon fog and light, the
  indoor rain loop. Its footsteps ship off (see below).
- **Wind** (`src/systems/wind/windAudio.js`): one filtered-noise loop that follows wind strength, silent indoors.
- **Soundscape** (`src/scenes/soundscapeHost.js` drives `src/systems/soundscape/`): over a ship's deck, swell, wash
  and rigging beds (`seaAir.js`) and the sea's songs at the helm (`seaScore.js`); on land, surf near a shore, the
  wild by climate and hour, and a town's murmur and taverns (`worldAir.js`). Beds are seeded noise made off the main
  thread (`soundJobs.js`, `soundWorker.js`, `soundBeds.js`, `townBeds.js`); recorded clips are `public/sfx/*.wav`,
  with provenance in `public/sfx/SOURCES.md` (`soundscapeSfx.js`, loaded by `clipInstall.js`). The host's `stop`
  silences it indoors.

## Footsteps

- `src/systems/footsteps.js` is Daggerfall Unity's `PlayerFootsteps`: the ground decides the clip pair, one step every
  `WALK_STEP_INTERVAL` (2.5 units), volume `FOOTSTEP_VOLUME` (0.7). The hosts always run this machine because its
  water and landing state feed other readers.
- `src/systems/immersiveFootsteps.js` ports Immersive Footsteps 1.01 by Kirk.O (MIT, `vendor/immersive-footsteps/`):
  terrain- and floor-aware steps plus armour sway, at a fixed 0.02 s step. While it is on and its clips have loaded,
  `ownsStride()` answers true and the hosts skip the classic stride. The hosts call its `onTransition*` handlers on
  every scene change.
- Better Ambience's "Better Footsteps" ships **off**, as Immersive Footsteps' author asks. Turning both on shows the
  mod's warning (`reportModCompatibilityIssues`).

## Combat voices

`src/combat/combatVoices.js` ports Daggerfall Unity's race and gender attack and pain clip tables. It reads
`Enhancements/CombatVoices` at the point of use (Features row `combat-voices`). Rolls: 20% for an attack grunt
(`ATTACK_VOICE_CHANCE`), 40% for a pain cry (`PAIN_VOICE_CHANCE`). `src/characters/enemy/enemySounds.js` ports
`EnemySounds`: the move and bark cadence and attack sounds, read from the enemy table. Monster Volume scales a
monster's own sounds, not a weapon's impact.

## The game's own sounds

`src/systems/enhancedSounds.js` `enhancedSoundsOn()` gates every sound Daggerfall does not have: the wind, the
enhanced inventory's clicks, climbing, horse voices and hooves, gathering, and the soundscape. It is true only on the
enhanced skin with uiPrefs `soundEnhancements` on (Features row `enhanced-sounds`). The classic skin plays exactly what
Daggerfall Unity plays. The pref name avoids the `enhanced` prefix on purpose: online play forces every `enhanced*`
pref on, and sound stays the player's choice.

Loose sound replacement (`src/systems/soundReplacer.js`) lets a player attach a mod's `Sound` folder; listed clips
(the crickets and the distant howl) are then replaced. uiPrefs `nightCrickets` and `distantHowl` silence each.

## Volume settings

| Row | Store | Reader |
| --- | --- | --- |
| Sound Volume | `Controls/SoundVolume` (settings) | the engine master, `_out` |
| Music Volume | `Controls/MusicVolume` (settings) | `musicGain`, `trackGain` in `songPlayer.js`; `music.resyncGain` |
| Monster Volume, Companion Idle Volume | uiPrefs `monsterVolume`, `companionVolume` | `src/systems/monsterVolume.js` |
| Horse Volume, Animal Volume | uiPrefs `horseVolume`, `animalVolume` | `src/systems/animalVolume.js` |

All four extra rows scale under Sound Volume. They sit on Settings > Audio > Volume (`src/ui/settings/settingsMap.js`).
Every sound must reach the speakers through the master: a new play door connects through `_out()`.

## Tests

- Engine: `test/systems/audio.test.js`, `test/systems/audio3d.test.js`, `test/systems/gatemix_limiter.test.js`,
  `test/systems/rpt1026_events_audio.test.js` (voice limit).
- Music: `test/systems/music.test.js`, `test/systems/disc20.test.js` (fades), `test/systems/midiout1.test.js`,
  `test/systems/musicreplacement.test.js`, `test/systems/audit21_music.test.js`, `test/formats/hmi.test.js`.
- Ambience and footsteps: `test/systems/ambient.test.js`, `test/systems/animalambience.test.js`,
  `test/systems/ba1_betterambience.test.js`, `test/systems/footsteps.test.js`,
  `test/systems/if1_immersivefootsteps.test.js`, `test/systems/soundscape/`.
- Switches and volume: `test/systems/enhancedsounds.test.js`, `test/systems/volume_sliders.test.js`,
  `test/systems/uisounds.test.js`.

## Traps

- Never create a second `AudioContext`. Music and video share the engine's so their clocks agree.
- `ensure` must stay idempotent with `??=` on a `null` start value; a `false` start value breaks the memo.
- Node tests have no `window`: `_ensureCtx` leaves sound disabled and play calls do nothing.
- Keep playlists in Daggerfall Unity's order with its duplicates.
- The FM choice is read once per scene boot, not live.
