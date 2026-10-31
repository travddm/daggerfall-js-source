// @ts-check
// WB12c (2026-10-01, Mac: "shops, libraries and the first breach" for the book): THE PORT'S OWN BOOKS - books the
// classic table never had, written into the BOK format's own bytes (formats/bookFile.js) so the reader, the raum-book
// face, the item's title and its price read them as they read a classic book. The classic table baked from DFU
// (systems/booksData.js) is never touched: a port book's id is above every classic one, its low byte no classic
// book's (the filename law reads the low byte - BOK%05d.TXT), and the one door (ui/bookDoor.js) reads it here before
// it asks for a file. Design: bible/11-Multiplayer/World-Bosses.md section 19 C; the text is its appendix.
//
// Not a DFU member. Ledger A (WB).
import { RSC } from '../formats/textRsc.js';
import { BookFile, messageToBookFilename } from '../formats/bookFile.js';
import { getSeed, setSeed } from '../formats/dfRandom.js';

/** WB12c: On the Burning Doors - id 417 (the year), a Mages Guild conjurer's account of the breaches. */
export const BURNING_DOORS_ID = 417;
/** GUN-LORE (2026-10-24; bible/05-Combat/Dwarven-Thunderlock.md "GUN-LORE"): Rourken Thunder - id 418, a Sentinel
 *  antiquarian's account of the Dwemer guns and the shot they throw. */
export const ROURKEN_THUNDER_ID = 418;

/**
 * A port book: its header's title and author, and its pages - each a list of rows, a row a paragraph the reader wraps
 * (`center` for a centred one, `font` a FontPrefix face - BOOK_TITLE_FONT) or '' for an empty line.
 * @typedef {{ title: string, author: string, pages: ReadonlyArray<ReadonlyArray<string|{ text: string, center?: boolean, font?: number }>> }} PortBook
 */

/** The face a title page sets: FontPrefix 5, FONT0004 (ui/bookReader.js BOOK_FONT_NAMES, ui/enhanced/enhancedBook.js
 *  FACE_OF_PREFIX). The empty line under it puts the reader back in its own face. */
export const BOOK_TITLE_FONT = 5;

/** @type {(head: string, text: string) => ReadonlyArray<string|{ text: string, center?: boolean }>} */
const section = (head, text) => Object.freeze([{ text: head, center: true }, '', text, '']);

/** A port book, frozen and typed as one (the map's entries each a PortBook, never the first entry's literal type). */
const book = (/** @type {PortBook} */ b) => /** @type {PortBook} */ (Object.freeze(b));

