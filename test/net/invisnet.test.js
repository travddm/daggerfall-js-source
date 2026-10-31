// INVIS-NET (2026-09-27, Mac relaying reports: "Other player's still see other players who are suppose to be
// invisible"). A player's magical concealment - Invisibility, Chameleon, Shadow - lived on their own entity alone: the
// pose carried none of it, so every other player drew them whole (the body, the sprite, the rider, the name), could
// press F on them, and their own foes hunted them as if they stood in the open (enemyMotor's own note: "a peer's flags
// are a later slice's wire field"). The pose carries it now (`cv`: 1 invisible, 2 blending, 4 a shade, omitted at 0),
// and a reader draws a concealed peer as DFU draws every concealed entity that is not the player - not at all - and
// hands its foes the flags. (INVIS-LOOK, the same day: that is the classic lane's draw; under Enhanced Combat Visuals the
// peer is drawn translucent, as a concealed foe is - test/net/invislook.test.js.) Driven through the wire's door, two sessions either side of the real relay Room, the
// dungeon's peer candidates mounted over its own statements, and the world host by source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as acorn from 'acorn';

import { validPose, poseChanged, parseClient } from '../../src/net/wire.js';
import { lerpPose, OnlineSession } from '../../src/net/online.js';
import { concealBits, concealFlagsOfBits, concealmentFlags } from '../../src/systems/effects.js';
import { fakeRoom } from '../fakeRoom.mjs';
import { fakeSocketClass } from '../fakeSocket.mjs';
import { RemotePlayers } from '../../src/net/remotePlayers.js';
import { hostText } from '../hostText.mjs';   // HOST-SPLIT 2 (AUDIT, the second read): its negatives read the host whole
import { openPeers, pickPeerInFront, SOCIAL_REACH } from '../../src/player/socialPick.js';   // CONCEAL-MATE

const rd = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const P = { x: 1, y: 2, z: 3, yaw: 0, pitch: 0, mv: 0 };
const withEffects = (...kinds) => ({ activeEffects: kinds.map((kind) => ({ kind, roundsRemaining: 5 })) });

test('INVIS-NET wire: `cv` survives the door and the relay\'s pose frame, bounded to the three bits and OMITTED at 0 - an unconcealed pose is the bytes it always was; each edge goes out at once; lerpPose carries it', () => {
  const base = validPose(P);
  assert.equal('cv' in base, false, 'unconcealed: no field');
  assert.equal(JSON.stringify(validPose({ ...P, cv: 0 })), JSON.stringify(base), 'a zero is the old bytes');
  assert.equal(validPose({ ...P, cv: 1 }).cv, 1, 'invisible');
  assert.equal(validPose({ ...P, cv: 6 }).cv, 6, 'blending and a shade together');
  assert.equal(validPose({ ...P, cv: 99 }).cv, 7, 'clamped to the three bits');
  for (const junk of [-1, '1', true, NaN, {}]) assert.equal('cv' in validPose({ ...P, cv: junk }), false, `${String(junk)}: nothing`);
  assert.equal(parseClient(JSON.stringify({ t: 'pose', p: { ...P, cv: 1 } }), { hasHello: true }).p.cv, 1, 'the relay\'s own door keeps it');
  assert.equal(poseChanged(base, validPose({ ...P, cv: 1 })), true, 'vanishing is news at once');
  assert.equal(poseChanged(validPose({ ...P, cv: 1 }), base), true, 'and so is coming back');
  assert.equal(poseChanged(validPose({ ...P, cv: 2 }), validPose({ ...P, cv: 2 })), false, 'still blending: no news');
  assert.equal(lerpPose(base, validPose({ ...P, x: 3, cv: 4 }), 0.5).cv, 4, 'the drawn pose carries it whole');
  assert.equal('cv' in lerpPose(validPose({ ...P, cv: 4 }), base, 0.5), false, 'and drops it with the pose it rode');
});

