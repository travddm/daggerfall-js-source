// Online is one lane: the skin, getPref and modSetting ask this module first, so the room's switches are forced in one
// place (the server profile's pins) and never at a mount site. test/systems/onlinelane.test.js fails a boolean switch
// that is neither forced nor declared the player's. The player keeps the dials and what only their screen draws.

import { pageHas } from '../pageQuery.js';   // PERF-URL: the page's query, parsed once a search
import { activePins, onProfileInstalled, rule } from './serverProfile.ts';
import { PROFILE_KEYS } from '../../net/profile/profileKeys.ts';
import { OFFICIAL_PROFILE } from '../../net/profile/officialProfile.ts';

/** The page is online: `?online` is on the URL (main.js sets it for
 *  Play Online and deletes it on every other door - and WRITES IT TO
 *  THE URL through publishBootParams below, which is what makes this
 *  read true). Injectable for node; a page without a location is never
 *  online. */
export const isOnlinePage = (search = globalThis.location?.search ?? '') => pageHas('online', search);   // PERF-URL: parsed once a search (systems/pageQuery.js)

/** The keys main.js's front door DECIDES per choice (F12's law: set on
 *  the door that wants them, deleted on every other) - and so the keys
 *  a stale URL must not carry into the menu that decides them. */
export const BOOT_DOOR_KEYS = Object.freeze(['load', 'online', 'loadkey', 'test', 'classic', 'classicload', 'realm', 'realmnew', 'legacyborn', 'region', 'loc', 'seat', 'start']);   // BAY-LEFT-B: a birth's seat by its map id   // HOUSE-WAITS (FIELD BUGS 2026-10-09f): a waiting house's birth, decided by the Online page   // REALM P1.3: the realm character's id, and a character born online

/**
 * MAC-N3: THE BOOT'S PARAMS ARE THE URL, or the lane reads nothing.
 *
 * main.js builds `params` from location.search, and the front door
 * SETS `online` on it for Play Online - on the in-memory copy. Nothing
 * ever wrote that copy back, so `location.search` stood at whatever
 * the player typed (nothing) and isOnlinePage above - the one read
 * uiSkin, getPref and modSetting all go through - answered false on
 * every real online session. The whole lane OL1 records was live for
 * a URL typed by hand and for the probes, and dead for the button:
 * a player with Classic stored played online on the classic skin,
 * and the chat is the enhanced skin's DOM panel (world.js chatStart),
 * so there was no chat. The relay itself was fine, because the world
 * host reads `params.has('online')` off the copy.
 *
 * ONE HOME. The fix is not a second read path (a latch main.js could
 * set beside the URL - two truths, and the next reader picks one):
 * the boot publishes the params it decided to the URL it read them
 * from, before the world boots, and every `location.search` reader
 * in the tree sees the same page the world host does. The empty-value
 * spelling (`?world` not `?world=`) is the menu's own test door's.
 *
 * Answers the search string it wrote (or would have), for the pins. A
 * history that refuses (a scheme without the History API) is warned
 * about and not fatal - the boot still runs; the lane is what is lost,
 * and it is lost LOUDLY.
 */
export function publishBootParams(params, { history = globalThis.history, location = globalThis.location } = {}) {
  const body = String(params).replace(/=(&|$)/g, '$1');
  const search = body ? `?${body}` : '';
  if (!history?.replaceState || !location) return search;
  if (location.search === search) return search;
  try { history.replaceState(history.state ?? null, '', `${location.pathname}${search}${location.hash ?? ''}`); }
  catch (e) { console.warn('[boot] the URL could not be written - the online lane reads it and will not see this session:', e?.message ?? e); }
  return search;
}