/** @type {ReadonlyMap<number, PortBook>} */
export const PORT_BOOKS = new Map([[BURNING_DOORS_ID, book({
  title: 'On the Burning Doors',
  author: 'Ysolde Marnhel',
  pages: Object.freeze([
    Object.freeze([
      { text: 'On the Burning Doors', center: true, font: BOOK_TITLE_FONT }, '',
      { text: 'by Ysolde Marnhel', center: true },
      { text: 'Master Conjurer of the Mages Guild, Wayrest', center: true }, '',
      'Every day now, somewhere in the wilds of the Bay, the sky catches fire. Herders swear to a door of black stone that rises where no stone stood, its arch full of flame, and to a lord of the Deadlands who waits within. The common folk call these the doors of Oblivion and bar their shutters. They are right to bar them, and wrong about nearly everything else.',
      '',
    ]),
    section('The Covenant', 'Since the days of Saint Alessia, Akatosh has kept a covenant with the blood of the Emperors. While a Septim wears the Amulet of Kings and the Dragonfires burn in the Temple of the One, no Prince of Oblivion may force his way into Tamriel. Our Emperor Uriel, seventh of that name, sits the Ruby Throne, and the fires burn. No invasion comes. But the Covenant was made to bar a door forced from without. It was never made to bar a door opened from within. Every apprentice who calls a scamp into a circle proves as much, and every coven of the Bay that calls a Prince on his own day proves it more loudly.'),
    section('The faithful', 'Mehrunes Dagon, Prince of Destruction, has never lacked for worshipers in a land as quarrelsome as ours. His faithful keep to the wilds, and to a rite older than Wayrest. They gather about a ring of braziers, burn his sigil into the earth, and bleed for him. What opens is not a gate as the Daedra raise them in their own realms. It is a breach: a wound in the world, held open by the will of the Prince and the blood of his faithful, and by nothing else.'),
    section('The Warden', 'No Prince walks through such a wound himself. He sends a lord of his house to hold it, a Dremora of the rank they call valkynaz, and the one who answers most often in our Bay names himself Ruhn. Among the faithful he is the Warden of the Burning Gate. I have spoken with three who stood before him and lived. They agree that he is very large, that he burns, and that he does not tire.'),
    section('Why the doors close', 'Here the Covenant shows its teeth. A breach is a door the Dragonfires did not permit, and they will not suffer it long. From the hour it opens the Covenant presses upon it like a hand upon a wound. Within two hours it is sealed; two hours after, it collapses entirely, and whatever of Dagon\'s remains on our side is cast back into the Deadlands. Should the Warden fall before then, the breach fails at once. It is his will that holds the door.'),
    section('The Battlespire', 'I am asked whether the Prince has done such a thing before. He has, and worse. In the years of the false Emperor his legions took the Battlespire itself, where the Empire trained its battlemages, and held it until a single apprentice drove them out. Not since the Battlespire fell has Dagon found doors so wide as these.'),
    section('The embers', 'Those who close a breach carry out coals of its fire. They do not cool and they do not go out, and in the Guild we call them Deadlands embers. The Guild will buy them for study. A certain Broker of the wilds pays better, and asks fewer questions.'),
    section('Counsel', 'If you would close a door, find the faithful first. Their circle stands within sight of where the breach will open, and their smoke rises with the first omen. No one coven opens a breach - the Prince presses on that place from his side, and the faithful only widen the wound - so their door will open whatever you do. But cut down their Summoner before the rite is done, and the fire of the broken rite clings to those who broke it: when the door is closed, it pays each of them an ember more. What the faithful keep in their circle is yours as well. Do not go alone. Do not stand where the ground glows. And when the Covenant closes the door, do not be on the wrong side of it.'),
  ]),
})], [ROURKEN_THUNDER_ID, book({
  title: 'Rourken Thunder',
  author: 'Imrah Bel-Tavir',
  pages: Object.freeze([
    Object.freeze([
      { text: 'Rourken Thunder', center: true, font: BOOK_TITLE_FONT }, '',
      { text: 'On the Guns of the Dwemer, and the Shot They Throw', center: true }, '',
      { text: 'by Imrah Bel-Tavir', center: true },
      { text: 'Antiquarian of Sentinel', center: true }, '',
      'Every curio dealer between Sentinel and Wayrest claims to have held a Dwemer gun, and most of them think it was a kind of crossbow. It was not. I have held three, taken one apart, and lost the use of two fingers for a season to a fourth. This is what I have learned about them, and about the brass beads they fire.',
      '',
    ]),
    section('The Rourken', 'These guns were made by the Rourken, not the Dwemer of Morrowind. When the eastern Dwemer allied with the Chimer, the Rourken clan refused. Their lord threw his hammer, Volendrung, out of Morrowind and swore to build wherever it landed. It landed in the Alik\'r, and there they built Volenfell, the City of the Hammer. They were soldiers and sailors, and they disappeared with every other Dwemer at Red Mountain.'),
    section('The tonal art', 'The Dwemer could move, mend or break things with sound. Their scholars called it tonal architecture. A note tuned to an object acts on it, the way a singer can crack a glass. Kagrenac\'s great works were the largest use of it. The Rourken guns are among the smallest.'),
    section('The coil', 'There is no flint, pan or powder inside a Dwemer gun. There is a coil of tuned brass and crystal, wound by a small key, and a striker held off it by the trigger. Pull the trigger and the coil sounds one note. Then it has to be wound again. A gunner turning the key between shots is not loading the gun. He is tuning it.'),
    section('The bead', 'The shot is a bead the Dwemer called a pellet: a pea of brass sealed around a speck of aetherium, the blue crystal they mined and fought over. The coil\'s note is pitched to that crystal and sets its charge loose, so the bead leaves the barrel as a ball of lightning. That is why the flash is the colour of the shot, and why the gun is so loud. The thunder you hear is the note.'),
    section('The long gun and the short', 'I know of two Rourken guns. The long one, which dealers call a thunderlock, belonged to the Tonal Guard: a heavy two-handed gun with a long coil and a deep note. The short one, the pistolet, was made for the decks of their airships. Its coil fires once before it must be wound, so their marines carried them in pairs and fired one while winding the other. Both use the same beads, and neither is any use without them.'),
    section('Why they are rare', 'No forge in the Bay has made a pellet since the Dwemer disappeared, and no mage I know can charge a dead one. Live ones turn up in the old stores under the Alik\'r, in the packs of the treasure-hunters who died robbing them, and in the hold of the Rourken airship that still comes over Daggerfall.'),
    section('Counsel', 'Do not open the lock. Do not hold a bead to your ear. Do not fire one indoors. Do not buy a gun without beads, or beads that do not hum. A dead bead is only a pea.'),
  ]),
})]]);

