// FRIENDLY-SPELLS DROP: the
// friendly-spells patch (its sixth cut, a superset of the friendly-spells-and-Nightsound drop) integrated onto main.
//
// The drop was cut from main before ALLY-CAST, the party-rest audit and CRICKET-DUNGEON landed, and it carried a
// second player-to-player spell system (AID1: its own `aid` frame, relay arm and receiver, no party gate). ALLY-CAST
// stays the one system - its `cast` frame, its party-only receiver, the gift landing as a self-cast - and what the
// drop added on top of it rides ALLY-CAST's own door: a beneficial TOUCH that meets a party mate the crosshair pick
// did not name, a beneficial MISSILE that strikes one, a beneficial BLAST one stands in. The rest came in as written:
// SPELLFX1 (a peer's cast and arrow DRAWN, the pose's `ce`/`ar`, world98), SPELLFX2 (a peer's cast HEARD), SNDREP1
// (a player-attached sound pack and the crickets/howl switches - over CRICKET-DUNGEON, which still stops the loop
// underground), HEAL1 (the Healer's touch Balm), the test room's missiles, REST-MANA1 (online, rest pays magicka),
// STRANGER-REST2 (50 m), QS8 (the book's ready is the spell slot's; the drop called it QS7, a name already taken), and PARTY-REST29/30/31 ported onto the
// party-rest audit's law (partyRestLaw.js cooldownStamp) rather than over it.
import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPlayerMagic } from '../../src/scenes/hostMagic.js';
import { calculateCastCost } from '../../src/systems/spellcost.js';
import { EXPLOSION_RADIUS } from '../../src/systems/spellcast.js';
import { validPose, POSE_CAST_ELEMENTS, RELAY_VERSION, castGate, validCastData, PARTY_MAX } from '../../src/net/wire.js';
import { SOUND_REPLACEMENTS, SOUND_SWITCHES, soundEntry, setSoundReplacements, soundReplacementCount, soundSilenced, fetchReplacement } from '../../src/systems/soundReplacer.js';
import { setPref, PREF_DEFAULTS } from '../../src/systems/uiPrefs.js';
import { cooldownStamp, latestStamp, voteStands } from '../../src/systems/party/partyRestLaw.js';
import { startingSpells, HEALER_CAREER_INDEX, HEAL_OTHER_INDEX, HEAL_OTHER_NAME, healOtherSpell } from '../../src/systems/chargen.js';
import { allyCastable } from '../../src/systems/allyCast.js';
import { testMissileSpells, addTestMissileSpells, TEST_FIREBALL_INDEX, TEST_HEAL_BOLT_INDEX } from '../../src/systems/testRoom.js';
import { spellPointRecoveryRate, SPECIAL_ABILITY, restIgnoresNoRegen } from '../../src/systems/rest/rest.js';
import { AmbientEffects, CRICKET_CHORUS, AMBIENT_CRICKETS_LOOP } from '../../src/systems/ambientEffects.js';
import { hostText } from '../hostText.mjs';   // HOST-SPLIT 2 (AUDIT, the second read): its negatives read the host whole

