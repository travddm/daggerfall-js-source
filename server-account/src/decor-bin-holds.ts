// A shared chest's goods live only in decor_bin, and a bin row names its piece. A write that deletes the piece, or the
// home and so its pieces, or that makes the piece no longer a container, would leave goods that nobody can open and that
// stop the next owner's sale. Every such write asks these first, to answer its refusal, and adds the matching SQL to its
// WHERE clause, so a deposit that lands after the read stops the write. The foreign key from decor_bin to home_decor
// refuses the delete as well.

type Statement = { bind(...values: unknown[]): Statement; first(): Promise<unknown> };
type Database = { prepare(sql: string): Statement };

/** No goods in one piece's bin. Binds the map id, the building key and the piece id, in that order. */
export const PIECE_BIN_EMPTY_SQL =
  'NOT EXISTS (SELECT 1 FROM decor_bin WHERE map_id = ? AND building_key = ? AND piece_id = ?)';

/** No goods in any bin of one home, given the SQL parameter names its map id and building key are bound to. */
export function homeBinEmptySql(mapId: string, buildingKey: string): string {
  return `NOT EXISTS (SELECT 1 FROM decor_bin WHERE map_id = ${mapId} AND building_key = ${buildingKey})`;
}

/** Whether one piece's bin holds goods now. */
export async function pieceBinHolds(
  db: Database,
  mapId: number,
  buildingKey: number,
  pieceId: string,
): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 AS held FROM decor_bin WHERE map_id = ? AND building_key = ? AND piece_id = ? LIMIT 1')
    .bind(mapId, buildingKey, pieceId)
    .first();
  return row != null;
}

/** Whether any bin of one home holds goods now. */
export async function homeBinHolds(db: Database, mapId: number, buildingKey: number): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 AS held FROM decor_bin WHERE map_id = ? AND building_key = ? LIMIT 1')
    .bind(mapId, buildingKey)
    .first();
  return row != null;
}
