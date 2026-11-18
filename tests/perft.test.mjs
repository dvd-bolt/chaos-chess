import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, start, apply, legalActions } from '../web/src/engine/game.js';
import { legalMoves } from '../web/src/engine/rules.js';

function perft(st, d) {
  if (d === 0) return 1;
  const ms = legalMoves(st);
  if (d === 1) return ms.length;
  let n = 0;
  for (const m of ms) n += perft(apply(st, m).state, d - 1);
  return n;
}
const pos = (fen, turn = 'w') => start(createGame({ fen, turn, seed: 1, decks: { w: [], b: [] }, hands: { w: [], b: [] } })).state;

test('perft: начальная позиция', () => {
  const st = pos('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR');
  assert.deepEqual([1, 2, 3, 4].map(d => perft(st, d)), [20, 400, 8902, 197281]);
});
test('perft: Kiwipete', () => {
  const st = pos('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R');
  assert.deepEqual([1, 2, 3].map(d => perft(st, d)), [48, 2039, 97862]);
});
test('perft: позиция 3 (взятие на проходе, связки)', () => {
  const st = pos('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8');
  assert.deepEqual([1, 2, 3, 4].map(d => perft(st, d)), [14, 191, 2812, 43238]);
});
test('perft: позиция 4 (превращения, рокировки)', () => {
  const st = pos('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1');
  assert.deepEqual([1, 2, 3].map(d => perft(st, d)), [6, 264, 9467]);
});
