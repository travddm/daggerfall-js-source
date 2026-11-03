// AUDIT 18 - "hosts-outer": the FOUR-HOST GAP lane.
//
// src/scenes/{world,exterior,dungeon}.js and the worldModes machine
// they mount are parallel motor hosts. The single worst recurring bug
// shape in this port is a feature wired into ONE of them and not its
// siblings; it has recurred at every audit since 17h. Each law below
// was extracted into src/scenes/shared.js so it CANNOT be half-applied
// again, and each is pinned twice:
//   - BEHAVIOURALLY on the extracted function, and
//   - by a SOURCE SWEEP asserting every host calls it by name.
// The source sweeps are not decoration: the behavioural pin alone
// passes identically before and after the host wiring, which is
// exactly the trap that let these ship. Every assertion here was
// checked to FAIL under the mutation that restores the defect.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  motorStats, applyMotorEffectFlags, adjustFallStart,
  offsetArrows, populatesWanderingNpcs, POPULATED_LOCATION_TYPES,
  applyFallLanding, NetRandom, applyNightStars, STAR_CHANCE, STAR_COLOR_INDICES,
  outdoorFogColor, RAINY_FOG_DENSITY, skyFrameForWeatherTime,
} from '../../src/scenes/shared.js';
import { GROUND_RECORD_LIMIT } from '../../src/world/terrain/terrainTiles.js';   // AUDIT WATER-NEXT m8
import { KEEP } from '../../src/scenes/dataSource.js';
import { PlayerMotor, walkSpeed, FALL_DAMAGE_THRESHOLD, FALL_HP_PER_METRE } from '../../src/player/motor.js';
import { SKILLS } from '../../src/systems/skills.js';
import { SOUND } from '../../src/systems/soundClips.js';
import { FOG_SETTINGS } from '../../src/world/weather.js';
import { skyFrameForTime } from '../../src/world/worldClock.js';
import { convertTilemap } from '../../src/world/terrain/terrainSurface.js';
import { ArrowFlight } from '../../src/combat/arrowFlight.js';
import { biogFileName } from '../../src/formats/biogFile.js';
import { BlocksFile } from '../../src/formats/blocksFile.js';
import { MapsFile } from '../../src/formats/mapsFile.js';
import { Arch3dFile } from '../../src/formats/arch3dFile.js';
import { dfMeshToModel } from '../../src/world/meshReader.js';
import { layoutInterior } from '../../src/world/interior/interiorLayout.js';
import { ImgFile } from '../../src/formats/imgFile.js';
import { DFPalette } from '../../src/formats/dfPalette.js';
import { hostText } from '../hostText.mjs';   // HOST-SPLIT 2: the world host whole

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (f) => hostText(f);

const ARENA2 = process.env.ARENA2_PATH;
const skipReal = !ARENA2 || !existsSync(ARENA2)
  ? 'ARENA2_PATH not set or missing - real-data validation skipped'
  : false;

// The four parallel motor hosts, by the names the brief uses.
const MOTOR_HOSTS = ['src/scenes/world.js', 'src/scenes/exterior.js', 'src/scenes/dungeon.js'];
const EXTERIOR_HOSTS = ['src/scenes/world.js', 'src/scenes/exterior.js'];

// ---------------------------------------------------------------------
// 1. The player motor is never given the live entity.
//    PlayerSpeedChanger.cs:389/:400/:418 read Stats.LiveSpeed and
//    GetLiveSkillValue(Running/Swimming) on EVERY call; every host
//    passed `undefined`, taking the motor's 50/30/30 default forever.
// ---------------------------------------------------------------------

