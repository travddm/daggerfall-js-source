// A player deletes one of its realm characters. Everything the character owned goes with it in one transaction; what
// it held that has a worth (goods, gold, Stores materials) goes to its account's mailbox; what another player is part
// of is settled (a bid refunded, a tenant refunded, a guild handed on). The delete refuses only where another party
// holds something no settle rule covers, for a tombstone, and for a character the judge holds.
//
// The steps:
//   1. Read the row and the refusals.
//   2. Read the snapshot and its fingerprint, and plan the mail from the snapshot.
//   3. One batch: the fingerprint guard, the settles, the mail, the deletes, and a guard that no row is left.
//   4. Once the batch has committed, drop the character's stored objects.
import {
  readSnapshot,
  readFingerprint,
  fingerprintGuard,
  type Database,
  type Row,
  type Snapshot,
  type Statement,
} from './character-snapshot.ts';
import { planDeleteMail, type DeleteWarning } from './delete-mail.ts';
import { deletedRowSteps, noRowLeftGuard } from './character-rows.ts';
import { marketSteps, homeAndOtherSteps, handGuildOnSteps, mailSteps } from './settle-steps.ts';
import { REALM_ID_RE, holdRefusal, mustChange, dropCharacterObjects } from '../realm.js';
import { releaseSteps } from '../ledger.js';
import { endUnionsOf } from '../legacy.js';
import { GUILD_HOLDS_SQL, GUILD_HOLDS_SQL_CODES, guildKeepsSql } from '../guilds.js';
import { guildMarksSweep } from '../marks.js';
import { displayName } from '../accounts.js';
import { GUILD_RANK_MASTER } from '../../../src/net/guild/guildLaw.js';
import { homeMoved } from '../../../src/net/homeLaw.js';

/** Who the delete's mail is from, as the mailbox shows it. */
export const DELETE_SENDER = 'The Realm';

export type DeleteContext = {
  db: Database & { batch(steps: Statement[]): Promise<{ results?: Row[] }[]> };
  bucket: unknown;
  nowS?: number;
};

export type DeleteAnswer =
  { ok: true; warnings: DeleteWarning[]; moved?: unknown[] } | { error: string; held?: unknown };

/** What the character's guild place asks of the delete. */
type GuildPlan =
  | { kind: 'none' }
  | { kind: 'member' }
  | { kind: 'hand-on'; guildId: string }
  | { kind: 'end'; guildId: string; treasury: number; gold: number; marks: number };

/**
 * A lone guildmaster's guild ends with it, as a leave ends it: its gold goes by mail and its Marks to the account. A hold
 * of the guild's other than its gold refuses, as it refuses a leave. A guildmaster with members hands the guild on.
 */
async function guildPlan(db: Database, snapshot: Snapshot, player: string): Promise<GuildPlan | { error: string }> {
  const place = snapshot.guildPlace[0];
  if (!place) return { kind: 'none' };
  if (Number(place.rank) !== GUILD_RANK_MASTER) return { kind: 'member' };
  const guildId = String(place.guild_id);
  if (Number(place.members) > 1) return { kind: 'hand-on', guildId };
  const holds = (await db.prepare(GUILD_HOLDS_SQL).bind(guildId, player).first()) as Row | null;
  if (holds) {
    const held = GUILD_HOLDS_SQL_CODES.findIndex((_code: string, index: number) => Number(holds[`h${index}`]) > 0);
    if (held >= 0) return { error: GUILD_HOLDS_SQL_CODES[held] };
    if (Number(holds.marks_full) > 0) return { error: 'marks-full' };
  }
  // A realm character takes out only what realm characters paid in, as a withdrawal does; the rest ends with the guild
  const treasury = Number(place.treasury) || 0;
  const gold = Math.min(treasury, Number(place.realm_gold) || 0);
  return { kind: 'end', guildId, treasury, gold, marks: Number(place.marks) || 0 };
}

/** The steps that end a lone guildmaster's guild: its gold taken out (it goes by mail), its Marks swept, its row gone. */
function endGuildSteps(
  db: Database,
  plan: { guildId: string; treasury: number },
  playerRow: Row,
  nowS: number,
): Statement[] {
  return [
    db
      .prepare('UPDATE guilds SET treasury = 0, moved_by = ?3, moved_at = ?4 WHERE id = ?1 AND treasury = ?2')
      .bind(plan.guildId, plan.treasury, displayName(playerRow), nowS),
    guildMarksSweep(db, plan.guildId, playerRow, nowS, { alone: true }),
    db
      .prepare(
        `DELETE FROM guilds WHERE id = ?1 AND treasury = 0 AND NOT EXISTS (SELECT 1 FROM guild_marks WHERE guild_id = ?1 AND balance > 0)
          AND NOT ${guildKeepsSql('?1')} AND (SELECT COUNT(*) FROM guild_members WHERE guild_id = ?1) = 1`,
      )
      .bind(plan.guildId),
    mustChange(db, 1),
  ];
}

