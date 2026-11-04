# Character modes

Status: decided, 2026-11-03 (owner decision 23g and its follow-up answers). Not yet built: the PR plan in section 8
lists the order. Companion to the simulation-core note: the relay checks or decides on messages and never simulates a
room per frame. Paths are relative to the repository root.

## Summary

- The player picks one of five modes when creating a character: Classic (default), Hardcore, Legacy, Ironman,
  Hardcore Ironman. The picker lists the pros and cons of each.
- Two independent switches make the five modes: **how death works** (Classic rule, permadeath, or Project Legacy's
  families) and **Ironman** (no player-to-player trade, no groups). Hardcore Ironman is permadeath plus Ironman.
- Most of the machinery exists. Permadeath is Project Legacy's Bloodline tombstone (`realmDie`, `dead_at`) fired on
  every online death. Trade restrictions fit beside `holdRefusal`, which every value-moving route already asks. The
  mode travels to the relay in the signed identity token, as Bloodline's `hb` flag does.
- The one hard problem is **who decides a Hardcore death**. Today the client's death door calls `/v1/realm/die`; a
  client that disconnects at 1 HP escapes and rejoins from its last checkpoint. The owner decided to trust the client
  until the simulation core lets the relay compute player health (sim-core step 7); the relay still signs a death
  receipt for deaths it sees. Until then Hardcore relies on honesty against a modified client (section 4).
- Mode is stored once, at creation, in the new column `realm_characters.mode` (migration `0004`), in the save as
  `characterMode`, and in the token as `md`. A mode can only be loosened (Ironman to Classic, Hardcore to Classic while
  alive), never tightened, and a dead character stays dead.
- Eight PRs, in section 8. The first two (law, storage) change nothing players can feel; the creation picker, the
  restrictions and the permadeath gate follow.

## 1. What exists today

### 1.1 Death

| Where                           | What happens                                                                                                                                            | Source                                                                                                                                                                                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Offline, no Project Legacy rise | The DFU sequence: input paused, camera sinks, fade, 3 s later the title menu. No gold is taken.                                                         | `src/systems/playerDeath.js` (`DEATH_TIME_BEFORE_RESET = 3`, cites DFU `Assets/Scripts/Game/PlayerDeath.cs:33-93`); `src/scenes/shared.js` `endRunToTitleMenu`; `src/systems/deathPenalty.js` header ("A death with no rise ... still takes nothing") |
| Online                          | Same sequence, then the player wakes at the nearest temple, town or graveyard (or the dungeon door) with part health. The purse loses a tenth.          | `src/systems/deathRespawn.js` (header: "an ORIGINAL addition, not a DFU or classic system"); `src/systems/deathPenalty.js` `DEATH_GOLD_DIVISOR = 10`, "There is no switch"                                                                            |
| Offline with Project Legacy on  | An Enduring member "rises": respawn, a toll of years, and the same tenth of gold (BAL4). A Bloodline member falls for good.                             | `src/scenes/legacyHost.js` `onDeath` (:533), `writeDeath`; `src/ui/deathScreen.js` `rises` (:132-135)                                                                                                                                                 |
| Remains                         | Only Project Legacy leaves remains, a lootable body the heir can claim. Open-world "fallen player's own remains" went with open-world PvP (decision 3). | `src/scenes/legacyRemainsStand.js`; `server-account/migrations/0003_drop_wild_sea_pvp.sql`                                                                                                                                                            |
| Resurrect                       | A party Resurrect inside `REZ_HOLD_S = 150` s takes a held Bloodline death back (realm: `realmRaise`).                                                  | `src/systems/legacy/revived.js:"export const REZ_HOLD_S "`; `server-account/src/legacy.js:"export async function realmR"`                                                                                                                             |
| The Endurance floor             | An online-only layer on `maxHealth`, never saved, applied to every online character. It does not depend on the mode.                                    | `docs/systems/characters.md` ("plus online-only layers (the Endurance floor and the Firmament's Health ...)"); `src/systems/chargen.js:"export function defineLiveMaxH"` `defineLiveMaxHealth`                                                        |
| The Firmament                   | A passive tree owned by the account service per character. Not tied to death.                                                                           | `server-account/src/firmament.js`; `docs/systems/characters.md` (Firmament section)                                                                                                                                                                   |
| PvP falls                       | Not a character death. Siege fighters have a relay-side `down`/`upAt` state; arena bouts take vitality from the token's `cl`; a duel loss is a report.  | `src/net/siege/siegeRef.js:"return { lv: Math.max(1,"`; `src/net/identityToken.js` (`cl`: "never a health the client claims"); `server-account/src/service.js` `/v1/duel/loss`                                                                        |
| Abyss (Super Dungeon)           | Its own death law: the hub keeps one life and one win per account per Hollow across copies.                                                             | `server/src/sdCopy.js` header, `sdAcctKey` (`sdac:<sub>`)                                                                                                                                                                                             |

