// Probe 5: a rest in a rented room heals the character and advances the clock.
//
// The room is rented at a tavern: resting in the street asks the guards' leave and brings them. The rest opens through the
// Rest key (R) and the window's "until fully healed" choice. The key is handled on a frame, so each step waits for the
// window it needs instead of a count of frames.
import { Game } from './lib/harness.mjs';
import { TOWN_URL, enterTown, clearBoxes, buildingsOfTown, openInnkeeper, rentRoom } from './lib/town.mjs';

export const name = 'rest';

export async function run({ browser, base, ck }) {
  const g = new Game(browser, base);
  const travelState = () => g.J(() => window.__travelProbe());
  try {
    await enterTown(g, TOWN_URL);
    await clearBoxes(g);
    await enterTown(g, TOWN_URL);
    await clearBoxes(g);
    const { taverns } = await buildingsOfTown(g);
    const inn = await openInnkeeper(g, taverns);
    ck('the innkeeper answers', inn);
    const room = inn ? await rentRoom(g) : { rooms: 0 };
    ck('a room is rented', room.rooms === 1);
    if (room.rooms === 1) {
      await g.page.evaluate(() => {
        window.__playerEntity.health = Math.max(1, Math.floor(window.__playerEntity.maxHealth / 2));
      });
      const hurt = await g.entity();
      const t0 = (await travelState()).minutes;
      for (let i = 0; i < 6 && /Tavern/i.test((await g.overlayKind()) ?? ''); i++) await g.key('Escape', 4); // the innkeeper's window first
      for (let i = 0; i < 6 && !/Rest/i.test((await g.overlayKind()) ?? ''); i++) {
        await g.key('KeyR', 6);
        await g.page.waitForTimeout(1000);
      }
      const restOpen = ck(
        'pressing Rest opens the rest window',
        /Rest/i.test((await g.overlayKind()) ?? ''),
        `overlay: ${(await g.overlayKind()) ?? 'none'}`,
      );
      if (restOpen) {
        await g.page.waitForTimeout(800);
        await g.key('Digit2', 4);
        // the rest runs on real time and closes its window when it is done
        await g.until(async () => !(await g.overlayKind()) || (await g.entity()).health >= hurt.maxHealth, 600000, 500);
        const rested = await g.entity();
        const t1 = (await travelState()).minutes;
        ck('resting heals the character', rested.health > hurt.health, `hp ${hurt.health} -> ${rested.health}`);
        ck('resting advances the clock', t1 > t0, `${Math.round((t1 - t0) / 60)}h`);
      }
    }
    g.noErrors(ck, 'the rest');
  } finally {
    await g.close();
  }
}