/** The refusal a judged character meets, when its delete would send anything to the account. */
async function holdOnDelete(
  db: Database,
  player: string,
  id: string,
  row: Row,
  sendsGoods: boolean,
): Promise<DeleteAnswer | null> {
  // A held character's hold lives on its row, so it is not deleted while pieces of its make are at the account
  if (row.held) {
    const crafted = await db
      .prepare('SELECT 1 FROM products WHERE owner = ?1 AND char_id = ?2 LIMIT 1')
      .bind(player, id)
      .first();
    if (crafted) return { error: 'trade-held', held: row.held };
  }
  // Mail moves its goods to the account, where any other character could claim them: a judged character moves nothing
  if (sendsGoods) {
    const refusal = holdRefusal(row) as DeleteAnswer | null;
    if (refusal) return refusal;
  }
  return null;
}

/** The player's own delete of its realm character `id`. */
export async function deleteCharacter(ctx: DeleteContext, player: string, id: unknown): Promise<DeleteAnswer> {
  const { db, bucket } = ctx;
  const nowS = ctx.nowS ?? Math.floor(Date.now() / 1000);
  if (typeof id !== 'string' || !REALM_ID_RE.test(id)) return { error: 'body' };
  const row = (await db
    .prepare('SELECT name, obj, prev, dead_at, held, judged_seq FROM realm_characters WHERE id = ? AND player = ?')
    .bind(id, player)
    .first()) as Row | null;
  if (!row) return { error: 'no-realm-character' };
  // A tombstone is the realm's only record of a Bloodline death, and its row the person's claim
  if (row.dead_at != null) return { error: 'dead' };

  const { snapshot, print } = await readSnapshot(db, player, id, nowS);
  const guild = await guildPlan(db, snapshot, player);
  if ('error' in guild) return guild;
  const playerRow = ((await db.prepare('SELECT * FROM players WHERE id = ?1').bind(player).first()) ?? {}) as Row;
  const plan = planDeleteMail(snapshot, {
    player,
    name: String(row.name ?? 'Your character'),
    nowS,
    guildGold: guild.kind === 'end' ? guild.gold : 0,
  });
  const held = await holdOnDelete(db, player, id, row, plan.mail.length > 0);
  if (held) return held;

  const steps: Statement[] = [
    fingerprintGuard(db, player, id, nowS, print),
    db
      .prepare(
        'SELECT map_id, building_key FROM homes WHERE player = ? AND char_id = ? AND guild_id IS NULL ORDER BY map_id, building_key',
      )
      .bind(player, id),
    ...marketSteps(db, snapshot, player, nowS),
    ...homeAndOtherSteps(db, player, id),
    ...(guild.kind === 'end' ? endGuildSteps(db, guild, playerRow, nowS) : []),
    ...mailSteps(db, plan.mail, { character: id, sender: DELETE_SENDER, nowS, mustChange: (n) => mustChange(db, n) }),
    ...deletedRowSteps(db, player, id),
    ...(guild.kind === 'hand-on' ? handGuildOnSteps(db, guild.guildId) : []),
    db.prepare('DELETE FROM realm_characters WHERE id = ? AND player = ?').bind(id, player),
    ...(releaseSteps(db, id, nowS, { deleted: true }) as Statement[]),
    endUnionsOf(db, id, nowS, 'gone') as Statement,
    noRowLeftGuard(db, player, id),
  ];
  let results: { results?: Row[] }[];
  try {
    results = await db.batch(steps);
  } catch (error) {
    // Something it settles moved between the read and the batch: nothing was written, and the player may try again
    if ((await readFingerprint(db, player, id, nowS)) !== print) return { error: 'delete-moved' };
    // Or its guild came to hold something after the read, which refuses it as a leave is refused
    const again = await guildPlan(db, snapshot, player);
    if ('error' in again) return again;
    throw error;
  }
  await dropCharacterObjects(bucket, player, id, [row.obj, row.prev]);
  const towns = new Map<number, number[]>();
  for (const home of results[1]?.results ?? []) {
    const mapId = Number(home.map_id);
    towns.set(mapId, [...(towns.get(mapId) ?? []), Number(home.building_key)]);
  }
  const moved = [...towns].flatMap(([mapId, keys]) => homeMoved(mapId, [], keys));
  return { ok: true, warnings: plan.warnings, ...(moved.length > 0 ? { moved } : {}) };
}