/** The port books' ids, in order. */
export const PORT_BOOK_IDS = Object.freeze([...PORT_BOOKS.keys()]);
export const isPortBook = (id) => PORT_BOOKS.has(id);
export const portBookTitle = (id) => PORT_BOOKS.get(id)?.title ?? null;

/** The BOK header's length before the page offsets (formats/bookFile.js: title 64, author 64, the tag 8, 88 empty,
 *  the price u32, three u16s, the page count u16). */
const HEADER = 236;

/** A row's bytes: printable ASCII only - anything else is the file's own '?' (textRsc.js encodeRscRecord's rule). */
function textBytes(out, s) {
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    out.push(c >= RSC.FirstCharacter && c <= RSC.LastCharacter ? c : 0x3f);
  }
}

/**
 * A port book in the BOK format's own bytes: the header (title, author, its price - the classic law's own for its
 * title, as the reader's load rolls it), the page offsets, and each page a token stream - a centred row opened by
 * JustifyCenter, a left one by JustifyLeft, a face by FontPrefix, each closed by NewLine, an empty line a bare NewLine
 * (which also ends a centred run and a face - ui/bookReader.js layoutBookLines) - closed by EndOfPage. Pure.
 * @param {PortBook} book
 */
export function encodePortBook(book) {
  const pages = book.pages.map((rows) => {
    const out = [];
    for (const r of rows) {
      if (r === '') { out.push(RSC.NewLine); continue; }
      const row = typeof r === 'string' ? { text: r } : r;
      out.push(row.center ? RSC.JustifyCenter : RSC.JustifyLeft);
      if (row.font) out.push(RSC.FontPrefix, row.font);
      textBytes(out, row.text);
      out.push(RSC.NewLine);
    }
    out.push(RSC.EndOfPage);
    return out;
  });
  const start = HEADER + 4 * pages.length;
  const bytes = new Uint8Array(start + pages.reduce((n, p) => n + p.length, 0));
  const v = new DataView(bytes.buffer);
  const field = (s, at, len) => { const b = []; textBytes(b, s); bytes.set(b.slice(0, len - 1), at); };   // a C string, NUL-ended
  field(book.title, 0, 64);
  field(book.author, 64, 64);
  v.setUint16(234, pages.length, true);
  let at = start;
  pages.forEach((p, i) => { v.setUint32(HEADER + 4 * i, at, true); bytes.set(p, at); at += p.length; });
  v.setUint32(224, classicPrice(bytes), true);
  return bytes;
}

/** The classic price law for a book's bytes: BookFile's own roll off the title's first four bytes (300-800) - with the
 *  generator's state put back, so pricing a port book never moves the classic draws (the port prices the classic books
 *  once, at boot - systems/books.js loadBookPrices - and never at a mint). */
function classicPrice(bytes) {
  const seed = getSeed();
  try {
    const f = new BookFile();
    f.load(bytes, 'BOK00000.TXT');
    return f.price;
  } finally { setSeed(seed); }
}

/** @type {Map<number, Uint8Array>} */
const _bytes = new Map();
/** A port book's bytes, or null for any other id. Encoded once. */
export function portBookBytes(id) {
  const book = PORT_BOOKS.get(id);
  if (!book) return null;
  if (!_bytes.has(id)) _bytes.set(id, encodePortBook(book));
  return /** @type {Uint8Array} */ (_bytes.get(id));
}

/** A port book opened as the reader opens a classic one (its filename the id's own, so the price law is the
 *  classic's), or null for any other id. */
export function openPortBook(id) {
  const bytes = portBookBytes(id);
  if (!bytes) return null;
  const f = new BookFile();
  f.load(bytes, messageToBookFilename(id));
  return f;
}

/** A port book's price - the classic law's own for its title, as its header carries it - or null for any other id. */
export function portBookPrice(id) {
  const bytes = portBookBytes(id);
  return bytes ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(224, true) : null;
}