const rd = (p) => hostText(p);
const fx = (type, subType = 0, mag = 20) => ({
  type, subType,
  magnitudeBaseLow: mag, magnitudeBaseHigh: mag, magnitudeLevelBase: 0, magnitudeLevelHigh: 0, magnitudePerLevel: 1,
  durationBase: 0, durationMod: 0, durationPerLevel: 1, chanceBase: 100, chanceMod: 0, chancePerLevel: 1,
});
const EMPTY = { type: -1, subType: -1 };
const HEAL = fx(10, 8), DAMAGE = fx(4, 0), FORTIFY = fx(9, 0, 10);
const spellOf = (rangeType, effects, name = 'Balm') => ({ name, index: 90, element: 4, rangeType, effects });
const mkPlayer = () => ({
  isPlayer: true, level: 4, health: 20, maxHealth: 50, maxMagicka: 500, magicka: 500,
  skills: new Array(40).fill(50), skillUses: new Array(40).fill(0),
  stats: { intelligence: 50, willpower: 50, endurance: 50 }, career: {}, activeEffects: [],
});
/** allycast.test.js's rig, with the drop's seams: `mates` the party mates' bodies, `bodies` every player's. */
function magicRig(player, { mates = [], bodies = null, pick = null, sounds = [], door = null } = {}) {
  const world = { said: [], frames: [] };
  const magic = createPlayerMagic({
    renderer: { createBillboardBatch: () => ({}), destroyBillboardBatch() {} },
    audio: { playOneShot() {}, playOneShotId() {}, play3d() {}, play3dId: (...a) => sounds.push(a) },
    getTexture: async () => ({ getSize: () => [16, 16], getScale: () => [0, 0] }),
    uploadRecord() {}, uploadRecordFrame() {},
    collider: { raycast: () => Infinity, heightAt: () => -100 },
    playerEntity: player,
    playerSinks: { hurt() {}, heal(n) { player.health = Math.min(player.maxHealth, player.health + n); }, drainMagicka() {}, restoreMagicka() {}, drainFatigue() {}, restoreFatigue() {}, say: (l) => world.said.push(l) },
    say: (l) => world.said.push(l),
    surfacePlayer() {},
    foes: () => [],
    foeSinks: () => ({ hurt() {}, heal() {}, drainMagicka() {}, restoreMagicka() {}, drainFatigue() {}, restoreFatigue() {} }),
    absorbCtx: () => ({ inside: true, day: false }),
    rolls: () => 0.99,
    startCastAnim: null,
    allyTarget: () => pick,
    castAtAlly: (id, frame) => { if (door && !door(id, frame)) return false; world.frames.push({ id, frame }); return true; },
    allyMarks: () => mates,
    peerBodies: bodies ? () => bodies : null,
  });
  magic.firePending([0, 0.9, 0], [0, 0, 1]);
  return { magic, world };
}
const BRAN = (z, x = 0) => ({ id: 'peer-0002', name: 'Bran', feet: [x, 0, z], height: 1.8 });
const fly = (magic, seconds = 3) => { for (let t = 0; t < seconds; t += 1 / 60) magic.update(1 / 60, [0, -50, 0], [0, 0, 1]); };

// ─── AID1, ONTO ALLY-CAST ───────────────────────────────────────────────────────────────────────────────────────

test('FRIENDLY-SPELLS: a beneficial TOUCH that meets a party mate the crosshair pick did not name is GIVEN through ALLY-CAST\'s own door - the `cast` frame, the caster\'s line, nothing landing on me; a HOSTILE touch at the same mate sends nothing (mutants: the touch marks dropped; a gift through any door but castAtAlly; a hostile spell marked)', () => {
  const player = mkPlayer();
  const { magic, world } = magicRig(player, { mates: [BRAN(1.5)] });
  magic.readySpell(spellOf(1, [FORTIFY, EMPTY, EMPTY], 'Strength'));
  assert.equal(magic.castInput([0, 0.9, 0], [0, 0, 1]), true, 'the touch gate admits the mate\'s body');
  assert.equal(world.frames.length, 1, 'one cast frame');
  assert.equal(world.frames[0].id, 'peer-0002');
  assert.deepEqual(world.frames[0].frame.spell.effects, [FORTIFY], 'ALLY-CAST\'s own frame (allyCastFrame): the real effects');
  assert.equal(world.frames[0].frame.level, 4);
  assert.ok(world.said.includes('You cast Strength on Bran.'));
  // a HOSTILE touch at the same mate: the mate is no mark for it, so nothing leaves through the cast door
  const hostile = magicRig(mkPlayer(), { mates: [BRAN(1.5)] });
  hostile.magic.readySpell(spellOf(1, [DAMAGE, EMPTY, EMPTY], 'Shock'));
  assert.equal(hostile.magic.castInput([0, 0.9, 0], [0, 0, 1]), false, 'nothing in touch reach for a hostile touch - a mate is not its target');
  assert.equal(hostile.world.frames.length, 0, 'and no cast frame goes to the mate');
});

