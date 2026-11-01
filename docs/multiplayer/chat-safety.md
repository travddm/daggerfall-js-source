# Chat safety, moderation and the Discord bot

This page covers what a chat line passes through, how players report and moderators act, the AI reviewer, and the
Discord moderation bot. Staff tools beyond moderation are in [staff-tools.md](staff-tools.md).

Responsibility is split three ways: the **client** filters and shows, the **relay** rate-limits, mutes, bans and
signs lines, and the **account service** owns reports, cases, sanctions, the reviewer and Discord.

## A chat line's path

### Client (sending)

1. `parseChatLine` (`src/net/chatCommands.js`) separates channel and host commands from text.
   `parseSafetyCommand` (`src/net/safety/safetyLaw.js`) handles `/block`, `/report`, `/ban`, `/strikes`, `/cases`,
   `/dismiss`, `/conduct`, `/rules`. `src/net/moderation.js` handles `/mute` and `/unmute`.
2. The code of conduct must be agreed before the first line (`src/net/safety/conduct.js`; the token carries
   `conduct`).
3. `sanitizeChat` (`src/net/wire.js`) cuts to `CHAT_MAX` and masks words with `maskText` (`src/net/nameFilter.js`).

### Relay

In `server/src/index.js`, for a `chat` frame:

1. Per-socket rate gate (`chatGate`, `CHAT_HZ_MAX` 2/s); overspending adds strikes up to `CHAT_STRIKES_MAX`.
2. Staff channel lines branch off (`staffLine`).
3. Mute check: a socket with `mu` in the future gets `{ t: 'muted', until }` and the line is dropped. `mu` comes
   from the token and from mute orders.
4. `_sayLine` routes to guild, party or room. New accounts (guest or young token) get one line per
   `NEW_VOICE_GAP_MS` (4 s), else `{ t: 'slowed', ms }`. The room budget is `CHAT_ROOM_HZ_MAX` (20/s).
5. `_stamped` signs the line with `GATE_SIGNING_KEY` (`src/net/safety/chatStamp.js`, `mintStamp`). A stamp lets the
   service verify later that the relay really carried the line.
6. Public tabs (`PUBLIC_TABS`) are queued for the account service: `_feedLine`, then `_feedFlush` posts a signed
   batch (`sealFeed`, `FEED_BATCH` 40 lines or `FEED_WAIT_MS` 30 s) to `MOD_FEED_URL`.

### Client (receiving)

`sanitizeChat` and `sanitizeName` run again. `ChatLog` (`src/net/chat.js`) applies the block list (`hears`) and keeps
stamped lines for reports (`reportLines`). Blocked accounts' requests are dropped in `SocialState` and
`OnlineSession`.

### Names

`checkName` (`src/net/nameFilter.js`) checks handles and character names against crude, slur and impersonation
lists, with normalisation and an allow-list for innocent words. The service runs the same check on register
(`accounts.js`). `src/net/handleShape.js` defines guest-name and handle shapes.

## Reports and cases

- A player reports from a line's menu or with `/report`. `POST /v1/safety/report` runs `fileReport`
  (`server-account/src/safety.js`): shape check (`reportShape`), reason (`REPORT_REASONS`: harassment, hate,
  sexual, threat, spam, other), up to `REPORT_LINES_MAX` lines, `REPORT_RATE_MAX` reports an hour. Every line's
  stamp is verified (`verifyStamp`); an unstamped or forged line is not evidence.
- `openCaseFor` gathers reports on one account into one open case: `mod_cases`, `mod_reports` (one per reporter),
  `mod_case_lines`.
- **Automatic mute.** Three credible reporters (linked, not muted, older than `SPROUT_S`) within an hour mute the
  account for 30 minutes (`autoMute`, actor `auto:reports`). Moderators and already sanctioned accounts are exempt
  (`autoMutable`).
- Private reports (bugs, exploits, security) are a separate desk: `src/net/privateReport.js`,
  `server-account/src/reports.js`, table `private_reports`, routes `/v1/report/*`, read by Owner accounts (`isReportReader`).

## Sanctions

| Action | Stored in | Effect on the relay |
| --- | --- | --- |
| Mute | `players.muted_until`, `muted_by` | Mute order sets the socket's `mu`; new tokens carry `mu` |
| Ban | `players.banned_until`, `ban_reason`, `banned_by` | `_banClose` closes the sockets; `_bannedHello` refuses tokens older than the ban; bans stored in room storage |
| Dismiss | Case closed; `voidAutoMutes` lifts its automatic mutes | Unmute order |

- Every act is a `mod_actions` row, never deleted. The ladder (`src/net/safety/safetyLaw.js`, `LADDER_MIN`) is 30 minutes, 1 day,
  7 days; after those three steps (`LADDER_BAN_AT`) the next act is a ban; strikes count over 90 days (`strikesOf`,
  `server-account/src/sanctions.js`).
