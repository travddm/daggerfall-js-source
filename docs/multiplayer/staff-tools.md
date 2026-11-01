# Staff tools

This page covers the tools staff use on the live game: roles, the staff panel's service side, in-game staff
commands, follow, freeze, hidden mode, on-screen messages, staff events and the monitoring feeds. Chat moderation is
in [chat-safety.md](chat-safety.md).

## Roles

| Role | Source | Checked by |
| --- | --- | --- |
| Admin | `players.staff_admin` | `isDeveloper`; `staffRole` returns `admin` |
| Moderator | `players.staff_mod` | `canModerate`; `staffRole` returns `moderator` |
| Owner | `players.staff_owner` (and Admin) | `isOwner` |
| Report reader, POI approver | an Owner | `isReportReader`, `poiRolesOf` |
| POI builder | an Admin | `poiRolesOf` |

A role belongs to the account, never to a handle: registering a name grants nothing. The columns are read fresh on every
request. An Owner is set only by the operator (`tools/staffRole.mjs`); an Owner adds and removes Admins
(`/v1/staff/admin/add`, `/admin/remove`); an Admin adds and removes Moderators (`/v1/staff/mod/add`, `/mod/remove`). A
Moderator changes no role. See [Staff roles](../operations/staff-roles.md).

In game, the relay sees roles only as **glyphs** in the identity token (`glyphsOf`). `isStaff`
(`src/net/staffCommands.js`) accepts `STAFF_GLYPHS` (`dev`, `dm`). The `mod` glyph is not in that list;
hidden mode (`HIDDEN_GLYPHS`) does include it.

## The staff panel

The panel is a browser extension kept outside this repository. This repository holds its service side and the
game's hook.

- Routes `/v1/staff/*` (`STAFF_ROUTES` in `server-account/src/service.js`; `server-account/src/staff.js`,
  `staffPlayers.js`, `staffRealm.js`, `staffEconomy.js`, `staffCensus.js`, ...). POST only, session in the
  `x-staff-session` header. Game sessions are refused.
- **Sign-in has three locks** (`staffLogin`, `staffEnroll`): the account password, an Ed25519 key held by the panel
  (signature over `dfo-staff:v1:<what>:<handle>:<ts>`, 300 s, one use), and the role lists. An owner's first key is
  in `OWNER_KEYS`. Sessions idle out after 30 minutes and end after 8 hours.
- Every staff action writes `staff_audit`.
- The game exposes `src/net/staffHook.js`: the one door the panel uses to ask the running game for places, the
  player's position, and to follow or teleport.

## In-game commands

`STAFF_COMMANDS` in `src/net/staffCommands.js`, parsed by `parseStaffCommand`: `/tp`, `/god`, `/fly`, `/heal`,
`/pos`, `/staff`, `/relay`.

- `/tp <player>` goes to the relay (`server/src/staffTeleport.js`, `routeStaffTeleport`), which checks `isStaff` and
  answers the target's position to the asker only. Client: `src/net/staffTeleport.js`.
- `/relay <setting> <value>` (developers, `mayRelayCfg`) changes relay settings stored on the hub (`relaycfg`), such
  as Discord roles and threads, `bossBody`, `leaseDoor`, `grantMode`. Settings are read through
  `/internal/relay/cfg`. See `src/net/relayCfg.js`.

## Follow, hidden mode and the map

- **Follow** (`server-account/src/staffFollow.js`, `server/src/staffFollow.js`, `src/net/staffFollow.js`): the
  service mints a hidden spectator token; the relay lets that socket watch a player without appearing.
- **Hidden mode** (`/v1/staff/hide`; `server-account/src/staffHidden.js`, `server/src/staffHidden.js`): a hidden
  token keeps the socket out of rosters, counts and fan-out (`hiddenHello`, `hiddenPose`). The relay reports who saw
  a hidden socket to `HIDDEN_SEEN_URL` (`src/net/hiddenSeen.js`).
- **Map and places** (`src/net/staffMap.js`, `src/net/staffPlaces.js`, `src/scenes/staffFlatMapHost.js`): travellers
  by region through a hidden link, and the game's own place lists.

## Freeze and staff chat

- `/v1/staff/freeze`, `/unfreeze`, `/freezes` (admins; `server-account/src/staffFreeze.js`). A freeze is stored in
  `players.frozen_until` and `frozen_reason` (at most 7 days) and pushed as an order. Failed pushes are retried by
  the minute cron (`retryFreezePushes`).
- The relay (`server/src/staffFreeze.js`) pins a frozen player in place: `frozenHello` keeps the position its old
  socket had, and `frozenFrame` passes only pings, leases, camera turns and staff-channel lines. Any blow, cast, trade
  or duel aimed at a frozen player is dropped. The client shows a freeze screen with a staff chat tab (`src/net/staffChat.js`, `src/scenes/staffFreezeHost.js`).
- Staff chat threads: `/v1/staff/talk`, `/chat`, `/chat-send`; the player side is `/v1/staff-chat/read` and `/send`.
  Tables `staff_chat_threads`, `staff_chat_lines`.

## On-screen messages

`/v1/staff/message` (`server-account/src/staffMessage.js`) stores a message (up to 200 characters) and pushes an
`smsg` order. The relay nudges the player's client (`server/src/staffMessage.js`); the client fetches the words from
the service and sends the acknowledgement (`src/net/staffMessages.js`, `src/ui/staffMessageBox.js`).

## Staff events

Admins can start a live event: a pack of creatures and an optional boss at a place.

- Service: `/v1/staff/event` (start, end, boss) and `/v1/staff/events` (`server-account/src/staffEvents.js`), table
  `staff_events`, pushed as an `sevent` order.
- Shared rules: `src/net/staffEvent/staffEventLaw.js` (`validStaffEvent`): at most 4 running, bounded creature
  kinds and totals, boss size and health caps, at most one day long.
- Relay: `server/src/staffEvents.js` (`takeStaffEventLaw`, `payReward`) keeps the event book on the hub and pays
  receipts (`src/net/staffEvent/staffEventReceipt.js`).
- Game: the event runs as a raid (`src/systems/staffEvents.js`, `src/systems/raidingParties.js`); the boss is
  promoted by `promoteStaffBoss` (`src/systems/eliteFoes.js`) and can be piloted (`src/systems/staffBossPilot.js`).

## Monitoring feeds

The relay posts signed batches to the account service (signature header `x-relay-staff-sig`,
`server/src/staffFeedLaw.js`):

| Feed | Relay | Service route | Tables |
| --- | --- | --- | --- |
| Network rows and foes seen | `staffNetFrame`, `staffFoesSeen`, `staffNetFlush` (`server/src/staffFeeds.js`) | `/v1/staff/net-feed` | `staff_net_batches`, `staff_net_rows`, `staff_foe_rows` |
| Encounter reactions | `staffReactAsk` | `/v1/mod/reaction-feed` | `encounter_reactions`, `reaction_batches` |
| Spawn grants | grant window | `/v1/mod/grant-feed` | not traced |

Feed windows are flushed when a room empties (`flushAtDrain`), so they do not keep a room awake. The hourly cron
sweeps old rows.