test('FRIENDLY-SPELLS: a beneficial MISSILE that strikes a party mate is given to them and gone; a FIREBALL flies through the same mate and gives nothing (mutants: the missile\'s gift flag ignored; a hostile spell considered)', () => {
  const player = mkPlayer();
  const { magic, world } = magicRig(player, { mates: [BRAN(8)] });
  magic.readySpell(spellOf(2, [HEAL, EMPTY, EMPTY], 'Healing Bolt'));
  magic.castInput([0, 0.9, 0], [0, 0, 1]);
  assert.equal(magic.missileCount(), 1, 'no crosshair pick: it flies');
  fly(magic);
  assert.equal(world.frames.length, 1, 'it struck Bran: given');
  assert.equal(world.frames[0].frame.spell.rangeType, 2, 'a ranged gift keeps its type on the wire (the receiver lands it as a self-cast)');
  assert.equal(magic.missileCount(), 0, 'and it is spent');
  magic.readySpell(spellOf(2, [DAMAGE, EMPTY, EMPTY], 'Fireball'));
  magic.castInput([0, 0.9, 0], [0, 0, 1]);
  fly(magic, 0.5);
  assert.equal(world.frames.length, 1, 'a Fireball is never a gift - it passes through a friend');
});

test('FRIENDLY-SPELLS: a beneficial BLAST around me reaches the party mates standing in it and no one outside it; a FREE ready (a trap\'s payload, AUDIT ALLY-CAST A7) gives nothing (mutants: the radius ignored; the free ready given)', () => {
  const player = mkPlayer();
  const { magic, world } = magicRig(player, { mates: [BRAN(2), { id: 'peer-0003', name: 'Cass', feet: [0, 0, EXPLOSION_RADIUS + 3], height: 1.8 }] });
  magic.readySpell(spellOf(3, [HEAL, EMPTY, EMPTY], 'Aura'));
  magic.castInput([0, 0.9, 0], [0, 0, 1]);
  assert.deepEqual(world.frames.map((f) => f.id), ['peer-0002'], 'Bran in the blast, Cass outside it');
  const p2 = mkPlayer();
  const r2 = magicRig(p2, { mates: [BRAN(2)] });
  r2.magic.readySpell(spellOf(3, [HEAL, EMPTY, EMPTY], 'Aura'), { free: true });
  r2.magic.castInput([0, 0.9, 0], [0, 0, 1]);
  assert.equal(r2.world.frames.length, 0, 'a free ready is the trap\'s, never a gift');
});

test('FRIENDLY-SPELLS: a beneficial blast in a FULL party reaches every mate through the real cast door - each frame valid on the wire, all seven through the sender\'s meter in the one instant (mutant: the meter one frame per cast deep, CAST_HZ_MAX)', () => {
  // the link's own door (net/online.js sendCast): the wire's projection, then the sender's castGate - here at one instant
  let bucket = null;
  const door = (id, frame) => {
    if (!validCastData(frame)) return false;
    const g = castGate(bucket, 1000);
    if (!g.pass) return false;
    bucket = g.bucket;
    return true;
  };
  const mates = Array.from({ length: PARTY_MAX - 1 }, (_, i) => ({ id: `peer-000${i + 2}`, name: `Mate ${i + 2}`, feet: [Math.cos(i) * 2, 0, Math.sin(i) * 2], height: 1.8 }));
  const { magic, world } = magicRig(mkPlayer(), { mates, door });
  magic.readySpell(spellOf(3, [HEAL, EMPTY, EMPTY], 'Aura'));
  magic.castInput([0, 0.9, 0], [0, 0, 1]);
  assert.equal(world.frames.length, PARTY_MAX - 1, 'every mate of a full party is given the blast - none silently dropped at the meter');
  assert.equal(new Set(world.frames.map((f) => f.id)).size, PARTY_MAX - 1);
  assert.ok(world.frames.every((f) => f.frame.spell.rangeType === 1), 'an area gift leaves as a touch frame, the one shape AUDIT ALLY-CAST B4 admits');
  // SPELL-GIFT: ONE line, every mate named
  const lines = world.said.filter((l) => l.startsWith('You cast Aura on '));
  assert.equal(lines.length, 1, 'the caster reads one line for the blast');
  for (const m of mates) assert.ok(lines[0].includes(m.name), `...naming ${m.name}`);
});

