// INTRO2: the title song's session, transition and independent asset identity.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { TitleMusic, titleSongName, audibleContextTime, MENU_MUSIC_LEVEL, TITLE_SONGS } from '../../src/systems/titleMusic.js';
import { introTitleAt, introFrameAt, introCameraAt, INTRO_CREDITS, TITLE_IMPACT_TIME, TITLE_ENTER_TIME, TITLE_READY_TIME, LANDSCAPE_HOLD_TIME, TITLE_DEPTH, TITLE_BLUR, CREST_TIME } from '../../src/ui/intro/introCue.js';
import { introTerrainGrid, introGroundGrid } from '../../src/ui/intro/introLandscape.js';
import { seaDistance, BALFIERA } from '../../src/ui/intro/introMap.js';
import { brandMark } from '../../src/ui/brandMark.js';

const read = (p) => readFileSync(new URL('../../' + p, import.meta.url));

test('INTRO2: the supplied logo is byte-exact', () => {
  // BR4 shipped Mac's earlier cut as he supplied it
  // (real alpha; INTRO2's JPEG had a black backing to screen away). BR5
  // his DFO Online logo, its 800 x 600 file cut to the 526 x 322
  // its paint covers - every pixel inside his, unchanged, and none outside
  // with any alpha. BR6: his dragon mark - its 2000 x 1434
  // file cut to the 1680 x 1410 its paint covers, then scaled to 1232 x 1034
  // at his word (the same 56:47; 785 KB where the cut was 1.28 MB).
  assert.equal(createHash('sha256').update(read('src/assets/branding/dfo-online.png')).digest('hex'), 'bf7a6bca77b6f29f31738a85545cd7fb51c3e91dce4df985a93c7874804b57a7');
});

test('INTRO4: the 19 s beat (decoded sample 230016 / 12000) is the crest; the logo lands on bar 16 at sample 592128 / 12000, and one frame earlier it is still out in front', () => {
  assert.ok(Math.abs(CREST_TIME - 230016 / 12000) < 1e-9, 'Mac\u2019s beat is the one around 19 seconds - INTRO2\u2019s landing, INTRO4\u2019s crest');
  const measured = 592128 / 12000;
  assert.ok(measured > 49.3 && measured < 49.4, 'the third phrase\u2019s downbeat, sixteen bars after the 19 s beat');
  assert.ok(Math.abs(TITLE_IMPACT_TIME - measured) < 1e-6);
  const before = introTitleAt(measured - 1 / 60), at = introTitleAt(measured + 1e-8);
  assert.ok(before.scale < 0.95 && before.opacity > 0.9, 'still arriving, and already legible');
  assert.equal(at.scale, 1); assert.equal(at.blur, 0); assert.equal(at.opacity, 1);
  assert.ok(at.impact > 0.999);
  assert.equal(introTitleAt(measured - 2).opacity, 0);
});

test('INTRO2c: the mark flies out of the depth of the shot, never from the top, and stops dead on the beat', () => {
  // y is the vertical component of the entrance. There is none, at any time.
  for (let t = 0; t <= TITLE_IMPACT_TIME + 3; t += 1 / 60) assert.equal(introTitleAt(t).y, 0);
  const at = (t) => introTitleAt(TITLE_IMPACT_TIME + t);
  assert.equal(introTitleAt(TITLE_ENTER_TIME).scale, 1 / TITLE_DEPTH);
  assert.ok(TITLE_DEPTH > 3, 'it starts genuinely far away, not merely small');
  // 1/z under a constant approach: the rush accelerates into the landing, and
  // never overshoots past its resting size on the way or after it.
  const a = at(-0.5).scale, b = at(-0.3).scale, c = at(-0.1).scale;
  assert.ok(a < b && b < c && c < 1, 'monotone approach');
  assert.ok(c - b > b - a, 'the approach accelerates into its landing');
  for (let t = TITLE_ENTER_TIME; t <= TITLE_IMPACT_TIME + 4; t += 1 / 120) {
    const st = introTitleAt(t);
    assert.ok(st.scale <= 1 + 1e-12, `no overshoot at ${t}`);
    assert.ok(st.blur >= 0 && st.blur <= TITLE_BLUR);
  }
  // Depth of field closes with the distance and costs nothing once at rest.
  assert.ok(at(-0.5).blur > at(-0.1).blur && at(-0.1).blur > 0);
  for (const t of [0, 0.5, 30, 600]) assert.equal(at(t).blur, 0);
});