test('audit18 hosts: motorStats is LIVE - a rolled or drained Speed reaches the motor', () => {
  const entity = { stats: { speed: 50, strength: 50 }, skills: 30 };
  const stats = motorStats(entity);
  assert.equal(stats.speed, 50);
  assert.equal(stats.running, 30);
  assert.equal(stats.swimming, 30);

  // The whole point: the read is per-step, not a boot-time snapshot.
  entity.stats.speed = 80;
  assert.equal(stats.speed, 80, 'motorStats must re-read the entity, not snapshot it');

  // A drain rides liveStat, exactly as LiveSpeed does.
  entity.activeEffects = [{ kind: 'drainAttribute', stat: 'speed', magnitude: 30 }];
  assert.equal(stats.speed, 50);
  entity.activeEffects = [{ kind: 'fortifyAttribute', stat: 'speed', magnitude: 20 }];
  assert.equal(stats.speed, 100);

  // Per-skill values, not the flat interim, once chargen has rolled.
  entity.skills = { [SKILLS.Running]: 71, [SKILLS.Swimming]: 12 };
  assert.equal(stats.running, 71);
  assert.equal(stats.swimming, 12);
});

test('audit18 hosts: motorStats keeps the documented SPD-50 stand-in before chargen', () => {
  // playerEntity's INTERIM entity carries strength/agility/luck and NO
  // speed key. An unguarded liveStat would return 0 and walk a fresh
  // boot at (0 + 150 - 35) / 39.5 instead of the SPD-50 default.
  const interim = { stats: { strength: 50, agility: 50, luck: 50 }, skills: 30 };
  assert.equal(motorStats(interim).speed, 50);
  assert.equal(motorStats({}).speed, 50);
});

test('audit18 hosts: the motor actually MOVES with the live stat', () => {
  const entity = { stats: { speed: 50 }, skills: 30 };
  const motor = new PlayerMotor({ move: () => {} }, motorStats(entity));
  assert.equal(motor.stats.speed, 50);
  const slow = walkSpeed(motor.stats.speed);
  entity.stats.speed = 90;
  const fast = walkSpeed(motor.stats.speed);
  assert.ok(fast > slow, 'a raised Speed must raise the walk speed');
});

