// @ts-check
// SEAT2b: A SEAT'S FORTIFICATIONS, ITS SIEGE WORKS AND ITS REVOLT - the law both ends read (docs: Seats-Arc 6.2, 7.5, 7.7,
// 4.2's Siege Camp). Fortifications belong to the SEAT, not the guild: a project on the seat's board, its Marks paid once
// from the treasury, and the tier stands at once for the rest of the Season; each drops a tier when the seat changes hands
// and at a Season's end, and Season 0's end wipes them (18). There are no materials, no stockpile and no writs: the works
// cost Marks alone. A Siege Camp is Marks too (CAMP_MARKS), paid once by the challenger's guild at the pledge.
//
// Pure. Not a DFU member: Daggerfall's towns have no player works. Ledger A (EVERY PALACE A SEAT's row).

const tier = (marks) => Object.freeze({ marks });

/**
 * THE WORKS (7.5), in the table's order: each `{ id, name, tiers: [{ marks, needs: [[material, units]] }], where }` -
 * `where` the seats that may raise it: 'any'; 'gate' (a crown's, or a palace whose Walls stand at tier 3 - "palace
 * seats with tier 3 Walls gain a gate of their own"); 'coast' (coastal seats only).
 */
export const FORT_WORKS = Object.freeze([
  Object.freeze({ id: 'walls', name: 'Walls', where: 'any', tiers: Object.freeze([
    tier(700), tier(2000), tier(5300)]) }),
  Object.freeze({ id: 'gatehouse', name: 'Gatehouse', where: 'gate', tiers: Object.freeze([
    tier(1300), tier(3300), tier(8000)]) }),
  Object.freeze({ id: 'watchtowers', name: 'Watchtowers', where: 'any', tiers: Object.freeze([
    tier(500), tier(1300)]) }),
  Object.freeze({ id: 'barracks', name: 'Barracks', where: 'any', tiers: Object.freeze([
    tier(1000), tier(2700), tier(6000)]) }),
  Object.freeze({ id: 'market', name: 'Market Hall', where: 'any', tiers: Object.freeze([
    tier(700), tier(1700), tier(4000)]) }),
  Object.freeze({ id: 'shrine', name: 'Shrine', where: 'any', tiers: Object.freeze([
    tier(700), tier(2000)]) }),
  Object.freeze({ id: 'forge', name: 'Forge', where: 'any', tiers: Object.freeze([
    tier(700), tier(1700)]) }),
  Object.freeze({ id: 'workshop', name: 'Workshop', where: 'any', tiers: Object.freeze([
    tier(700), tier(1700)]) }),
  Object.freeze({ id: 'apothecary', name: 'Apothecary', where: 'any', tiers: Object.freeze([
    tier(700), tier(1700)]) }),
  Object.freeze({ id: 'harbour', name: 'Harbor', where: 'coast', tiers: Object.freeze([
    tier(1300), tier(3300)]) }),
]);
const BY_ID = new Map(FORT_WORKS.map((w) => [/** @type {string} */ (w.id), w]));
/** A work by its id, or null. */
export const fortWork = (id) => (typeof id === 'string' ? BY_ID.get(id) ?? null : null);
/** A work's highest tier (2 or 3), or 0 for none. */
export const fortMaxTier = (id) => fortWork(id)?.tiers.length ?? 0;
/** Tier `t`'s row of a work (1-based), or null. */
export const fortTierRow = (id, t) => (Number.isSafeInteger(t) && t >= 1 ? fortWork(id)?.tiers[t - 1] ?? null : null);

/**
 * WHETHER A SEAT MAY RAISE A WORK (7.5): `seat` `{ tier: 'palace'|'crown', coastal, walls }` - its tier, whether its
 * town is coastal and its Walls' tier now. A Gatehouse at a crown, or at a palace whose Walls stand at tier 3; a
 * Harbour at a coastal seat; the rest anywhere.
 */
/** AUDIT SEATS-2 L5: the Apothecary's steps wait on Alchemy's, Cooking's and Jewelcrafting's stations - until they stand
 *  it is raised by no one (a holder's Drakes and stone paid for nothing). PROF12: OPENED - the three
 *  stand (PROF9 the fire, PROF10 the jeweller's bench, PROF12 the alchemy station), and a step a tier is each one's
 *  (STATION_PROFESSIONS): a Jewelcrafting piece's quality step, a dish's XP half again (recipeLaw cookXp), a brew's Potent
 *  chance +10 (alchemyLaw potentChance). */
