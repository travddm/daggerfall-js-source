// @ts-check
// Picks, for one race, sex and view, the body-part record that skins each body slot of a Morrowind actor.
//
// Record layout (UESP, Tes3Mod:File Format, BODY): BYDT holds the part (slot), a flags byte (Female = 1,
// NotPlayable = 2) and the MeshType (Skin = 0). BODY ids that end in `1st` name the first-person variant of a
// part. A record is a candidate when it is a playable skin of the wanted race, in a slot the sweep maps.
//
// Records are visited in load order. A record that matches the wanted sex and view exactly always takes the slot,
// so a later plugin overrides an earlier one. A record that only approximates the request is a fallback and may
// take a slot only under the tier rules in `fallbackTier`.

/** The slots whose skin the sweep maps. Head, hair and clavicle are placed by other code. */
export const SKIN_SWEEP_SLOTS = Object.freeze([
  'neck',
  'chest',
  'groin',
  'hand',
  'wrist',
  'forearm',
  'upperarm',
  'foot',
  'ankle',
  'knee',
  'upperleg',
  'tail',
]);

/** Slots that a first-person view may fill from a third-person mesh when no first-person record exists. */
const ARM_SLOTS = new Set(['hand', 'wrist', 'forearm', 'upperarm']);
const SWEEP_SLOT_SET = new Set(SKIN_SWEEP_SLOTS);

/**
 * The fields of a BODY record that the resolution reads.
 * @typedef {object} BodyPartRecord
 * @property {string} id
 * @property {string} slot
 * @property {string} race Lowercase race id from FNAM.
 * @property {boolean} female BYDT flag Female.
 * @property {boolean} skin BYDT MeshType is Skin.
 * @property {boolean} playable BYDT flag NotPlayable is clear.
 * @property {boolean} firstPerson The id marks a first-person mesh.
 */

/**
 * How a record relates to the request.
 * - `exact`: the wanted sex and the wanted view.
 * - `otherSex`: a male record standing in for a female actor, in the wanted view.
 * - `otherView`: the wanted sex, third-person mesh for a first-person view.
 * - `otherBoth`: a male third-person mesh for a female first-person view.
 * @typedef {'exact' | 'otherSex' | 'otherView' | 'otherBoth'} MatchKind
 */

/**
 * @typedef {object} Choice
 * @property {BodyPartRecord} part
 * @property {MatchKind} kind
 * @property {number} tier Higher tiers replace lower ones; a fallback never replaces an exact match.
 */

/**
 * Whether a record is a candidate at all, before sex and view are compared.
 * @param {BodyPartRecord} part
 * @param {string} race
 */
function isCandidate(part, race) {
  return Boolean(part.playable && part.skin && part.race === race && SWEEP_SLOT_SET.has(part.slot));
}

/**
 * Classify a candidate against the request, or return null when it can never be used for it.
 * A male actor never uses female records. A female actor uses male records when no female one exists.
 * A first-person view uses third-person meshes only on the arm slots, which are the ones drawn in view.
 * @param {BodyPartRecord} part
 * @param {boolean} female
 * @param {boolean} firstPerson
 * @returns {MatchKind | null}
 */
function classify(part, female, firstPerson) {
  if (!female && part.female) return null;
  const sameSex = part.female === female;
  const sameView = part.firstPerson === firstPerson;
  if (sameSex && sameView) return 'exact';
  if (sameView) return 'otherSex';
  if (!firstPerson || !ARM_SLOTS.has(part.slot)) return null;
  return sameSex ? 'otherView' : 'otherBoth';
}

/**
 * The tier of a fallback. A female first-person arm has three kinds: the female third-person mesh and the male
 * first-person mesh rank equally (the later one of a different kind wins), and the male third-person mesh ranks below
 * both. Every other request has at most one fallback kind in play.
 * @param {MatchKind} kind
 * @param {BodyPartRecord} part
 * @param {boolean} female
 */
function fallbackTier(kind, part, female) {
  if (kind === 'exact') return 3;
  const femaleArmView = female && ARM_SLOTS.has(part.slot);
  if (!femaleArmView) return 1;
  return kind === 'otherBoth' ? 1 : 2;
}

/**
 * Whether a candidate takes a slot that already holds `current`.
 * @param {Choice | undefined} current
 * @param {Choice} next
 */
function replaces(current, next) {
  if (!current || next.kind === 'exact') return true;
  if (next.tier !== current.tier) return next.tier > current.tier;
  return next.tier === 2 && next.kind !== current.kind;
}

/**
 * Choose the body part that skins each slot.
 * @param {BodyPartRecord[] | null | undefined} parts BODY records in load order.
 * @param {string | undefined} race Race id, any case.
 * @param {unknown} female
 * @param {{ firstPerson?: unknown }} [options] `firstPerson` selects the first-person meshes.
 * @returns {Map<string, BodyPartRecord>} Slot to record, in the order the slots were first filled.
 */
export function resolveBodyParts(parts, race, female, { firstPerson = false } = {}) {
  const wantedRace = String(race || '').toLowerCase();
  const wantFemale = Boolean(female);
  const wantFirstPerson = Boolean(firstPerson);
  /** @type {Map<string, Choice>} */
  const chosen = new Map();
  for (const part of parts || []) {
    if (!isCandidate(part, wantedRace)) continue;
    const kind = classify(part, wantFemale, wantFirstPerson);
    if (!kind) continue;
    const next = { part, kind, tier: fallbackTier(kind, part, wantFemale) };
    if (replaces(chosen.get(part.slot), next)) chosen.set(part.slot, next);
  }
  return new Map([...chosen].map(([slot, choice]) => [slot, choice.part]));
}

/** The werewolf's head and hair: the BODY records `WerewolfHead` and `WerewolfHair`, looked up by id and nothing
 *  else (no race, sex, part or flag test; the actor's own head and hair are ignored), the last .esm to carry one
 *  winning (the load order). Third person only. Every other slot is empty for a werewolf, and the body is the
 *  robe's (mwItemMap composeWornArmor, a `record` piece). */
export const WEREWOLF_HEAD_ID = 'werewolfhead';
export const WEREWOLF_HAIR_ID = 'werewolfhair';
export function werewolfHeadRows(parts) {
  const lastRecordWithId = (wantedId) =>
    (parts ?? []).filter((part) => String(part.id || '').toLowerCase() === wantedId).at(-1) ?? null;
  return [
    { slot: 'head', record: lastRecordWithId(WEREWOLF_HEAD_ID) },
    { slot: 'hair', record: lastRecordWithId(WEREWOLF_HAIR_ID) },
  ];
}

/** The vampire's head: the BODY record that is a vampire's, a skin and a head, of the sex and the race (ignoring
 *  case), the last in load order of those. NotPlayable is no bar (Morrowind's vampire heads are never offered at
 *  chargen). Null when the race has none. */
export function vampireHeadRecord(parts, race, female) {
  const raceId = String(race || '').toLowerCase();
  const vampireHeads = (parts ?? []).filter(
    (part) =>
      part.vampire && part.skin && part.slot === 'head' && !part.firstPerson && part.female === !!female && part.race === raceId,
  );
  return vampireHeads.at(-1) ?? null;
}