test('audit18 hosts: EVERY motor host hands PlayerMotor the live entity', () => {
  for (const host of MOTOR_HOSTS) {
    const s = src(host);
    assert.match(s, /new PlayerMotor\([^)]*motorStats\(playerEntity\)/,
      `${host} must construct PlayerMotor with motorStats(playerEntity)`);
    assert.doesNotMatch(s, /new PlayerMotor\([A-Za-z.]+, undefined,/,
      `${host} still passes undefined stats - the motor takes its 50/30/30 default`);
  }
});

// ---------------------------------------------------------------------
// 2. levitate / swim / slowFall / waterWalking were written only in
//    world-mode 'dungeon' and NEVER CLEARED.
// ---------------------------------------------------------------------

test('audit18 hosts: applyMotorEffectFlags - the EFFECT owns the flag (Levitate.cs:131/:136)', () => {
  const player = { levitating: true, swimming: true, waterWalking: true, slowFalling: true, waterSurfaceY: 12 };

  // No live effect -> every flag clears. This is the leak that stranded
  // a player in the motor's no-gravity branch after leaving a dungeon.
  applyMotorEffectFlags(player, { activeEffects: [] });
  assert.equal(player.levitating, false);
  assert.equal(player.swimming, false);
  assert.equal(player.waterWalking, false);
  assert.equal(player.slowFalling, false);
  assert.equal(player.waterSurfaceY, null, 'no blockWaterLevel outdoors -> IsPlayerSwimming false');

  // A LIVE Levitate must survive the transition - DFU keeps you
  // levitating outdoors until the spell ends, so "clear on exit"
  // would be a different bug.
  applyMotorEffectFlags(player, { activeEffects: [{ kind: 'levitate', roundsRemaining: 4 }] });
  assert.equal(player.levitating, true);
  assert.equal(player.swimming, false, 'swimming is never true outside a water block');

  applyMotorEffectFlags(player, { activeEffects: [{ kind: 'waterWalking', roundsRemaining: 1 }] });
  assert.equal(player.waterWalking, true);
  assert.equal(player.levitating, false);

  applyMotorEffectFlags(player, { activeEffects: [{ kind: 'slowfall', roundsRemaining: 1 }] });
  assert.equal(player.slowFalling, true);
});

// ---------------------------------------------------------------------
// 3. An open dungeon UI window did not hold the world in worldModes.
// ---------------------------------------------------------------------

// ---------------------------------------------------------------------
// 4. Platform riding was wired only into the standalone dungeon scene.
// ---------------------------------------------------------------------

// step meets as it steps (world/actionSystem.js _standMover, player/moverBody.js), and shared.js's ridePlatform, a
// host-side delta applied the next frame, is gone; test/world/fb1019f_moverbody.test.js holds the law whole.
test('audit18 hosts: the mover carries its rider by its own step, the rider\'s own stance through the resolver - and a body on the static shell beside it is no rider', async () => {
  const { Collider } = await import('../../src/player/collider.js');
  const { ActionSystem } = await import('../../src/world/actionSystem.js');
  const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const plate = (x0, x1) => ({ positions: new Float32Array([x0, 0, -1, x1, 0, -1, x1, 0, 1, x0, 0, 1]), indices: new Uint32Array([0, 1, 2, 0, 2, 3]) });
  const col = new Collider(() => -Infinity);
  const floor = plate(-20, 20);
  col.addMesh('dungeon', floor.positions, floor.indices, I);
  const actions = new ActionSystem(col);
  const lift = actions.addAction(0, 7, plate(-1, 1), new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.001, 0, 1]),
    { duration: 20, rotation: { x: 0, y: 0, z: 0 }, translation: { x: 0, y: 2, z: 0 }, nextObject: -1, triggerFlag: 0x02 });
  const rider = new PlayerMotor(col);
  rider.spawn(0, 0.2, 0);
  rider.crouching = true;   // PH1: the rider's own stance
  const still = { forward: 0, strafe: 0, run: false, jump: false, up: false, down: false };
  for (let i = 0; i < 30; i++) rider.update(1 / 60, still, 0);
  assert.equal(rider.groundKey, lift.key, 'the rider stands on the lift');
  actions.activate(lift.key);
  actions.update(0.25, rider);
  assert.ok(Math.abs(rider.pos[1] - lift.matrix[13]) < 1e-6, `carried by the step itself: feet ${rider.pos[1]} on the lift at ${lift.matrix[13]}`);
  // the static dungeon shell is not a platform: a body standing on it, beside the lift, stays where it stood
  const by = new PlayerMotor(col);
  by.spawn(5, 0.2, 0);
  for (let i = 0; i < 30; i++) by.update(1 / 60, still, 0);
  assert.equal(by.groundKey, 'dungeon');
  const at = [...by.pos];
  actions.update(0.25, by);
  assert.deepEqual([...by.pos], at);
});

test('audit18 hosts: BOTH dungeon-mounting hosts hand the movers the body (and the building\'s host its own)', () => {
  const hosts = [
    ['src/scenes/dungeon.js', /if \(!overlayHeld\) ctx\.actions\.update\(dt, walkMode \? player : null\);/],
    ['src/scenes/worldModes.js', /if \(!overlayHeld\) dungeonCtx\.actions\.update\(dt, player\);/],
    ['src/scenes/worldModes.js', /if \(!overlayHeld\) interiorCtx\.actions\.update\(dt, player\);/],
  ];
  for (const [host, call] of hosts) {
    assert.match(src(host), call, `${host} keeps the body from its movers - the lift penetrates the capsule`);
  }
});

// ---------------------------------------------------------------------
// 5. The floating-origin recenter shifted Y but not fallStart, and
//    arrows.offsetAll?.() was a permanent no-op.
// ---------------------------------------------------------------------

test('audit18 hosts: adjustFallStart is AcrobatMotor.AdjustFallStart, guard included', () => {
  const falling = { falling: true, fallStart: 505 };
  adjustFallStart(falling, -505);
  assert.equal(falling.fallStart, 0, 'a vertical recenter must carry fallStart with it');

  // The `falling` guard is verbatim: a grounded motor's fallStart is a
  // stale value and must not be corrupted.
  const grounded = { falling: false, fallStart: 505 };
  adjustFallStart(grounded, -505);
  assert.equal(grounded.fallStart, 505);
});

