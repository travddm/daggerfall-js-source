// Probe 5: save, reload the page, load; position, gold, inventory and level must match.
//
// The character is changed first (gold through the game's own producer, a new place to stand) so a restore of the
// boot state would not match. `__quickSave` is the pause menu's save (the world host's own composer); the load is read
// back twice: in the same page through `__loadSave`, and across a page reload through the `&load` boot door.
import { Game } from './lib/harness.mjs';
import { TOWN_URL, enterTown } from './lib/town.mjs';

export const name = 'save';

const snapshot = (g) => g.page.evaluate(() => {
  const p = window.__playerEntity;
  const items = p.items ?? [];
  return {
    name: p.name, level: p.level ?? null, health: p.health, maxHealth: p.maxHealth,
    gold: JSON.parse(window.__travelProbe()).gold,
    items: items.filter((i) => i.group !== 'Currency').map((i) => `${i.name}x${i.stackCount ?? 1}`).sort(),
    pixel: window.__currentPixel(),
    pos: window.__player.pos.map((v) => Math.round(v * 10) / 10),
    mode: window.__mode(),
  };
});

const sameAs = (a, b) => {
  const d = [];
  for (const k of ['name', 'level', 'gold', 'pixel', 'mode', 'maxHealth']) if (a[k] !== b[k]) d.push(`${k}: ${a[k]} vs ${b[k]}`);
  if (a.items.join('|') !== b.items.join('|')) d.push(`items: ${a.items.length} vs ${b.items.length}`);
  const off = Math.hypot(a.pos[0] - b.pos[0], a.pos[2] - b.pos[2]);
  if (off > 1) d.push(`position off by ${off.toFixed(1)}`);
  return d;
};

export async function run({ browser, base, ck }) {
  const g = new Game(browser, base);
  try {
    await enterTown(g, TOWN_URL);
    const doors = await g.page.evaluate(() => window.__doors());
    const d = doors[Math.min(5, doors.length - 1)];
    await g.page.evaluate(([x, y, z, yaw]) => window.__pose(x, y, z, yaw, 0),
      [d.pos[0] + d.normal[0] * 4, d.pos[1] - 1.2, d.pos[2] + d.normal[2] * 4, 1.0]);
    await g.waitFrames(6);
    await g.page.evaluate(() => window.__addGold(777));
    await g.waitFrames(3);
    const saved = await snapshot(g);
    ck('the character has something to lose', saved.gold >= 777 && saved.items.length > 0, `${saved.gold}g, ${saved.items.length} items, level ${saved.level}`);

    const ok = await g.page.evaluate(() => window.__quickSave('probe-save'));
    ck('the game saves', !!ok, String(ok));
    const keys = await g.J(() => window.__saveKeys());
    ck('the save is listed for the character', (keys ?? []).length > 0, JSON.stringify(keys));

    // change the character, then load it back in the same page
    await g.page.evaluate(() => window.__addGold(5000));
    await g.page.evaluate(([x, y, z]) => window.__pose(x, y, z, 0, 0), [d.pos[0] - d.normal[0] * 20, d.pos[1] - 1.2, d.pos[2] - d.normal[2] * 20]);
    await g.waitFrames(4);
    const moved = await snapshot(g);
    ck('the character changed after the save', moved.gold !== saved.gold, `${moved.gold}g`);
    const key = keys[keys.length - 1].key;
    await g.page.evaluate((k) => window.__loadSave(k), key);
    await g.waitFrames(10);
    await g.until(() => g.page.evaluate(() => window.__streamIdle?.() === true), 240000);
    const loaded = await snapshot(g);
    const diff = sameAs(saved, loaded);
    ck('loading in the page restores the save', diff.length === 0, diff.join('; '));

    // across a reload: the page boots anew, the boot door loads the most recent save
    await g.page.evaluate(() => window.__quickSave('probe-save'));
    const before = await snapshot(g);
    await g.open(`${TOWN_URL}&load`, { wait: 'frame' });
    await g.until(() => g.page.evaluate(() => window.__shotReady === true), 420000);
    await g.waitFrames(6);
    const after = await snapshot(g);
    const diff2 = sameAs(before, after);
    ck('a reload and a load restore position, gold, inventory and level', diff2.length === 0, diff2.join('; ') || `${after.gold}g, ${after.items.length} items, level ${after.level}`);
    g.noErrors(ck, 'save and load');
  } finally {
    await g.close();
  }
}