export const APOTHECARY_OPEN = true;
export function fortMayRaise(id, seat) {
  const w = fortWork(id);
  if (!w) return false;
  if (id === 'apothecary' && !APOTHECARY_OPEN) return false;
  if (w.where === 'gate') return seat?.tier === 'crown' || (seat?.tier === 'palace' && Number(seat?.walls ?? 0) >= 3);
  if (w.where === 'coast') return !!seat?.coastal;
  return true;
}

/** What tier `t` of a work costs in Marks (7.5), or null for no such tier. */
export const fortCost = (id, t) => fortTierRow(id, t)?.marks ?? null;
// ─── THE DROPS (7.5, 9.1, 18) ─────────────────────────────────────────

/** A work's tier after a drop: one less, at least nought. */
export const fortDropped = (t) => Math.max(0, Math.floor(Number(t) || 0) - 1);
/**
 * THE CAPTURE'S DROP (6.8: "the fortifications, each one tier down"; Appendix A: "the Walls drop to tier 0") over a
 * seat's works (`{ [id]: tier }`): each a tier down.
 */
export const fortsAfterCapture = (forts) => Object.fromEntries(Object.entries(forts ?? {}).map(([id, t]) => [id, fortDropped(t)]));
/** A Season's end (9.1): every work a tier down. */
export const fortsAfterSeason = (forts) => Object.fromEntries(Object.entries(forts ?? {}).map(([id, t]) => [id, fortDropped(t)]));

// ─── WHAT A TIER DOES (7.5, "Effect per tier") ────────────────────────

/** The Walls: the defenders' respawn wave 3 s faster a tier, never under 5 s. */
export const WALLS_WAVE_STEP_MS = 3000;
export const WALLS_WAVE_MIN_MS = 5000;
export const defendersWaveMs = (baseMs, walls) => Math.max(WALLS_WAVE_MIN_MS, baseMs - WALLS_WAVE_STEP_MS * Math.max(0, Math.min(3, Number(walls) || 0)));
/** The Gatehouse (6.2): vitality 20,000, +50% a tier; a fighter's blow deals a tenth of its damage to it. */
export const GATEHOUSE = Object.freeze({ vitality: 20000, perTier: 0.5, blowShare: 0.1 });
export const gatehouseVitality = (t) => Math.round(GATEHOUSE.vitality * (1 + GATEHOUSE.perTier * Math.max(0, Math.min(3, Number(t) || 0))));
/** A Ram (6.2): vitality 3,000 (a Siegewright's +50%, Professions-Arc 3.3), 500 every 10 s to the Gatehouse while two
 *  of its side stand within 3 m; one a side at a time; a destroyed Ram is gone. */
export const RAM = Object.freeze({ vitality: 3000, damage: 500, everyMs: 10000, crew: 2, crewM: 3, siegewright: 0.5 });
export const ramVitality = (siegewright = false) => Math.round(RAM.vitality * (siegewright ? 1 + RAM.siegewright : 1));
/** The Watchtowers: the holder told when a challenger passes half its defence (tier 1), a quarter (tier 2). */
export const watchtowerShare = (t) => (t >= 2 ? 0.25 : t === 1 ? 0.5 : null);
/**
 * SEAT2b part two: WHAT THE WATCHTOWERS SEE (7.5) - the challengers whose week at the seat has passed the towers' share
 * of the holder's defence: `standings` each pledged guild's `{ guild, influence }` as the Seat tab shows it (a
 * challenger's risen in Unrest, its Legacy in - the number the Turning sets against the defence), `holder` the holder's
 * guild id, `defence` its defence now, `t` the Watchtowers' tier. Answers `[{ guild, influence, share }]`, the most
 * dangerous first - none without towers, without a defence, or for the holder itself. "Passes" is at or past (a
 * challenger level with the share has passed it). Pure.
 */
export function towersSee(standings, { holder, defence, t }) {
  const share = watchtowerShare(t);
  if (share == null || !(Number(defence) > 0)) return [];
  const line = Number(defence) * share;
  return (standings ?? []).filter((s) => s && s.guild !== holder && Number(s.influence) >= line)
    .map((s) => ({ guild: s.guild, influence: Number(s.influence), share }))
    .sort((a, b) => b.influence - a.influence || (a.guild < b.guild ? -1 : 1));
}
/** The holder's word from its Watchtowers: "The Watchtowers of Anticlere see the Iron Circle <IC> past half our defence." */
export const towersText = (seatName, guildName, share) => `The Watchtowers of ${seatName} see ${guildName} past ${share <= 0.25 ? 'a quarter' : 'half'} of our defense.`;
/** The Barracks: the relay-run town guards that fight for the holder - 2, 4, 6. */
export const barracksGuards = (t) => [0, 2, 4, 6][Math.max(0, Math.min(3, Number(t) || 0))];
/** The Market Hall: the town's boards list a quarter more a tier; the Tithe's cap a point more a tier. */
export const marketHallListings = (base, t) => Math.floor(base * (1 + 0.25 * Math.max(0, Math.min(3, Number(t) || 0))) + 1e-9);
export const marketHallTitheCap = (baseCap, t) => baseCap + Math.max(0, Math.min(3, Number(t) || 0));
/** The Shrine: Standing +1 a week a tier; each gate felled in the region +50 influence a tier to the holder. */
export const SHRINE_GATE_INFLUENCE = 50;
export const shrineStanding = (t) => Math.max(0, Math.min(2, Number(t) || 0));
export const shrineGateInfluence = (t) => SHRINE_GATE_INFLUENCE * shrineStanding(t);
/** The Forge, the Workshop and the Apothecary: a member crafting at the seat in their professions, +1 quality step a
 *  tier (PROF0 9.2's steps). */
