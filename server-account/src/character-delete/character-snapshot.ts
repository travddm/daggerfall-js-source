// What a character's delete settles, read once before its batch. The batch asks the same reads again as one text (the
// fingerprint) and refuses itself when the text changed, so the goods it sends on are exactly the goods read here.

export type Statement = {
  bind(...values: unknown[]): Statement;
  first(): Promise<unknown>;
  all(): Promise<{ results?: unknown[] }>;
};
export type Database = { prepare(sql: string): Statement };

/** One row as the database answers it. */
export type Row = Record<string, unknown>;

/** A read: its columns, named once, and the rows' source. Every source binds ?1 the account, ?2 the character, ?3 now. */
type Read = { columns: string[]; from: string };

/** The character's own homes. Guild halls are the guild's, never a member's. */
const OWN_HOMES = 'SELECT map_id, building_key FROM homes WHERE player = ?1 AND char_id = ?2 AND guild_id IS NULL';

/** A trader's stock in one of the character's homes, by whichever character of the account stocked it. */
const IN_OWN_HOME = `EXISTS (SELECT 1 FROM home_decor d JOIN (${OWN_HOMES}) h ON h.map_id = d.map_id
  AND h.building_key = d.building_key WHERE d.map_id = l.vendor_map AND d.id = l.vendor_id)`;

const LISTING_OPEN = "(l.state = 'open' OR (l.state IN ('expired', 'removed') AND l.returned = 0))";
const AUCTION_OPEN = "(a.state = 'open' OR (a.state IN ('unsold', 'removed') AND a.returned = 0))";

export const READS = {
  homes: {
    columns: ['map_id', 'building_key', 'rent_due'],
    from: `homes WHERE player = ?1 AND char_id = ?2 AND guild_id IS NULL ORDER BY map_id, building_key`,
  },
  tenants: {
    columns: ['map_id', 'building_key', 'room', 'tenant', 'price', 'until'],
    from: `home_rooms r WHERE r.tenant IS NOT NULL AND r.until > ?3 AND EXISTS (SELECT 1 FROM (${OWN_HOMES}) h
      WHERE h.map_id = r.map_id AND h.building_key = r.building_key) ORDER BY map_id, building_key, room`,
  },
  chestGoods: {
    columns: ['map_id', 'building_key', 'piece_id', 'uid', 'item'],
    from: `decor_bin b WHERE EXISTS (SELECT 1 FROM (${OWN_HOMES}) h WHERE h.map_id = b.map_id
      AND h.building_key = b.building_key) ORDER BY map_id, building_key, piece_id, uid`,
  },
  listings: {
    columns: ['id', 'char_id', 'kind', 'state', 'material', 'provenance', 'own', 'bought', 'currency', 'item'],
    from: `market_listings l WHERE l.seller = ?1 AND ${LISTING_OPEN} AND (l.char_id = ?2 OR ${IN_OWN_HOME}) ORDER BY id`,
  },
  auctions: {
    columns: ['id', 'state', 'provenance', 'high', 'high_bid'],
    from: `market_auctions a WHERE a.seller = ?1 AND a.char_id = ?2 AND ${AUCTION_OPEN} ORDER BY id`,
  },
  escrowed: {
    columns: ['provenance', 'item'],
    from: `piece_escrow e WHERE e.provenance IN (
      SELECT l.provenance FROM market_listings l WHERE l.seller = ?1 AND l.kind = 'piece' AND ${LISTING_OPEN}
        AND (l.char_id = ?2 OR ${IN_OWN_HOME})
      UNION SELECT a.provenance FROM market_auctions a WHERE a.seller = ?1 AND a.char_id = ?2 AND ${AUCTION_OPEN})
      ORDER BY provenance`,
  },
  leadingBids: {
    columns: ['id', 'auction'],
    from: `market_bids WHERE bidder = ?1 AND char_id = ?2 AND state = 'high' ORDER BY id`,
  },
  orders: {
    columns: ['id'],
    from: `market_orders WHERE poster = ?1 AND char_id = ?2 AND state = 'open' ORDER BY id`,
  },
  commissions: {
    columns: ['id'],
    from: `commissions WHERE poster = ?1 AND poster_char = ?2 AND state = 'open' ORDER BY id`,
  },
  onTheRoad: {
    columns: ['rid', 'material', 'units', 'currency'],
    from: `market_sales WHERE buyer = ?1 AND char_id = ?2 AND kind = 'material' AND delivered = 0 ORDER BY rid`,
  },
  deliveries: {
    columns: ['id', 'item', 'provenance'],
    from: `market_deliveries WHERE player = ?1 AND char_id = ?2 AND collected = 0 ORDER BY id`,
  },
  saleGold: {
    columns: ['gold'],
    from: 'market_gold WHERE player = ?1 AND char_id = ?2',
  },
  stores: {
    columns: ['material', 'origin', 'qty'],
    from: 'prof_stores WHERE player = ?1 AND char_id = ?2 AND qty > 0 ORDER BY material, origin',
  },
  guildPlace: {
    columns: ['guild_id', 'rank', 'members', 'treasury', 'realm_gold', 'marks'],
    from: `(SELECT m.guild_id, m.rank, (SELECT COUNT(*) FROM guild_members o WHERE o.guild_id = m.guild_id) AS members,
      (SELECT treasury FROM guilds g WHERE g.id = m.guild_id) AS treasury,
      (SELECT realm_gold FROM guilds g WHERE g.id = m.guild_id) AS realm_gold,
      (SELECT balance FROM guild_marks k WHERE k.guild_id = m.guild_id) AS marks
      FROM guild_members m WHERE m.player = ?1 AND m.char_id = ?2)`,
  },
  record: {
    columns: ['seq', 'held', 'judged_seq', 'dead_at'],
    from: 'realm_characters WHERE id = ?2 AND player = ?1',
  },
} satisfies Record<string, Read>;