test('INVIS-NET sender and reader: my own concealment packs into the three bits DaggerfallEntity names, normal or true power, and a reader unpacks the flags the foes\' senses read', () => {
  assert.equal(concealBits(withEffects()), 0);
  assert.equal(concealBits(withEffects('invisNormal')), 1);
  assert.equal(concealBits(withEffects('invisTrue')), 1);
  assert.equal(concealBits(withEffects('chameleonNormal')), 2);
  assert.equal(concealBits(withEffects('shadeTrue')), 4);
  assert.equal(concealBits(withEffects('invisNormal', 'chameleonTrue', 'shadeNormal')), 7);
  for (const kinds of [[], ['invisTrue'], ['chameleonNormal'], ['shadeNormal'], ['invisNormal', 'shadeTrue']]) {
    const en = withEffects(...kinds);
    assert.deepEqual(concealFlagsOfBits(concealBits(en)), concealmentFlags(en), `the round trip is the entity's own flags (${kinds.join('+') || 'none'})`);
  }
  assert.equal(validPose({ ...P, cv: concealBits(withEffects('invisTrue')) || undefined }).cv, 1, 'what the sender packs, the door admits');
  assert.equal(JSON.stringify(validPose({ ...P, cv: concealBits(withEffects()) || undefined })), JSON.stringify(validPose(P)), 'and an unconcealed pose is the old bytes');
});

test('INVIS-NET end to end: my invisibility leaves my session the moment it lands, passes the real relay Room, and stands on the pose the other player draws me from; ended, it is gone from theirs', async () => {
  const ROOM = 'world:3,12';
  const { FakeWS, sockets } = fakeSocketClass();
  let now = 1_700_000_000_000;
  const at = { x: 3 * 32768 + 10, y: 0, z: 12 * 32768 + 10, yaw: 0, pitch: 0, mv: 0 };
  const me = new OnlineSession({ url: 'wss://relay.test', name: 'ghost-0001', id: 'ghost-0001', secret: 'secret-of-ghost-0001', WebSocketImpl: FakeWS, now: () => now });
  const them = new OnlineSession({ url: 'wss://relay.test', name: 'seer-0001', id: 'seer-0001', secret: 'secret-of-seer-0001', WebSocketImpl: FakeWS, now: () => now });
  const info = console.info; console.info = () => {};
  try {
    me.join(ROOM, at); them.join(ROOM, at);
    const [mine, theirs] = sockets;
    mine.open(); theirs.open();
    const r = fakeRoom(ROOM);
    const relayMine = r.connect(), relayTheirs = r.connect();
    await r.hello(relayMine, 'ghost-0001', at); await r.hello(relayTheirs, 'seer-0001', at);
    for (const f of relayMine.sent) mine.receive(f);   // SD-HELLO (PIN MOVED): my own welcome, off the real Room - a socket says nothing past its hello until it lands
    let heard = 0;
    const hear = () => { for (; heard < relayTheirs.sent.length; heard++) theirs.receive(relayTheirs.sent[heard]); };
    const relayLast = async () => {
      const f = mine.sent.map((m) => (typeof m === 'string' ? JSON.parse(m) : m)).filter((m) => m.t === 'pose').at(-1);   // test/fakeSocket.mjs keeps the text sent
      await r.room.webSocketMessage(relayMine, JSON.stringify(f));
      hear();
    };
    hear();
    assert.deepEqual(them.drawable().map((p) => p.id), ['ghost-0001'], 'they see me, from the welcome');
    now += 150; me.sendPose({ ...at });
    now += 150;
    assert.equal(me.sendPose({ ...at, cv: 1 }), true, 'invisible, standing still, long before the heartbeat: sent at once');
    await relayLast();
    const relayed = relayTheirs.sent.filter((m) => m.t === 'pose' && m.id === 'ghost-0001').at(-1);
    assert.equal(relayed?.p?.cv, 1, 'the relay fans it on');
    now += 150; them.tick();
    assert.equal(them.drawable()[0].shown.cv, 1, 'and it stands on the pose they draw me from');
    now += 150;
    assert.equal(me.sendPose({ ...at }), true, 'the spell ends: sent at once too');
    await relayLast();
    now += 150; them.tick();
    assert.equal('cv' in them.drawable()[0].shown, false, 'and gone from theirs');
  } finally { console.info = info; }
});

// ---- AUDIT (the pre-merge audit, 2026-09-27, Mac: "Audit before we merge"): what else named or showed a concealed player.