test('INTRO2b: the camera is already at rest before the logo starts moving, so the beat carries the landing alone', () => {
  const rest = introCameraAt(LANDSCAPE_HOLD_TIME, 16 / 9);
  assert.ok(LANDSCAPE_HOLD_TIME < TITLE_ENTER_TIME - 0.5, 'the camera flight ends well before the mark starts its own');
  for (const t of [TITLE_ENTER_TIME, (TITLE_ENTER_TIME + TITLE_IMPACT_TIME) / 2, TITLE_IMPACT_TIME, TITLE_IMPACT_TIME + 1]) {
    assert.deepEqual(introCameraAt(t, 16 / 9), rest, `camera still moving at ${t}`);
    assert.equal(introFrameAt(t).landscapeTime, LANDSCAPE_HOLD_TIME, 'the held terrain frame is not re-rendered');
  }
});

test('INTRO2: the final title never auto-dismisses, however long the player stays on it', () => {
  for (const time of [TITLE_READY_TIME + 1, 60, 165, 600]) {
    const st = introFrameAt(time);
    assert.equal(st.title.opacity, 1); assert.equal(st.title.y, 0);
    assert.equal(st.ready, true); assert.equal(st.prompt, 1);
    assert.equal(st.credits.every(c => c.opacity === 0), true);
  }
  assert.equal(introFrameAt(TITLE_READY_TIME - 0.01).ready, false);
});

test('INTRO2: both credits end before the climb, with a readable hold and no overlap', () => {
  for (const c of INTRO_CREDITS) {
    assert.ok(c.out - c.up >= 1.8);
    assert.ok(c.end < 9.45);
    const st = introFrameAt((c.up + c.out) / 2);
    assert.equal(st.credits.filter(x => x.opacity > 0).length, 1);
    assert.equal(st.credits.find(x => x.key === c.key).opacity, 1);
  }
});

test('INTRO2: camera is continuous, finite, and keeps the full horizontal frame on portrait screens', () => {
  // INTRO4: the flight climbs from a dozen metres to thousands of kilometres, so "no teleport" is held against the
  // camera's height: no frame moves the eye more than a tenth of how high it stands (and never more than 15 m low down)
  for (const aspect of [0.47, 1, 16 / 9, 21 / 9]) {
    let previous = introCameraAt(0, aspect);
    for (let i = 1; i <= Math.ceil((LANDSCAPE_HOLD_TIME + 1) * 60); i++) {
      const current = introCameraAt(i / 60, aspect);
      assert.ok([...current.eye, ...current.aim, current.fov].every(Number.isFinite));
      assert.ok(current.fov > 0 && current.fov < Math.PI);
      const step = Math.hypot(...current.eye.map((v, k) => v - previous.eye[k]));
      assert.ok(step < Math.max(15, 0.1 * previous.eye[1]), `no teleport between camera projections at ${(i / 60).toFixed(3)} s: ${step.toFixed(1)} m at ${previous.eye[1].toFixed(0)} m`);
      previous = current;
    }
  }
  const wide = introCameraAt(19, 16 / 9), narrow = introCameraAt(19, 0.47);
  assert.ok(Math.abs(Math.tan(wide.fov / 2) * 16 / 9 - Math.tan(narrow.fov / 2) * 0.47) < 1e-9);
});

