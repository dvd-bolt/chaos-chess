// Игровой цикл Chaos Chess: мана, рука, ход = (быстрая карта?) + (ход фигурой | основная карта).
// apply() чистая: возвращает новое состояние и список событий для анимаций.
// Действия: {k:'m'} ход, {k:'c'} карта, и «довыборы» в рамках хода: {k:'d'} сброс (Озарение),
// {k:'p'}/{k:'skip'} шаг Марша, {k:'g'} дар хаоса.
import { opp, inCheck, genMoves, moveIsSafe, legalMoves, boardFromFen, START_FEN, kingSq, LAVA } from './rules.js';
import { CARDS, CARD_IDS, START_DECK, BOARD_NEUTRAL, cardTargets, resolveCard, zone3, zoneOf, marchSteps, MAX_CHARGE } from './cards.js';

export const MANA_CAP = 7, HAND_CAP = 5, START_HAND = 3;
export const CHAOS_EVERY = 16; // хаос-событие каждые 8 кругов, объявление за круг

export const CHAOS = {
  lava:     { name: 'Лавовый разлом', text: 'Центр d4–e5 на 2 круга — лава. Фигура, закончившая ход на лаве, сгорает. Король туда не ходит.' },
  starfall: { name: 'Звездопад', text: 'Оба игрока получают +2 маны.' },
  storm:    { name: 'Буря', text: 'Каждый сбрасывает случайную карту и берёт новую.' },
  cavalry:  { name: 'Кавалерия', text: '1 круг пешки могут ходить ещё и как конь, без взятия.' },
  silence:  { name: 'Тихий час', text: '1 круг нельзя играть карты.' },
  gift:     { name: 'Дар хаоса', text: 'Каждый выбирает 1 карту из 3 случайных.' },
  haste:    { name: 'Ускорение', text: 'В свой следующий ход каждый может сыграть 2 быстрые карты.' },
  fog:      { name: 'Туман войны', text: '1 круг видны только клетки рядом с твоими фигурами и под их ударом.' },
};