test('AUDIT pre-merge I-G executed: a peer the classic lane stands nowhere is still HEARD - its steps at it, as a concealed foe\'s sounds play in DFU (the renderer off, not the audio) - and has no doll and no name', () => {
  const calls = [];
  const rp = new RemotePlayers({ renderer: {}, deps: { fetchBytes: async () => null, palette: null, audio: { playOneShot() { calls.push('flat'); }, play3d(clip, at) { calls.push(at); } } }, compose: async () => null });
  const peer = (x) => ({ id: 'amy-0002', name: 'amy', shown: { x, y: 0, z: 4, yaw: 0, pitch: 0, mv: 1, wd: 0, an: 0, fk: 0, cv: 1 }, look: null });
  for (let i = 0; i < 200; i++) rp.sync([peer(i * 0.1)], (p) => [p.x, p.y, p.z], { bodyHeight: () => 2, eye: [0, 1.7, 0], dt: 1 / 30, hidden: () => true });   // a body's height: the name pass would stand her at it
  assert.ok(calls.length > 0 && calls.every((c) => c !== 'flat'), 'her steps, at her');
  assert.equal(rp._shown.length, 0, 'no name');
  rp.sync([peer(20)], (p) => [p.x, p.y, p.z], { bodyHeight: () => 2, eye: [0, 1.7, 0], dt: 1 / 30, hidden: () => false });
  assert.equal(rp._shown.length, 1, 'drawn, she is named (the control)');
  assert.equal(rp._batches.size, 0, 'no sprite, no doll');
});

// ---- CONCEAL-MATE (2026-10-07, a player: "you're not interactable with party members - would be a QoL if you can interact
// with at least your party members while chameleon or shadow form, invis etc on"): a concealed player stays open to their
// own party - the F key and its plaque, the Nearby list, a page, a gift - and to nobody else.

test('CONCEAL-MATE executed: openPeers keeps every open player and a concealed party mate (invisible, blending, a shade, all three), drops a concealed stranger, and with no party test drops every concealed one - the F key\'s pick then finds the mate', () => {
  const near = [
    { id: 'open-0001', feet: [0, 0, -2] },
    { id: 'mate-0002', feet: [0, 0, -3], cv: 1 },
    { id: 'mate-0003', feet: [0, 0, -4], cv: 2 },
    { id: 'mate-0004', feet: [0, 0, -5], cv: 4 },
    { id: 'mate-0005', feet: [0, 0, -6], cv: 7 },
    { id: 'strg-0006', feet: [0, 0, -1], cv: 2 },
    { id: 'zero-0007', feet: [0, 0, -7], cv: 0 },
  ];
  const mates = new Set(['mate-0002', 'mate-0003', 'mate-0004', 'mate-0005']);
  const isMate = (id) => mates.has(id);
  assert.deepEqual(openPeers(near, isMate).map((p) => p.id), ['open-0001', 'mate-0002', 'mate-0003', 'mate-0004', 'mate-0005', 'zero-0007'], 'every open player and every concealed mate, in order - never the concealed stranger');
  assert.deepEqual(openPeers(near, null).map((p) => p.id), ['open-0001', 'zero-0007'], 'no party: the concealed are nobody\'s');
  assert.deepEqual(openPeers(near, () => 1).map((p) => p.id), ['open-0001', 'zero-0007'], 'a truthy non-true answer is not a mate');
  assert.deepEqual(openPeers(null, isMate), [], 'no list: nobody');
  assert.deepEqual(openPeers([null, undefined, near[0]], isMate), [near[0]], 'holes skipped');
  // the pick itself: the concealed stranger stands NEAREST on the ray, and is not the one pressed; a mate is
  const along = (cam, fwd, feet) => -feet[2];
  const onlyConcealed = near.filter((p) => p.cv);
  assert.equal(pickPeerInFront([0, 0, 0], [0, 0, -1], openPeers(onlyConcealed, isMate), SOCIAL_REACH, along)?.peer.id, 'mate-0002', 'the invisible mate is pressed');
  assert.equal(pickPeerInFront([0, 0, 0], [0, 0, -1], openPeers(onlyConcealed, () => false), SOCIAL_REACH, along), null, 'out of the party, nobody is');
});