// ─── SPELLFX1 / SPELLFX2: A PEER'S CAST, DRAWN AND HEARD ───────────────────────────────────────────────────────

test('SPELLFX1/2: a peer\'s ranged cast is DRAWN as a missile that stops on a body and lands NOTHING, heard as its element\'s cast sound from where it was cast; a touch flashes and flies nothing (mutants: the drawn missile landing; the sound dropped)', () => {
  const player = mkPlayer();
  const sounds = [];
  const { magic, world } = magicRig(player, { sounds, bodies: [] });
  assert.equal(magic.spellVisual({ from: [0, 1.6, -8], dir: [0, 0, 1], element: 0, rangeType: 2, casterId: 'peer-0009' }), true);
  assert.equal(magic.missileCount(), 1, 'drawn');
  assert.equal(sounds.length, 1, 'heard'); assert.deepEqual(sounds[0][1], [0, 1.6, -8], 'from the caster\'s own place');
  const h = player.health;
  for (let t = 0; t < 2; t += 1 / 60) magic.update(1 / 60, [0, 0, 0], [0, 0, 1]);
  assert.equal(magic.missileCount(), 0, 'it met my body and is gone');
  assert.equal(player.health, h, 'and dealt nothing: the caster\'s own world decided what it hit');
  assert.equal(world.frames.length, 0);
  assert.equal(magic.spellVisual({ from: [0, 1.6, -8], dir: [0, 0, 1], element: 4, rangeType: 1 }), true);
  assert.equal(magic.missileCount(), 0, 'a touch flashes, nothing flies');
  assert.equal(magic.spellVisual({ from: [NaN, 0, 0], dir: [0, 0, 1] }), false, 'a bad place draws nothing');
});

test('SPELLFX1 wire (world98): the pose carries the cast\'s element (`ce`, 0..4) and the arrows loosed (`ar`); a pose from before them reads Magic and none (mutants: the fields dropped by the projection; an element past the table)', () => {
  assert.equal(RELAY_VERSION, 'world279'); assert.equal(POSE_CAST_ELEMENTS, 5);
  const base = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
  assert.equal(validPose({ ...base, ce: 0, ar: 7 }).ce, 0); assert.equal(validPose({ ...base, ce: 0, ar: 7 }).ar, 7);
  assert.equal(validPose(base).ce, 4, 'an older pose: Magic'); assert.equal(validPose(base).ar, 0);
  assert.equal(validPose({ ...base, ce: 9 }).ce, 4, 'past the table: Magic');
});

// ─── SNDREP1: THE SOUND PACK AND THE NIGHT SOUNDS ──────────────────────────────────────────────────────────────