test('audit18 hosts: an unadjusted fallStart bills a 2-metre hop as a 500-metre fall', () => {
  // The concrete failure: cross the +/-500 vertical threshold while
  // airborne and land. landedFallDistance = fallStart - pos.y.
  const shift = -505;
  const player = { falling: true, fallStart: 505 };
  const landedY = 505 + shift + 2;          // two metres below the (shifted) start
  const unbilled = player.fallStart - landedY;
  assert.equal(unbilled, 503, 'the un-adjusted bill');
  adjustFallStart(player, shift);
  assert.equal(player.fallStart - landedY, -2 + 0, 'the adjusted bill is the real drop');
  assert.ok(Math.trunc(FALL_HP_PER_METRE * (unbilled - FALL_DAMAGE_THRESHOLD)) > 2000,
    'the un-adjusted bill is a lethal 2475 HP from a hop');
});

test('audit18 hosts: offsetArrows actually moves in-flight arrows (the ?. hid a missing method)', () => {
  const arrows = new ArrowFlight({ getGpuMesh: () => null });
  arrows.fire([1, 2, 3], [0, 0, 1]);
  arrows.fire([10, 0, -4], [1, 0, 0]);
  // The pre-fix call site was `arrows.offsetAll?.(offset)` and
  // ArrowFlight has no offsetAll at all, so this was a silent no-op.
  assert.equal(typeof arrows.offsetAll, 'undefined',
    'ArrowFlight has no offsetAll - the optional call could never do anything');
  offsetArrows(arrows, [-819.2, -500, 10]);
  assert.deepEqual(arrows.arrows[0].pos, [1 - 819.2, 2 - 500, 13]);
  assert.deepEqual(arrows.arrows[1].pos, [10 - 819.2, -500, 6]);
});

// ---------------------------------------------------------------------
// 6. The exterior host spawned a wandering population everywhere.
// ---------------------------------------------------------------------

test('audit18 hosts: PopulationManager rides exactly seven LocationTypes', () => {
  // StreamingWorld.cs:771-781 / DFRegion.cs:66-86. Set equality, not
  // spot checks - a widened table must fail this.
  assert.deepEqual([...POPULATED_LOCATION_TYPES].sort((a, b) => a - b), [0, 1, 2, 3, 5, 6, 8]);
  for (const t of [0, 1, 2, 3, 5, 6, 8]) assert.equal(populatesWanderingNpcs(t), true, `type ${t}`);
  // DungeonLabyrinth 4, DungeonKeep 7, ReligionCult 9, DungeonRuin 10,
  // HomePoor 11, Graveyard 12, Coven 13 get no wandering NPCs.
  for (const t of [4, 7, 9, 10, 11, 12, 13, 14, 15]) {
    assert.equal(populatesWanderingNpcs(t), false, `type ${t} must NOT be populated`);
  }
});

test('audit18 hosts: the ?exterior gate is reachable on real MAPS.BSA', { skip: skipReal }, () => {
  const maps = new MapsFile();
  maps.load(
    new Uint8Array(readFileSync(join(ARENA2, 'MAPS.BSA'))),
    new Uint8Array(readFileSync(join(ARENA2, 'CLIMATE.PAK'))),
    new Uint8Array(readFileSync(join(ARENA2, 'POLITIC.PAK'))),
  );
  // ?exterior takes an arbitrary ?region/?loc from the URL, so the gate
  // is not theoretical: a DungeonLabyrinth exterior is one query away.
  const cases = [['Daggerfall', 'Daggerfall', 0, true],
    ['Daggerfall', 'Gothway Garden', 1, true],
    ['Daggerfall', "Privateer's Hold", 4, false]];
  for (const [region, name, type, populated] of cases) {
    const loc = maps.getLocationByName(region, name);
    assert.equal(loc.mapTableData.locationType, type, `${name} locationType`);
    assert.equal(populatesWanderingNpcs(loc.mapTableData.locationType), populated, name);
  }
});

