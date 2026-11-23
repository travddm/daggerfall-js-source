// The batch steps that settle what a deleted character had with the market, its homes, its guild and other players.
// Each acts on exactly the rows the snapshot read; the fingerprint at the head of the batch refuses it if they moved.
import type { Database, Row, Snapshot, Statement } from './character-snapshot.ts';
import type { DeleteMail } from './delete-mail.ts';
import { bidReturn, orderReturn } from '../market.js';
import { commissionReturn } from '../writs.js';

const RANK_MASTER = 0;

const listOf = (rows: Row[], column: string): string => JSON.stringify(rows.map((row) => row[column]));
const IN_LIST = (parameter: string): string => `IN (SELECT value FROM json_each(${parameter}))`;

/**
 * The market settled: its listings and auctions cancelled with their goods marked returned (the goods go by mail),
 * every bid on its auctions and its own leading bids void, its orders cancelled and its commissions withdrawn, with
 * their escrowed Marks back to each bidder's or poster's account in the same batch (the market's own returns, which
 * wait for the account's next market read if its Marks are at the cap), its materials on the road and its pieces
 * waiting marked as handed over. A piece's escrow ledger row goes as a sale removes it, so whoever claims the piece
 * registers it at their next checkpoint.
 */
export function marketSteps(db: Database, snapshot: Snapshot, player: string, nowS: number): Statement[] {
  const pieces = JSON.stringify(
    [...snapshot.listings, ...snapshot.auctions].map((row) => row.provenance).filter((value) => value != null),
  );
  const auctions = listOf(snapshot.auctions, 'id');
  const leading = listOf(snapshot.leadingBids, 'id');
  return [
    db
      .prepare(
        `UPDATE market_listings SET state = CASE WHEN state = 'open' THEN 'cancelled' ELSE state END,
          closed_at = COALESCE(closed_at, ?2), returned = 1 WHERE id ${IN_LIST('?1')}`,
      )
      .bind(listOf(snapshot.listings, 'id'), nowS),
    db
      .prepare(
        `UPDATE market_auctions SET state = CASE WHEN state = 'open' THEN 'cancelled' ELSE state END,
          closed_at = COALESCE(closed_at, ?2), returned = 1 WHERE id ${IN_LIST('?1')}`,
      )
      .bind(auctions, nowS),
    db.prepare(`UPDATE products SET listed = 0 WHERE provenance ${IN_LIST('?1')}`).bind(pieces),
    db.prepare(`DELETE FROM piece_escrow WHERE provenance ${IN_LIST('?1')}`).bind(pieces),
    db
      .prepare(`UPDATE market_bids SET state = 'void' WHERE state = 'high' AND auction ${IN_LIST('?1')}`)
      .bind(auctions),
    db.prepare(`UPDATE market_bids SET state = 'void' WHERE state = 'high' AND id ${IN_LIST('?1')}`).bind(leading),
    // The auction it led reopens at its opening price, as if the bid had not been made
    db.prepare(`UPDATE market_auctions SET high = NULL, high_bid = NULL WHERE high_bid ${IN_LIST('?1')}`).bind(leading),
    db
      .prepare(
        `UPDATE market_orders SET state = 'cancelled', closed_at = ?2 WHERE state = 'open' AND id ${IN_LIST('?1')}`,
      )
      .bind(listOf(snapshot.orders, 'id'), nowS),
    db
      .prepare(
        `UPDATE commissions SET state = 'withdrawn', closed_at = ?2 WHERE state = 'open' AND id ${IN_LIST('?1')}`,
      )
      .bind(listOf(snapshot.commissions, 'id'), nowS),
    db
      .prepare(
        `UPDATE market_sales SET delivered = 1 WHERE buyer = ?2 AND kind = 'material' AND delivered = 0 AND rid ${IN_LIST('?1')}`,
      )
      .bind(listOf(snapshot.onTheRoad, 'rid'), player),
    db
      .prepare(`UPDATE market_deliveries SET collected = 1 WHERE player = ?2 AND collected = 0 AND id ${IN_LIST('?1')}`)
      .bind(listOf(snapshot.deliveries, 'id'), player),
    db.prepare(`DELETE FROM item_uids WHERE state = 'escrow' AND uid ${IN_LIST('?1')}`).bind(pieces),
    ...marksReturnSteps(db, snapshot, nowS),
  ];
}

