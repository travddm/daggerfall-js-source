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
    const landed = await g.until(
      async () => {
        const t = await travelState();
        const j = await g.J(() => JSON.stringify(window.__journeyState()));
        return Math.abs(t.pixel.x - dest.pixel.x) <= 1 && Math.abs(t.pixel.y - dest.pixel.y) <= 1 && j.scale === 1;
      },
      // the journey walks the player a frame at a time: three map pixels took over 240 s in software GL (measured: two pixels
      // in 240 s with Edge on SwiftShader), and CI's runners are slower still
      900000,
      1000,
    );
    await g.until(() => g.page.evaluate(() => window.__streamIdle?.() === true), 240000);
    const after = await travelState();
    ck(
      'the trip moves the player',
      after.pixel.x !== before.pixel.x || after.pixel.y !== before.pixel.y,
      `${before.pixel.x},${before.pixel.y} -> ${after.pixel.x},${after.pixel.y}`,
    );
    ck(
      'the journey ends at the place that was asked for',
      !!landed,
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