export type ReadName = keyof typeof READS;

/** The rows each read answered. */
export type Snapshot = { [Name in ReadName]: Row[] };

const selectOf = (read: Read): string => `SELECT ${read.columns.join(', ')} FROM ${read.from}`;

/**
 * Every read as one JSON text. Read before the batch and asked again inside it; a sale, a deposit, a rent or a
 * checkpoint that lands between the two changes the text and refuses the batch.
 */
export const FINGERPRINT_SQL = `SELECT json_array(${(Object.values(READS) as Read[])
  .map((read) => `(SELECT json_group_array(json_array(${read.columns.join(', ')})) FROM (${selectOf(read)}))`)
  .join(',\n  ')}) AS print`;

/**
 * Every read, in one statement: the snapshot is parsed from the fingerprint's own text, so the rows the delete plans from
 * are exactly the rows its guard compares.
 */
export async function readSnapshot(
  db: Database,
  player: string,
  character: string,
  nowS: number,
): Promise<{ snapshot: Snapshot; print: string }> {
  const print = await readFingerprint(db, player, character, nowS);
  const parsed = JSON.parse(print) as unknown[][][];
  const snapshot = {} as Snapshot;
  (Object.entries(READS) as [ReadName, Read][]).forEach(([name, read], index) => {
    snapshot[name] = (parsed[index] ?? []).map((values) =>
      Object.fromEntries(read.columns.map((column, at) => [column, values[at]])),
    );
  });
  return { snapshot, print };
}

/** The fingerprint as it stands now. */
export async function readFingerprint(db: Database, player: string, character: string, nowS: number): Promise<string> {
  const row = (await db.prepare(FINGERPRINT_SQL).bind(player, character, nowS).first()) as { print?: unknown } | null;
  return String(row?.print ?? '');
}

/** The batch step that refuses the batch when the fingerprint is no longer `print`. */
export function fingerprintGuard(
  db: Database,
  player: string,
  character: string,
  nowS: number,
  print: string,
): Statement {
  return db
    .prepare(`INSERT INTO realm_tx_guard (moved, expected) SELECT 0, 1 WHERE (${FINGERPRINT_SQL}) IS NOT ?4`)
    .bind(player, character, nowS, print);
}