// ---------------------------------------------------------------------
// 7. Fall damage: three copies of the law, and interior mode had none.
// ---------------------------------------------------------------------

test('audit18 hosts: applyFallLanding is CheckFallingDamage + ApplyPlayerFallDamage', () => {
  const played = [];
  const sound = (id) => played.push(id);

  // Below half the threshold: nothing at all.
  let e = { health: 40 };
  applyFallLanding(e, 2.4, { sound });
  assert.equal(e.health, 40);
  assert.deepEqual(played, []);

  // Past half the threshold: BadFallDetected, no damage.
  applyFallLanding(e, 3.2, { sound });
  assert.equal(e.health, 40);
  assert.deepEqual(played, [SOUND.FallHard]);

  // Past the threshold: trunc(HPPerMetre * (d - threshold)), and the
  // damage sound instead of the alert.
  played.length = 0;
  e = { health: 40 };
  applyFallLanding(e, 12, { sound });
  assert.equal(e.health, 40 - Math.trunc(FALL_HP_PER_METRE * (12 - FALL_DAMAGE_THRESHOLD)));
  assert.equal(e.health, 5);
  assert.deepEqual(played, [SOUND.FallDamage]);

  // Truncation, not rounding, and health never goes below 0.
  e = { health: 100 };
  applyFallLanding(e, 5.99, { sound: () => {} });
  assert.equal(e.health, 100 - 4, 'trunc(5 * 0.99) = 4');
  e = { health: 3 };
  applyFallLanding(e, 40, { sound: () => {} });
  assert.equal(e.health, 0);

  // The injected `hurt` preserves the dungeon host's hurtPlayer path.
  const bills = [];
  e = { health: 90 };
  applyFallLanding(e, 12, { hurt: (d) => bills.push(d), sound: () => {} });
  assert.deepEqual(bills, [35]);
  assert.equal(e.health, 90, 'an injected hurt must own the health write');
});

// ---------------------------------------------------------------------
// 8. The night-sky star pass (DaggerfallSky.LoadVanillaNightSky).
// ---------------------------------------------------------------------

test('audit18 hosts: NetRandom reproduces .NET System.Random byte-exactly', () => {
  // The published seeded-Random sequence: substituting any other PRNG
  // paints different stars, so this is a DATA law.
  const r0 = new NetRandom(0);
  assert.deepEqual([0, 0, 0, 0, 0].map(() => r0._internalSample()),
    [1559595546, 1755192844, 1649316166, 1198642031, 442452829]);
  const r42 = new NetRandom(42);
  assert.deepEqual([0, 0, 0].map(() => r42._internalSample()),
    [1434747710, 302596119, 269548474]);
  // NextDouble is InternalSample * (1 / int.MaxValue).
  const r = new NetRandom(0);
  assert.equal(r.nextDouble(), 1559595546 * (1.0 / 2147483647));
  // Next(min, max) truncates Sample() * range.
  const rn = new NetRandom(0);
  assert.equal(rn.next(0, 6), Math.trunc(1559595546 * (1.0 / 2147483647) * 6));
});

test('audit18 hosts: the star pass constants and the clear-sky window are verbatim', () => {
  assert.equal(STAR_CHANCE, 0.004);
  assert.deepEqual([...STAR_COLOR_INDICES], [16, 32, 74, 105, 112, 120]);

  // Only `index > 16 && index < 32` is a candidate - the bounds are
  // EXCLUSIVE on both sides (DaggerfallSky.cs:595).
  const edge = new Uint8Array([15, 16, 17, 31, 32, 33]);
  const bmp = { data: edge };
  // A generator that always fires: every eligible texel becomes a star.
  // next() -> 2 picks star colour 74, so a painted texel is visibly
  // distinct from index 16 itself (which is BOTH a bound and a star
  // colour - picking index 0 would hide an off-by-one).
  applyNightStars(bmp, { nextDouble: () => 0, next: () => 2 });
  assert.deepEqual([...edge], [15, 16, 74, 74, 32, 33],
    'indices 16 and 32 are outside the window; 17 and 31 are inside');

  // A generator that never fires leaves the bitmap untouched.
  const keep = new Uint8Array([20, 20, 20]);
  applyNightStars({ data: keep }, { nextDouble: () => 1, next: () => 0 });
  assert.deepEqual([...keep], [20, 20, 20]);

  // emptyBitmap() (a failed decode) must pass through, as getColor32 does.
  assert.doesNotThrow(() => applyNightStars({ width: 0, height: 0, data: null },
    { nextDouble: () => 0, next: () => 0 }));
});

