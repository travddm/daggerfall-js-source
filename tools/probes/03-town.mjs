// Probe 3: a town exterior, a shop (buy, then sell it back) and a tavern (rent a room).
//
// Boots the town directly (`class=1` skips chargen). Shop and tavern are found through `__doors`/`__buildingAt`;
// the player is posed at a door (`__pose`) and enters through the activation (`__enter`). Buying and selling go
// through the trade window's own click (`__tradeSlot`, `__tradeClick`) and the merchant's offer box (Y).
import { Game } from './lib/harness.mjs';
import {
  enterTown,
  enterDoor,
  leaveBuilding,
  stageOne,
  buildingsOfTown,
  openInnkeeper,
  rentRoom,
} from './lib/town.mjs';

export const name = 'town';

export async function run({ browser, base, ck }) {
  const g = new Game(browser, base);
  try {
    await enterTown(g);
    ck('the player stands in a town exterior', (await g.mode()) === 'exterior', await g.mode());
    const doors = await g.page.evaluate(() => window.__doors());
    ck('the town has buildings', doors.length > 0, `${doors.length} doors`);

    const { shops, taverns } = await buildingsOfTown(g);
    ck(
      'the town has a shop and a tavern',
      shops.length > 0 && taverns.length > 0,
      `${shops.length} shops, ${taverns.length} taverns`,
    );

    // ── a shop: buy, then sell it back ──
    let inShop = null;
    for (const s of shops.slice(0, 8)) {
      if (await enterDoor(g, s.i)) {
        inShop = s;
        break;
      }
    }
    ck(
      'a shop door opens and the player walks in',
      !!inShop,
      inShop ? `${inShop.name ?? ''} (type ${inShop.type})` : 'every shop door refused',
    );
    if (inShop) {
      let o = await g.J(() => window.__openShelf(0));
      ck('the shelf raises the trade window', !!o?.native, `${o?.remote ?? 0} on the shelf`);
      if (o?.native && o.remote > 0) {
        await g.waitFrames(10);
        if ((await g.entity()).gold < 5000) await g.page.evaluate(() => window.__addGold(20000));
        const before = await g.entity();
        const stock = await g.J(() => window.__tradeOverlay());
        const item = stock.remote[0].name;
        await stageOne(g, 'remote', 0);
        o = await g.J(() => window.__shopOverlay());
        await g.shot('03-staged');
        ck(
          'a click stages the item and does not pay',
          (o?.cost ?? 0) > 0 && (await g.entity()).gold === before.gold,
          `${item}: cost ${o?.cost}`,
        );
        await g.page.evaluate(() => window.__tradeClick('modeAction'));
        await g.waitFrames(4);
        ck('the merchant makes an offer', (await g.J(() => window.__shopOverlay()))?.box?.buttons === 'YesNo');
        await g.key('y', 4);
        const bought = await g.entity();
        ck(
          'agreeing pays gold and adds the item',
          bought.gold < before.gold && bought.qty > before.qty,
          `${item}: ${before.gold}g -> ${bought.gold}g, ${before.qty} -> ${bought.qty} pieces`,
        );
        await g.page.evaluate(() => window.__tradeClick('exit'));
        await g.waitFrames(3);

        // sell the same item back
        const sell = await g.J(() => window.__openMerchantSell());
        ck('the merchant buys', sell?.native && sell.mode === 'Sell', `mode ${sell?.mode}`);
        // sell: the first row of the pack list that the merchant takes
        const local = (await g.J(() => window.__tradeOverlay()))?.localNames ?? [];
        ck('the pack list has something to sell', local.length > 0, local.join(', '));
        let staged = null,
          slot = -1;
        for (let i = 0; i < Math.min(local.length, 6) && !staged?.staged; i++) {
          slot = i;
          await stageOne(g, 'local', i);
          staged = await g.J(() => window.__shopOverlay());
        }
        ck(
          'a click stages the sale',
          staged?.staged >= 1,
          `${local[slot]}: staged ${staged?.staged}, cost ${staged?.cost}`,
        );
        if (staged?.staged) {
          await g.page.evaluate(() => window.__tradeClick('modeAction'));
          await g.waitFrames(3);
          await g.key('y', 4);
          const sold = await g.entity();
          ck(
            'agreeing pays gold and takes the pieces',
            sold.gold > bought.gold && sold.qty < bought.qty,
            `${bought.gold}g -> ${sold.gold}g, ${bought.qty} -> ${sold.qty} pieces`,
          );
        }
        await g.page.evaluate(() => window.__tradeClick('exit'));
        await g.waitFrames(3);
      }
      ck('the player is back in the street', await leaveBuilding(g), await g.mode());
    }

    // ── a tavern: the room ──
    const tavernOpen = await openInnkeeper(g, taverns);
    ck('the innkeeper answers', tavernOpen);
    if (tavernOpen) {
      const r = await rentRoom(g);
      ck('the room is quoted', r.quoted);
      ck(
        'renting takes gold and records the room',
        r.rooms === 1 && r.after < r.before,
        `${r.before}g -> ${r.after}g, ${r.rooms} room(s)`,
      );
    }
    const e = await g.entity();
    ck('the character is alive', e.health > 0, `hp ${e.health}/${e.maxHealth}`);
    g.noErrors(ck, 'the town, shop and tavern');
  } finally {
    await g.close();
  }
}
