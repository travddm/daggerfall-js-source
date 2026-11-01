// Helpers of the town probes: a town boot, doors, shops and taverns, through the `?shot` hooks.
export const SHOP_TYPES = [0, 2, 5, 6, 7, 8, 9, 12, 13];
export const TAVERN = 15;

export const TOWN_URL = '/play/?world&region=Daggerfall&loc=Daggerfall&class=1&skin=classic&novideo&play&shot&tod=12:00';

/** Opens the town and waits until it has streamed in. */
export async function enterTown(g, url = TOWN_URL) {
  await g.open(url, { wait: 'frame' });
  await g.until(() => g.page.evaluate(() => window.__shotReady === true), 420000);
  await g.waitFrames(4);
}

/** Poses the player at door number `index` and activates it; true when the player stands inside. */
export async function enterDoor(g, index) {
  // read the door afresh: crossing a map-pixel edge shifts every coordinate by 819.2, so a door read earlier can be stale
  const { pos, normal } = (await g.page.evaluate(() => window.__doors()))[index];
  await g.page.evaluate(([x, y, z, yaw]) => window.__pose(x, y, z, yaw, -0.05),
    [pos[0] + normal[0] * 1.5, pos[1] - 1.2, pos[2] + normal[2] * 1.5, Math.atan2(-normal[0], -normal[2])]);
  if (!await g.page.evaluate(() => window.__enter())) return false;
  await g.waitFrames(6);
  // a building's description page can stand between the door and the inside: read it and go on
  for (let i = 0; i < 40 && (await g.mode()) !== 'interior'; i++) {
    if (await g.overlayKind()) { await g.page.waitForTimeout(300); await g.key('Enter', 4); } else await g.page.waitForTimeout(300);
  }
  await g.waitFrames(4);
  return (await g.mode()) === 'interior';
}

/** Leaves a building through its door: the exit is a ray from the eye, so turn on the spot until the door answers. */
export async function leaveBuilding(g) {
  // a window left up holds the interior's input; put it away first
  for (let i = 0; i < 6 && await g.overlayKind(); i++) { await g.key('Escape', 4); await g.page.evaluate(() => window.__closeOverlay?.()); }
  // the exit is a ray from the eye, and an answer of true can be an inner door or a shelf: turn on the spot until the
  // mode is the street's (the exit is a fade, so give each answer a moment)
  for (let k = 0; k < 16; k++) {
    await g.page.evaluate((yaw) => window.__look(yaw, 0), (k * Math.PI) / 4);
    await g.waitFrames(3);
    if (!await g.page.evaluate(() => window.__exit())) continue;
    if (await g.until(async () => (await g.mode()) === 'exterior', 4000)) break;
  }
  await g.waitFrames(4);
  return (await g.mode()) === 'exterior';
}

/** Clicks a trade-window row; a stack asks how many (a text field), and the probe answers one. */
export async function stageOne(g, which, slot) {
  await g.page.evaluate(([w, i]) => window.__tradeSlot(w, i), [which, slot]);
  await g.waitFrames(3);
  // a stack leaves the cost at 0 and raises the 'how many' field
  if (JSON.parse((await g.page.evaluate(() => window.__shopOverlay())) ?? 'null')?.cost) return;
  for (let i = 0; i < 4; i++) await g.page.keyboard.press('Backspace');
  await g.page.keyboard.press('1');
  await g.key('Enter', 4);
}


/** The shop and tavern doors of the town the player stands in: [{ i, type, name }]. */
export async function buildingsOfTown(g) {
  const kinds = await g.J(([shops, tavern]) => JSON.stringify(
    window.__doors().map((_, i) => JSON.parse(window.__buildingAt(i) ?? 'null'))
      .map((b, i) => (b && (shops.includes(b.buildingType) || b.buildingType === tavern) ? { i, type: b.buildingType, name: b.name } : null))
      .filter(Boolean)), [SHOP_TYPES, TAVERN]);
  return { shops: kinds.filter((k) => k.type !== TAVERN), taverns: kinds.filter((k) => k.type === TAVERN) };
}

/** Walks into a tavern and opens the innkeeper's window; true when it answers. The player stands inside, at the counter. */
export async function openInnkeeper(g, taverns) {
  for (const t of taverns.slice(0, 6)) {
    if (!await enterDoor(g, t.i)) continue;
    for (const npc of (await g.J(() => window.__staticNpcs())) ?? []) {
      await g.page.evaluate((i) => window.__activateNpc(i), npc.i);
      await g.waitFrames(8);
      if ((await g.J(() => window.__tavernOverlay()))?.tavern) return true;
    }
    await leaveBuilding(g);
  }
  return false;
}

/** At the innkeeper's window: asks for a room and agrees to the price. Answers { before, after, rooms } gold and rentals. */
export async function rentRoom(g) {
  const before = (await g.entity()).gold;
  await g.page.evaluate(() => window.__tavernClick('room'));
  await g.waitFrames(6);
  await g.key('Enter', 6);
  const quoted = (await g.J(() => window.__tavernOverlay()))?.buttons === 'YesNo';
  await g.key('KeyY', 8);
  const rooms = await g.page.evaluate(() => (window.__playerEntity.rentedRooms ?? []).length);
  return { quoted, before, after: (await g.entity()).gold, rooms };
}

/** Clicks a point of the game's native 320x200 screen, at the scale and letterbox the live canvas has. */
export async function nativeClick(g, vx, vy) {
  const pt = await g.page.evaluate(([x, y]) => {
    const c = document.querySelector('canvas');
    const sc = Math.max(1, Math.floor(Math.min(c.width / 320, c.height / 200)));
    const ox = Math.floor((c.width - 320 * sc) / 2), oy = Math.floor((c.height - 200 * sc) / 2);
    const r = c.getBoundingClientRect();
    return { x: r.left + (ox + x * sc) * (r.width / c.width), y: r.top + (oy + y * sc) * (r.height / c.height) };
  }, [vx, vy]);
  await g.page.mouse.click(pt.x, pt.y);
}