test('audit18 hosts: the seeded star field is deterministic', () => {
  const run = () => {
    const data = new Uint8Array(89592).fill(20);
    applyNightStars({ data }, new NetRandom(0));
    let n = 0;
    for (const v of data) if (STAR_COLOR_INDICES.includes(v)) n++;
    return n;
  };
  assert.equal(run(), 393);
  assert.equal(run(), 393);
});

test('audit18 hosts: NITE night skies get their stars on real data', { skip: skipReal }, () => {
  const counts = {};
  for (const name of ['NITE00I0.IMG', 'NITE01I0.IMG', 'NITE02I0.IMG', 'NITE03I0.IMG']) {
    const img = new ImgFile();
    img.load(new Uint8Array(readFileSync(join(ARENA2, name))), name);
    const pal = new DFPalette();
    pal.load(new Uint8Array(readFileSync(join(ARENA2, img.paletteName))), img.paletteName);
    img.palette = pal;
    const bmp = img.getDFBitmap(0, 0);
    assert.equal(bmp.width, 512);
    assert.equal(bmp.height, 219);
    const before = new Uint8Array(bmp.data);
    let eligible = 0;
    for (const v of before) if (v > 16 && v < 32) eligible++;
    applyNightStars(bmp, new NetRandom(0));
    let changed = 0;
    for (let i = 0; i < before.length; i++) if (before[i] !== bmp.data[i]) changed++;
    counts[name] = { eligible, changed };
  }
  // Measured on the real ARENA2 corpus. The port painted ZERO stars.
  assert.deepEqual(counts, {
    'NITE00I0.IMG': { eligible: 83823, changed: 370 },
    'NITE01I0.IMG': { eligible: 92586, changed: 402 },
    'NITE02I0.IMG': { eligible: 89592, changed: 393 },
    'NITE03I0.IMG': { eligible: 84602, changed: 372 },
  });
});

// ---------------------------------------------------------------------
// 9. Bad weather hides the clear night sky.
// ---------------------------------------------------------------------

test('audit18 hosts: a rainy or snowy night shows the DAY sky at frame 0', () => {
  // Find a night minute and a day minute through the port's own clock.
  const night = [...Array(1440).keys()].find((m) => skyFrameForTime(m) === null);
  const day = [...Array(1440).keys()].find((m) => skyFrameForTime(m) !== null);
  assert.ok(night !== undefined && day !== undefined);

  assert.equal(skyFrameForWeatherTime(night, true), null, 'Normal weather keeps the night sky');
  assert.equal(skyFrameForWeatherTime(night, false), 0,
    'a non-Normal WeatherStyle disables the clear night sky (DaggerfallSky.cs:363-367)');
  // Daytime is untouched either way.
  assert.equal(skyFrameForWeatherTime(day, true), skyFrameForTime(day));
  assert.equal(skyFrameForWeatherTime(day, false), skyFrameForTime(day));
});

