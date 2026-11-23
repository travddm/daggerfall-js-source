// What a deleted character's goods become: mail to its account. Its own goods, gold and Stores materials go to its
// account's mailbox; a tenant's refund goes to the tenant's account. Built from the snapshot alone, so it can be tested
// without a database and shown before the delete as its warning.
import type { Row, Snapshot } from './character-snapshot.ts';
import { POST_MATERIALS_MAX, POST_MATERIAL_MAX, type PostMaterial } from '../../../src/net/postLaw.js';
import { RENT_DAY_S } from '../../../src/net/homeLaw.js';
import { templateByIndex } from '../../../src/systems/item/itemTemplates.js';
import { lawTemplate } from '../../../src/systems/item/itemLaw.js';

/** One piece of post the delete writes. */
export type DeleteMail = {
  to: string;
  subject: string;
  body: string;
  item: Record<string, unknown> | null;
  gold: number;
  materials: PostMaterial[];
};

/** What the delete settles, as the player is told before it. `count` is how many, or an amount of gold. */
export type DeleteWarning = { code: DeleteWarningCode; count: number };

export type DeleteWarningCode =
  | 'items-mailed'
  | 'gold-mailed'
  | 'materials-mailed'
  | 'market-cancelled'
  | 'bids-refunded'
  | 'tenants-refunded'
  | 'goods-lost';

/** The mail plan and its warnings. */
export type MailPlan = { mail: DeleteMail[]; warnings: DeleteWarning[] };

/** A gold coin pile as a chest holds it: its count is gold, not an item. */
const isCoin = (item: Record<string, unknown>): boolean => item.group === 'Currency' && item.templateIndex === 276;

/** A Stores origin for units a gold or a Drakes purchase brought. */
const boughtOrigin = (currency: unknown): string => (currency === 'gold' ? 'gold' : 'bought');

const whole = (value: unknown): number => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
};

/**
 * An item record as the mailbox can carry it: a template the game still knows (the mailbox claims nothing else), and a
 * name, its template's when the record has none.
 */
function mailableItem(text: unknown): Record<string, unknown> | null {
  if (typeof text !== 'string') return null;
  let item: unknown;
  try {
    item = JSON.parse(text);
  } catch {
    return null;
  }
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const record = item as Record<string, unknown>;
  if (!lawTemplate(record.templateIndex)) return null;
  if (typeof record.name === 'string' && record.name.length > 0) return record;
  const template = templateByIndex(Number(record.templateIndex)) as { name?: string } | null | undefined;
  return template?.name ? { ...record, name: template.name } : null;
}

/** Units of each material and origin, added up. */
class MaterialTotals {
  private totals = new Map<string, PostMaterial>();

  add(material: unknown, origin: string, qty: unknown): void {
    const units = whole(qty);
    if (typeof material !== 'string' || units === 0) return;
    const key = `${material} ${origin}`;
    const held = this.totals.get(key);
    if (held) held.qty += units;
    else this.totals.set(key, { material, origin, qty: units });
  }

  get size(): number {
    return this.totals.size;
  }

  /**
   * The totals split into pieces an empty Stores can always take: at most POST_MATERIAL_MAX of one material (all its
   * origins together) and POST_MATERIALS_MAX entries in a piece.
   */
  pieces(): PostMaterial[][] {
    const out: PostMaterial[][] = [];
    const left = [...this.totals.values()].map((entry) => ({ ...entry }));
    while (left.some((entry) => entry.qty > 0)) {
      const piece: PostMaterial[] = [];
      const room = new Map<string, number>();
      for (const entry of left) {
        if (entry.qty === 0 || piece.length === POST_MATERIALS_MAX) continue;
        const space = room.get(entry.material) ?? POST_MATERIAL_MAX;
        const qty = Math.min(entry.qty, space);
        if (qty === 0) continue;
        piece.push({ material: entry.material, origin: entry.origin, qty });
        room.set(entry.material, space - qty);
        entry.qty -= qty;
      }
      out.push(piece);
    }
    return out;
  }
}

/**
 * The tenants' refunds from each home's uncollected rent: the unused days at the room's current price, paid in order
 * while the home's held rent lasts. Answers each tenant account's refund and the rent left over.
 */