- Session doors answer a banned account with `{ error: 'banned', until, reason }`.
- There is no moderation kick. Freeze and hide are staff tools.
- In-game moderator routes: `/v1/mod/{mute,ban,unban,strikes,cases,case,dismiss}`. In game and Discord both call
  `modAct` (`safety.js`): claim the case, act, resolve, push the order.

### Who may moderate

`canModerate` (`server-account/src/titles.js`) is true for accounts with `players.staff_mod = 1` or
`players.staff_admin = 1`. The row is read on every request.
Accounts that can moderate cannot be muted or banned through these paths.

### How orders reach the relay

`pushLaw` (`sanctions.js`) POSTs a signed order to the relay's `/v1/law` (`RELAY_LAW_URL`) through the `RELAY`
service binding. Orders are minted by `identityToken.js` (`mintBanOrder`, `mintOrder`, `mintFreezeOrder`,
`mintHideOrder`, `mintStaffCutOrder`, `mintStaffEventOrder`) and live 60 s. The relay's `lawDoor` verifies the order,
drops replays (`lawSeen`) and passes it to the hub's `_takeOrder`, which applies it to every room. A failed push is not
retried: the database row is the truth, and the next token the player mints carries it.

## The AI reviewer

`server-account/src/modAi.js`, `safetyClock.js`; switch `MOD_AI` (`off`, `shadow`, `on`).

- The relay's public-line feed is kept only while `MOD_AI` is not `off` (`takeFeed`).
- Every minute (`safety` cron job) `safetyMinute` reads the feed, triages open cases, and sends lines to the
  Anthropic Messages API (`reviewLines`; model `MOD_AI_MODEL`, with a built-in default). The key is the
  `ANTHROPIC_API_KEY` secret.
- **shadow**: verdicts are recorded and shown on Discord cards; nothing is acted on.
- **on**: a verdict of the highest severity, confidence at least 0.9, in harassment, hate, sexual or threat, mutes for
  30 minutes (`auto:review`), only after a second read of the account's own lines agrees. The reviewer never bans.
- Daily call cap `MOD_AI_DAILY_MAX`, with a share kept for reports.

## The Discord bot

The bot is an **interactions endpoint** on the account service, not a gateway bot.

- Route `POST /v1/discord/interactions` (`server-account/src/discord.js`, `discordInteraction`). `discordSigned`
  verifies the Ed25519 signature (`x-signature-ed25519`, `x-signature-timestamp`, 300 s skew) with
  `DISCORD_PUBLIC_KEY`.
- Commands are declared in `server-account/src/discordCommands.js` (`DISCORD_COMMANDS`): `/mod lookup`, `/mod mute`,
  `/mod unmute`, `/mod ban`, `/mod unban`. Guild-only and hidden from members without Manage Messages.
- `actorOf` maps the Discord user to a game account through the `staff_discord` table (Discord user id to account id,
  set by the operator with `tools/staffRole.mjs discord`). The account must pass `canModerate`. A Discord role grants nothing by itself.
- **Case cards.** `postCards` (minute cron) posts one card per case to `DISCORD_MOD_CHANNEL` (`caseCard`): the
  reported lines, reasons, reviewer verdict, strikes and next ladder step. Buttons (`safe:<act>:<caseId>`): mute 30
  minutes, 1 day, 7 days, ban 30 days, dismiss. A press claims the case for 60 s, acts through `modAct`, and redraws
  the card. Player text goes inside code blocks.

### What the deploy does, and what a person does

The account deploy's step "Point Discord at the service" runs `node tools/discordModCommands.mjs --setup` when
`DISCORD_BOT_TOKEN`, `DISCORD_MOD_CHANNEL` and `DISCORD_PUBLIC_KEY` are all set. It checks that the public key is the
application's, sets the Interactions Endpoint URL, overwrites the whole command list, and reports any missing channel
permission (View Channel, Send Messages, Embed Links). It writes `DISCORD_BOT_TOKEN` and `ANTHROPIC_API_KEY` from
repository secrets to the Worker.

To change the bot, change `discordCommands.js`, `discord.js` or `wrangler.toml` and merge. A person must still invite
the bot, grant its channel permissions and roles, and rotate `DISCORD_BOT_TOKEN` in the repository secrets.

### Relay announcements

Separate from moderation, the relay posts event announcements (Oblivion gates, Super Dungeons, serpent) through a
webhook (`GATE_DISCORD_WEBHOOK` secret; `heraldWebhook` in `server/src/index.js`, cards in
`src/net/herald/heraldCard.js`). Ping roles and threads come from the `*_DISCORD_ROLE` and `*_DISCORD_THREAD` vars and
can be changed in game with `/relay` (`src/net/relayCfg.js`).