test('SNDREP1: a pack\'s loose WAVs answer for the two classic clips by DFU\'s names, any case; the crickets and the howl each switch OFF on their own pref, replaced or classic - beside CRICKET-DUNGEON, which still stops the loop underground (mutants: the switch ignored; a name matched loosely)', async () => {
  assert.deepEqual(SOUND_REPLACEMENTS, { 6: 'AmbientCrickets', 113: 'AmbientDistantHowl' });
  assert.deepEqual(SOUND_SWITCHES, { 6: 'nightCrickets', 113: 'distantHowl' });
  assert.equal(soundEntry('StreamingAssets/Sound/ambientcrickets.WAV'), 'AmbientCrickets');
  assert.equal(soundEntry('AmbientCrickets.ogg'), null); assert.equal(soundEntry('song_00.ogg'), null, 'a music pack\'s file is not a sound');
  assert.equal(setSoundReplacements(['song_00.ogg', 'AmbientCrickets.wav'], async (f) => new Uint8Array([f.length])), 1);
  assert.equal(soundReplacementCount(), 1);
  assert.deepEqual([...(await fetchReplacement('AmbientCrickets'))], ['AmbientCrickets.wav'.length]);
  assert.equal(await fetchReplacement('AmbientDistantHowl'), null, 'not in the pack');
  setSoundReplacements([], null);
  assert.equal(PREF_DEFAULTS.nightCrickets, true); assert.equal(PREF_DEFAULTS.distantHowl, true);
  assert.equal(soundSilenced(6), false);
  setPref('nightCrickets', false);
  try { assert.equal(soundSilenced(6), true, 'the crickets off'); assert.equal(soundSilenced(113), false, 'the howl on its own switch'); }
  finally { setPref('nightCrickets', true); }
  assert.equal(soundSilenced(7), false, 'a clip with no switch');
});

test('SNDREP1 x CRICKET-DUNGEON: switching the crickets OFF mid-chorus stops the sounding loop at once and holds the chorus clock; back ON, the night takes up where it stood - and underground stays silent with the switch on (mutants: the arm leaving a sounding loop to its bout; the underground stop lost)', () => {
  const loops = [];
  const engine = { play3d: () => 2, playOneShot: () => 2,
    loop(index, volume) { const h = { index, volumes: [volume], stopped: false, stop() { this.stopped = true; }, setVolume(v) { this.volumes.push(v); } }; loops.push(h); return h; } };
  const live = () => loops.filter((h) => !h.stopped);
  const a = new AmbientEffects({ minWait: 5, maxWait: 25 }, engine, () => 0);
  a.setPreset('clearNight');
  for (let t = 0; t < CRICKET_CHORUS.fade + 1; t += 0.1) a.update(0.1, {});
  assert.equal(live().length, 1, 'singing'); assert.equal(live()[0].index, AMBIENT_CRICKETS_LOOP);
  const t0 = a._cricketT;
  setPref('nightCrickets', false);
  try {
    a.update(0.1, {});
    assert.equal(live().length, 0, 'Off: silent - now, not at the end of the bout');
    for (let t = 0; t < 60; t += 0.1) a.update(0.1, {});
    assert.equal(live().length, 0, 'and no chorus starts while it is off');
    assert.equal(a._cricketT, t0, 'the chorus clock held');
  } finally { setPref('nightCrickets', true); }
  a.update(0.1, {});
  assert.equal(live().length, 1, 'back on: the same chorus, taken up');
  a.update(0.1, { underground: true });
  assert.equal(live().length, 0, 'CRICKET-DUNGEON: under the ground the switch being on changes nothing');
});

// ─── PARTY-REST29/30/31, ON THE PARTY-REST AUDIT'S LAW ─────────────────────────────────────────────────────────