export const STATION_PROFESSIONS = Object.freeze({
  forge: Object.freeze(['smithing']),
  workshop: Object.freeze(['carpentry', 'outfitting', 'masonry']),
  apothecary: Object.freeze(['alchemy', 'cooking', 'jewelcrafting']),
});
/** The steps a seat's works give a craft in `profession`, over its works' tiers (`{ [id]: tier }`). */
export function stationSteps(profession, forts) {
  let steps = 0;
  for (const [id, profs] of Object.entries(STATION_PROFESSIONS)) if (profs.includes(profession)) steps += Math.max(0, Number(forts?.[id] ?? 0) || 0);
  return steps;
}
/**
 * AUDIT PROF-541 R2-H1: THE STEPS MY GUILD'S HALL GIVES A CRAFT - `seat` (the town a station stands in, dressed in its
 * holder: world.js seatHere) where my guild (`guild`, the guild book's id) holds it: its works' steps in `profession`
 * (stationSteps), and the seat a craft names (null where no step stands - the service asks the Charter again,
 * professions.js seatStepsFor). One law for every station's line and the craft it sends, by profession.
 */
export function hallStepsFor(seat, guild, profession) {
  const steps = !!guild && seat?.holder?.guild?.id === guild ? stationSteps(profession, seat.forts ?? {}) : 0;
  return { steps, seat: steps > 0 ? seat.key ?? null : null };
}
/** The Harbour: a port for members (the Travel Options' port) at tier 1 or more. */
export const harbourPort = (t) => Number(t) >= 1;
/**
 * SEAT2b part two: WHETHER A TOWN IS COASTAL (7.5: "Harbour (coastal seats only)") - its own map pixel or one of the
 * eight about it water (`isWater(px, py)`, the host's sea test: ui/overworldModel.js isWaterPixel over CLIMATE.PAK's
 * Ocean and WOODS.WLD's sea level), or `port` (a harbour Travel Options or DFU already draws there stands on water).
 * DECIDED: part one asked the port flag alone, and a port is already Travel Options' port - its Harbour gave nothing. A
 * coast is the sea beside the town; the funding client's word, bounded as before (a lie spends the liar's treasury on a
 * harbour no ship can reach).
 */
export function coastalAt(px, py, isWater, port = false) {
  if (port) return true;
  if (!Number.isFinite(px) || !Number.isFinite(py) || typeof isWater !== 'function') return false;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (isWater(px + dx, py + dy)) return true;
  return false;
}
/** How far the map pixels round a town's are asked for the sea: the port law's ring (world/portSites.js - a port town is
 *  one the open sea bears on within it, its places' bearing read off it). FB1020c BERTH-RING: here, beside the coast's
 *  other law, so the berth's and a cargo's port (systems/naval/harbourBoard.js deliveryPort, which the account Worker
 *  bundles) read the one ring without the world's placement code; portSites.js re-exports both. */
export const SEA_RING = 2;
/** Whether the sea bears on a map pixel: a pixel of it (`isSea(x, y)`) within SEA_RING - the ring its bearing is read off
 *  (world/portSites.js seaBearing), so a town it bears on has a seaward edge to stand its places on. Pure. */
export function seaBears(px, py, isSea) {
  if (typeof isSea !== 'function') return false;
  for (let dy = -SEA_RING; dy <= SEA_RING; dy++) for (let dx = -SEA_RING; dx <= SEA_RING; dx++) if (isSea(px + dx, py + dy)) return true;
  return false;
}
/** SEAT2b part two: whether `seat` (the seats' list's - its holder and its works' tiers, `forts`) is a Travel Options port
 *  for a character of guild `guild`: a Harbour standing there and the guild its holder (7.5: "the town is a Travel
 *  Options port for members"). */
