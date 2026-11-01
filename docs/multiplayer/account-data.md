# Account service data

This page covers the account service's stored data: the D1 schema and how migrations work, saves and realm characters
in R2, the market and its duplication guards, homes and decor, and the integrity checks on online characters. The
service itself is in [account-service.md](account-service.md).

## Migrations

- Schema lives in `server-account/migrations/NNNN_name.sql` (four-digit sequence, snake_case name), applied in name
  order. Each file starts with a comment on what it adds.
- The deploy (`.github/workflows/account-deploy.yml`, step "Apply migrations") runs
  `wrangler d1 migrations apply daggerfall-accounts --remote`. Wrangler records applied files in the `d1_migrations`
  table, so each file runs once.
- Before it applies, the deploy records a D1 Time Travel bookmark in the job summary. Restoring that bookmark
  (`wrangler d1 time-travel restore`) is the only undo: some migrations cannot be reversed by another migration.
- A failure with "CPU time limit" or "was reset" stops the deploy without retry. Keep each migration small; split a
  large backfill.
- Patterns: `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN`, and table rebuilds (`*_new`, copy, drop,
  rename) to change a constraint. SQLite cannot alter a `CHECK` in place.
- Tests build their database from the same files: `test/accountDb.mjs` runs every `.sql` file in name order. A broken
  migration fails the test suite.
- Never edit an applied migration. Add a new file with the next number.

## Main tables

| Area | Tables (migration) |
| --- | --- |
| Accounts | `players` (0001; also mutes, bans, freeze, staff flags, titles in later files), `sessions` (0001), passwords (0002) |
| Cloud saves | `saves` (0003) |
| Realm characters | `realm_characters` (0018), `realm_trades` (0019), audit columns (0020), integrity (0096) |
| Homes | `homes` (0010) and later home files (rooms, look, yard, layout, deed, vendors, transfer) |
| Decor | `home_decor` (0011) and later decor files (items, batch, access, use, hold) |
| Currency | `marks_ledger` with balance triggers (0025, rebuilt in 0032) |
| Market | `market_listings`, `market_sales`, `market_deliveries`, `market_orders`, `market_fills`, `market_prices`, `market_reports`, `products` (0032); auctions (0033); gold market (0041); `piece_escrow` (0128) |
| Guilds | `guilds` (0013) and later guild files (halls, board, overhaul, castles) |
| Group content | `gate_kills` (0014), `arena_*` (0074 onward), `serpent_kills` (0081), `sd_kills` (0090), `wild_falls` (0104), `eg_*` (0124), `wild_escrow` (0118) |
| Professions and towns | professions, mining, smithing and other crafts; town seats (0048 onward); town economy |
| Moderation and staff | `mod_cases`, `mod_reports`, `mod_case_lines`, `mod_actions` (0126), `private_reports` (0129), staff tables |

Deleting a `players` row cascades to most of an account's rows. `products` deliberately does not cascade: a crafted
piece outlives its maker's account.

## Cloud saves

`server-account/src/saves.js`. A save slot is a `saves` row (player, character id, save name, game and real time,
sizes) plus two R2 objects, `data` and `shot`, under a key per player, character, slot and part. A per-account row cap
is enforced in the `INSERT`. Delete removes the R2 objects (failures tolerated) and then the row. The service keeps no
version history of offline slots.

## Realm characters

An online character's truth is the service's, not the client's (`server-account/src/realm.js`, `0018`).

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
`review.js`, `realm.js`; columns and tables from `0096_integrity.sql`).

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