test('PARTY-REST29 law: cooldownStamp - a member\'s start stamp their own newer vote supersedes cools nothing down, and MINE passed as none (my window closed unrested) neither; voteStands still reads EVERY grant, so the round an unrested grant spent is spent (mutants: the supersede dropped; the waiver leaking into the vote)', () => {
  const now = 100_000;
  const lead = { acct: 'L', p: { restStartedAt: 90_000, voteAt: null } };
  assert.equal(cooldownStamp([lead], -Infinity, now), 90_000, 'a grant with no newer vote holds the cooldown');
  const reopened = { acct: 'L', p: { restStartedAt: 90_000, voteAt: 95_000 } };
  assert.equal(cooldownStamp([reopened], -Infinity, now), 0, 'the leader opened a new round: their old grant cools nothing');
  assert.equal(cooldownStamp([], 97_000, now), 97_000, 'mine counts...');
  assert.equal(cooldownStamp([], -Infinity, now), 0, '...unless waived');
  assert.equal(cooldownStamp([{ acct: 'L', p: { restStartedAt: 1e300 } }], -Infinity, now), 0, 'a stamp from beyond the clock is no stamp (stampOf)');
  // the vote still reads every grant: a ready cast before the unrested grant does not approve the next round
  const last = latestStamp([], 'restStartedAt', 97_000, now);
  assert.equal(voteStands({ ready: true, readyAt: 96_000 }, now, last), false);
  assert.equal(voteStands({ ready: true, readyAt: 98_000 }, now, last), true);
});

// ─── HEAL1, THE TEST ROOM, REST-MANA1, QS8 ─────────────────────────────────────────────────────────────────────

test('HEAL1: a Healer starts knowing the touch Balm - the Balm\'s own effects at ByTouch, a fixed index of its own - and it is a gift ALLY-CAST gives; no other class gets it (mutants: the range left CasterOnly; every class given it)', () => {
  const balm = { name: 'Balyna\'s Balm', index: 97, element: 4, rangeType: 0, icon: 3, effects: [HEAL, EMPTY, EMPTY] };
  const spells = new Map([[97, balm], [2, { index: 2, effects: [] }], [1, { index: 1, effects: [] }], [37, { index: 37, effects: [] }]]);
  const out = startingSpells(HEALER_CAREER_INDEX, spells);
  const touch = out.find((s) => s.index === HEAL_OTHER_INDEX);
  assert.ok(touch, 'the Healer knows it');
  assert.equal(touch.name, HEAL_OTHER_NAME); assert.equal(touch.rangeType, 1); assert.deepEqual(touch.effects, balm.effects);
  assert.notEqual(touch.effects[0], balm.effects[0], 'copied, not shared');
  assert.equal(allyCastable(touch), true, 'a gift');
  assert.equal(startingSpells(3, spells).some((s) => s.index === HEAL_OTHER_INDEX), false, 'a Mage does not');
  assert.equal(healOtherSpell(new Map()), null, 'no Balm in the file: nothing');
});

test('SPELLFX1 test room: the sorceress gets a Fireball and a Healing Bolt, once - the bolt a gift, the Fireball not (mutant: a re-apply doubling them)', () => {
  const [fireball, bolt] = testMissileSpells(null);
  assert.equal(fireball.index, TEST_FIREBALL_INDEX); assert.equal(bolt.index, TEST_HEAL_BOLT_INDEX);
  assert.equal(allyCastable(bolt), true); assert.equal(allyCastable(fireball), false);
  const e = { spells: [] };
  addTestMissileSpells(e); addTestMissileSpells(e);
  assert.equal(e.spells.length, 3); assert.equal(e.spells[2].name, 'Resurrection');   // RESURRECT1: and a Resurrection, to raise a fallen mate
});

test('REST-MANA1: online a no-regen career\'s rested hour pays magicka; offline it is Daggerfall\'s, none (mutant: the online arm dropped)', () => {
  const sorc = { maxMagicka: 80, career: { abilityFlagsAndSpellPointsBitfield: SPECIAL_ABILITY.NoRegenSpellPoints } };
  const was = globalThis.location;
  try {
    globalThis.location = { search: '' };
    assert.equal(restIgnoresNoRegen(), false); assert.equal(spellPointRecoveryRate(sorc), 0);
    globalThis.location = { search: '?online=1' };
    assert.equal(restIgnoresNoRegen(), true); assert.equal(spellPointRecoveryRate(sorc), 10);
  } finally { globalThis.location = was; }
  assert.equal(spellPointRecoveryRate({ maxMagicka: 80, career: {} }), 10, 'an ordinary career either way');
});