test('INTRO2: reduced motion removes the flight, the arriving logo, and impact, retaining its musical reveal', () => {
  assert.deepEqual(introCameraAt(2, 1.5, true), introCameraAt(19, 1.5, true));
  assert.equal(introTitleAt(TITLE_IMPACT_TIME - 0.01, true).opacity, 0);
  assert.deepEqual(introTitleAt(TITLE_IMPACT_TIME, true), { opacity: 1, y: 0, scale: 1, blur: 0, impact: 0 });
  assert.deepEqual(introTitleAt(TITLE_IMPACT_TIME - 0.4, true), { opacity: 0, y: 0, scale: 1, blur: 0, impact: 0 });
});

test('INTRO2: generated mesh indices remain within the grid; INTRO4: the city\u2019s ground grid is dense at its middle and reaches its rim', () => {
  const g = introTerrainGrid(8, 5);
  assert.equal(g.vertices.length, 9 * 6 * 2); assert.equal(g.indices.length, 8 * 5 * 6);
  assert.ok(g.indices.every(i => i < 9 * 6));
  const ground = introGroundGrid(16, 1000, 2);
  const xs = [...new Set(Array.from(ground.vertices.filter((_, i) => i % 2 === 0)))].sort((a, b) => a - b);
  assert.deepEqual([xs[0], xs.at(-1)], [-1000, 1000]);
  assert.ok(xs[9] - xs[8] < xs[16] - xs[15], 'the middle\u2019s cells are the small ones');
  // INTRO2's bay shape stays authored (it is drawn inside the continent now): Balfiera is still land
  assert.ok(seaDistance(BALFIERA.x, BALFIERA.y) > 0);
});

test('INTRO2: audible clock uses the device timestamp, with a latency-aware fallback', () => {
  assert.equal(audibleContextTime({ currentTime: 10.2, getOutputTimestamp: () => ({ contextTime: 10, performanceTime: 10000 }) }, 10016), 10.016);
  assert.equal(audibleContextTime({ currentTime: 10.2, outputLatency: 0.2 }, 10016), 10);
  assert.equal(audibleContextTime({ currentTime: 10.2, outputLatency: 0.2, getOutputTimestamp: () => ({ contextTime: 0, performanceTime: 0 }) }, 10016), 10);
});

test('the title song is Daggerfall Unity\u2019s title screen song, with the classic theme standing in for an archive without it', () => {
  assert.deepEqual(TITLE_SONGS, ['5STRONG.HMI', '03.HMI']);
  const archive = (names) => ({ getSongIndex: (n) => names.indexOf(n) });
  assert.equal(titleSongName(archive(['03.HMI', '5STRONG.HMI'])), '5STRONG.HMI');
  assert.equal(titleSongName(archive(['03.HMI'])), '03.HMI');
  assert.equal(titleSongName(archive([])), null);
  assert.equal(titleSongName(null), null, 'no archive: no song');
});

/** The shared AudioContext and the music service, as far as the title song uses them. */
function musicRig({ data = true, archive = { getSongIndex: (n) => (n === '5STRONG.HMI' ? 7 : -1) } } = {}) {
  const events = [];
  const ctx = {
    currentTime: 10, state: 'suspended', outputLatency: 0.1,
    resume() { events.push(['resume']); this.state = 'running'; return Promise.resolve(); },
    suspend() { this.state = 'suspended'; return Promise.resolve(); },
  };
  const sound = {
    ctx: null,
    ensureContext() { this.ctx = ctx; return ctx; },
    ensure() { events.push(['sound.ensure']); return Promise.resolve(); },
  };
  const songs = {
    archive: null, enabled: false, current: null,
    ensure() { events.push(['songs.ensure']); this.archive = archive; this.enabled = !!archive; return Promise.resolve(); },
    playSong(name) { events.push(['play', name]); this.current = name; return true; },
    fadeTo(level, seconds) { events.push(['fade', level, seconds]); },
    fadeOut() { events.push(['fadeOut']); this.current = null; },
  };
  const fetchBytes = async (name) => {
    events.push(['read', name]);
    if (!data) throw new Error(name + ': 404');
    return new Uint8Array(0);
  };
  const music = new TitleMusic({ fetchBytes, sound, songs, now: () => 10000 });
  return { music, ctx, events, songs };
}

