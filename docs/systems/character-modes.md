# Character modes

> Leaves core: a first-party Character Modes mod with its own permadeath, which supports Project Legacy when it is
> present and does not depend on it (decision 117 (18)).

A new character picks one of five modes at creation: Classic, Hardcore, Legacy, Ironman or Hardcore Ironman. Classic
is Daggerfall Unity's (DFU) rule. This is a departure from DFU, made for online play. The full design, with the rules
each mode is to enforce, is in `dfo-plans/future-work/character-modes/character-modes-design.md`.

## Not enforced yet

Online play does not enforce Hardcore or Ironman yet. Nothing reads the `permadeath` or `ironman` predicates: a
Hardcore death online is not final, and an Ironman character can trade and join parties. The official profile still
offers both modes online. Decision 116 (1) hides them online until their enforcement lands; open draft PR #142 does
that. Offline, a mode is stored on the character and changes nothing.

## What the code does

| Part | What it does | Where |
| --- | --- | --- |
| The law | The five modes in picker order, `DEFAULT_MODE` (`classic`), the token codes 0 to 4, the predicates `permadeath`, `ironman` and `legacy`, and `canDrop` and `dropsFrom` (a mode is loosened, never tightened; Legacy is neither gained nor dropped). Pure: the relay may bundle it. | `src/net/modeLaw.js` |
| Settings | The `character-modes` mod: `Enabled` (off is DFU: no question, every character Classic) and `Modes.Hardcore`, `Modes.Ironman`, `Modes.HardcoreIronman`. The Legacy mode is offered when Project Legacy's `Enabled` is on. | `src/systems/characterModesSettings.js`, `src/systems/characterModes.js` (`characterModesOn`, `offeredModes`) |
| The picker | The question screen: one card per offered mode, Classic first and marked Recommended. | `src/ui/characterModeChoice.js` (`characterModeScreen`) |
| Chargen | After the wizard, `withChargenQuestions` asks the mode when `characterModesOn()` is true, then the Project Legacy model question for the Legacy mode only. Every other mode answers the model question with no lineage. | `src/systems/chargenSession.js` |
| Save | The answer is saved as `characterMode` on the player entity. | `src/systems/save/save.js` |
| Account service | `createRealm` stores the mode in the `mode` column of `realm_characters`. `createRefusal` refuses `mode` (no such mode, or a Legacy mode without a line, or a line without the Legacy mode) and `mode-off` (a mode the server does not offer). | `server-account/src/realm.js`, `server-account/migrations/0004_character_modes.sql` |
| Server offer | `MODES_OFFERED` is a comma-separated list of offered modes; empty offers all five. Classic is always offered. | `server-account/wrangler.toml`, `modeLaw.js` (`offeredFromList`, `creatableModes`) |
| Token | `realmMintFacts` signs `md`, the mode's code, for every mode but Classic. The token validator accepts `md` only beside a realm character (`modeClaimsOk`). No relay code reads `md` yet. | `server-account/src/realm.js`, `src/net/identityToken.js` |
| Online pins | The official profile pins `character-modes` on with every mode offered, and pins Project Legacy's `Enabled`. | `src/net/profile/officialProfile.ts` |

The picker's card text promises more than the code does: "Online a death is final", a "Hall of the Fallen" and an
Ironman badge. None of these is built. No code path changes a character's mode after creation, although `canDrop`
states which changes would be allowed.

## Tests

- `test/net/modeLaw.test.js`: the law.
- `test/net/charactermodes_storage.test.js`: the column, the token claim and the create refusals.
- `test/ui/charactermodechoice.test.js`: the picker.