### 1.2 Project Legacy

- Mod `project-legacy`, setting `Enabled` **default true**, and `Legacy.Model` default 0 (Enduring)
  (`src/systems/modSettings.js:"'project-legacy': Object"`). Together they make every character a family founder whose
  offline death
  is a toll-and-rise. This is the "default-on rise" decision 23g replaces.
- A family has one of two models, fixed at founding: `bloodline` (each death final, an heir plays on) or `enduring`
  (a death costs years, Arkay's toll, until the span is spent)
  (`src/systems/legacy/family.js:"export const MODELS = Ob"`).
- Chargen asks the model question when Legacy is on (`src/systems/chargenSession.js:"if (legacyOn()) asks.pus"`,
  `legacyModelScreen`); the
  answer is saved as `entity.legacyChoice` (a model, or `none`) (`src/systems/save/save.js:"'legacyChoice',"`).
- Online, the line lives in `lineages` (`server-account/migrations/0001_schema.sql:"CREATE TABLE lineages ("`), written
  by
  `putLineage`; a realm character is born as a person of a line (`createRealm` with `lineage`/`person`,
  `server-account/src/realm.js:"export async function cre"`). Row columns `lineage_id`, `person_id`.
- **The tombstone is the permadeath mechanism already.** `realmDie` -> `entomb` stamps `realm_characters.dead_at`
  under the playing tab's lease. From then `joinRealm` returns `dead`, `deleteRealm` refuses, checkpoints and trades
  are refused, and the roster slot is freed (`REALM_CHARACTERS_MAX = 6` counts the living)
  (`server-account/src/legacy.js:"export async function realmD"`, `realm.js:"export async function jo"`,
  `realm.js:"export async function de"`). `afterTomb` ends the character's
  wedding, frees its item claims (`releaseSteps`), and hands on its guild seat (`legacy.js:"async function afterTomb"`).
- A held fall: the stamp is made at once, the lease kept aside as `rez_lease` for a Resurrect, and `settleHolds`
  (cron, `legacy.js:"export async function se"`) closes the window.
- The token already carries Bloodline: `hn hc hb hg` (`src/net/identityToken.js:"*   hn hc hb hg  that re"`).

### 1.3 Trading and value-moving paths

All account-side paths move goods on **realm records** (the character's last checkpoint) in one batch, and all ask the
judge's hold first: `holdRefusal(row)` -> `trade-held` or `record-unjudged`
(`server-account/src/realm.js:"export function holdRefu"`; its
comment lists the callers: "a market listing or purchase, a trade's half, a guild's vault or treasury, a rent, a card
table's stake, a disenchant whose Essence the market sells").

| Path                                              | Route or frame                                                                                         | Source                                                                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Player trade                                      | relay `trade` frame, then settle by two halves                                                         | `server/src/index.js:"if (m.t === 'trade') {"`; `server-account/src/realmTrade.js`; `src/net/realm/realmTradeLaw.js` |
| Market (listings, buy orders, auctions, couriers) | `/v1/market/*`                                                                                         | `server-account/src/market.js`; `src/net/marketLaw.js`                                                               |
| Guild vault, treasury, Marks deposit              | `/v1/guilds/vault/*`, `/v1/marks/guild/deposit`, `/withdraw`                                           | `server-account/src/guildVault.js`; `service.js:"// GUILD2: a new name fo"`                                          |
| Guild writs, commissions, craft writs             | `/v1/writs/supply`, `/commission`, `/craft`                                                            | `server-account/src/craftWrits.js`; `service.js` PROF6 block                                                         |
| Mail with items, server post                      | `/v1/mail/send` (items), `/v1/post/claim` (developers' pieces), `/v1/post/lost` (your own lost spoils) | `server-account/src/letters.js`, `post.js`, `lostSpoils.js`                                                          |
| Homes: transfer, room rent                        | `/v1/homes/transfer`, `/v1/homes/rooms/rent`                                                           | `server-account/src/homeTransfer.js`, `rent.js`                                                                      |
| Seat gifts, fort funding                          | `/v1/seats/give`, `/v1/seats/fort/fund`                                                                | `server-account/src/seatGifts.js`, `seatForts.js`                                                                    |
| Professions stores                                | `/v1/stores/withdraw` (own record, not a player path)                                                  | `server-account/src/professions.js`                                                                                  |
| The Broker                                        | Account shop for insignia and auras; not between players                                               | `server-account/src/brokerSales.js`, `accounts.js` `buyInsignia`                                                     |
| Dropped or looted piles                           | Check in PR 5: `src/net/bodyLoot.js` (what a peer may take from a body)                                | `src/net/bodyLoot.js`                                                                                                |

### 1.4 Group content

| Content                     | How a group forms                                                                                                                             | Source                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Parties                     | Hub party records; `partyHoldsOwner`, `_instanceKinOf` ask kinship                                                                            | `src/net/instanceRoom.js`; `server/src/index.js:"async _instanceKinOf(sub"`          |
| Private instances           | Key carries the owner's digest; only the owner's party is admitted                                                                            | `docs/multiplayer/group-instances.md` (Private instances); `src/net/instanceRoom.js` |
| The Abyss                   | Copy rooms `sd:<slot>.<owner>`; a public copy admits anyone to a seat cap, a party copy admits the owner, the party and staff (`sdCopyRight`) | `server/src/sdCopy.js`; `src/net/superDungeon/sdLaw.js`                              |
| Gates                       | Shared brain on the relay, receipts claimed at `/v1/gate/claim`                                                                               | `src/net/gate/`; `docs/multiplayer/group-instances.md` (Receipts)                    |
| Arena                       | Lobby, bouts, private bouts, exhibitions; PvE tiers and PvP ladder; ticket then claim                                                         | `src/net/arena/arenaLaw.js`; `server-account/src/arena.js`                           |
| Duels                       | Consensual, near each other, relay referee                                                                                                    | `src/net/duel/duelSession.js`                                                        |
| Sieges, Royal Tourney       | Guild-signed sides, relay referee, receipts                                                                                                   | `src/net/siege/`; `server-account/src/seatSiege.js`, `seatRoyal.js`                  |
| Raids, serpent, naval crews | Shared sea and raid rooms                                                                                                                     | `src/net/raid/`, `src/net/serpent/`, `server-account/src/crewSigns.js`               |

Rooms are client-hosted: the relay names one socket the host, and that client runs the room's foes. The relay referees
PvP and signs receipts (`docs/multiplayer/group-instances.md`, "A client hosts, the relay referees").

### 1.5 Where a mode can live

| Place           | Today                                                                                                                                                                                                                                                                                                                                                                                                       | Precedent                            |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| The save        | Character fields are listed in `src/systems/save/save.js`; `legacyChoice` is "asked ONCE, at chargen, and the character's own" (:101-104).                                                                                                                                                                                                                                                                  | `legacyChoice`                       |
| Account service | One `realm_characters` row per online character (`server-account/migrations/0001_schema.sql:"CREATE TABLE realm_chara"`); `saves` rows for offline cloud saves, keyed by `character_id` (`server-account/migrations/0001_schema.sql:"CREATE TABLE saves ("`). Online characters are born online: `firstSaveRefusal` requires `REALM_BIRTH_LEVEL` and a small purse (`realm.js:"export function firstSav"`). | `lineage_id`, `person_id`, `dead_at` |
| The relay       | Trusts only the signed identity token: `rc` (realm character), `ci` (its id), `cl` (judged level), `wa` (arms), `hb` (Bloodline) (`src/net/identityToken.js:"*   mu muted until, epoc"`). `realmMintFacts` reads the row at mint (`realm.js:"export async function realmM"`). TTL ceiling 300 s.                                                                                                            | `hb`, `cl`                           |

## 2. The modes

Two switches, stored as one value `mode`: `death` in {classic, hardcore, legacy} and `ironman` in {false, true}. The
five picker entries are: classic = (classic, no); hardcore = (hardcore, no); legacy = (legacy, no); ironman = (classic,
yes); hardcore_ironman = (hardcore, yes). Legacy plus Ironman is not offered (a family is a social structure, and the
owner's list has no such entry). The law module exposes the predicates `permadeath(mode)`, `ironman(mode)`,
`legacy(mode)`.

### 2.1 Rules by mode

|                                                   | Classic                                                                 | Hardcore                                                                                              | Legacy                                                                               | Ironman                 | Hardcore Ironman     |
| ------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------- | -------------------- |
| **Death, offline**                                | DFU: title menu after 3 s; load a save. No gold loss.                   | run ends; the character's saves are marked fallen and cannot be loaded (client-enforced, honest only) | Project Legacy: Enduring rises with a toll; Bloodline falls, heir plays on           | as Classic              | as Hardcore          |
| **Death, online**                                 | Respawn at a safe place; purse loses a tenth; Endurance floor unchanged | Permadeath: the tombstone is stamped; the character is gone with its items and gold                   | Enduring: rise, toll, tenth. Bloodline: tombstone, heir, estate share (existing law) | as Classic              | as Hardcore          |
| **Resurrect by a party**                          | Not needed                                                              | Yes, inside `REZ_HOLD_S` (existing hold window)                                                       | Existing (Bloodline hold)                                                            | Not possible (no party) | Not possible         |
| **PvP falls** (arena, duel, siege, Royal Tourney) | No death (existing)                                                     | no death (existing treatment)                                                                         | existing                                                                             | arena and duels only    | arena and duels only |
| **Trading with players**                          | Allowed                                                                 | Allowed                                                                                               | Allowed                                                                              | Barred (3.1)            | Barred               |
| **Grouping**                                      | Allowed                                                                 | Allowed                                                                                               | Allowed                                                                              | Barred (3.2)            | Barred               |
| **Rewards**                                       | Normal                                                                  | Normal: no extra power or gold; a mode badge and a Hall of the Fallen entry                           | Normal                                                                               | Normal: a badge         | Normal: a badge      |
| **Leaderboards**                                  | Own board                                                               | Own board                                                                                             | Own board                                                                            | Own board               | Own board            |

Rewards policy (decision 10): a mode never changes the numbers a character earns. The Port Doctrine's tamed power curve
(decision 30) stays whole; a mode adds only a badge and, on survival milestones, a title (cosmetic). Reason: any
bonus makes the harder modes mandatory and the tuned curve false.

### 2.2 Per content type

| Content                                                 | Classic                                | Hardcore                                   | Legacy         | Ironman                                                                              | Hardcore Ironman   |
| ------------------------------------------------------- | -------------------------------------- | ------------------------------------------ | -------------- | ------------------------------------------------------------------------------------ | ------------------ |
| Town, wilderness, dungeon, naval PvE (client-simulated) | normal                                 | death is final                             | Project Legacy | normal, solo                                                                         | final, solo        |
| Private instance                                        | normal                                 | final                                      | PL             | owner alone (no party to admit)                                                      | final, alone       |
| Abyss (Super Dungeon)                                   | normal; one life per Hollow (existing) | final **and** the Hollow's one life        | PL             | only a solo copy that admits nobody else (`sdCopyRight` returns false for non-owner) | as Ironman; final  |
| Gates                                                   | normal                                 | final                                      | PL             | a solo copy of the gate (PR 5)                                                       | a solo copy; final |
| Arena PvE                                               | normal                                 | a PvE bout fall is the bout's, not a death | normal         | allowed, solo bouts only                                                             | as Ironman         |
| Arena PvP, duel                                         | normal                                 | no death on a fall                         | normal         | allowed (one-on-one, no group, no trade)                                             | allowed, no death  |
| Siege, Royal Tourney                                    | normal                                 | the siege fall is `down`, not death        | normal         | barred (guild-signed team content)                                                   | barred             |
| Raids, serpent, naval crews                             | normal                                 | final                                      | PL             | barred (shared rooms)                                                                | barred             |
| Guilds                                                  | normal                                 | normal                                     | normal         | may be a member (chat, rank, halls); vault, treasury, writs and gifts barred         | same               |

The Hardcore siege answer, stated directly: a Hardcore character who loses a siege or an Arena bout goes `down` and
returns (the referee's existing state). It does not die. Reason: the referee models vitality from the token's judged
level, not from the character's real health, so these falls are results and not deaths; making them lethal would put
Hardcore characters out of all PvP and would need a second health model on the relay.

### 2.3 Hardcore death details

- Items and gold die with the character. There is no estate and no remains. The account keeps what it already owns
  apart from the character: Marks, titles and glyphs, the account-level homes (`ACCOUNT-HOMES`), and the Renown
  track's record. Guild seat is handed on, wedding ends, claims are freed (`afterTomb`, unchanged).
- The row stays, with `dead_at` and `dead_why = 'fell'`, and appears in a Hall of the Fallen (name, class, level,
  place, time, killer when known). The slot is freed.
- The existing party Resurrect window applies (150 s).
- Staff may take a death back through the existing operator revival (`realm-revive.yml`, D1 Time Travel;
  `docs/multiplayer/account-service.md:148`; `revived.js` `takeBack`) for a verified bug only. Section 4.4.

### 2.4 Ironman details

Trade barred (3.1): every player-to-player path in 1.3. Allowed: the Broker, NPC shops, own Stores, own Home, banks,
`/v1/post/claim` (developers' pieces), `/v1/post/lost` (own lost spoils), plain text chat and mail without items.
Grouping barred (3.2). Beneficial spells from other players have no effect on an Ironman character, and an Ironman
character's beneficial spells have none on others (a gift is a trade by another name).

## 3. Ironman enforcement

### 3.1 Trading

- **Relay:** the `trade` arm (`server/src/index.js:"if (m.t === 'trade') {"`) drops the frame when the sender's token or
  the target's token
  carries Ironman (`md`), as it drops a frame to a peer that is gone: no junk strike, the sender's session times out.
- **Account service:** one function `modeRefusal(row, other?)` beside `holdRefusal`
  (`realm.js:"export function holdRefu"`), called wherever
  `holdRefusal` is called and in the mail-with-items, homes transfer, rent and seat-gift routes. It answers
  `{ error: 'ironman' }`. For a two-party act (trade half, market purchase, courier, rent) either side being Ironman
  refuses. The check reads `realm_characters.mode`, never a client field.
- **Market:** an Ironman character cannot list, bid, buy or fill. The Market tab reads `mode` and shows why.
- A test per route lists every route in `service.js` that moves value and fails if one neither asks `holdRefusal` nor
  `modeRefusal` nor appears in an allowlist with a reason. This keeps a later route from bypassing the mode.

### 3.2 Grouping

- **Parties:** the hub refuses to create, join or invite for an Ironman token. `partyHoldsOwner`/`_instanceKinOf`
  then never find kin for an Ironman account, so private instances admit the owner alone with no new code
  (`src/net/instanceRoom.js`, `server/src/index.js:"async _instanceKinOf(sub"`).
- **Abyss copies:** `sdCopyRight` (`server/src/sdCopy.js`) admits an Ironman owner alone and refuses an Ironman
  character entering another's copy.
- **Raids, serpent, sieges, Royal Tourney, crew signs:** entry checks refuse an Ironman token (`md`), at the Worker as
  they
  refuse a closed room today (`gateHolds`, `sdLiveAsk`). Gate rooms are shared, so an Ironman character enters a solo
  copy of the gate, as it does in the Abyss (decided; new content).
- **Peer effects:** peers' beneficial acts on an Ironman character are dropped at the receiver and by the relay where
  the act is routed; the exact `act` routing needs a read in PR 5.
- Chat stays open; loneliness is not a goal.

## 4. Enforcement of permadeath online

### 4.1 The gap

`realmDie` is called by the client's own death door (`legacyHost.onDeath` -> `writeDeath({ hold })`,
`legacyHost.js:"function onDeath() {"`, route `/v1/realm/die`,
`server-account/src/index.js:"if (path === '/v1/realm/d"`). The service checks only the
lease. So the client decides. The header's claim that "a tab killed under its death screen escapes nothing"
covers a tab that reached the door; it does not cover a client that closes the socket at 1 HP and rejoins from its
last checkpoint (at most the 2-minute checkpoint interval old). That is cheap for any player and trivial for a
modified client. For Bloodline this was an acceptable gap; for Hardcore it is the whole mode.

What the relay can see today: `pose` and `own` frames, the host's `foes` frames, hit frames routed to the host, and
the join and leave of each socket. PvE damage to a player is applied by the client, so the relay does not see a
player's health (the token comment: "never a health the client claims"). The simulation-core note gives the way
forward: tier 2, "server checks", and a relay that re-runs the core on a message (steps 6 and 7).

### 4.2 Who decides a Hardcore death

Decided, in two layers (plus the target state). Neither needs a relay tick.

1. **The client reports; the service stamps.** Unchanged, and still the common path: the death door calls
   `/v1/realm/die`. For a Hardcore character the call also carries the relay's receipt (layer 2) when one exists.
2. **A relay death receipt.** Add a `died` frame to the room socket: the client sends it as the death sequence
   begins, before the death screen. The relay stamps the verified account and `ci`, signs a receipt with
   `GATE_SIGNING_KEY` (the receipt pattern of `src/net/gate/gateReceipt.js`, new file `src/net/mode/deathReceipt.js`),
   returns it to the client, and posts it to the service through a relay-to-service door of the `/v1/mod/grant-feed`
   kind (signature-proven, `service.js` lists `/v1/mod/grant-feed`). The service stamps `dead_at` from either the
   client's `/v1/realm/die` or the relay's feed, whichever comes first; the other is idempotent (`realmDie` already
   is). Value: the death is recorded even if the client dies with its tab before it can call the service.
3. **No combat-logout rule (decided).** Until the simulation core lets the relay track player health (sim-core
   step 7), the relay cannot tell a death from a disconnect, and the owner chose to trust the client. Until then
   **Hardcore relies on honesty against a modified client**: a player who closes the socket at 1 HP and rejoins from
   the last checkpoint escapes the death. The relay-signed receipt (layer 2) covers deaths the relay sees; it does not
   cover a client that never reports. No ghost body and no combat tag are built.
4. **The target state (sim-core step 7).** When the core runs on the relay and the relay checks co-op PvE blows, it
   also computes player health from the blows it accepted and states the death itself. A combat-logout rule can be
   designed then, against measured cost.

### 4.3 Disconnects and rejoin

- A leave: no effect. The lease, the checkpoint and the rejoin path are unchanged.
- A leave in a fight: no effect (section 4.2, layer 3).
- Lease takeover (a second tab or device): `joinRealm` already ends the other lease.
- A rejoin always loads the newest checkpoint; a Hardcore death after the last checkpoint is made durable by the
  tombstone, not by a save (as `entomb` does), so an old checkpoint cannot be reloaded past it (`joinRealm` refuses
  `dead`).

### 4.4 Anti-abuse

- **Mid-fight alt-F4:** not stopped until sim-core step 7 (section 4.2, layer 3).
- **Reload from checkpoint after a death:** impossible; `dead_at` is durable and `joinRealm` refuses.
- **Laundering via Hardcore alts:** unchanged by the mode; the judge's wealth, ledger and dupe checks still apply
  (`server-account/src/judge.js`, `ledger.js`). The six-slot cap counts living characters only.
- **Death farming for kills or rewards:** PvP falls do not kill (2.2), so no one earns by killing a Hardcore
  character; a Hardcore death gives no killer any reward.
- **Spoofing the mode:** the relay reads `md` from the signed token; the service reads `mode` from the row. A client
  field is never read for enforcement.
- **Staff revival:** only for a verified bug (server error, host crash); recorded in `realm_findings` with the ticket.
  Decision 9.

## 5. Changing modes

Rules:

- A mode can only be **loosened**, never tightened. Becoming Hardcore or Ironman later would make the label false
  (its history of trades, groups and deaths already exists).
- Allowed drops: Ironman -> Classic; Hardcore Ironman -> Hardcore (drop the Ironman half) or -> Ironman (drop the
  permadeath half) or -> Classic; Hardcore -> Classic while the character is **alive**.
- Legacy neither gained nor dropped: a family is founded at birth (`family.js` "founded under one and never changes
  it"), and its record is a separate object (`lineages`).
- A **dead** Hardcore character is dead: no mode change brings it back. "Hardcore to Classic after a death" is
  therefore a new character, not a conversion. The picker can offer "Start a new character" from the Hall of the
  Fallen.
- A drop is one way, confirmed by typing the character's name, and records `mode_from` and `mode_changed_at`. The
  character keeps a badge that says it was Ironman or Hardcore ("fell from"), so leaderboards stay honest. Boards that
  already counted it keep their rows with the old mode.
- A drop takes effect at the next lease (join). The relay reads the token for up to 300 s after the change, so the
  service refuses the change while the character holds a live lease with a room socket, and the client reconnects
  after answering.
- Offline, no server. A save can drop its mode locally; it is flagged offline-dropped and never counts for
  leaderboards because offline characters do not reach them.

## 6. Creation UI (description only)

A "Character mode" step at the end of chargen, replacing `legacyModelScreen`'s gate
(`chargenSession.js:"if (legacyOn()) asks.pus"`). One card
per mode, Classic selected and marked "Recommended". Each card has: a name, one line, a Pros list, a Cons list. A
detail panel on selection shows the rules from section 2 for death, trading and groups in plain words, and the
change-mode rule from section 5 ("Can be loosened later, never tightened. Cannot be changed after death."). Choosing
Hardcore, Ironman or Hardcore Ironman asks one confirmation that restates the cons. Choosing Legacy then asks the
existing Bloodline or Enduring question (decision 4). Offline new games show the same step, with online-only rules
labelled "Online only".

| Mode             | Pros                                                                    | Cons                                                                            |
| ---------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Classic          | DFU's rules; a death costs a tenth of your gold online; no restrictions | None beyond the gold                                                            |
| Hardcore         | A death means something; a Hall of the Fallen entry and a badge         | Online death is permanent: the character, its items and its gold are lost       |
| Legacy           | A family, heirs and a line that outlives one character                  | Project Legacy's rules: Bloodline deaths are final, Enduring deaths cost years  |
| Ironman          | Self-reliance; a badge; Classic death                                   | No trading with players, no parties, no shared dungeons, gates, raids or sieges |
| Hardcore Ironman | The hardest road; a badge                                               | Everything in Hardcore and Ironman                                              |

This note changes no UI; it is for the later UI PR and the owner's review of the wording.

## 7. Data

### 7.1 Account service (migration `0004_character_modes.sql`)

The fork has no player data (this fork has no players), so there is no backfill; the default only lets the
`ALTER` run.

```sql
-- The mode a realm character was created in, and the mode it was dropped from (modeLaw.js CHARACTER_MODES).
ALTER TABLE realm_characters ADD COLUMN mode TEXT NOT NULL DEFAULT 'classic'
  CHECK (mode IN ('classic', 'hardcore', 'legacy', 'ironman', 'hardcore_ironman'));
ALTER TABLE realm_characters ADD COLUMN mode_from TEXT;
ALTER TABLE realm_characters ADD COLUMN mode_changed_at INTEGER;
-- A relay-signed death receipt pays once (the nonce), as a gate receipt does.
CREATE TABLE realm_death_receipts (
  nonce      TEXT PRIMARY KEY,
  char_id    TEXT NOT NULL,
  at         INTEGER NOT NULL,
  source     TEXT NOT NULL CHECK (source IN ('client', 'relay', 'staff'))
);
-- Leaderboard rows record the mode at the time of the result.
ALTER TABLE arena_pve ADD COLUMN mode TEXT;
ALTER TABLE arena_pvp ADD COLUMN mode TEXT;
```

Other result tables that feed boards (`sd_kills`, `hunt_clears`) get the same nullable column when their board reads it
(PR 6). `createRealm` takes `mode`, refuses `lineage` unless `mode = 'legacy'`, and requires `lineage` when `mode =
'legacy'`. `unique(player, lineage_id, person_id)` is unchanged.

### 7.2 Save

A new key `characterMode` beside `legacyChoice` in `src/systems/save/save.js`. It is set once at chargen, saved with the
character and never changed except by a drop. Online it is advisory: the judge compares the checkpoint's value with the
row and records a finding on mismatch (`server-account/src/judge.js`, as it does for other fields). Offline it is the
authority. Legacy mode sets `legacyChoice` to the chosen model; every other mode sets it to `none` so Project Legacy
sits the character out "at their birth and at every load" (`family.js` `NO_LINEAGE`). With this, Project Legacy's mod
default `Enabled: true` is no longer how a character joins a family; only the Legacy mode does.

### 7.3 Token and relay

- New optional token field `md`: 0 classic, 1 hardcore, 2 legacy, 3 ironman, 4 hardcore_ironman. It is minted by
  `realmMintFacts` (`realm.js:"export async function realmM"`) from the row and added to the token validator and its
  comment block
  (`src/net/identityToken.js`). The relay reads it at the hello and keeps it on the socket attachment.
- New shared law `src/net/modeLaw.js` (pure; the relay imports only `src/net/*`): `CHARACTER_MODES`, `modeOfCode(md)`,
  `permadeath(m)`, `ironman(m)`, `legacy(m)`, `canDrop(from, to)`.
- New frames (validators in `src/net/wire.js` as `validDiedIn` and `validDiedOut`): `died` (client to relay, a death
  begins), `diedRcpt` (relay to client, the signed receipt). No other frame changes: trade, party and room entry read
  `md` from the token already on the socket.
- New relay-to-service door `/v1/mod/death-feed` (signature-proven like `/v1/mod/grant-feed`) and the client route
  `/v1/realm/die` gains an optional `receipt`.
- New account routes: `POST /v1/realm/mode` (a drop), and a read of the Hall of the Fallen (`/v1/realm/fallen`).
- Every change to a file the relay imports bumps `RELAY_VERSION` (now `world290`,
  `src/net/wire.js:"export const RELAY_VERSION "`) with the
  hash row in `test/net/relayversion.test.js`.

## 8. PR plan

Sizes: S under 150 lines of diff, M 150-500, L over 500.

| #   | PR                                                                                                                                                                       | Size | Relay bump | Content                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `src/net/modeLaw.js` and its tests                                                                                                                                       | S    | no         | The pure law: modes, predicates, drops. Unit tests of every transition and predicate.                                                             |
| 2   | Storage: migration `0004`, `createRealm(mode)`, `realmMintFacts` and token `md`, save key `characterMode`                                                                | M    | yes        | No behaviour change for players (all existing characters are `classic`). Round-trip and token tests. The judge's mismatch finding waits for PR 6. |
| 3   | Creation: the mode step in chargen, `legacyModelScreen` moved under the Legacy mode, Project Legacy `Enabled` default off                                                | M    | no         | The UI PR (before and after previews, `ui-changes.md`); stays a draft until the owner approves. Depends on 2.                                     |
| 4   | Ironman, account side: `modeRefusal` in every value route, route-coverage test, Market tab text                                                                          | M    | no         | Account service only. Depends on 2.                                                                                                               |
| 5   | Ironman, relay side: `trade` frame drop, party refusal, solo copies of the Abyss and of gates, raid, siege, Royal Tourney, serpent and crew refusals, peer effects       | L    | yes        | Depends on 2. Reads `act` routing first. The solo gate copy is new content.                                                                       |
| 6   | Hardcore death: relay `died` frame and receipts, `/v1/mod/death-feed`, service stamp on either path, judge mismatch finding, Hall of the Fallen read, PvP exemption test | L    | yes        | Depends on 2. No combat-logout rule (decision 6).                                                                                                 |
| 7   | Leaderboards per mode: `mode` columns on result rows, a board per mode, badges and titles                                                                                | M    | no         | Depends on 2 and 6.                                                                                                                               |
| 8   | Mode drops: `/v1/realm/mode`, confirmation UI, badge                                                                                                                     | M    | no         | Depends on 2 and 3.                                                                                                                               |

Order: 1, 2, then 3 and 4 in either order, then 5, 6, 7, 8. PRs 3 to 8 each restate in the PR description what the
player
can now feel. Offline Hardcore (decision 2) is a small part of PR 3.

Verification (`verification.md`): each of 4 to 7 is exercised in the running game on two clients through the local
relay harness: an Ironman trade is refused on the relay and on the account route; a Hardcore character killed in a
dungeon cannot rejoin; an arena fall does not kill.

## 9. Decisions (owner, 2026-11-03)

1. Two switches (death rule, Ironman), not five unrelated values.
2. Offline Hardcore: a death ends the run and marks the saves fallen (honour-based, no board).
3. A Hardcore death loses the estate: items and gold go with the character.
4. Legacy mode keeps the Bloodline and Enduring question.
5. PvP falls (Arena, duels, sieges, Royal Tourney) never kill a Hardcore character.
6. Combat logout: trust the client until the relay can track player health (section 4.2). The relay-signed death
   receipt stays for deaths the relay sees.
7. Ironman: Arena PvE and PvP and duels allowed; sieges, Royal Tourney, raids, serpent and crews barred; solo copies of
   the Abyss and of gates; guild membership without vault, treasury, writs or gifts.
8. Changing modes: loosen only, never tighten; a dead Hardcore character stays dead; Legacy neither gained nor dropped.
9. Staff revival of a Hardcore death only for a verified server or host fault, logged.
10. A mode gives no power or gold. Badges, a Hall of the Fallen and titles. **Separate leaderboards per mode.**
11. Project Legacy's switch stays a master switch, **off by default**. While it is off the Legacy option is hidden and
    the Legacy mode cannot be created. The mode works only while the switch is on.
12. Other players' beneficial effects on an Ironman character have no effect.

## Noticed, not in scope

- `src/net/identityToken.js` lists `hd` twice in the field comment (:327 and :338-339). Documentation only.
- The PvE damage path to a player is client-side; the sim-core note's tier 2 will change who observes it. I did not
  trace the `act` frame's routing for peer effects.