/** REALM P0.1: THE URL'S POWERS STAY
 *  OFFLINE. F304 left the shipped build's URL flags ungated ("URL flags are fine, no need"), because a single-player
 *  game's cheats are the player's business. Online they are every other player's too:
 *  - `?shot` installs the probe seams, `window.__addGold` among them;
 *  - `?fly` and `?nofoes` walk a shared world with no walls and no foes, and `?tp` teleports;
 *  - `?class`, `?spell` and `?weapon` hand a character what it never earned;
 *  - `?spawn`, `?region` and `?loc` choose where a fresh character stands;
 *  - `?tod`, `?timescale`, `?weather`, `?wseed` and `?season` stand against the shared clock and sky.
 *  An online boot drops every one of them before anything reads them (scenes/world.js, beside the Test Room's refusal),
 *  and publishes the drop so every later reader of the URL agrees. Offline, F304 stands. */
export const ONLINE_REFUSED_FLAGS = Object.freeze(['shot', 'fly', 'nofoes', 'tp', 'class', 'spell', 'weapon', 'spawn', 'region', 'loc', 'tod', 'timescale', 'weather', 'wseed', 'season', 'editor']);   // POI-3: the POI editor's free eye and its map jump are powers too - a builder edits offline
/** Drops the refused flags from an online boot's params, in place. Answers the flags it dropped (none offline). */
export function refuseOnlinePowerFlags(params) {
  if (!params?.has?.('online')) return [];
  const dropped = ONLINE_REFUSED_FLAGS.filter((k) => params.has(k));
  for (const k of dropped) params.delete(k);
  return dropped;
}

/** Is a Features row that says `online: 'room'` pinned in the official profile, as a boolean or one of its tiers?
 *  features.js holds every such row to it. */
export function roomPinned(c) {
  const prefs = OFFICIAL_PROFILE.pins.prefs;
  if (!Object.hasOwn(prefs, c.key)) return false;
  const pin = prefs[c.key];
  return typeof pin === 'boolean' || (c.tiers ?? []).some(([v]) => v === pin);
}

/** The port's switches the lane forces online, at the installed profile's `pins.prefs`. A live binding, so it follows
 *  the profile the front door installs. */
export let ONLINE_FORCED_PREFS = activePins().prefs;
/** The registry's door: a `'player'` answer leaves the key to the player by name. Idempotent. */
export function declareOnlinePrefs(table) {
  for (const [key, answer] of Object.entries(table ?? {})) {
    if (answer === 'player' && !ONLINE_PLAYERS_OWN_PREFS.includes(key)) ONLINE_PLAYERS_OWN_PREFS.push(key);
  }
}

/** The switches the lane deliberately leaves to the player (SURV-TIERS: and one tier, the survival pref) -
 *  the pin fails on a boolean uiPrefs key that is in neither list. */
