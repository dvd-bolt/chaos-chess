// Шахматное ядро: клетки, атаки, генерация ходов с учётом стен, заморозки и щитов.
// Клетка i = r*8 + f, r=0 — восьмая горизонталь (сверху), f=0 — вертикаль a.

export const FILES = 'abcdefgh';
export const sqName = i => FILES[i & 7] + (8 - (i >> 3));
export const sqIdx = n => (8 - Number(n[1])) * 8 + FILES.indexOf(n[0]);
export const idx = (r, f) => r * 8 + f;
export const inb = (r, f) => r >= 0 && r < 8 && f >= 0 && f < 8;
export const opp = s => (s === 'w' ? 'b' : 'w');
export const cheb = (a, b) => Math.max(Math.abs((a >> 3) - (b >> 3)), Math.abs((a & 7) - (b & 7)));

export const KN = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
export const KG = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
export const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const RAYS = { R: ORTH, B: DIAG, Q: KG };

export const hasWall = (st, i) => st.walls[i] !== undefined;
export const isFrozen = (st, p) => !!p && st.frozen[p.id] !== undefined;
export const isShielded = (st, p) => !!p && st.shield[p.id] !== undefined;
export const blocked = (st, i) => !!st.board[i] || hasWall(st, i);
export const isShackled = (st, p) => !!p && !!st.shackled && st.shackled[p.id] !== undefined;
export const LAVA = [27, 28, 35, 36]; // d5 e5 d4 e4
export const lavaOn = st => !!(st.chaos && st.chaos.lava > st.ply);
export const isLava = (st, i) => lavaOn(st) && LAVA.includes(i);
const cavalryOn = st => !!(st.chaos && st.chaos.cavalry > st.ply);

export function kingSq(st, s) {
  const B = st.board;
  for (let i = 0; i < 64; i++) if (B[i] && B[i].t === 'K' && B[i].s === s) return i;
  return -1;
}

// Бьёт ли сторона `by` клетку i. Замороженные фигуры не атакуют, стены перекрывают лучи.
export function attacked(st, i, by) {
  const B = st.board, r = i >> 3, f = i & 7;
  const act = p => p && p.s === by && st.frozen[p.id] === undefined;
  const pr = by === 'w' ? r + 1 : r - 1;
  for (const df of [-1, 1]) {
    if (inb(pr, f + df)) { const p = B[idx(pr, f + df)]; if (act(p) && p.t === 'P') return true; }
  }
  for (const [dr, df] of KN) {
    if (inb(r + dr, f + df)) { const p = B[idx(r + dr, f + df)]; if (act(p) && p.t === 'N') return true; }
  }
  for (const [dr, df] of KG) {
    if (inb(r + dr, f + df)) { const p = B[idx(r + dr, f + df)]; if (act(p) && p.t === 'K') return true; }
  }
  for (const [dirs, a, b] of [[ORTH, 'R', 'Q'], [DIAG, 'B', 'Q']]) {
    for (const [dr, df] of dirs) {
      let rr = r + dr, ff = f + df;
      while (inb(rr, ff)) {
        const j = idx(rr, ff);
        if (st.walls[j] !== undefined) break;
        const p = B[j];
        if (p) { if (act(p) && (p.t === a || p.t === b)) return true; break; }
        rr += dr; ff += df;
      }
    }
  }
  return false;
}

export function inCheck(st, s) {
  const k = kingSq(st, s);
  return k >= 0 && attacked(st, k, opp(s));
}

