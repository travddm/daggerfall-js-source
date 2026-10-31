// AUDIT 26 - the MODAL host (src/scenes/worldModes.js): the interior /
// dungeon mode machine the two exterior hosts hand the frame to.
//
// Every pin below is a DFU law the machine had lost at one seam while
// its siblings kept it: the right-click a window owns, the motor a
// paused window stops, the window a forced door has to pop, the scene
// it has to cache, the StaticNPC.Data a conversation is keyed by, and
// the goods a sale actually takes out of the pack.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { staticNpcData, staticNpcName } from '../../src/characters/staticNpc.js';
import { RACES } from '../../src/systems/races.js';
import { NPCSession, SOCIAL_GROUP } from '../../src/systems/npcSession.js';
import { getNameBankOfRegion } from '../../src/characters/nameHelper.js';   // F016

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (f) => readFileSync(join(ROOT, f), 'utf8');

/** The brace-matched body of a function/method, from its header. */
function bodyOf(text, header) {
  const i = text.indexOf(header);
  assert.ok(i > 0, `${header} not found`);
  let depth = 0;
  let j = text.indexOf('{', i + header.length - 1);
  const start = j;
  for (; j < text.length; j++) {
    if (text[j] === '{') depth++;
    else if (text[j] === '}' && --depth === 0) break;
  }
  return text.slice(start, j + 1);
}

/** Is `needle` inside a brace-matched `gate` block somewhere in text? */
function insideGate(text, gate, needle) {
  const target = text.indexOf(needle);
  assert.ok(target > 0, `${needle} not found`);
  for (let i = text.indexOf(gate); i >= 0; i = text.indexOf(gate, i + 1)) {
    let depth = 0;
    let j = text.indexOf('{', i + gate.length - 1);
    const open = j;
    for (; j < text.length; j++) {
      if (text[j] === '{') depth++;
      else if (text[j] === '}' && --depth === 0) break;
    }
    if (target > open && target < j) return true;
  }
  return false;
}

// ---------------------------------------------------------------------
// F205 - a right-click on a window is the WINDOW's.
// UserInterfaceManager.cs:179-185: AddWindow pauses the game for any
// PauseWhileOpen window, so the click never reaches WeaponManager - and
// in this port the modal sink runs magic.interceptAttack FIRST, so an
// ungated right-click cast the readied spell instead of removing an item.
// ---------------------------------------------------------------------

// ---------------------------------------------------------------------
// F065 - PauseGame(true) sets Time.timeScale = 0 (GameManager.cs:600-609),
// so PlayerMotor stops updating entirely. Zeroed inputs are the PARALYSIS
// law, not this one: they let gravity, velocity and the crouch edge keep
// running under an open menu.
// ---------------------------------------------------------------------

// ---------------------------------------------------------------------
// F211 + F064 - the FORCED door (anchor recall, the guild's Teleportation
// service, a quest TeleportPc landing). Teleport.cs:145-148 caches the
// interior scene before departing; UserInterfaceManager.cs:189-196 runs
// OnPop on every window it removes, and RestWindow raises IsResting on
// open and clears it there alone.
// ---------------------------------------------------------------------

// ---------------------------------------------------------------------
// F018 - TalkToStaticNPC reads targetNPC.Data (TalkManager.cs:752-770):
// the nameSeed the questor pool and castleNPCsSpokenTo are keyed by, the
// factionID the faction walk starts from, the race the NPCData carries.
// The port handed it the raw block-person record, which has none of them.
// ---------------------------------------------------------------------

const blockPerson = (over = {}) => ({
  x: 1, y: 2, z: 3, textureArchive: 182, textureRecord: 4,
  factionID: 0, flags: 0, rawX: 10, rawY: 20, rawZ: 30, position: 1234, ...over,
});

const session = (over = {}) => new NPCSession({
  factionData: () => null,
  factionName: () => '',
  reactionToPlayer: () => 0,
  expandRandomTextRecord: (id) => `record:${id}`,
  randomTokens: (id) => [{ text: `tokens:${id}` }],
  messageBox: () => {},
  pushTalkWindow: () => {},
  sgroupReputation: () => 1000,
  rolls: () => 0.9,
  ...over,
});

