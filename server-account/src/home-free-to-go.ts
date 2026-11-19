// A home that is released or handed to a new owner must not take a tenant's room, a trader's open stock or a shared
// chest's goods with it. The routes read these first to answer the right refusal, but a deposit or a listing can land
// between that read and the write. The same tests therefore go into the write itself, and the batch refuses when one
// of them fails.

/** The SQL parameter names (such as `?1`) that a write binds the home's map, building and the current time to. */
export type HomeParams = {
  mapId: string;
  buildingKey: string;
  nowS: string;
};

type Statement = { bind(...values: unknown[]): Statement; first(): Promise<unknown> };
type Database = { prepare(sql: string): Statement };
type Count = { n?: number } | null;

export type HomeHeldError = 'home-tenants' | 'home-vendor-stocked' | 'home-holds';

/**
 * The conditions a home's release or transfer write adds to its WHERE clause. `withBin` asks that the shared chests hold
 * nothing; a transfer that keeps the decor and the items hands the chests' goods to the new owner, so it leaves it out.
 */
export function homeFreeToGoSql({ mapId, buildingKey, nowS }: HomeParams, withBin: boolean): string {
  const conditions = [
    `NOT EXISTS (SELECT 1 FROM home_rooms WHERE map_id = ${mapId} AND building_key = ${buildingKey}
      AND tenant IS NOT NULL AND until > ${nowS})`,
    `NOT EXISTS (SELECT 1 FROM market_listings l JOIN home_decor d ON d.map_id = l.vendor_map AND d.id = l.vendor_id
      WHERE l.state = 'open' AND d.map_id = ${mapId} AND d.building_key = ${buildingKey})`,
  ];
  if (withBin) {
    conditions.push(`NOT EXISTS (SELECT 1 FROM decor_bin WHERE map_id = ${mapId} AND building_key = ${buildingKey})`);
  }
  return conditions.join(' AND ');
}

/** Which of the conditions in `homeFreeToGoSql` fails now, read after a refused write to name its refusal. */
export async function homeHeldError(
  db: Database,
  mapId: number,
  buildingKey: number,
  nowS: number,
  withBin: boolean,
): Promise<HomeHeldError | null> {
  const count = async (sql: string, ...values: unknown[]): Promise<number> => {
    const row = (await db
      .prepare(sql)
      .bind(...values)
      .first()) as Count;
    return Number(row?.n ?? 0);
  };
  const tenants = await count(
    'SELECT COUNT(*) AS n FROM home_rooms WHERE map_id = ? AND building_key = ? AND tenant IS NOT NULL AND until > ?',
    mapId,
    buildingKey,
    nowS,
  );
  if (tenants > 0) return 'home-tenants';
  const stock = await count(
    `SELECT COUNT(*) AS n FROM market_listings l JOIN home_decor d ON d.map_id = l.vendor_map AND d.id = l.vendor_id
      WHERE l.state = 'open' AND d.map_id = ? AND d.building_key = ?`,
    mapId,
    buildingKey,
  );
  if (stock > 0) return 'home-vendor-stocked';
  if (!withBin) return null;
  const held = await count(
    'SELECT COUNT(*) AS n FROM decor_bin WHERE map_id = ? AND building_key = ?',
    mapId,
    buildingKey,
  );
  return held > 0 ? 'home-holds' : null;
}