export const ONLINE_PLAYERS_OWN_PREFS = [
  'tutorialPopups',   // TUT1: the tutorial's popups are each player's to keep or turn off
  'touchAnalogStick', 'touchGyroLook', 'touchHaptics', 'touchFullscreen',   // TI2: how this phone is held
  'showFps',          // FPS1: a diagnostic over the game
  'hudLocked',        // HUD-MOVE: where THIS player keeps their HUD - a layout on one screen, nothing the room agrees on
  'hudBarsSplit',     // HUD-MOVE: whether this player's three bars move apart - the same screen's
  'hudSnap',          // HUD-SNAP: whether this player's pieces catch on each other while moved - the same screen's
  'shotDownload',     // LOAD1: whether THIS player's screenshot key also saves a file - their disk, nobody else's
  'skipStartVideo',   // UXB1-A: whether THIS player sits through the opening film - read at the front door, before any room
  'chatHidden',       // CHAT-R2: whether THIS player wants the chat on screen - the room does not get a say in what someone looks at
  'peerClassSprites', // 2026-09-17: how OTHER players are drawn on THIS machine (animated class sprite vs paperdoll) -
                       // purely a local rendering choice, same shape as chatHidden above; it changes nothing the room agrees on
  'peerAttackSounds', 'peerFootsteps',   // PEER-FS1: and how OTHER players are HEARD on this machine - the same local-only shape
  'nightCrickets', 'distantHowl',        // SNDREP1: whether THIS player hears the night's crickets and the far howl - an ear, nothing the room agrees on
  'heldMap',          // MAP-TOGGLE: whether THIS player's maps are the held sheet or DFU's windows - a look, nothing the room agrees on
  'plusCursor', 'plusItemHover',   // PLUS6/7: the Plus dress's gauntlet cursor and its hover card - what THIS screen draws (OVH3's law: the skin is the player's; PLUS-ONLY retired `enhancedPlus`)
  'packPhoneDoll',    // PACK-PHONE: whether THIS phone's pack draws the body - what this screen draws
  'padCursorAssist',  // PAD-CURSOR: how THIS player's controller cursor feels - nothing the room agrees on
  'plusToggleRun',    // PADPLUS1: whether THIS player's Run button latches - how this pad is held, nothing the room agrees on
  'proceduralSky',    // EE1's legacy key, read only by the migration
  'language', 'languageOffered',   // L10N1b: the language THIS player reads the port in, and whether the front door has asked - words on this screen, nothing the room agrees on
  'restWithParty',   // REST-OPT: whether I rest with my party or alone - my own say
  'gentleActs',   // PROF1: Gentle acts - an accessibility choice; every act plain is never an edge over another player
  'acceptStrangerSpells',   // SPELL-GIFT: whether a stranger's healing and protective spells land on THIS player - their own say
  'showToTravellers',   // TV3: whether the region's travellers see where THIS player is - their own say
  'chatChannelColours', 'chatPingSound',   // CHAT-COLOURS, PING1: how THIS player's chat is coloured and whether a ping chimes - a screen and an ear, nothing the room agrees on
  'chatTrade', 'chatLfg',   // CHAT-TRADE: whether THIS player listens to the Trade and LFG channels - their tabs, nothing the room agrees on
  'standingAll',   // EVERY-STANDING: whether THIS player's Standing page lists every faction's number - a page they read, nothing the room agrees on
  'reducedMotion',   // whether THIS player's title cards stand still (ui/gate/gateTitleCard.js) - an accessibility choice, nothing the room agrees on
];   // (RF4: grown by declareOnlinePrefs with the registry's 'player' answers - the dials)

/** The DFU settings the room plays by (settings.js getData asks here first), in DFU's own strings: each profile key
 *  that names a `setting`, at the installed profile's value. A live binding. */
export let ONLINE_FORCED_SETTINGS = forcedSettingsOf();
function forcedSettingsOf() {
  const out = {};
  for (const [name, key] of Object.entries(PROFILE_KEYS)) {
    if (!key.setting) continue;
    const [section, k] = key.setting.split('.');
    (out[section] ??= {})[k] = rule(name, '?online') ? 'True' : 'False';
  }
  return Object.freeze(out);
}
/** The forced raw value of a DFU `section/key` on an online page, else undefined. The table first (AUDIT RETRO1
 *  G2): every settings read comes through here - retro mode's, a dozen a frame - and the page test builds a
 *  URLSearchParams each time, for the one key in the table. */
export function onlineForcedSetting(section, key, search) {
  return Object.hasOwn(ONLINE_FORCED_SETTINGS[section] ?? {}, key) && isOnlinePage(search) ? ONLINE_FORCED_SETTINGS[section][key] : undefined;
}

/** The forced value of a uiPrefs key on an online page, else undefined.
 *  PERF-URL2:
 *  THE TABLE FIRST, as onlineForcedSetting above has asked it since AUDIT RETRO1 G2. getPref asks this on every read - hundreds a frame
 *  - and the page test reads `location.search`, a DOM getter, before PERF-URL's memo can answer; the table forces a
 *  handful of keys (the Features registry's own switches, RF4 - AUDIT 637 C5: not the mods'), so every other read paid the page for nothing
 *  (measured in the real game, offline: 0.09 ms a frame of isOnlinePage under onlineForcedPref, beside the sea's own
 *  forced switch). Two pure reads joined by `&&`: the same answer in either order. */
