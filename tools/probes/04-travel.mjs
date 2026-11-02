// Probe 4: fast travel to another place through the real travel map; the journey ends at the place asked for and the clock runs.
//
// The travel map is driven by keys as a player does (V opens it, F finds a place by name); `__travelNearest` names
// the destination, `__travelProbe` reads the map pixel and the game clock, `__journeyState` says when the journey is over
// (the game walks the player there at x60; its time scale is back to x1 on arrival).
import { Game } from './lib/harness.mjs';
import { TOWN_URL, enterTown, nativeClick, clearBoxes } from './lib/town.mjs';

export const name = 'travel';

export async function run({ browser, base, ck }) {
  const g = new Game(browser, base);
  const travelState = () => g.J(() => window.__travelProbe());
  const travelMap = () => g.J(() => window.__travelMap());
  try {
    // ── fast travel ──
    await enterTown(g, TOWN_URL);
    ck('the player starts in a town', (await g.mode()) === 'exterior', await g.mode());
    await clearBoxes(g);
    const dest = await g.J(() => window.__travelNearest());
    ck('the map knows a place to go', !!dest?.name, dest ? `${dest.name}, ${dest.region}` : 'none');
    const before = await travelState();

    await g.key('v');
    const opened = await travelMap();
    ck('the travel map opens', !!opened);
    if (!opened?.identifying) await nativeClick(g, 25, 191);
    await g.key('Enter', 1);
    let s = await travelMap();
    if (!s?.regionSelected) {
      await nativeClick(g, 25, 191);
      await g.key('Enter', 1);
      s = await travelMap();
    }
    ck('the region page opens', !!s?.regionSelected);
    await g.key('f', 1);
    for (const c of dest.name) {
      if (c === ' ') await g.page.keyboard.press('Space');
      else if (/[a-zA-Z0-9'-]/.test(c)) await g.page.keyboard.press(c);
      await g.page.waitForTimeout(30);
    }
    await g.key('Enter', 1);
    if ((await travelMap())?.picker) await g.key('Enter', 1);
    ck('the destination is found by name', !!(await travelMap())?.locationSelected);
    await g.until(async () => {
      const x = await travelMap();
      return x?.top === 'confirm' || x?.popUp;
    }, 60000);
    if ((await travelMap())?.top === 'confirm') await g.key('y', 1);
    await g.key('b', 8);
    await g.until(async () => (await travelMap()) === null, 90000);
    // The journey walks the player a frame at a time, and software GL on a CI runner decides how many frames a minute
    // gives: a trip took 525 s to 785 s whole on most runners and over 1400 s on a slow one. So the wait is on progress,
    // not on a clock: it ends on arrival, or when the pixel has not changed for STALL_MS (a journey held by streaming
    // shows in the state lines below), with ABSOLUTE_MS as the job's own bound.
    const STALL_MS = 600000;
    const ABSOLUTE_MS = 1500000;
    const t0 = Date.now();
    let lastPixel = '';
    let movedAt = t0;
    let lastLine = 0;
    let lastState = null;
    const landed = await g.until(
      async () => {
        const t = await travelState();
        const j = await g.J(() => JSON.stringify(window.__journeyState()));
        lastState = j;
        const pixel = `${t.pixel.x},${t.pixel.y}`;
        if (pixel !== lastPixel) {
          lastPixel = pixel;
          movedAt = Date.now();
        }
        if (Date.now() - lastLine > 60000) {
          lastLine = Date.now();
          console.log(`   [${Math.round((Date.now() - t0) / 1000)}s] pixel ${pixel}, frame ${await g.frame()}, journey ${JSON.stringify(j)}`);
        }
        if (Math.abs(t.pixel.x - dest.pixel.x) <= 1 && Math.abs(t.pixel.y - dest.pixel.y) <= 1 && j.scale === 1) return true;
        return Date.now() - movedAt > STALL_MS || Date.now() - t0 > ABSOLUTE_MS ? 'gave up' : false;
      },
      ABSOLUTE_MS + 60000,
      1000,
    );
    if (landed === 'gave up') console.log(`  --- the journey stopped moving; last state ${JSON.stringify(lastState)}`);
    await g.until(() => g.page.evaluate(() => window.__streamIdle?.() === true), 240000);
    const after = await travelState();
    ck(
      'the trip moves the player',
      after.pixel.x !== before.pixel.x || after.pixel.y !== before.pixel.y,
      `${before.pixel.x},${before.pixel.y} -> ${after.pixel.x},${after.pixel.y}`,
    );
    ck(
      'the journey ends at the place that was asked for',
      landed === true,
      `wanted ${dest.pixel.x},${dest.pixel.y}, stands at ${after.pixel.x},${after.pixel.y}`,
    );
    ck(
      'the trip takes game time',
      after.minutes > before.minutes,
      `${Math.round((after.minutes - before.minutes) / 60)}h`,
    );

    g.noErrors(ck, 'fast travel');
  } finally {
    await g.close();
  }
}