test('audit18 hosts: BOTH exterior hosts thread the weather style into the sky', () => {
  for (const host of EXTERIOR_HOSTS) {
    // ES1 gave the call a fourth argument - the weather and
    // the classic clock, which the ENHANCED sky needs for its clouds and
    // its moons - so the night-sky flag is no longer the last thing on
    // the line. It is still the third argument and still the weather's. SEA-EVENTS: world.js's violence the Aether
    // Storm's first, at sea (scenes/seaVenturesHost.js seaStormShown).
    assert.match(src(host), /sky\.use\([^;]*minute, weatherSkyOffset === 0[,)]/,
      `${host} shows NITE on every night minute regardless of weather`);
    assert.match(src(host), /\{ weather, violence: weatherOverride \?\? (?:seaStormShown\(\) \?\? )?currentWeatherRaw\(\), classicMinutes: playerTicker\.classicMinutes, skyMinutes: skyMinutes\(\), sun: wxNow\.sun, flash: flash - 1, pos: [^}]+ \}\);\s*\/\/ WEATHER2a[^\n]*ES1/,
      `${host} does not feed the enhanced sky its weather and clock (TIME1: the event clock the weather walks, the sky the moons are dated by)`);
  }
});

// ---------------------------------------------------------------------
// 10. Gray fog for anything denser than heavy rain.
// ---------------------------------------------------------------------

test('audit18 hosts: outdoorFogColor is SetSkyFogColor, threshold included', () => {
  const sky = [0.2, 0.4, 0.8];
  assert.equal(RAINY_FOG_DENSITY, 0.003);
  // Denser than rainy -> Color.gray.
  assert.deepEqual([...outdoorFogColor(FOG_SETTINGS.snowy, sky)], [0.5, 0.5, 0.5]);
  assert.deepEqual([...outdoorFogColor(FOG_SETTINGS.heavy, sky)], [0.5, 0.5, 0.5]);
  // Rainy is NOT > rainy, and the linear settings are not Exponential.
  assert.equal(outdoorFogColor(FOG_SETTINGS.rainy, sky), sky);
  assert.equal(outdoorFogColor(FOG_SETTINGS.sunny, sky), sky);
  assert.equal(outdoorFogColor(FOG_SETTINGS.overcast, sky), sky);
  // A linear setting denser than the threshold still takes the sky.
  assert.equal(outdoorFogColor({ mode: 'linear', density: 0.5 }, sky), sky);
});

// ---------------------------------------------------------------------
// 11. The interior blockIndex 0 that made IsBadInteriorModel dead.
// ---------------------------------------------------------------------

test('audit18 hosts: the real blockIndex makes IsBadInteriorModel fire', { skip: skipReal }, () => {
  const blocks = new BlocksFile();
  blocks.load(new Uint8Array(readFileSync(join(ARENA2, 'BLOCKS.BSA'))));
  const arch = new Arch3dFile();
  arch.load(new Uint8Array(readFileSync(join(ARENA2, 'ARCH3D.BSA'))));
  const cache = new Map();
  const getModel = (id) => {
    if (!cache.has(id)) {
      cache.set(id, dfMeshToModel(arch.getMesh(arch.getRecordIndex(id)), () => ({ width: 1, height: 1 })));
    }
    return cache.get(id);
  };
  // Every row of the repair table that a host can actually reach.
  for (const [name, record] of [['ARMRGL01.RMB', 1], ['ARMRBL01.RMB', 1], ['GENRGM00.RMB', 8]]) {
    const index = blocks.getBlockIndex(name);
    const block = blocks.getBlock(index);
    assert.equal(block.index, index, `${name}: dfBlock.index must be the real block index`);
    const repaired = layoutInterior(block, index, record, getModel);
    const raw = layoutInterior(block, 0, record, getModel);
    assert.equal(repaired.placements.filter((m) => m.modelIdNum === 31000).length, 0,
      `${name}: the stair-trapping 31000 must be removed`);
    assert.equal(raw.placements.filter((m) => m.modelIdNum === 31000).length, 1,
      `${name}: blockIndex 0 leaves the trap in place`);
    assert.equal(raw.placements.length, repaired.placements.length + 1);
  }
});

// ---------------------------------------------------------------------
// 12. The exterior marker tile bypassed the tilemap conversion.
// ---------------------------------------------------------------------