export function onlineForcedPref(key, search) {
  return Object.hasOwn(ONLINE_FORCED_PREFS, key) && isOnlinePage(search) ? ONLINE_FORCED_PREFS[key] : undefined;
}

/** AUDIT TRAVEL-ONLINE T7: what the map says if a trip over land ever reaches fast travel online (world.js's fork) -
 *  unreachable while the room holds Travel Options' switches, said rather than teleported should it ever be reached. */
export const ONLINE_LAND_TRAVEL_REFUSAL = 'Online, journeys over land cannot be skipped. Turn on Travel Options and try again.';

/** The mod keys the lane forces online: the installed profile's `pins.modKeys` (why each is the room's is written in
 *  officialProfile.ts). A live binding. */
export let ONLINE_ROOM_MOD_KEYS = activePins().modKeys;

/** Mods whose every switch is the player's online: they draw on one screen, or the owner's machine resolves them and the
 *  wire carries the result. Hand-written, so onlinelane.test.js fails a vendor in neither this list nor the room's. */
export const ONLINE_PLAYERS_OWN_MODS = [
  // AUDIT-WH R8: a readout is the player's - it stands nothing, rolls
  // nothing, writes nothing and is not on the wire.
  'world-tooltips',
  // MODS-ONLINE: what draws on your own screen and nowhere else.
  'dynamic-skies',         // the sky dome over a weather the room already shares (WORLD5 rolls it; this only paints it)
  'seasons-iliac-bay',     // which texture archives load for the season - a swap in front of the same terrain
  'weapon-widget',         // the first-person weapon's own motion; no damage, no timing, no attack state
  'eye-of-the-beholder',   // third person and your own billboard; peers are drawn by remotePlayers either way
  'readied-spellcasting-hands',   // RSH1: your own first-person hands on your own screen; the cast itself is unchanged
  'immersive-footsteps',   // your own footstep audio
  'better-ambience',       // ambient audio and the dungeon's darkness, both drawn locally
  // MODS-ONLINE-2: what the port already resolves at the
  // machine that owns the actor, so the wire carries the result and
  // never the rule - and which MODS-ONLINE-4 then re-asked "does my
  // switch reach another player?", moving three of them back.
  'shield-widget',               // the block is the DEFENDER's - damageShieldPool runs where the blow lands
  'handheld-torches',            // an item in my save with a light on my screen
  'diverse-weapons',        // DW1: the first-person weapon's and the icons' art - drawn on your own screen and nowhere else
  'horse-cart-and-cargo',   // HCC: whose horse and wagon stand where is the player's own; the others only SEE them (the online half rides the pose and the cell's frame, never a switch of the room's ground)
  'warm-ashes-ships',       // WA1: my own voyage's ambush - my quest, my crew and pirates (a spawner's foes, WORLD2: a peer on the same deck sees them fight), my lent ship; the pirate vessels are my blocks' variant and stand 40-140 m off in open water, where a peer without them sees sea
  'foraging',               // FORAGE1: my own tools, my own pack, my own quests - a use, a food, a fetch quest all run on my save
  'low-poly-trees',         // LPT1: how the wilderness's trees are DRAWN - a 3D tree or its far picture where the same flat stands; the tree's cover, its sway, its Logging node and its fall are the flat's own, so a peer without it walks the same wood
  // 'project-legacy' moved to ONLINE_ROOM_MOD_KEYS with CHARACTER MODES: its `Enabled` decides whether the Legacy mode is offered, which is the room's.
  // LEGACY1 (kept for the dials below): my own family - its record, its births and its deaths are my characters'; the heirloom is an item in my save, and its power is folded where it is worn
  'physical-items',         // PI1: how MY loot lies - my own bodies' items stood round them (a peer's body shows none: its list is its owner's), my own shift-drops a pile as any drop is; a take off a dungeon's body is the room's word as the quick door's is (dungeonContext.js publishLoot), so what any peer reads of a container is the same switch on or off
  'come-sail-away',         // CSA-A: a boat is a possession in my save, placed and sailed by me - HCC's wagon's shape: whose boat stands where is the player's own, and a peer only SEES me move (my pose); its wind is my machine's own roll (ComeSailAway.UpdateWind, UnityEngine.Random), as it is each DFU player's
  'heat-haze',              // HAZE1: the desert's shimmer on your own screen, over a weather and an hour the room already shares
  'windfall',               // WINDFALL1: how the trees sway, the leaves and flakes that blow and the gusts you hear - your own screen and speakers; nothing stands, rolls or is written
  'snowfall',               // SNOWFALL1: the winter ground's paint and the snow drawn over it, on your own screen - the floor under it is the terrain's
];

