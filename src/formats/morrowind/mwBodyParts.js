// @ts-check
// Body-part resolution for the Morrowind layer: which BODY record fills each slot of an actor of a race and sex.

/** MW-D32: sBodyPartMap's slot list (npcanimation.cpp:1187-1197) - the
 *  mesh parts the skin sweep maps to visible slots. NO head, NO hair
 *  (those come off the actor's own record - the chargen face law), NO
 *  clavicle (deliberately never mapped to any PRT slot). */
export const SKIN_SWEEP_SLOTS = Object.freeze([
  'neck', 'chest', 'groin', 'hand', 'wrist', 'forearm', 'upperarm',
  'foot', 'ankle', 'knee', 'upperleg', 'tail',
]);

const ARM_SLOT_SET = new Set(['hand', 'wrist', 'forearm', 'upperarm']);

/**
 * MW-D32: GETBODYPARTS, WHOLE (npcanimation.cpp:1167-1297). One record
 * sweep in LOAD ORDER over the sBodyPartMap slots, with the reference's
 * exact ladder:
 *  - BPF_NotPlayable skipped, MT_Skin only, race matched - and NO
 *    vampire filter: the sweep never had one (vampire heads live on the
 *    actor's own record path, and head/hair are not in the map at all)
 *  - a first-person HAND slot missing its .1st record falls back to
 *    third-person skins (:1232-1254): same gender fills, same gender
 *    upgrades an other-gender fallback, male fills for a female
 *  - every other slot takes parts of ITS view only (:1258)
 *  - male parts fall back for females: fill when empty, and a male
 *    .1st upgrades a 3P hand fallback (:1261-1280)
 *  - a PROPER match (right view, right gender) OVERWRITES - the LAST
 *    record in load order wins (:1286-1293), which is how an expansion
 *    overrides a base-game body
 * @returns {Map} slot -> chosen record (absent: no record for the slot)
 */
export function resolveBodyParts(parts, race, female, { firstPerson = false } = {}) {
  const want = String(race || '').toLowerCase();
  const isF = !!female;
  const out = new Map();
  for (const p of parts ?? []) {
    if (!p.playable || !p.skin) continue;
    if (p.race !== want) continue;
    const slot = p.slot;
    if (!SKIN_SWEEP_SLOTS.includes(slot)) continue;
    const isHand = ARM_SLOT_SET.has(slot);
    const sameGender = !!p.female === isF;
    if (firstPerson && isHand && !p.firstPerson) {
      const cur = out.get(slot);
      if (!cur && sameGender) out.set(slot, p);
      else if (cur && sameGender && !!cur.female !== isF) out.set(slot, p);
      else if (!cur && isF) out.set(slot, p);
      continue;
    }
    if (!!p.firstPerson !== !!firstPerson) continue;
    if (isF && !p.female) {
      const cur = out.get(slot);
      if (!cur) out.set(slot, p);
      else if (isHand && !cur.firstPerson && p.firstPerson) out.set(slot, p);
      continue;
    }
    if (isF !== !!p.female) continue;
    out.set(slot, p);   // proper match: LAST in load order wins
  }
  return out;
}