// Псевдолегальные ходы стороны s (без проверки собственного короля).
export function genMoves(st, s, capturesOnly = false) {
  const out = [], B = st.board, o = opp(s), cavalry = cavalryOn(st), lava = lavaOn(st);
  const canTake = q => q && q.s !== s && q.t !== 'K' && st.shield[q.id] === undefined && st.frozen[q.id] === undefined;
  for (let i = 0; i < 64; i++) {
    const p = B[i];
    if (!p || p.s !== s || st.frozen[p.id] !== undefined || isShackled(st, p)) continue;
    const r = i >> 3, f = i & 7;
    if (p.t === 'P') {
      const d = s === 'w' ? -1 : 1, last = s === 'w' ? 0 : 7, start = s === 'w' ? 6 : 1;
      const push = (to, cap) => {
        if ((to >> 3) === last) for (const pr of ['Q', 'N', 'R', 'B']) out.push({ k: 'm', from: i, to, promo: pr, cap });
        else out.push({ k: 'm', from: i, to, cap });
      };
      const r1 = r + d;
      if (!inb(r1, f)) continue;
      if (cavalry && !capturesOnly) {
        for (const [dr, df] of KN) {
          const rr = r + dr, ff = f + df;
          if (!inb(rr, ff) || rr === 0 || rr === 7) continue;
          const j = idx(rr, ff);
          if (!blocked(st, j)) out.push({ k: 'm', from: i, to: j });
        }
      }
      const j = idx(r1, f);
      if (!capturesOnly && !blocked(st, j)) {
        push(j, false);
        const j2 = idx(r + 2 * d, f);
        if (r === start && !p.moved && !blocked(st, j2)) out.push({ k: 'm', from: i, to: j2, dbl: true });
      } else if (capturesOnly && (j >> 3) === last && !blocked(st, j)) push(j, false);
      for (const df of [-1, 1]) {
        if (!inb(r1, f + df)) continue;
        const t = idx(r1, f + df), q = B[t];
        if (q) { if (canTake(q)) push(t, true); }
        else if (st.ep === t && !hasWall(st, t)) {
          const c = B[idx(r, f + df)];
          if (c && c.t === 'P' && canTake(c)) out.push({ k: 'm', from: i, to: t, ep: true, cap: true });
        }
      }
    } else if (p.t === 'N' || p.t === 'K') {
      for (const [dr, df] of p.t === 'N' ? KN : KG) {
        if (!inb(r + dr, f + df)) continue;
        const j = idx(r + dr, f + df);
        if (hasWall(st, j) || (lava && p.t === 'K' && LAVA.includes(j))) continue;
        const q = B[j];
        if (q ? canTake(q) : !capturesOnly) out.push({ k: 'm', from: i, to: j, cap: !!q });
      }
      if (p.t === 'K' && !p.moved && !capturesOnly) castles(st, s, i, o, out);
    } else if (st.ghost === p.id) { // Призрачный шаг: луч проходит сквозь фигуры, стены по-прежнему держат
      for (const [dr, df] of RAYS[p.t]) {
        let rr = r + dr, ff = f + df;
        while (inb(rr, ff)) {
          const j = idx(rr, ff);
          if (hasWall(st, j)) break;
          const q = B[j];
          if (q) { if (canTake(q)) out.push({ k: 'm', from: i, to: j, cap: true }); }
          else if (!capturesOnly) out.push({ k: 'm', from: i, to: j });
          rr += dr; ff += df;
        }
      }
    } else {
      for (const [dr, df] of RAYS[p.t]) {
        let rr = r + dr, ff = f + df;
        while (inb(rr, ff)) {
          const j = idx(rr, ff);
          if (hasWall(st, j)) break;
          const q = B[j];
          if (q) { if (canTake(q)) out.push({ k: 'm', from: i, to: j, cap: true }); break; }
          if (!capturesOnly) out.push({ k: 'm', from: i, to: j });
          rr += dr; ff += df;
        }
      }
    }
  }
  return out;
}

function castles(st, s, i, o, out) {
  const row = s === 'w' ? 7 : 0;
  if (i !== idx(row, 4) || attacked(st, i, o)) return;
  const B = st.board;
  const rookOk = j => { const q = B[j]; return q && q.s === s && q.t === 'R' && !q.moved && !isFrozen(st, q) && !isShackled(st, q); };
  if (rookOk(idx(row, 7)) && !blocked(st, idx(row, 5)) && !blocked(st, idx(row, 6))
      && !attacked(st, idx(row, 5), o) && !attacked(st, idx(row, 6), o))
    out.push({ k: 'm', from: i, to: idx(row, 6), castle: 'K' });
  if (rookOk(idx(row, 0)) && !blocked(st, idx(row, 1)) && !blocked(st, idx(row, 2)) && !blocked(st, idx(row, 3))
      && !attacked(st, idx(row, 3), o) && !attacked(st, idx(row, 2), o))
    out.push({ k: 'm', from: i, to: idx(row, 2), castle: 'Q' });
}

// Проверка, что ход не оставляет своего короля под боем (на копии доски).
export function moveIsSafe(st, m, s) {
  const nb = st.board.slice(), p = nb[m.from];
  nb[m.to] = p; nb[m.from] = null;
  if (m.ep) nb[(m.from & ~7) | (m.to & 7)] = null;
  if (m.castle) {
    const row = m.from & ~7, rf = m.castle === 'K' ? 7 : 0, rt = m.castle === 'K' ? 5 : 3;
    nb[row + rt] = nb[row + rf]; nb[row + rf] = null;
  }
  if (st.portals && st.portals.length && p.t !== 'K') { // порталы открыты обоим — учитываем телепорт
    const pt = st.portals.find(x => x.a === m.to || x.b === m.to);
    if (pt) { const o2 = pt.a === m.to ? pt.b : pt.a; if (!nb[o2] && !hasWall(st, o2)) { nb[o2] = p; nb[m.to] = null; } }
  }
  const tmp = { board: nb, walls: st.walls, frozen: st.frozen };
  const k = p.t === 'K' ? m.to : kingSq(tmp, s);
  return k < 0 || !attacked(tmp, k, opp(s));
}

export function legalMoves(st, s = st.turn) {
  return genMoves(st, s).filter(m => moveIsSafe(st, m, s));
}

// Расстановка по FEN (только поле фигур). Остальное задаёт игра.
export function boardFromFen(fen, nextId) {
  const board = Array(64).fill(null);
  let r = 0, f = 0, id = nextId;
  for (const ch of fen.split(' ')[0]) {
    if (ch === '/') { r++; f = 0; continue; }
    if (/\d/.test(ch)) { f += Number(ch); continue; }
    const s = ch === ch.toUpperCase() ? 'w' : 'b', t = ch.toUpperCase();
    const home = (t === 'P' && r === (s === 'w' ? 6 : 1)) || (t === 'K' && r === (s === 'w' ? 7 : 0) && f === 4)
      || (t === 'R' && r === (s === 'w' ? 7 : 0) && (f === 0 || f === 7));
    board[idx(r, f)] = { id: id++, s, t, moved: !home, lm: -1 };
    f++;
  }
  return { board, nextId: id };
}

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
