// Головоломки: компактная запись позиции и проверка решения «мат за один ход (быстрая карта + действие)».
import { createGame, apply, legalActions, settle } from './game.js';
import { idx } from './rules.js';

const CH = { K: 'k', Q: 'q', R: 'r', B: 'b', N: 'n', P: 'p' };
function fenOf(board) {
  let s = '';
  for (let r = 0; r < 8; r++) {
    let e = 0;
    for (let f = 0; f < 8; f++) {
      const p = board[idx(r, f)];
      if (!p) { e++; continue; }
      if (e) { s += e; e = 0; }
      s += p.s === 'w' ? p.t : CH[p.t];
    }
    if (e) s += e;
    if (r < 7) s += '/';
  }
  return s;
}

// Позиция → компактный объект. Позиции с метками, метеорами, порталами и капканами не упаковываем.
export function pack(st) {
  if (st.marks.length || st.meteors.length || st.portals.length || st.traps.length) return null;
  const S = st.turn, sqOf = id => st.board.findIndex(p => p && p.id === id);
  const ids = obj => Object.keys(obj).map(id => sqOf(+id)).filter(i => i >= 0);
  return { fen: fenOf(st.board), turn: S, mana: st.mana[S], hand: st.hand[S].map(c => c.id), ...(st.hand[S].some(c => c.ch) ? { ch: st.hand[S].map(c => c.ch || 0) } : {}),
    walls: Object.fromEntries(Object.entries(st.walls).map(([j, v]) => [j, Math.max(1, v - st.ply)])),
    frozen: ids(st.frozen), shield: ids(st.shield), shackled: ids(st.shackled), grave: st.grave[S], ep: st.ep,
    moved: st.board.map((p, i) => (p && p.moved ? i : -1)).filter(i => i >= 0) };
}

export function unpack(P) {
  const o = P.turn === 'w' ? 'b' : 'w';
  const st = createGame({ fen: P.fen, turn: P.turn, seed: 1, decks: { w: [], b: [] }, hands: { [P.turn]: P.hand, [o]: [] },
    mana: { [P.turn]: P.mana, [o]: 0 }, grave: { [P.turn]: P.grave || [] } });
  st.started = true; st.ply = 2; st.tn = { w: 1, b: 1 }; st.ep = P.ep ?? -1;
  if (P.ch) st.hand[P.turn] = st.hand[P.turn].map((c, i) => (P.ch[i] ? { ...c, ch: P.ch[i] } : c));
  for (const [j, v] of Object.entries(P.walls || {})) st.walls[j] = st.ply + v;
  for (const k of ['frozen', 'shield', 'shackled']) for (const j of P[k] || []) if (st.board[j]) st[k][st.board[j].id] = st.ply + 2;
  for (let i = 0; i < 64; i++) if (st.board[i]) st.board[i] = { ...st.board[i], moved: (P.moved || []).includes(i) };
  return st;
}

// Все решения: последовательности действий одной стороны, после которых соперник получает мат.
export function solutions(st, limit = 50) {
  const S = st.turn, out = [];
  const walk = (s, line, depth) => {
    if (out.length >= limit) return;
    for (const a of legalActions(s)) {
      const s2 = settle(apply(s, a).state);
      if (s2.result) { if (s2.result.winner === S && s2.result.reason === 'mate') out.push([...line, a]); continue; }
      if (s2.turn === S && depth < 3) walk(s2, [...line, a], depth + 1);
    }
  };
  walk(st, [], 0);
  return out;
}

export const PUZZLE_EPOCH = Date.UTC(2026, 10, 15); // 15.11.2026 — день №0
export const puzzleDay = (now = Date.now()) => Math.floor((now - PUZZLE_EPOCH) / 86400000);
