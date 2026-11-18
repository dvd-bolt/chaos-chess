// Бот Chaos Chess: негамакс с альфа-бета по полным ходам (быстрая карта не тратит глубину) + форсированные взятия.
// «Довыборы» внутри хода (сброс, Марш, дар хаоса) решаются жадно по оценке, без ветвления.
import { legalActions, apply, inCheck, CARDS } from '../engine/game.js';
import { genMoves, moveIsSafe, legalMoves, LAVA, lavaOn } from '../engine/rules.js';
import { zoneOf } from '../engine/cards.js';

const PV = { P: 100, N: 310, B: 325, R: 500, Q: 900, K: 0 };
export const CV = { shield: 25, wall: 20, ritual: 15, blink: 35, hook: 45, stasis: 40, mark: 40, meteor: 55, lightning: 70,
  shackles: 25, insight: 30, march: 20, swap: 25, ghost: 35, trap: 35, shockwave: 35, promote: 40, portal: 30, rebirth: 60,
  polymorph: 65, quake: 30, mirror: 70, ward: 25, bastion: 22, tide: 25, leap: 30, mentor: 30, frost: 35, comet: 45, harpoon: 45,
  foresight: 30, storm: 70, forge: 55, phoenix: 65 };
const MATE = 1e6;
// карты, которые бот рассматривает внутри дерева перебора (эффект мгновенный и важен тактически)
const TACTICAL = new Set(['lightning', 'hook', 'blink', 'shield', 'stasis', 'polymorph', 'ghost', 'shockwave', 'storm', 'harpoon', 'leap', 'ward', 'frost']);

export const LEVELS = {
  novice: { depth: 1, q: 1, noise: 90, blunder: 0.2, cardsPerId: 2, quickTop: 2 },
  fighter: { depth: 2, q: 4, noise: 12, blunder: 0, cardsPerId: 3, quickTop: 3 },
  master: { depth: 3, q: 6, noise: 0, blunder: 0, cardsPerId: 4, quickTop: 4, timeMs: 1400, iterative: true },
};

function pst(p, i) {
  const r = i >> 3, f = i & 7, adv = p.s === 'w' ? 7 - r : r;
  const center = (3.5 - Math.abs(r - 3.5)) + (3.5 - Math.abs(f - 3.5));
  switch (p.t) {
    case 'P': return adv * 6 + (adv >= 5 ? (adv - 4) * 25 : 0) + (f >= 2 && f <= 5 ? center * 2 : 0);
    case 'N': return center * 6 - 12;
    case 'B': return center * 3;
    case 'R': return adv === 6 ? 15 : 0;
    case 'Q': return center;
    case 'K': return adv === 0 ? 15 : -adv * 12;
  }
  return 0;
}

export function evaluate(st, side) {
  if (st.result) return st.result.winner === side ? MATE : st.result.winner ? -MATE : 0;
  let sc = 0;
  const B = st.board, at = {}, sgn = p => (p.s === side ? 1 : -1);
  for (let i = 0; i < 64; i++) {
    const p = B[i];
    if (!p) continue;
    at[p.id] = i;
    let v = PV[p.t] + pst(p, i);
    if (st.shield[p.id] !== undefined && PV[p.t] >= 300) v += 10;
    if (st.shackled && st.shackled[p.id] !== undefined) v -= 10;
    sc += sgn(p) * v;
  }
  for (const m of st.meteors) {
    for (const j of zoneOf(m)) {
      const p = B[j];
      if (p && p.t !== 'K' && st.shield[p.id] === undefined && st.frozen[p.id] === undefined) sc -= sgn(p) * PV[p.t] * 0.75;
    }
  }
  for (const m of st.marks) {
    const i = at[m.id];
    if (i === undefined) continue;
    const p = B[i];
    if (p.lm <= m.placed && st.shield[p.id] === undefined) sc -= sgn(p) * PV[p.t] * 0.35;
  }
  if (lavaOn(st)) for (const j of LAVA) { const p = B[j]; if (p && p.t !== 'K') sc -= sgn(p) * PV[p.t] * 0.5; }
  for (const t of st.traps || []) sc += (t.owner === side ? 1 : -1) * 15;
  const o = side === 'w' ? 'b' : 'w';
  // мана и карты ценятся умеренно: бот должен их тратить, а не копить
  sc += (Math.min(st.mana[side], 6) - Math.min(st.mana[o], 6)) * 4;
  for (const c of st.hand[side]) sc += (CV[c.id] || 30) * 0.3;
  for (const c of st.hand[o]) sc -= (CV[c.id] || 30) * 0.3;
  if (inCheck(st, st.turn)) sc += st.turn === side ? -25 : 25;
  return sc;
}

// Довыбор (сброс/Марш/дар): лучший по статической оценке.
function greedyPending(st) {
  const S = st.turn;
  let best = null, bv = -Infinity;
  for (const a of legalActions(st)) {
    const v = evaluate(apply(st, a).state, S);
    if (v > bv) { bv = v; best = a; }
  }
  return best;
}

// Действия узла: все ходы + карты, отобранные по статической оценке (top-K на каждую карту).
function actionsFor(st, only, perId) {
  if (st.pending) { const a = greedyPending(st); return a ? [a] : []; }
  const S = st.turn, all = legalActions(st, only), moves = [], groups = {};
  for (const a of all) {
    if (a.k === 'm') moves.push(a);
    else (groups[a.id] ||= []).push(a);
  }
  const cards = [];
  for (const id in groups) {
    let g = groups[id];
    if (g.length > perId) {
      g = g.map(a => { const s2 = apply(st, a).state; return [evaluate(s2, S), a]; })
        .sort((x, y) => y[0] - x[0]).slice(0, perId).map(x => x[1]);
    }
    cards.push(...g);
  }
  moves.sort((a, b) => score(st, b) - score(st, a));
  return [...moves.filter(m => m.cap || m.promo), ...cards, ...moves.filter(m => !m.cap && !m.promo)];
}
const score = (st, m) => (m.cap ? 10 * PV[(st.board[m.to] || { t: 'P' }).t] - PV[st.board[m.from].t] : 0) + (m.promo ? PV[m.promo] : 0);