export function rentRefunds(
  homes: Row[],
  tenants: Row[],
  nowS: number,
): { refunds: Map<string, number>; left: number } {
  const refunds = new Map<string, number>();
  let left = 0;
  for (const home of homes) {
    let held = whole(home.rent_due);
    const rooms = tenants.filter((room) => room.map_id === home.map_id && room.building_key === home.building_key);
    for (const room of rooms) {
      const days = Math.ceil((Number(room.until) - nowS) / RENT_DAY_S);
      const owed = Math.max(0, days) * whole(room.price);
      const paid = Math.min(owed, held);
      held -= paid;
      if (paid > 0) refunds.set(String(room.tenant), (refunds.get(String(room.tenant)) ?? 0) + paid);
    }
    left += held;
  }
  return { refunds, left };
}

/**
 * The mail a delete writes, and the warnings that name what it settles. `guildGold` is a lone guildmaster's guild
 * treasury, which goes to the account with the guild.
 */
export function planDeleteMail(
  snapshot: Snapshot,
  { player, name, nowS, guildGold }: { player: string; name: string; nowS: number; guildGold: number },
): MailPlan {
  const items: Record<string, unknown>[] = [];
  const materials = new MaterialTotals();
  let gold = 0;
  let lostGoods = 0;
  const escrowed = new Map(snapshot.escrowed.map((row) => [row.provenance, row.item]));

  for (const row of snapshot.chestGoods) {
    const item = mailableItem(row.item);
    if (item && isCoin(item)) gold += whole(item.stackCount);
    else if (item) items.push(item);
    else lostGoods += 1;
  }
  for (const row of snapshot.listings) {
    if (row.kind === 'material') {
      materials.add(row.material, 'own', row.own);
      materials.add(row.material, boughtOrigin(row.currency), row.bought);
    } else {
      const item = mailableItem(row.kind === 'item' ? row.item : escrowed.get(row.provenance));
      if (item) items.push(item);
      else lostGoods += 1;
    }
  }
  for (const row of snapshot.auctions) {
    const item = mailableItem(escrowed.get(row.provenance));
    if (item) items.push(item);
    else lostGoods += 1;
  }
  for (const row of snapshot.onTheRoad) materials.add(row.material, boughtOrigin(row.currency), row.units);
  for (const row of snapshot.deliveries) {
    const item = mailableItem(row.item);
    if (item) items.push(item);
    else lostGoods += 1;
  }
  for (const row of snapshot.stores) materials.add(row.material, String(row.origin), row.qty);
  for (const row of snapshot.saleGold) gold += whole(row.gold);
  const { refunds, left } = rentRefunds(snapshot.homes, snapshot.tenants, nowS);
  gold += left + whole(guildGold);

  const subject = `The goods of ${name}`.slice(0, 80);
  const body = `${name} was deleted. What the character held is here. Claim it with any online character of this account.`;
  const mail: DeleteMail[] = items.map((item) => ({ to: player, subject, body, item, gold: 0, materials: [] }));
  const materialPieces = materials.pieces();
  if (gold > 0 || materialPieces.length > 0) {
    const [first = [], ...rest] = materialPieces;
    mail.push({ to: player, subject, body, item: null, gold, materials: first });
    for (const piece of rest) mail.push({ to: player, subject, body, item: null, gold: 0, materials: piece });
  }
  for (const [tenant, refund] of refunds) {
    mail.push({
      to: tenant,
      subject: 'Your rent, refunded',
      body: 'The owner of the home you rented a room in is gone. The rent for the days you did not use is returned.',
      item: null,
      gold: refund,
      materials: [],
    });
  }

  const marketCount =
    snapshot.listings.length + snapshot.auctions.length + snapshot.orders.length + snapshot.commissions.length;
  const bidsVoided = snapshot.auctions.filter((row) => row.high_bid != null).length + snapshot.leadingBids.length;
  const warnings: DeleteWarning[] = [
    { code: 'items-mailed' as const, count: items.length },
    { code: 'gold-mailed' as const, count: gold },
    { code: 'materials-mailed' as const, count: materials.size },
    { code: 'market-cancelled' as const, count: marketCount },
    { code: 'bids-refunded' as const, count: bidsVoided },
    { code: 'tenants-refunded' as const, count: snapshot.tenants.length },
    { code: 'goods-lost' as const, count: lostGoods },
  ].filter((warning) => warning.count > 0);
  return { mail, warnings };
}
