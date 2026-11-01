# Account service data

This page covers the account service's stored data: the D1 schema and how it changes, saves and realm characters
in R2, the market and its duplication guards, homes and decor, and the integrity checks on online characters. The
service itself is in [account-service.md](account-service.md).

## Schema and migrations

- The whole schema is one file, `server-account/migrations/0001_schema.sql`: every table, index and trigger, grouped
  by area, with a one-line comment on what each table holds. It also seeds the three version counters the service
  reads and raises but never inserts (`arena_board_ver`, `homes_gen`, `poi_feed`). The database starts empty; no data is migrated into it.
- A later schema change is a new file with the next number (`0002_<what>.sql`, `0003_...`), snake_case name, applied
  in name order. Never edit a file that was applied, `0001_schema.sql` included: the ledger does not run it again.
- The deploy (`.github/workflows/account-deploy.yml`, step "Apply migrations") runs
  `wrangler d1 migrations apply daggerfall-accounts --remote`. Wrangler records applied files in the `d1_migrations`
  table, so each file runs once.
- Before it applies, the deploy records a D1 Time Travel bookmark in the job summary. Restoring that bookmark
  (`wrangler d1 time-travel restore`) is the only undo: a migration cannot always be reversed by another one.
- A failure with "CPU time limit" or "was reset" stops the deploy without retry. Keep each migration small.
- Patterns for a later file: `CREATE TABLE`, `ALTER TABLE ... ADD COLUMN`, and table rebuilds (`*_new`, copy, drop,
  rename) to change a constraint. SQLite cannot alter a `CHECK` in place.
- Tests build their database from the same files: `test/accountDb.mjs` runs every `.sql` file in name order, and
  `test/server/schema.test.js` checks that they apply cleanly and hold every table and column the service's SQL names.

## Main tables

| Area | Tables |
| --- | --- |
| Accounts | `players` (also mutes, bans, freeze, staff flags, titles), `sessions` |
| Cloud saves | `saves` |
| Realm characters | `realm_characters` (with its audit and integrity columns), `realm_trades`, `realm_findings` |
| Homes | `homes`, `home_rooms`, `home_yards`, `home_moves`, `home_offers` and the other `home_*` tables |
| Decor | `home_decor` and the `decor_*` tables (bins, batch receipts, access, holds) |
| Currency | `marks`, `marks_ledger` with balance triggers |
| Market | `market_listings`, `market_sales`, `market_deliveries`, `market_orders`, `market_fills`, `market_prices`, `market_reports`, `products`, `market_auctions`, `market_bids`, `market_gold`, `piece_escrow` |
| Guilds | `guilds` and the `guild_*` tables (members, notes, vault, castles, writs) |
| Group content | `gate_kills`, `arena_*`, `serpent_kills`, `sd_kills`, `sea_season` |
| Professions and towns | the `prof_*` tables, `node_harvests`, `motherlodes`; town seats (`town_seat_*`); town economy (`town_econ_*`) |
| Moderation and staff | `mod_cases`, `mod_reports`, `mod_case_lines`, `mod_actions`, `private_reports`, the `staff_*` tables |

Deleting a `players` row cascades to most of an account's rows. `products` deliberately does not cascade: a crafted
piece outlives its maker's account.

## Cloud saves

`server-account/src/saves.js`. A save slot is a `saves` row (player, character id, save name, game and real time,
sizes) plus two R2 objects, `data` and `shot`, under a key per player, character, slot and part. A per-account row cap
is enforced in the `INSERT`. Delete removes the R2 objects (failures tolerated) and then the row. The service keeps no
version history of offline slots.

## Realm characters

An online character's truth is the service's, not the client's (`server-account/src/realm.js`).

- One `realm_characters` row per character (up to `REALM_CHARACTERS_MAX`). The service mints the id
  (`r` + 20 hex); a client id proves nothing.
- The save is in R2 under `realm/<player>/<id>/<seq>-<tag>` (`realmObjectKey`). The game is client-authoritative,
  so the service judges every checkpoint (see Integrity checks below).
- Every write is a new object; the row names the current object and the one before it, and moves only after the
  write lands.
- **The lease.** Joining mints a new `lease` secret, which takes the character from any other tab and frees the
  account's other characters, so one account plays one character at a time. A checkpoint lands
  only under the current lease and only at `seq + 1` (headers `x-realm-lease`, `x-realm-seq`). An old tab, a second
  device, a restored backup or an edited copy cannot write the character again.