export const harbourPortFor = (seat, guild) => !!guild && seat?.holder?.guild?.id === guild && harbourPort(seat?.forts?.harbour ?? 0);

// ─── THE SIEGE CAMP (4.2, 5.2 step 7) ─────────────────────────────────

/** What a Siege Camp costs its guild, once, at the pledge (4.2); a camp that wins no Right of Siege is burnt whole. */
export const CAMP_MARKS = 1500;
/** The Rams a camp that won the Right brings to the siege. */
export const CAMP_RAMS = 3;
/**
 * A CHALLENGER'S SIEGE CAMP AT THE TURNING (4.2): `paid` whether its guild pitched one, `won` whether its guild won the
 * Right there, `gated` whether the seat has a Gatehouse a Ram could strike (Appendix A: "no Ram - a palace has no
 * Gatehouse"). Answers the Rams it brings.
 */
export const campRams = ({ paid = false, won = false, gated = false } = {}) => (paid && won && gated ? CAMP_RAMS : 0);

// ─── THE REVOLT (7.7) ─────────────────────────────────────────────────

/** A seat at Standing 0 revolts at its next siege window: a Rebel Captain (vitality as a siege fighter of Renown 50)
 *  and 12 rebels at the palace door; the holder must fell the Captain inside the window's two hours - fail, and the
 *  Charter lapses; succeed, and Standing returns to 20 (townSeatLaw.js STANDING_CHANGES.revoltTo). */
export const REVOLT = Object.freeze({ captainRenown: 50, rebels: 12, windowMs: 2 * 3600 * 1000 });
/** Whether a seat revolts at its next window: its Standing at nought. */
export const revoltDue = (standing) => Number(standing) <= 0;

// ─── THE WORKS' WORDS (7.9: "the stockpile: every fortification project and what it still needs") ───

/** What a work's tier does, as the Seat tab says it. */
export const FORT_EFFECT_WORDS = Object.freeze({
  walls: (t) => `the defenders' wave ${(WALLS_WAVE_STEP_MS / 1000) * t} s faster`,
  gatehouse: (t) => `its vitality ${gatehouseVitality(t).toLocaleString('en-US')}`,
  watchtowers: (t) => `the holder is warned when a challenger gets past ${t >= 2 ? 'a quarter' : 'half'} of its defense`,
  barracks: (t) => `${barracksGuards(t)} town guards fight for the holder`,
  market: (t) => `the town's boards list ${25 * t}% more, the Tithe's cap ${t} ${t === 1 ? 'point' : 'points'} higher`,
  shrine: (t) => `Standing +${shrineStanding(t)} a week, +${shrineGateInfluence(t)} influence for each gate felled in the region`,
  forge: (t) => `members smithing here ${t === 1 ? 'a quality step' : `${t} quality steps`} better`,
  workshop: (t) => `members' carpentry, outfitting and masonry here ${t === 1 ? 'a quality step' : `${t} quality steps`} better`,
  // AUDIT PROF12 P1: a step each its own - a piece of jewellery's quality (the Forge's law), a dish's XP half again
  // (recipeLaw cookXp), a brew's Potent chance +10 (alchemyLaw POTENT.apothecary)
  apothecary: (t) => `members' jewelry here ${t === 1 ? 'a quality step' : `${t} quality steps`} better, their dishes ${t === 1 ? 'half again' : t === 2 ? 'twice' : `${(2 + t) / 2} times`} the XP, their brews +${10 * t}% Potent chance`,
  harbour: () => 'a port for the holder\'s members',
});
/**
 * A WORK'S LINE on the Seat tab - `w` its row as the service reads it (`{ tier }`): "Walls: tier 1 - the defenders' wave
 * 3 s faster." or "Walls: none raised.", and the Marks of the next tier where one can still be raised.
 */
export function fortWorkLine(id, w, { seatTier = null } = {}) {
  const work = fortWork(id);
  if (!work) return '';
  const t = Math.max(0, Number(w?.tier ?? 0) || 0);
  // AUDIT SEATS-2 L3 (6.2: "a crown's Gatehouse stands from the first"): a crown's stands at tier 0, its vitality said
  const head = t > 0 ? `${work.name}: tier ${t} - ${FORT_EFFECT_WORDS[id](t)}.`
    : id === 'gatehouse' && seatTier === 'crown' ? `${work.name}: standing - ${FORT_EFFECT_WORDS.gatehouse(0)}.` : `${work.name}: none raised.`;
  const next = fortCost(id, t + 1);
  return next == null ? head : `${head} Tier ${t + 1}: ${next.toLocaleString('en-US')} Marks.`;
}
