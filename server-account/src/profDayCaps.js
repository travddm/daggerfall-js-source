// @ts-check
// PROFESSION-CAPS: the account service's half of the day's bound on a profession track (src/net/profCapLaw.js has the
// numbers and the switch). The guards wrap the harvest and craft routes: a request already answered (its rid) is answered
// again, never refused; a new one past the day's count is refused `prof-day-cap`. The read and the write are two trips, so
// the bound is soft by the few requests the hour's rate limit (PROF_OPS_MAX) lets through at once.
import { PROF_DAY_CAP, profCapsOn, gateMasterwork } from '../../src/net/profCapLaw.js';
import { RECIPES, recipeById, takesQuality } from '../../src/net/recipeLaw.js';
import { trackOf } from '../../src/net/professionLaw.js';
import { utcDay } from '../../src/net/marksLaw.js';

/** The gathering track each harvest kind raises (professions.js NODE_HARVESTS, by the kind the request names). */
const TRACK_OF_KIND = Object.freeze({
  ore: 'mining',
  stone: 'mining',
  logs: 'logging',
  herbs: 'herbalism',
  food: 'herbalism',
  hide: 'hunting',
  fish: 'fishing',
});
const count = async (db, sql, ...binds) =>
  Number(
    (
      await db
        .prepare(sql)
        .bind(...binds)
        .first()
    )?.n ?? 0,
  );

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

/** A craft route, guarded: past the character's day on the recipe's track, `prof-day-cap`. */
export async function craftCapped(ctx, player, env, body, craft) {
  const recipe = recipeById(body?.recipe);
  if (profCapsOn(env) && recipe && typeof body?.character === 'string' && typeof body?.rid === 'string') {
    const { db, nowS } = ctx;
    const track = trackOf(recipe.profession);
    const recipes = JSON.stringify(RECIPES.filter((x) => trackOf(x.profession) === track).map((x) => x.id));
    const answered = await count(
      db,
      'SELECT COUNT(*) AS n FROM prof_crafts WHERE player = ?1 AND rid = ?2',
      player.id,
      body.rid,
    );
    const today = await count(
      db,
      'SELECT COUNT(*) AS n FROM prof_crafts WHERE player = ?1 AND char_id = ?2 AND at >= ?3 AND recipe IN (SELECT value FROM json_each(?4))',
      player.id,
      body.character,
      nowS - (nowS % 86400),
      recipes,
    );
    if (!answered && today >= PROF_DAY_CAP.crafting) return { error: 'prof-day-cap' };
  }
  return craft(ctx, player, env, body);
}

/** The craft's quality passed through the level gate: a Masterwork's Rare below the gate's level is a Superior. */
export async function gatedQuality(db, player, character, recipe, quality, roll) {
  if (!takesQuality(recipe)) return quality;
  const crafter = await db
    .prepare('SELECT level_seen AS lv FROM realm_characters WHERE id = ?1 AND player = ?2')
    .bind(character, player)
    .first();
  return gateMasterwork(quality, crafter?.lv ?? null, roll);
}