- **Born online only.** A realm character is made by `createRealm`; no offline character is brought in. Its first
  save must be a new character's (`firstSaveRefusal`: level 1 and no more than `REALM_BIRTH_WEALTH_MAX`). "Copy to
  offline" still writes a realm save as a new offline character, and nothing played on the copy comes back.
- Value moving between players (trades, market, mail) goes through `realm_trades` and the ledger. `holdRefusal`
  refuses any such move for a held character.

## Marks and the ledger

Marks are the online currency. Every movement is one `marks_ledger` row with a source and destination kind (`mint`,
`account`, `guild`, `escrow`, `burn`) and an amount. Triggers keep the `marks` and `guild_marks` balances in step with
inserted rows. Code never updates a balance directly.

Every write carries a request id `rid`, unique per actor (`UNIQUE (actor, rid)`). A repeated request is answered the
same way instead of paying twice. Listings and auctions are unique on `(seller, rid)`.

## Market

`server-account/src/market.js`; shared rules in `src/net/marketLaw.js` and `src/net/marketBook.js`.

- `marketList` lists a material (units taken from the player's Stores) or a crafted piece (by provenance and wear).
  `marketBuy` pays the seller net of tax and the town hall's tithe. Goods arrive by courier (`market_deliveries`,
  `marketCollect`).
- Buy orders (`marketOrder`, `marketFill`) hold the buyer's Marks in ledger escrow while the order stands.
- Auctions (`marketAuction`, `marketBid`) run for a fixed time; a bid in the last minutes extends the end. Bids are
  escrowed; an outbid bid is returned. `closeAuctions` settles them on the minute cron, and `settle` runs on reads.
- **Duplication guards** for crafted pieces, each identified by a 16-character provenance in `products`:
  - partial unique indexes allow one open listing (`idx_market_piece_open`) and one open auction
    (`idx_market_auction_open`) per provenance;
  - `piece_escrow` records a piece while the service holds it; writes check `NOT EXISTS` against it;
  - `products.listed` and `item_uids.state = 'escrow'` keep a listed piece off other paths.
- `marketReport` and `marketRemove` let players report and moderators remove listings.

## Homes, decor and yards

`server-account/src/homes.js`, `decor.js`, `decorAccess.js`; shared rules in `src/net/homeLaw.js`,
`src/net/decorLaw.js`, `src/net/yardRange.js`.

- A home is one building in one town, keyed `(map_id, building_key)`, with exactly one owner server-wide.
- A decor piece belongs to a home row. What it is (model or flat) is fixed at placement; where it stands is a JSON
  `place` moved by `moveDecor`. Removing a home removes its pieces.
- `homes.paid` and `home_decor.paid` record what was paid. A refund or a realm credit uses those values, never a
  client-stated price.
- Entry is `private`, `party` or `public` (`setHomeEntry`); `decorMay` checks who may place or use decor.
- Yards are decor rows with a `yard` flag. `yardsOf` serves a town's yards from a short-lived in-memory snapshot
  (`YARDS_KEPT_S`); `settleYards` runs a bounded number a minute.
- Offline houses and ships keep their decor in the save file, not here.

## Integrity checks

Online characters are checked on every checkpoint and by the hourly sweeps (`server-account/src/judge.js`,
`review.js`, `realm.js`).

| Check | What it detects | Result |
| --- | --- | --- |
| Law | A checkpoint that breaks game rules (level rise faster than possible, impossible values; `lawValuesOf`) | A finding; repeated strikes hold the character for staff review |
| Dupe | The same item uid (`item_uids`) claimed by a second record after a grace period | `item_dupes` row; the character's trades are held |
| Budget | Wealth gained per played hour past a line (`realm_wealth_hours`, `wealthOf`) | A hold, only while staff have the budget on (`realm_config`) |
| Outlier | Statistical outliers in measures (`measure`, `gainsMeasure`) | A review note |

- Findings go to `realm_findings` (kept 90 days); wealth hours are kept 30 days.
- A hold sets `realm_characters.held` (`law`, `dupe`, `budget`, `staff`). `holdRefusal` then refuses any route that
  moves the character's value to another player. The character can still play.
- Staff clear a hold through the `/v1/mod/realm-*` review routes (`reviewAct`), which set `law_excused`.
- Reward claims (`/v1/*/claim`) carry relay-signed receipts and insert `OR IGNORE` into kill tables keyed by nonce, so
  a receipt pays once. See [group-instances.md](group-instances.md).
