// Probe 4: fast travel to another place through the real travel map, then a rest in a rented room; the clock advances in both.
//
// The travel map is driven by keys as a player does (V opens it, F finds a place by name); `__travelNearest` names
// the destination, `__travelProbe` reads the map pixel and the game clock, `__journeyState` says when the journey is over
// (the game walks the player there at x60; its time scale is back to x1 on arrival). The rest is taken in a room rented at
// a tavern: resting in the street asks the guards' leave and brings them. It opens through the Rest key (R) and the
// window's "until fully healed" choice. Each half boots the town afresh, and the journey goes first: a journey that
// starts after a night's rest has stalled.
import { Game } from './lib/harness.mjs';
import { TOWN_URL, enterTown, buildingsOfTown, openInnkeeper, rentRoom } from './lib/town.mjs';

export const name = 'travel';

/** Puts away the quest boxes a new game opens with: they swallow keys. */
async function clearBoxes(g) {
  for (let i = 0, quiet = 0; i < 30 && quiet < 2; i++) {
    const up = await g.page.evaluate(() => JSON.parse(window.__talk()).overlay);
    if (up) { quiet = 0; await g.key('Escape'); } else quiet++;
    await g.waitFrames(1);
  }
}

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
    if (!opened?.identifying) await g.page.mouse.click(25 * 4, 191 * 4);
    await g.key('Enter', 1);
    let s = await travelMap();
    if (!s?.regionSelected) { await g.page.mouse.click(25 * 4, 191 * 4); await g.key('Enter', 1); s = await travelMap(); }
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
    await g.until(async () => { const x = await travelMap(); return x?.top === 'confirm' || x?.popUp; }, 60000);
    if ((await travelMap())?.top === 'confirm') await g.key('y', 1);
    await g.key('b', 8);
    await g.until(async () => (await travelMap()) === null, 90000);
    const landed = await g.until(async () => {
      const t = await travelState();
      const j = await g.J(() => JSON.stringify(window.__journeyState()));
      return Math.abs(t.pixel.x - dest.pixel.x) <= 1 && Math.abs(t.pixel.y - dest.pixel.y) <= 1 && j.scale === 1;
    }, 240000, 1000);
    await g.until(() => g.page.evaluate(() => window.__streamIdle?.() === true), 240000);
    const after = await travelState();
    ck('the trip moves the player', after.pixel.x !== before.pixel.x || after.pixel.y !== before.pixel.y,
      `${before.pixel.x},${before.pixel.y} -> ${after.pixel.x},${after.pixel.y}`);
    ck('the journey ends at the place that was asked for', !!landed, `wanted ${dest.pixel.x},${dest.pixel.y}, stands at ${after.pixel.x},${after.pixel.y}`);
    ck('the trip takes game time', after.minutes > before.minutes, `${Math.round((after.minutes - before.minutes) / 60)}h`);

    // ── a rest in a rented room ──
    await enterTown(g, TOWN_URL);
    await clearBoxes(g);
    const { taverns } = await buildingsOfTown(g);
    const inn = await openInnkeeper(g, taverns);
    ck('the innkeeper answers', inn);
    const room = inn ? await rentRoom(g) : { rooms: 0 };
    ck('a room is rented', room.rooms === 1);
    if (room.rooms === 1) {
      await g.page.evaluate(() => { window.__playerEntity.health = Math.max(1, Math.floor(window.__playerEntity.maxHealth / 2)); });
      const hurt = await g.entity();
      const t0 = (await travelState()).minutes;
      for (let i = 0; i < 6 && /Tavern/i.test((await g.overlayKind()) ?? ''); i++) await g.key('Escape', 4);   // the innkeeper's window first
      for (let i = 0; i < 6 && !/Rest/i.test((await g.overlayKind()) ?? ''); i++) { await g.key('KeyR', 6); await g.page.waitForTimeout(1000); }
      const restOpen = ck('pressing Rest opens the rest window', /Rest/i.test((await g.overlayKind()) ?? ''), `overlay: ${await g.overlayKind() ?? 'none'}`);
      if (restOpen) {
        await g.page.waitForTimeout(800);
        await g.key('Digit2', 4);
        // the rest runs on real time and closes its window when it is done
        await g.until(async () => !(await g.overlayKind()) || (await g.entity()).health >= hurt.maxHealth, 120000, 500);
        const rested = await g.entity();
        const t1 = (await travelState()).minutes;
        ck('resting heals the character', rested.health > hurt.health, `hp ${hurt.health} -> ${rested.health}`);
        ck('resting advances the clock', t1 > t0, `${Math.round((t1 - t0) / 60)}h`);
      }
    }
    g.noErrors(ck, 'fast travel and rest');
  } finally {
    await g.close();
  }
}
