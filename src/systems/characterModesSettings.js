// @ts-check
// CHARACTER MODES (docs/systems/character-modes.md): the departure from DFU's one death rule. `Enabled` off is Daggerfall
// Unity: no question at creation, every character Classic. `Modes.*` say which of the other modes a new character may
// pick; the Legacy mode is Project Legacy's own `Enabled`. Online the room pins every key (systems/online/onlineLane.js),
// and the account service refuses a mode its profile does not offer (`MODES_OFFERED`, server-account/src/realm.js).
export const CHARACTER_MODES_SETTINGS = Object.freeze({
  title: 'Character Modes',
  author: 'Daggerfall Online',
  keys: Object.freeze({
    Enabled: Object.freeze({
      default: true,
      description:
        'Choose a mode when you create a character: Classic, Hardcore, Legacy, Ironman or Hardcore Ironman. Off is Daggerfall Unity: every character plays Classic.',
    }),
    'Modes.Hardcore': Object.freeze({ default: true, description: 'Offer Hardcore: online, a death is final.' }),
    'Modes.Ironman': Object.freeze({
      default: true,
      description: 'Offer Ironman: no trading with players, no parties, no shared dungeons.',
    }),
    'Modes.Hardcore Ironman': Object.freeze({
      default: true,
      description: 'Offer Hardcore Ironman: Hardcore and Ironman together.',
    }),
  }),
});