test('AUDIT 26 F018: the talk seam is handed StaticNPC.Data - the block record has no nameSeed at all', () => {
  const pn = blockPerson();
  assert.equal(pn.nameSeed, undefined, 'collectInteriorPeople writes no such field - `pn.nameSeed ?? 0` is always 0');
  // SetLayoutData (StaticNPC.cs:210-224): position ^ (buildingKey + locationIndex)
  const data = staticNpcData(pn, { mapId: 5, locationIndex: 9, buildingKey: 7 });
  assert.equal(data.nameSeed, 1218);
  assert.equal(data.nameSeed, (1234 ^ (7 + 9)) | 0);

  // ...and the questor pool is keyed by that derived seed (TalkManager.cs
  // :2845/:2868 add by npcData.nameSeed, :759 looks up by .Data.nameSeed).
  const work = { npc: data, socialGroup: SOCIAL_GROUP.Merchants, buildingName: 'The Inn' };
  const s = session();
  s.npcsWithWork.set(data.nameSeed, work);
  assert.equal(s.talkToStaticNPC({ data, isChildNPC: false, displayName: 'x' }).kind, 'questOffer',
    'the derived record finds the questor');
  const s2 = session();
  s2.npcsWithWork.set(data.nameSeed, work);
  assert.equal(s2.talkToStaticNPC({ data: pn, isChildNPC: false, displayName: 'x' }).kind, 'talk',
    'the block record keys by 0, so no townsperson in the game could ever be carrying work');

});

// ---------------------------------------------------------------------
// F017 - GetRaceFromFaction (StaticNPC.cs:357-369) always has the live
// FactionData lookup and the region fallback. The guild popup's Talk
// button re-derived the data without either, so every NPC reached that
// way was a Nord answering to a different generated name than the same
// NPC clicked directly.
// ---------------------------------------------------------------------

test('AUDIT 26 F017: the popup Talk reads the same StaticNPC.Data the click derived - race lookups and all', () => {
  const pn = blockPerson({ factionID: 88 });
  // FACTION.TXT's own race enum: Breton is 3 there (FactionFile.cs:609-623)
  const getFaction = (id) => (id === 88 ? { id: 88, type: 1, race: 3, name: 'The Merchants' } : null);
  const withLookups = staticNpcData(pn, {
    buildingKey: 7, locationIndex: 9, getFaction, raceOfCurrentRegion: () => RACES.Redguard,
  });
  assert.equal(withLookups.race, RACES.Breton, 'a named faction lends its race');
  // no lookups: GetFactionData's out-struct default is FactionRaces.Nord
  assert.equal(staticNpcData(pn, { buildingKey: 7, locationIndex: 9 }).race, RACES.Nord);
  // AUDIT 26 F016 removed the race->bank path this pin demonstrated
  // the hazard through: the bank is the REGION's now (SetRuntimeData
  // :309), so the same seed draws the same name whatever race the two
  // derivations landed on. F017's real point - one derivation, lent
  // to the popup - is the source pins below; the RACE divergence
  // itself is still pinned, one assertion up.
  assert.equal(
    staticNpcName(withLookups, { getFaction, nameBank: getNameBankOfRegion(17) }),
    staticNpcName(staticNpcData(pn, { buildingKey: 7, locationIndex: 9 }), { getFaction, nameBank: getNameBankOfRegion(17) }),
    'one region, one bank - the race no longer renames the NPC',
  );

});

// ---------------------------------------------------------------------
// F063 - DaggerfallTradeWindow.cs:795 TransferItem takes a staged item OUT
// of PlayerEntity.Items, and the Sell confirm then clears the remote lot
// (:1036-1051). The port's window stages out of a filtered COPY of the
// pack, so nothing ever left it: the sale paid and the goods stayed.
// ---------------------------------------------------------------------