function qsearch(st, alpha, beta, qd, ctx) {
  if (st.result) return evaluate(st, st.turn);
  if (inCheck(st, st.turn)) { // под шахом: ищем мат на горизонте; уход от шаха разбираем только на первом слое
    if ((++ctx.nodes & 127) === 0 && ctx.deadline && now() > ctx.deadline) throw new Timeout();
    const moves = legalMoves(st);
    if (!moves.length) return legalActions(st).length ? evaluate(st, st.turn) : -MATE + 1;
    if (!ctx.q0 || qd < ctx.q0) return evaluate(st, st.turn);
    let best = -Infinity;
    for (const m of moves) {
      let s2 = apply(st, m).state;
      if (s2.pending) { const g = greedyPending(s2); if (g) s2 = apply(s2, g).state; }
      const v = s2.turn === st.turn ? evaluate(s2, st.turn) : -qsearch(s2, -beta, -alpha, qd - 1, ctx);
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }
  const stand = evaluate(st, st.turn);
  if (qd <= 0) return stand;
  if (stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  const caps = genMoves(st, st.turn, true).filter(m => moveIsSafe(st, m, st.turn))
    .sort((a, b) => score(st, b) - score(st, a));
  for (const m of caps) {
    let s2 = apply(st, m).state;
    if (s2.pending) { const g = greedyPending(s2); if (g) s2 = apply(s2, g).state; }
    const v = s2.turn === st.turn ? qsearch(s2, alpha, beta, qd - 1, ctx) : -qsearch(s2, -beta, -alpha, qd - 1, ctx);
    if (v >= beta) return v;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

class Timeout extends Error {}
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function negamax(st, depth, alpha, beta, cfg, ctx) {
  const perId = cfg.inner || 2;
  if ((++ctx.nodes & 127) === 0 && ctx.deadline && now() > ctx.deadline) throw new Timeout();
  if (st.result) return evaluate(st, st.turn);
  if (depth <= 0 && !st.pending) { ctx.q0 = cfg.q; return qsearch(st, alpha, beta, cfg.q, ctx); }
  const acts = actionsFor(st, TACTICAL, perId);
  if (!acts.length) return inCheck(st, st.turn) ? -MATE + ctx.ply : 0;
  let best = -Infinity;
  for (const a of acts) {
    const s2 = apply(st, a).state;
    const v = s2.turn === st.turn ? negamax(s2, depth, alpha, beta, cfg, ctx) : -negamax(s2, depth - 1, -beta, -alpha, cfg, ctx);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

function rootSearch(st, acts, depth, cfg, ctx, rnd, prune) {
  const scored = [];
  let alpha = -Infinity;
  for (const a of acts) {
    const s2 = apply(st, a).state;
    let v;
    if (s2.turn === st.turn) v = negamax(s2, depth, prune ? alpha : -Infinity, Infinity, cfg, ctx);
    else v = -negamax(s2, depth - 1, -Infinity, prune ? -alpha : Infinity, cfg, ctx);
    if (v > alpha) alpha = v;
    // при отсечении оценки слабых ходов — лишь границы, шум к ним не добавляем
    scored.push([prune ? v : v + (rnd() - 0.5) * 2 * cfg.noise, a, v]);
  }
  return scored.sort((x, y) => y[0] - x[0]);
}

// Выбор действия. rnd — функция случайных чисел (для разнообразия и уровня «Новичок»).
export function chooseAction(st, level = 'fighter', rnd = Math.random) {
  const cfg = LEVELS[level] || LEVELS.fighter, ctx = { nodes: 0, ply: 0, deadline: 0 };
  if (st.pending) return greedyPending(st);
  let acts = actionsFor(st, null, cfg.cardsPerId);
  if (!acts.length) return null;
  if (acts.length === 1) return acts[0];
  // быстрые карты: оставляем только самые полезные по статике, чтобы не умножать перебор
  const base = evaluate(st, st.turn);
  const quick = acts.filter(a => a.k === 'c' && CARDS[a.id].type === 'quick')
    .map(a => [evaluate(apply(st, a).state, st.turn) - base, a]).filter(x => x[0] > 10)
    .sort((x, y) => y[0] - x[0]).slice(0, cfg.quickTop).map(x => x[1]);
  const main = acts.filter(a => !(a.k === 'c' && CARDS[a.id].type === 'quick'));
  acts = main.length ? main.concat(quick) : acts;
  let scored;
  if (cfg.iterative) {
    const t0 = now();
    scored = rootSearch(st, acts, 1, cfg, ctx, rnd, false);
    for (let d = 2; d <= cfg.depth; d++) {
      ctx.deadline = t0 + cfg.timeMs;
      const order = scored.map(x => x[1]);
      try { scored = rootSearch(st, order, d, cfg, ctx, rnd, true); ctx.reached = d; } catch (e) { if (!(e instanceof Timeout)) throw e; break; }
    }
  } else scored = rootSearch(st, acts, cfg.depth, cfg, ctx, rnd, false);
  if (cfg.blunder && rnd() < cfg.blunder) return scored[Math.floor(rnd() * Math.min(5, scored.length))][1];
  return scored[0][1];
}