test('the title song plays through the game\u2019s music service once the gesture runs the context, and the menu ducks it without restarting it', async () => {
  const r = musicRig();
  const unlocked = r.music.unlock();
  assert.ok(r.events.some((e) => e[0] === 'resume'), 'resume before the first await');
  assert.equal(await unlocked, true);
  assert.equal(await r.music.prepare(), true);
  assert.equal(r.music.start(), true); assert.equal(r.music.start(), true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(r.events.filter((e) => e[0] === 'play'), [['play', '5STRONG.HMI']], 'played once');
  assert.equal(r.music.song, '5STRONG.HMI');
  r.music.setLevel(MENU_MUSIC_LEVEL, 1.1);
  assert.deepEqual(r.events.at(-1), ['fade', MENU_MUSIC_LEVEL, 1.1]);
  assert.equal(r.events.filter((e) => e[0] === 'play').length, 1, 'the duck does not restart the song');
  await r.music.dispose(); await r.music.dispose();
  assert.equal(r.events.filter((e) => e[0] === 'fadeOut').length, 1, 'a game chosen fades the song out once');
  assert.doesNotThrow(() => r.music.time());
});

test('with no ARENA2 data the film still has its clock, and it plays silently', async () => {
  const r = musicRig({ data: false });
  await r.music.unlock();
  assert.equal(await r.music.prepare(), true, 'the film does not wait for a song');
  assert.equal(r.music.start(), true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(r.events.filter((e) => e[0] === 'play').length, 0);
  assert.equal(r.music.song, null);
  r.ctx.currentTime = 12;
  assert.ok(r.music.time() > 0, 'the film\u2019s time moves on the context');
  await r.music.dispose();
  assert.equal(r.events.filter((e) => e[0] === 'fadeOut').length, 0, 'nothing of its own to fade');
  assert.equal(r.events.filter((e) => e[0] === 'songs.ensure' || e[0] === 'sound.ensure').length, 0,
    'neither service boots without data, so the game boots them once the player picks it');
});

test('INTRO2: suspension holds the picture; resume uses audio progress instead of elapsed wall time', async () => {
  const r = musicRig(); await r.music.unlock(); await r.music.prepare(); r.music.start();
  r.ctx.currentTime = 15; const before = r.music.time();
  await r.music.pause(); assert.equal(r.music.time(999999), before);
  await r.music.unlock(); r.ctx.currentTime = 15.2;
  assert.ok(Math.abs(r.music.time() - before - 0.2) < 1e-8);
  await r.music.dispose();
});

test('a front door let go before its song is ready starts no song', async () => {
  const r = musicRig();
  let finish;
  r.songs.ensure = () => new Promise((resolve) => { finish = () => { r.songs.archive = { getSongIndex: () => 0 }; resolve(); }; });
  await r.music.unlock(); await r.music.prepare(); r.music.start();
  await r.music.dispose();
  finish();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(r.events.filter((e) => e[0] === 'play').length, 0);
  assert.equal(r.music.start(), false);
});

test('INTRO2: the shared logo has accessible text and its exact natural aspect ratio', () => {
  const logo = brandMark({ createElement: (tag) => ({ tag }) });
  assert.equal(logo.tag, 'img'); assert.equal(logo.alt, 'DFO Online');   // BR5: the product's name alone - the mark names no other game
  // BR4: the element's size is the FILE's, read from its own IHDR - a new
  // logo dropped in without its dimensions reddens here, not in a layout
  // (BR5's did: 2112 x 850 to 526 x 322; BR6's: to 1232 x 1034).
  const png = read('src/assets/branding/dfo-online.png');
  assert.equal(png.toString('latin1', 12, 16), 'IHDR');
  assert.deepEqual([logo.width, logo.height], [png.readUInt32BE(16), png.readUInt32BE(20)]);
  assert.equal(logo.draggable, false);
});