function rand(st) { // mulberry32, состояние в st.rng
  let t = (st.rng = (st.rng + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function shuffle(st, arr) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand(st) * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

export function createGame(o = {}) {
  const { board, nextId } = boardFromFen(o.fen || START_FEN, 1);
  const st = {
    board, walls: {}, frozen: {}, shield: {}, shackled: {}, marks: [], meteors: o.meteors || [], traps: o.traps || [], portals: [],
    turn: o.turn || 'w', ply: 0, ep: -1, hm: 0, reps: [],
    mana: { w: 0, b: 1, ...(o.mana || {}) }, hand: { w: [], b: [] }, deck: { w: [], b: [] }, discard: { w: [], b: [] },
    grave: { w: [], b: [], ...(o.grave || {}) }, mirrorUsed: { w: false, b: false }, extra: { w: 0, b: 0 },
    tn: { w: 0, b: 0 }, quick: false, quickN: 0, ghost: null, march: false, pending: null,
    chaos: o.chaos ? { next: CHAOS_EVERY, ann: null, lava: 0, cavalry: 0, silence: 0, fog: 0, haste: { w: false, b: false }, gift: { w: null, b: null }, fogOk: !!o.fog } : null,
    rng: (o.seed ?? (Math.random() * 2 ** 32)) >>> 0,
    boss: o.boss ? { id: o.boss, side: o.bossSide || 'b' } : null,
    nextId, nextUid: 1, result: null, started: false,
    stats: { w: newStats(), b: newStats() },
  };
  for (const s of ['w', 'b']) {
    const deck = o.decks ? o.decks[s] : START_DECK;
    st.deck[s] = shuffle(st, deck.map(id => ({ uid: st.nextUid++, id })));
    if (o.hands) st.hand[s] = o.hands[s].map(id => ({ uid: st.nextUid++, id }));
    else for (let i = 0; i < START_HAND; i++) drawCard(st, s, []);
  }
  return st;
}
const newStats = () => ({ cards: 0, caps: 0, lost: 0, kills: {}, played: {} });

// Перевыбор стартовой руки: выбранные карты уходят в колоду, взамен берутся новые.
export function mulligan(st0, s, uids) {
  const st = clone(st0), back = st.hand[s].filter(c => uids.includes(c.uid));
  st.hand[s] = st.hand[s].filter(c => !uids.includes(c.uid));
  for (let i = 0; i < back.length; i++) drawCard(st, s, []);
  st.deck[s] = shuffle(st, [...st.deck[s], ...back]);
  return st;
}

export function start(st0) {
  const st = clone(st0), ev = [];
  st.started = true;
  beginTurn(st, ev);
  return { state: st, events: ev };
}

const cloneStats = s => ({ ...s, kills: { ...s.kills }, played: { ...s.played } });
export function clone(st) {
  return {
    ...st, board: st.board.slice(), walls: { ...st.walls }, frozen: { ...st.frozen }, shield: { ...st.shield }, shackled: { ...st.shackled },
    mana: { ...st.mana }, hand: { w: st.hand.w.slice(), b: st.hand.b.slice() },
    deck: { w: st.deck.w.slice(), b: st.deck.b.slice() }, discard: { w: st.discard.w.slice(), b: st.discard.b.slice() },
    tn: { ...st.tn }, stats: { w: cloneStats(st.stats.w), b: cloneStats(st.stats.b) }, extra: { ...st.extra },
    chaos: st.chaos && { ...st.chaos, haste: { ...st.chaos.haste }, gift: { ...st.chaos.gift } },
  };
}

function drawCard(st, s, ev, ignoreCap = false) {
  if (!st.deck[s].length) {
    if (!st.discard[s].length) return;
    st.deck[s] = shuffle(st, st.discard[s]); st.discard[s] = [];
    ev.push({ t: 'reshuffle', side: s });
  }
  const c = st.deck[s].pop();
  if (!ignoreCap && st.hand[s].length >= HAND_CAP) { st.discard[s].push(c); ev.push({ t: 'burn', side: s, card: c }); return; }
  st.hand[s].push(c);
  ev.push({ t: 'draw', side: s, card: c });
}

function gainMana(st, s, d, why, ev, cap = MANA_CAP) {
  if (st.mana[s] >= cap) return;
  const v = Math.min(cap, st.mana[s] + d);
  ev.push({ t: 'mana', side: s, d: v - st.mana[s], why });
  st.mana[s] = v;
}

// Помощники для эффектов: уничтожение, приземление (капкан, портал), превращение, добор.
function helpers(st, ev) {
  const H = {
    // by — сторона-виновник или null (хаос).
    destroy(p, sq, cause, by) {
      st.board[sq] = null;
      delete st.shield[p.id]; delete st.frozen[p.id]; delete st.shackled[p.id];
      if (st.marks.some(m => m.id === p.id)) st.marks = st.marks.filter(m => m.id !== p.id);
      ev.push({ t: 'destroy', sq, piece: p, cause });
      st.stats[p.s].lost++;
      if (p.t !== 'K') st.grave = { ...st.grave, [p.s]: [...st.grave[p.s], p.t] };
      if (by && by !== p.s) {
        st.stats[by].caps++;
        st.stats[by].kills[cause] = (st.stats[by].kills[cause] || 0) + 1;
        if (p.t !== 'K') gainMana(st, p.s, 1, 'rage', ev);
      }
      if (p.t === 'K') st.result = { winner: by, reason: 'king' };
    },
    promoteIfEdge(sq) {
      const p = st.board[sq];
      if (p && p.t === 'P' && (sq >> 3) === (p.s === 'w' ? 0 : 7)) {
        st.board[sq] = { ...p, t: 'Q' };
        ev.push({ t: 'promote', sq, to: 'Q' });
      }
    },
    // Фигура встала на клетку sq: вражеский капкан, затем портал. Возвращает итоговую клетку или -1.
    land(sq, portal = true) {
      const p = st.board[sq];
      if (!p) return sq;
      const ti = st.traps.findIndex(t => t.sq === sq && t.owner !== p.s);
      if (ti >= 0) {
        const t = st.traps[ti];
        st.traps = st.traps.filter((_, i) => i !== ti);
        if (p.t !== 'K' && st.shield[p.id] === undefined) {
          ev.push({ t: 'trap', sq, owner: t.owner });
          H.destroy(p, sq, 'trap', t.owner);
          return -1;
        }
        ev.push({ t: 'trapFail', sq, owner: t.owner });
      }
      if (portal && p.t !== 'K') {
        const pt = st.portals.find(x => x.a === sq || x.b === sq);
        if (pt) {
          const o = pt.a === sq ? pt.b : pt.a;
          if (!st.board[o] && st.walls[o] === undefined) {
            st.board[o] = p; st.board[sq] = null;
            ev.push({ t: 'portal', from: sq, to: o, piece: p });
            H.promoteIfEdge(o);
            return H.land(o, false);
          }
        }
      }
      return sq;
    },
    draw(n) { for (let i = 0; i < n; i++) drawCard(st, st.turn, ev, true); },
    drawCapped() { drawCard(st, st.turn, ev); },
    rand: () => rand(st),
  };
  return H;
}

function findPiece(st, id) {
  for (let i = 0; i < 64; i++) if (st.board[i] && st.board[i].id === id) return i;
  return -1;
}

function chaosPick(st) {
  const pool = Object.keys(CHAOS).filter(k => k !== 'fog' || st.chaos.fogOk);
  return pool[Math.floor(rand(st) * pool.length)];
}

function fireChaos(st, id, ev, H) {
  const C = st.chaos;
  ev.push({ t: 'chaos', id });
  switch (id) {
    case 'lava': C.lava = st.ply + 4; break;
    case 'starfall': for (const s of ['w', 'b']) gainMana(st, s, 2, 'chaos', ev, MANA_CAP + 2); break;
    case 'storm':
      for (const s of ['w', 'b']) {
        if (st.hand[s].length) {
          const i = Math.floor(rand(st) * st.hand[s].length), [c] = st.hand[s].splice(i, 1);
          st.discard[s].push(c); ev.push({ t: 'discard', side: s, card: c });
        }
        drawCard(st, s, ev);
      }
      break;
    case 'cavalry': C.cavalry = st.ply + 2; break;
    case 'silence': C.silence = st.ply + 2; break;
    case 'fog': C.fog = st.ply + 2; break;
    case 'haste': C.haste = { w: true, b: true }; break;
    case 'gift': {
      const pool = CARD_IDS.filter(id => CARDS[id].rarity !== 'legendary');
      const pick3 = () => shuffle(st, pool.slice()).slice(0, 3);
      C.gift = { w: pick3(), b: pick3() };
      break;
    }
  }
}

function beginTurn(st, ev) {
  const S = st.turn, H = helpers(st, ev);
  st.tn[S]++;
  ev.push({ t: 'turn', side: S, n: st.tn[S] });
  gainMana(st, S, 1, 'turn', ev);
  // заряд копится раньше добора: новая карта приходит пустой
  if (st.hand[S].some(c => CARDS[c.id]?.charge && (c.ch || 0) < MAX_CHARGE)) {
    st.hand[S] = st.hand[S].map(c => (CARDS[c.id]?.charge && (c.ch || 0) < MAX_CHARGE ? { ...c, ch: (c.ch || 0) + 1 } : c));
    ev.push({ t: 'charge', side: S });
  }
  if (st.tn[S] % 2 === 0) drawCard(st, S, ev);
  // отложенные эффекты владельца — раньше истечения щитов
  const due = st.meteors.filter(m => m.owner === S && m.at <= st.ply);
  if (due.length) {
    st.meteors = st.meteors.filter(m => !due.includes(m));
    for (const m of due) {
      const sqs = zoneOf(m), victims = [];
      ev.push({ t: 'meteor', sq: m.c, sqs, shape: m.shape });
      for (const j of sqs) {
        const p = st.board[j];
        if (p && p.t !== 'K' && st.shield[p.id] === undefined && st.frozen[p.id] === undefined) victims.push([p, j]);
        if (st.walls[j] !== undefined) { delete st.walls[j]; ev.push({ t: 'wallGone', sq: j }); }
      }
      for (const [p, j] of victims) H.destroy(p, j, 'meteor', S);
    }
  }
  const marks = st.marks.filter(m => m.owner === S && m.at <= st.ply);
  if (marks.length) {
    st.marks = st.marks.filter(m => !marks.includes(m));
    for (const m of marks) {
      const j = findPiece(st, m.id);
      if (j < 0) continue;
      const p = st.board[j];
      if (p.lm > m.placed || st.shield[p.id] !== undefined || st.frozen[p.id] !== undefined) {
        ev.push({ t: 'markFail', sq: j }); continue;
      }
      ev.push({ t: 'markHit', sq: j });
      H.destroy(p, j, 'mark', S);
    }
  }
  for (const k of ['shield', 'frozen', 'shackled']) {
    for (const id in st[k]) if (st[k][id] <= st.ply) { delete st[k][id]; ev.push({ t: k + 'End', id: +id }); }
  }
  for (const j in st.walls) if (st.walls[j] <= st.ply) { delete st.walls[j]; ev.push({ t: 'wallGone', sq: +j }); }
  if (st.portals.some(p => p.until <= st.ply)) {
    for (const p of st.portals.filter(p => p.until <= st.ply)) ev.push({ t: 'portalClose', a: p.a, b: p.b });
    st.portals = st.portals.filter(p => p.until > st.ply);
  }
  const C = st.chaos;
  if (C && !st.result) {
    if (C.ann && C.ann.at <= st.ply) { const id = C.ann.id; C.ann = null; C.next += CHAOS_EVERY; fireChaos(st, id, ev, H); }
    if (!C.ann && st.ply === C.next - 2) { C.ann = { id: chaosPick(st), at: C.next }; ev.push({ t: 'chaosAnn', id: C.ann.id }); }
    if (C.gift[S]) st.pending = { k: 'gift', side: S, opts: C.gift[S] };
  }
  if (st.boss && st.boss.side === S && !st.result) bossTurn(st, ev, H);
}

// Боссы кампании «Башня Хаоса»: особое правило срабатывает в начале хода босса. Угрозы видны заранее или сразу.
export const BOSSES = {
  ice:    { name: 'Ледяная королева', text: 'Каждый 3-й свой ход замораживает квадрат 2×2 с твоими фигурами.' },
  necro:  { name: 'Некромант', text: 'Каждый 5-й свой ход поднимает пешку на своей второй горизонтали.' },
  bomber: { name: 'Бомбардир', text: 'Каждый 4-й свой ход вызывает метеор на одну из твоих фигур — он упадёт через ход.' },
  mirror: { name: 'Зеркальный рыцарь', text: 'Получает копию каждой карты, которую ты сыграешь.' },
};
function bossTurn(st, ev, H) {
  const B = st.boss, S = B.side, O = opp(S), n = st.tn[S], board = st.board;
  const enemy = []; for (let i = 0; i < 64; i++) { const p = board[i]; if (p && p.s === O && p.t !== 'K' && st.shield[p.id] === undefined && st.frozen[p.id] === undefined) enemy.push(i); }
  const pick = arr => arr[Math.floor(H.rand() * arr.length)];
  if (B.id === 'ice' && n % 3 === 0 && enemy.length) {
    const c = pick(enemy), r = Math.min(6, c >> 3), f = Math.min(6, c & 7), sqs = [r * 8 + f, r * 8 + f + 1, r * 8 + f + 8, r * 8 + f + 9], ids = [];
    for (const j of sqs) { const p = board[j]; if (p && p.s === O && p.t !== 'K' && st.shield[p.id] === undefined) { st.frozen[p.id] = st.ply + 2; ids.push(p.id); } }
    ev.push({ t: 'boss', id: 'ice' }); ev.push({ t: 'stasis', sqs, ids });
  }
  if (B.id === 'necro' && n % 5 === 0) {
    const row = S === 'w' ? 6 : 1, free = [];
    for (let f = 0; f < 8; f++) if (!board[row * 8 + f] && st.walls[row * 8 + f] === undefined) free.push(row * 8 + f);
    if (free.length) { const sq = pick(free); board[sq] = { id: st.nextId++, s: S, t: 'P', moved: false, lm: st.ply }; ev.push({ t: 'boss', id: 'necro' }); ev.push({ t: 'rebirth', sq, piece: board[sq] }); }
  }
  if (B.id === 'bomber' && n % 4 === 0 && enemy.length) {
    const c = pick(enemy);
    st.meteors = [...st.meteors, { owner: S, c, at: st.ply + 2 }];
    ev.push({ t: 'boss', id: 'bomber' }); ev.push({ t: 'meteorCast', sq: c });
  }
}

function posKey(st) {
  let k = st.turn;
  for (let i = 0; i < 64; i++) { const p = st.board[i]; k += p ? (p.s === 'w' ? p.t : p.t.toLowerCase()) : (st.walls[i] !== undefined ? '#' : '.'); }
  return k + Object.keys(st.frozen).length + ':' + st.ep;
}

function endTurn(st, ev, mainWasMove) {
  const S = st.turn;
  if (st.chaos && st.chaos.lava > st.ply) { // лава сжигает фигуры того, кто закончил на ней ход
    const H = helpers(st, ev);
    for (const j of LAVA) {
      const p = st.board[j];
      if (p && p.s === S && p.t !== 'K' && st.shield[p.id] === undefined) { ev.push({ t: 'lavaBurn', sq: j }); H.destroy(p, j, 'lava', null); }
    }
  }
  if (!mainWasMove) st.ep = -1;
  const key = posKey(st);
  st.reps = st.hm === 0 ? [key] : [...st.reps, key];
  if (!st.result) {
    const n = st.reps.filter(k => k === key).length;
    const kingsOnly = st.board.every(p => !p || p.t === 'K');
    if (n >= 3) st.result = { winner: null, reason: 'repetition' };
    else if (st.hm >= 120) st.result = { winner: null, reason: 'fifty' };
    else if (kingsOnly) st.result = { winner: null, reason: 'material' };
  }
  if (st.chaos) st.chaos.haste = { ...st.chaos.haste, [S]: false };
  st.turn = opp(st.turn); st.ply++; st.quick = false; st.quickN = 0; st.ghost = null; st.march = false; st.pending = null;
  if (!st.result) beginTurn(st, ev);
}

function doMove(st, m, ev) {
  const S = st.turn, B = st.board, p = B[m.from], H = helpers(st, ev);
  let capSq = m.ep ? (m.from & ~7) | (m.to & 7) : m.to;
  const cap = B[capSq];
  ev.push({ t: 'move', from: m.from, to: m.to, piece: p, promo: m.promo, cap: !!cap });
  if (cap) H.destroy(cap, capSq, 'capture', S);
  B[m.from] = null;
  B[m.to] = { ...p, moved: true, lm: st.ply, ...(m.promo ? { t: m.promo } : {}) };
  if (m.promo) ev.push({ t: 'promote', sq: m.to, to: m.promo });
  if (m.castle) {
    const row = m.from & ~7, rf = row + (m.castle === 'K' ? 7 : 0), rt = row + (m.castle === 'K' ? 5 : 3);
    ev.push({ t: 'move', from: rf, to: rt, piece: B[rf] });
    B[rt] = { ...B[rf], moved: true, lm: st.ply }; B[rf] = null;
  }
  st.ep = m.dbl ? (m.from + m.to) / 2 : -1;
  st.hm = p.t === 'P' || cap ? 0 : st.hm + 1;
  if (!m.castle && H.land(m.to) !== m.to) st.ep = -1;
}

const quickLimit = st => (st.chaos && st.chaos.haste[st.turn] ? 2 : 1);
const silenced = st => !!(st.chaos && st.chaos.silence > st.ply);

// Легальность розыгрыша карты: основная — свой король не под шахом после; быстрая — остаётся легальное продолжение.
function cardOk(st, a, wasCheck) {
  const S = st.turn, d = CARDS[a.id];
  if (BOARD_NEUTRAL.has(a.id)) {
    if (d.type === 'spell') return !wasCheck;
    if (!wasCheck) return true;
  }
  const s2 = applyCard(st, a, []);
  if (d.type === 'spell') return !inCheck(s2, S);
  return !inCheck(s2, S) || mainActions(s2).length > 0;
}

function applyCard(st0, a, ev) {
  const st = clone(st0), S = st.turn;
  st.mana[S] -= CARDS[a.id].cost;
  const i = st.hand[S].findIndex(c => c.uid === a.uid);
  const [c] = st.hand[S].splice(i, 1);
  const ch = c.ch || 0;
  st.discard[S].push(c.ch ? { uid: c.uid, id: c.id } : c); // в сброс карта уходит без заряда
  st.stats[S].cards++;
  st.stats[S].played[a.id] = (st.stats[S].played[a.id] || 0) + 1;
  st.hm = 0;
  ev.push({ t: 'card', side: S, id: a.id, tg: a.tg });
  resolveCard(st, a.id, a.tg, S, ev, { ...helpers(st, ev), ch });
  if (st.boss && st.boss.id === 'mirror' && S !== st.boss.side && st.hand[st.boss.side].length < HAND_CAP) {
    st.hand[st.boss.side].push({ uid: st.nextUid++, id: a.id }); st.extra[st.boss.side]++;
    ev.push({ t: 'boss', id: 'mirror', card: a.id });
  }
  return st;
}

function cardActions(st, filter, only = null) {
  const S = st.turn, seen = new Set(), out = [];
  if (silenced(st)) return out;
  const wasCheck = inCheck(st, S);
  for (const c of st.hand[S]) {
    const key = c.id + ':' + (c.ch || 0); // одинаковые карты с разным зарядом — разные варианты
    if (seen.has(key) || (only && !only.has(c.id))) continue;
    seen.add(key);
    const d = CARDS[c.id];
    if (!d || d.cost > st.mana[S] || !filter(d)) continue; // !d — скрытая карта в урезанном состоянии
    for (const tg of cardTargets(st, c.id, S, c.ch || 0)) {
      const a = { k: 'c', id: c.id, uid: c.uid, tg };
      if (cardOk(st, a, wasCheck)) out.push(a);
    }
  }
  return out;
}

export function mainActions(st) {
  return [...legalMoves(st), ...cardActions(st, d => d.type === 'spell')];
}

function marchActions(st) {
  const S = st.turn;
  return marchSteps(st, S).filter(([from, to]) => moveIsSafe(st, { from, to }, S)).map(([from, to]) => ({ k: 'p', from, to }));
}

function pendingActions(st) {
  const P = st.pending, S = st.turn;
  if (P.k === 'discard') {
    const seen = new Set(), out = [];
    for (const c of st.hand[S]) if (!seen.has(c.id)) { seen.add(c.id); out.push({ k: 'd', uid: c.uid, id: c.id }); }
    return out;
  }
  if (P.k === 'march') return [...marchActions(st), { k: 'skip' }];
  if (P.k === 'gift') return [...new Set(P.opts)].map(id => ({ k: 'g', id }));
  return [];
}

// only — необязательное множество id карт, которые рассматривать (для бота).
export function legalActions(st, only = null) {
  if (st.result || !st.started) return [];
  if (st.pending) return pendingActions(st);
  return [...legalMoves(st), ...cardActions(st, d => d.type === 'spell' || st.quickN < quickLimit(st), only)];
}

export function apply(st0, a) {
  const ev = [];
  if (a.k === 'm') {
    const st = clone(st0);
    doMove(st, a, ev);
    if (st.march && !st.result && marchActions(st).length) { st.pending = { k: 'march', side: st.turn }; st.march = false; }
    else endTurn(st, ev, true);
    return { state: st, events: ev };
  }
  if (a.k === 'c') {
    const st = applyCard(st0, a, ev);
    if (CARDS[a.id].type === 'spell') endTurn(st, ev, false);
    else { st.quickN++; st.quick = true; }
    return { state: st, events: ev };
  }
  const st = clone(st0), S = st.turn, H = helpers(st, ev);
  switch (a.k) {
    case 'd': {
      const i = st.hand[S].findIndex(c => c.uid === a.uid), [c] = st.hand[S].splice(i, 1);
      st.discard[S].push(c); st.pending = null;
      ev.push({ t: 'discard', side: S, card: c });
      break;
    }
    case 'g': {
      const c = { uid: st.nextUid++, id: a.id };
      st.chaos.gift = { ...st.chaos.gift, [S]: null }; st.pending = null; st.extra[S]++;
      if (st.hand[S].length >= HAND_CAP) { st.discard[S].push(c); ev.push({ t: 'burn', side: S, card: c }); }
      else { st.hand[S].push(c); ev.push({ t: 'draw', side: S, card: c, gift: true }); }
      break;
    }
    case 'p': {
      const p = st.board[a.from];
      ev.push({ t: 'move', from: a.from, to: a.to, piece: p, march: true });
      st.board[a.from] = null; st.board[a.to] = { ...p, moved: true, lm: st.ply };
      if (st.ep >= 0 && a.from === st.ep + (S === 'w' ? -8 : 8)) st.ep = -1; // этой пешкой только что шагнули на 2
      st.hm = 0;
      H.land(a.to);
      st.pending = null;
      endTurn(st, ev, true);
      break;
    }
    case 'skip':
      st.pending = null;
      endTurn(st, ev, true);
      break;
  }
  return { state: st, events: ev };
}

// Итог позиции: мат/пат, если нет действий. Вызывает UI после каждого apply.
export function settle(st) {
  if (st.result || !st.started) return st;
  if (legalActions(st).length) return st;
  const s = { ...st };
  s.result = inCheck(st, st.turn) ? { winner: opp(st.turn), reason: 'mate' } : { winner: null, reason: 'stalemate' };
  return s;
}

export const sameAction = (a, b) => {
  if (!a || !b || a.k !== b.k) return false;
  switch (a.k) {
    case 'm': return a.from === b.from && a.to === b.to && (a.promo || '') === (b.promo || '');
    case 'c': return a.id === b.id && a.tg.join() === b.tg.join() && (!a.uid || !b.uid || a.uid === b.uid);
    case 'p': return a.from === b.from && a.to === b.to;
    case 'd': return a.id === b.id;
    case 'g': return a.id === b.id;
    case 'skip': return true;
  }
  return false;
};

export { inCheck, kingSq, genMoves, moveIsSafe, CARDS };
