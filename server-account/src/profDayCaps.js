// @ts-check
// PROFESSION-CAPS: the account service's half of the day's bound on a profession track (src/net/profCapLaw.js has the
// numbers and the switches). The guards wrap the profession routes: a harvest, a craft, a smelt, a brew, a disenchant and a
// reforge. A request already answered (its rid) is answered again, never refused; a new one past the day's count is refused
// `prof-day-cap`. The crafting acts share one count per track: a craft, a smelt (a work with no track, the loom's weave,
// counts for none), a brew (Alchemy), a disenchant and a reforge (Enchanting). The read and the write are two trips, so the
// bound is soft by the few requests the hour's rate limit (PROF_OPS_MAX) lets through at once.
import {
  PROF_DAY_CAP,
  TRACK_OF_KIND,
  profCapsOn,
  masterworkGateOn,
  dfuPricesOn,
  gateMasterwork,
} from '../../src/net/profCapLaw.js';
import { RECIPES, recipeById, takesQuality } from '../../src/net/recipeLaw.js';
import { trackOf, WORK_RECIPES, smeltRecipe } from '../../src/net/professionLaw.js';
import { utcDay } from '../../src/net/marksLaw.js';

const count = async (db, sql, ...binds) =>
  Number(
    (
      await db
        .prepare(sql)
        .bind(...binds)
        .first()
    )?.n ?? 0,
  );

/** The track a smelt-forge work raises (professions.js smeltAtForge: its `xp` track, else its choice's); null for none. */
const workTrack = (r) => ((r?.xp ?? r?.more?.profession) ? trackOf(r.xp ?? r.more.profession) : null);

/** The crafting acts a character did on `track` since `since`, across every table that records one. */
async function craftActsToday(db, player, character, track, since) {
  const ids = (list) => JSON.stringify(list.map((x) => x.id));
  const crafts = ids(RECIPES.filter((x) => trackOf(x.profession) === track));
  const works = ids(WORK_RECIPES.filter((r) => workTrack(r) === track));
  const of = (table) =>
    count(
      db,
      `SELECT COUNT(*) AS n FROM ${table} WHERE player = ?1 AND char_id = ?2 AND at >= ?3`,
      player,
      character,
      since,
    );
  const byRecipe = (table, list) =>
    count(
      db,
      `SELECT COUNT(*) AS n FROM ${table} WHERE player = ?1 AND char_id = ?2 AND at >= ?3 AND recipe IN (SELECT value FROM json_each(?4))`,
      player,
      character,
      since,
      list,
    );
  const parts = [byRecipe('prof_crafts', crafts), byRecipe('prof_smelts', works)];
  if (track === 'alchemy') parts.push(of('prof_brews'));
  if (track === 'enchanting') parts.push(of('prof_disenchants'), of('prof_reforges'));
  return (await Promise.all(parts)).reduce((a, b) => a + b, 0);
}

/** One crafting route, guarded: a new request past the character's day on `track` is refused `prof-day-cap`.
 *  `table` is the route's own record of requests answered. */
async function craftGuard(ctx, player, env, body, run, track, table) {
  if (profCapsOn(env) && track && typeof body?.character === 'string' && typeof body?.rid === 'string') {
    const { db, nowS } = ctx;
    const answered = await count(
      db,
      `SELECT COUNT(*) AS n FROM ${table} WHERE player = ?1 AND rid = ?2`,
      player.id,
      body.rid,
    );
    const today = await craftActsToday(db, player.id, body.character, track, nowS - (nowS % 86400));
    if (!answered && today >= PROF_DAY_CAP.crafting) return { error: 'prof-day-cap' };
  }
  return run(ctx, player, env, body);
}

/** A harvest route, guarded: past the character's day on the kind's track, `prof-day-cap`. */
export async function harvestCapped(ctx, player, env, body, harvest) {
  const track = TRACK_OF_KIND[body?.kind];
  if (profCapsOn(env) && track && typeof body?.character === 'string' && typeof body?.rid === 'string') {
    const { db, nowS } = ctx;
    const answered = await count(
      db,
      'SELECT COUNT(*) AS n FROM node_harvests WHERE player = ?1 AND rid = ?2',
      player.id,
      body.rid,
    );
    const today = await count(
      db,
      'SELECT COUNT(*) AS n FROM node_harvests WHERE player = ?1 AND char_id = ?2 AND profession = ?3 AND day = ?4',
      player.id,
      body.character,
      track,
      utcDay(nowS),
    );
    if (!answered && today >= PROF_DAY_CAP.gathering) return { error: 'prof-day-cap' };
  }
  return harvest(ctx, player, env, body);
}

/** A craft route, guarded (the recipe's track). */
export const craftCapped = (ctx, player, env, body, craft) => {
  const recipe = recipeById(body?.recipe);
  return craftGuard(ctx, player, env, body, craft, recipe ? trackOf(recipe.profession) : null, 'prof_crafts');
};
/** A smelt route, guarded (the work's track). */
export const smeltCapped = (ctx, player, env, body, smelt) =>
  craftGuard(ctx, player, env, body, smelt, workTrack(smeltRecipe(body?.recipe)), 'prof_smelts');
/** A brew route, guarded (Alchemy). */
export const brewCapped = (ctx, player, env, body, brew) =>
  craftGuard(ctx, player, env, body, brew, 'alchemy', 'prof_brews');
/** A disenchant route, guarded (Enchanting). */
export const disenchantCapped = (ctx, player, env, body, disenchant) =>
  craftGuard(ctx, player, env, body, disenchant, 'enchanting', 'prof_disenchants');
/** A reforge route, guarded (Enchanting). */
export const reforgeCapped = (ctx, player, env, body, reforge) =>
  craftGuard(ctx, player, env, body, reforge, 'enchanting', 'prof_reforges');

/** The tier prices' scale the state read names to the client (`dfu`, or the port's earlier `port`). */
export const priceScaleOf = (env) => (dfuPricesOn(env) ? 'dfu' : 'port');

/** The craft's quality passed through the level gate: a Masterwork's Rare below the gate's level is a Superior. */
export async function gatedQuality(db, env, player, character, recipe, quality, roll) {
  if (!masterworkGateOn(env) || !takesQuality(recipe)) return quality;
  const crafter = await db
    .prepare('SELECT level_seen AS lv FROM realm_characters WHERE id = ?1 AND player = ?2')
    .bind(character, player)
    .first();
  return gateMasterwork(quality, crafter?.lv ?? null, roll);
}
