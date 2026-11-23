// The piece frame: a cut and a join give back the frame's exact text at the limits, and the client's intake refuses
// every piece out of its bounds without holding more than one frame a socket.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Loaded by a computed path: the wire's imports name the DOM's crypto types, which tsconfig.node.json does not have.
const PIECES_PATH: string = '../../src/net/bulk-pieces.ts';
const WIRE_PATH: string = '../../src/net/wire.js';
const { BULK_PIECE_CHARS, PIECES_MAX, PIECE_MARK, PIECE_SEQ_MOD, PieceIntake, cutPieces, pieceEnds, pieceFrame, readPieceHeader } =
  await import(PIECES_PATH);
const { INBOUND_FRAME_MAX, WORLD_FRAME_MAX } = await import(WIRE_PATH);

const socket = {};

function joinAll(frames: string[], intake = new PieceIntake()): unknown {
  let out: unknown = null;
  for (const frame of frames) out = intake.take(socket, frame);
  return out;
}

test('a frame one unit over a piece is cut in two and joins back exactly', () => {
  const text = 'a'.repeat(BULK_PIECE_CHARS + 1);
  const frames = cutPieces(text, 7);
  assert.equal(frames.length, 2);
  assert.ok(frames.every((frame: string) => frame.startsWith(`${PIECE_MARK}7,`)));
  assert.equal(joinAll(frames), text);
});

test('a frame of one piece or less is not cut', () => {
  assert.deepEqual(pieceEnds('a'.repeat(BULK_PIECE_CHARS)), [BULK_PIECE_CHARS]);
  assert.deepEqual(pieceEnds(''), []);
});

test('the largest world frame joins back exactly, in at most PIECES_MAX pieces', () => {
  const text = `{"t":"world","id":"x","data":{"s":"${'b'.repeat(WORLD_FRAME_MAX)}"}}`;
  const frames = cutPieces(text, PIECE_SEQ_MOD - 1);
  assert.ok(frames.length <= PIECES_MAX);
  assert.equal(joinAll(frames), text);
});

test('the largest frame the client takes joins back, and one unit more is dropped', () => {
  const intake = new PieceIntake();
  assert.equal(joinAll(cutPieces('c'.repeat(INBOUND_FRAME_MAX), 1), intake), 'c'.repeat(INBOUND_FRAME_MAX));
  assert.equal(joinAll(cutPieces('c'.repeat(INBOUND_FRAME_MAX + 1), 2), intake), null);
  assert.equal(intake.drops, 1);
  assert.equal(intake.holds(socket), false, 'the partial frame is let go');
});

test('a cut never splits a surrogate pair, so the text survives the wire unchanged', () => {
  const text = 'x'.repeat(BULK_PIECE_CHARS - 1) + '\u{1F600}' + 'y'.repeat(10);
  const ends = pieceEnds(text);
  assert.equal(ends[0], BULK_PIECE_CHARS - 1, 'the pair goes whole into the second piece');
  for (const frame of cutPieces(text, 3)) assert.equal(frame.isWellFormed(), true);
  assert.equal(joinAll(cutPieces(text, 3)), text);
});

test('non-ASCII text round-trips', () => {
  const text = 'é漢'.repeat(BULK_PIECE_CHARS);
  assert.equal(joinAll(cutPieces(text, 4)), text);
});

test('a frame that is no piece passes through untouched', () => {
  const intake = new PieceIntake();
  assert.equal(intake.take(socket, '{"t":"pong"}'), '{"t":"pong"}');
  const binary = new ArrayBuffer(4);
  assert.equal(intake.take(socket, binary), binary);
});

test('headers out of range are refused', () => {
  const body = 'z';
  const refused = [
    `${PIECE_MARK}1,0,1,${body}`, // a frame of one piece is never cut
    `${PIECE_MARK}1,2,2,${body}`, // index past the count
    `${PIECE_MARK}1,0,${PIECES_MAX + 1},${body}`, // too many pieces
    `${PIECE_MARK}${PIECE_SEQ_MOD},0,2,${body}`, // sequence past its range
    `${PIECE_MARK}12345678901,0,2,${body}`, // eleven digits
    `${PIECE_MARK}-1,0,2,${body}`, // a sign
    `${PIECE_MARK}1,0,2`, // no body comma
    `${PIECE_MARK}1.5,0,2,${body}`, // not an integer
  ];
  for (const frame of refused) assert.equal(readPieceHeader(frame), null, frame);
  assert.deepEqual(readPieceHeader(pieceFrame(5, 1, 3, body)), { seq: 5, index: 1, count: 3, bodyAt: 10 });
});

test('the intake drops a piece out of order, from another frame, empty, or too long', () => {
  const [first, second, third] = cutPieces('q'.repeat(BULK_PIECE_CHARS * 2 + 5), 9);
  const cases: [string, string[]][] = [
    ['a gap', [first, third]],
    ['a repeat', [first, first.replace(`${PIECE_MARK}9,0,`, `${PIECE_MARK}9,0,`), third]],
    ['another sequence', [first, second.replace(`${PIECE_MARK}9,`, `${PIECE_MARK}8,`), third]],
    ['another count', [first, second.replace(',1,3,', ',1,4,'), third]],
    ['a middle piece first', [second, third]],
    ['an empty body', [first, `${PIECE_MARK}9,1,3,`]],
    ['a body over a piece', [first, pieceFrame(9, 1, 3, 'r'.repeat(BULK_PIECE_CHARS + 1))]],
  ];
  for (const [name, frames] of cases) {
    const intake = new PieceIntake();
    const results = frames.map((frame) => intake.take(socket, frame));
    assert.ok(
      results.every((result) => result === null),
      name,
    );
    assert.ok(intake.drops >= 1, name);
  }
});

test('a new first piece replaces a frame left unfinished, and is counted', () => {
  const intake = new PieceIntake();
  const old = cutPieces('o'.repeat(BULK_PIECE_CHARS * 2), 1);
  const fresh = cutPieces('n'.repeat(BULK_PIECE_CHARS * 2), 2);
  intake.take(socket, old[0]);
  assert.equal(intake.take(socket, fresh[0]), null);
  assert.equal(intake.take(socket, fresh[1]), 'n'.repeat(BULK_PIECE_CHARS * 2));
  assert.equal(intake.drops, 1);
});

test('two sockets join their frames apart', () => {
  const intake = new PieceIntake();
  const left = {};
  const right = {};
  const a = cutPieces('A'.repeat(BULK_PIECE_CHARS + 2), 1);
  const b = cutPieces('B'.repeat(BULK_PIECE_CHARS + 2), 1);
  assert.equal(intake.take(left, a[0]), null);
  assert.equal(intake.take(right, b[0]), null);
  assert.equal(intake.take(left, a[1]), 'A'.repeat(BULK_PIECE_CHARS + 2));
  assert.equal(intake.take(right, b[1]), 'B'.repeat(BULK_PIECE_CHARS + 2));
  assert.equal(intake.drops, 0);
});