test('audit18 hosts: a random ground marker resets to RECORD 8, not to BYTE 8', () => {
  // convertTilemap maps a pre-conversion byte b to record (b * 4) +
  // rotate + flip (UpdateTileMapDataJob). MeshReader.cs:487 resets a
  // TextureRecord >= 56 marker to record 8, "Index 8 is grass".
  assert.equal(convertTilemap(new Uint8Array([2]))[0], 8, 'byte 2 decodes to grass record 8');
  assert.equal(convertTilemap(new Uint8Array([8]))[0], 32, 'byte 8 decodes to record 32 - a different texture');
  assert.equal(GROUND_RECORD_LIMIT, 56, 'MeshReader.cs:487: the tileset\'s 56 records');
});

// ---------------------------------------------------------------------
// 13. Host seams with no reachable behaviour in node: source sweeps.
//     (Stated honestly - these files have zero execution coverage and
//     cannot be instantiated without a GL context and a live canvas.)
// ---------------------------------------------------------------------

test('audit18 hosts: interior point lights carry their PER-LIGHT range in both hosts', () => {
  // LT1 widened the call: the same nearestLights pick now also carries
  // colorOf - per-light colour x intensity - so the pin asserts BOTH
  // per-light channels ride the one call.
  for (const host of ['src/scenes/worldModes.js', 'src/scenes/interior.js']) {
    assert.match(src(host), /nearestLights\([A-Za-z.]+\.lights, cam\.pos, renderer\.maxPointLights, [A-Za-z.]+\.lights\.map\(\(l\) => l\.range\),[^\n]*\n\s*\(l\) => interiorLightColor\(!!renderer\.lightingLane, l\.color, l\.intensity\)\)/,   // EL1: the installed set's cap
      `${host} must pass per-record range AND colour x intensity to the shader`);
  }
});

// ---------------------------------------------------------------------
// 14. The ingest diet starved three live readers.
// ---------------------------------------------------------------------

test('audit18 hosts: the ARENA2 diet keeps every file a live reader asks for', () => {
  for (const lean of [true, false]) {
    for (let i = 0; i <= 17; i++) {
      assert.equal(KEEP(biogFileName(i), lean), true, `${biogFileName(i)} (lean=${lean})`);
    }
    assert.equal(KEEP('FACTION.TXT', lean), true);
    assert.equal(KEEP('CLASSES.DAT', lean), true);
    // The kinds that were already right must stay right.
    for (const n of ['TEXT.RSC', 'MAGIC.DEF', 'ART_PAL.COL', 'TEXTURE.000', 'SPELLS.STD', 'WOODS.WLD', 'BLOCKS.BSA']) {
      assert.equal(KEEP(n, lean), true, n);
    }
  }
  // And the diet must NOT be silently widened - a bare \.DAT$ would
  // drag the 247MB SKY/PACKED sets it exists to exclude.
  assert.equal(KEEP('SKY00.DAT', true), false, 'the lean diet still excludes the sky set');
  assert.equal(KEEP('SKY00.DAT', false), true);
  for (const n of ['PACKED.DAT', 'MONSTER.DAT', 'ANIM0000.VID', 'S0000001.QBN', 'S0000001.QRC', 'BARBER.FLC']) {
    assert.equal(KEEP(n, false), false, `${n} must stay out of the diet`);
  }
});

// ---------------------------------------------------------------------
// 15. The standing host rule itself.
// ---------------------------------------------------------------------

test('audit18 hosts: no host re-implements an extracted seam privately', () => {
  // A private copy is how every one of these gaps started.
  const inline = [
    [/player\.levitating = hasActiveEffect\(/, 'the levitate flag'],
    [/const rideO = [A-Za-z.]+\.actions\.objects\.get\(gk\)/, 'the platform ride'],
    [/Math\.trunc\(FALL_HP_PER_METRE \* \(player\.landedFallDistance/, 'the fall-damage law'],
  ];
  for (const host of [...MOTOR_HOSTS, 'src/scenes/worldModes.js']) {
    const s = src(host);
    for (const [re, what] of inline) {
      assert.doesNotMatch(s, re, `${host} keeps a private copy of ${what} - extract it instead`);
    }
  }
});

