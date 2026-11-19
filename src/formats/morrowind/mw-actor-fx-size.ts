// How large a spell effect is drawn on an actor that is not a person, and how far it sits from the actor's feet.
// Nothing here touches GL or reads a file.
//
// Morrowind's effect meshes (the VFX_ casting and hit visuals) are modelled around a person: about 128 units tall,
// and 64 units from the feet to the middle of the body. This module sets the rule for other bodies: one that reaches
// further than a person is drawn with a larger effect, in proportion, and one that is short or squat has the effect
// set lower than a person's. mwSpellFx.js re-exports it, and scenes/mwMagicFx.js applies the answer to the effect's placement.

/** The height of the person that the effect meshes are modelled around, in Morrowind units. */
export const PERSON_HEIGHT_UNITS = 128;

/** The reach of that person: half the height, in Morrowind units. A body whose reach is no larger takes no scale. */
export const PERSON_REACH_UNITS = PERSON_HEIGHT_UNITS / 2;

/** The scale and the vertical offset (Morrowind units) of an effect on a body. */
export interface ActorFxTransform {
  /** One or more: a body smaller than a person does not shrink the effect. */
  scale: number;
  /** Added to the feet's height, times the scale; zero or negative. */
  offset: number;
}

/**
 * The transform of an effect on a body `height` tall and `radius` round, both in metres, with `unitsPerMetre`
 * Morrowind units to the metre.
 *
 * The reach of the body is the greatest of its width, its depth (each twice the radius) and half its height. The
 * scale is the reach over a person's reach when that is above one, and one otherwise.
 *
 * The offset is zero for a tall, narrow body. A body shorter than a person sinks the effect by the shortfall
 * (`height - 128`). A body at least as tall as a person but less than twice as tall as it is wide * sinks it by the excess (`128 - height`). The offset then takes the scale, as the effect hangs from the scaled mesh.
 */
export function actorFxTransform(height: number, radius: number, unitsPerMetre: number): ActorFxTransform {
  const heightUnits = height * unitsPerMetre;
  const widthUnits = 2 * radius * unitsPerMetre;
  const ratio = Math.max(widthUnits, heightUnits / 2) / PERSON_REACH_UNITS;
  let offset = 0;
  if (heightUnits < PERSON_HEIGHT_UNITS) {
    offset = heightUnits - PERSON_HEIGHT_UNITS;
  } else if (heightUnits < widthUnits + widthUnits) {
    offset = PERSON_HEIGHT_UNITS - heightUnits;
  }
  return { scale: ratio > 1 ? ratio : 1, offset: offset * ratio };
}