/** The escrowed Marks of every bid, order and commission the market steps closed, back to their accounts. */
function marksReturnSteps(db: Database, snapshot: Snapshot, nowS: number): Statement[] {
  const bids = [
    ...snapshot.auctions.map((row) => row.high_bid).filter((id) => id != null),
    ...snapshot.leadingBids.map((row) => row.id),
  ];
  return [
    ...bids.flatMap((id) => bidReturn(db, id, nowS) as Statement[]),
    ...snapshot.orders.flatMap((row) => orderReturn(db, row.id, nowS) as Statement[]),
    ...snapshot.commissions.flatMap((row) => commissionReturn(db, row.id, nowS) as Statement[]),
  ];
}

/**
 * Its homes and the homes of others: an open offer of one of its homes cancelled, a festival offering's cakes and bowl
 * back to the account (as the festival's own sweep of an offering whose home is gone does), a room it rented in
 * another player's home freed, and a waiting trade it started refused so the other side learns at once.
 */
export function homeAndOtherSteps(db: Database, player: string, character: string): Statement[] {
  return [
    db
      .prepare(`UPDATE home_offers SET state = 'cancelled' WHERE seller = ?1 AND seller_char = ?2 AND state = 'open'`)
      .bind(player, character),
    db
      .prepare(
        `UPDATE players SET fest_cakes = fest_cakes + (SELECT COALESCE(SUM(stock), 0) FROM fest_offerings WHERE player = ?1 AND char_id = ?2),
          fest_bowls = fest_bowls + (SELECT COUNT(*) FROM fest_offerings WHERE player = ?1 AND char_id = ?2)
          WHERE id = ?1 AND EXISTS (SELECT 1 FROM fest_offerings WHERE player = ?1 AND char_id = ?2)`,
      )
      .bind(player, character),
    db
      .prepare(
        `UPDATE home_rooms SET tenant = NULL, tenant_char = NULL, tenant_name = NULL, until = 0
          WHERE tenant = ?1 AND tenant_char = ?2`,
      )
      .bind(player, character),
    db
      .prepare(
        `UPDATE realm_trades SET state = 'refused', why = 'gone' WHERE a_player = ?1 AND a_char = ?2 AND state = 'waiting'`,
      )
      .bind(player, character),
  ];
}

/** A guildmaster with members: its row goes, and the guild is handed to its next member, as a death hands it on. */
export function handGuildOnSteps(db: Database, guildId: string): Statement[] {
  return [
    db
      .prepare(
        `UPDATE guild_members SET rank = ${RANK_MASTER} WHERE rowid = (SELECT rowid FROM guild_members WHERE guild_id = ?1
          ORDER BY rank, joined_at, rowid LIMIT 1) AND NOT EXISTS (SELECT 1 FROM guild_members WHERE guild_id = ?1 AND rank = ${RANK_MASTER})`,
      )
      .bind(guildId),
  ];
}

/**
 * The batch step that writes the mail, one piece a row of `mail`, and the guard that every piece was written. A piece's
 * batch name is the character's and its index, so the same delete never writes it twice.
 */
export function mailSteps(
  db: Database,
  mail: DeleteMail[],
  {
    character,
    sender,
    nowS,
    mustChange,
  }: { character: string; sender: string; nowS: number; mustChange: (n: number) => Statement },
): Statement[] {
  if (mail.length === 0) return [];
  const list = JSON.stringify(
    mail.map((piece) => ({
      ...piece,
      item: piece.item ? JSON.stringify(piece.item) : null,
      materials: piece.materials.length > 0 ? JSON.stringify(piece.materials) : null,
    })),
  );
  return [
    db
      .prepare(
        `INSERT INTO server_post (id, to_id, batch, sender, subject, body, item, gold, materials, sent_at)
          SELECT lower(hex(randomblob(12))), json_extract(value, '$.to'), 'deleted-' || ?2 || '-' || key, ?3,
            json_extract(value, '$.subject'), json_extract(value, '$.body'), json_extract(value, '$.item'),
            json_extract(value, '$.gold'), json_extract(value, '$.materials'), ?4
          FROM json_each(?1)`,
      )
      .bind(list, character, sender, nowS),
    mustChange(mail.length),
  ];
}