/** Mods the room holds whole: every key reads its shipped default online but the listed free keys. The installed
 *  profile's `pins.wholeMods`; a live binding. */
export let ONLINE_WHOLE_MODS = activePins().wholeMods;
onProfileInstalled(() => {
  ONLINE_FORCED_PREFS = activePins().prefs;
  ONLINE_FORCED_SETTINGS = forcedSettingsOf();
  ONLINE_ROOM_MOD_KEYS = activePins().modKeys;
  ONLINE_WHOLE_MODS = activePins().wholeMods;
});

/** The forced value of a mod's switch on an online page, else undefined -
 *  the table above, by vendor AND key, so a mod may have one switch the
 *  room owns and the rest the player's. */
export function onlineForcedModSetting(vendor, key, search) {
  const room = ONLINE_ROOM_MOD_KEYS[vendor];
  if (!room || !Object.hasOwn(room, key)) return undefined;
  return isOnlinePage(search) ? room[key] : undefined;
}
/**
 * PARTY-LOOT: A ROOM'S SHARED BASE IS ROLLED UNDER THE ROOM'S RULES.
 * Every client in a dungeon room computes the same base list for a container (systems/roomLoot.js), and a take names
 * a piece of it by its place in that list - so a draw that reads ONE player's switch is a different list on that
 * player's machine, and the take lands on another piece. MODS-ONLINE-2 left a vendored mod's switches the player's
 * (Foraging's, the Ocean Hole's, Unleveled Loot's dials apart from P0.2's), and several of them roll into a pile or a
 * body. For the length of a base roll every key of every mod reads its SHIPPED default, as P0.2 reads a balance mod's
 * online: `asTheRoom(fn)` raises the scope around the synchronous roll and lowers it in a `finally`, so no read outside
 * the roll sees it and a throw cannot leave it raised. Nested calls nest. What the player's own switches decide stays
 * theirs everywhere else - and in their own bonus layer, which is rolled outside this scope.
 */
let _roomRoll = 0;
export function asTheRoom(fn) {
  _roomRoll++;
  try { return fn(); } finally { _roomRoll--; }
}
/** Whether a room's base is being rolled now (tests; the scope's own pin). */
export const rollingAsTheRoom = () => _roomRoll > 0;
/** REALM P0.2: a key the room owns WHOLE (ONLINE_WHOLE_MODS) - its value online is its shipped default, which
 *  modSettings.js onlineModSetting reads (this lane cannot read the table without a cycle). `offline` asks the table
 *  alone, for the offline sync's copy of the room's rules. */
export function onlineWholeModKey(vendor, key, search, { offline = false } = {}) {
  if (_roomRoll > 0) return true;   // PARTY-LOOT: while a room's base rolls, every mod is the room's whole (asTheRoom, below)
  const whole = Object.hasOwn(ONLINE_WHOLE_MODS, vendor) ? ONLINE_WHOLE_MODS[vendor] : null;
  return !!whole && !whole.includes(key) && (offline || isOnlinePage(search));
}
