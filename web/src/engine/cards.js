// Карты Chaos Chess: «Основа» (9) и «Расширение» (13). Король никогда не бывает целью и не затрагивается эффектами.
// Параметры карт — данные (CARDS), поведение — cardTargets/resolveCard. Баланс правится здесь же.
import { idx, inb, opp, cheb, KG, isFrozen, isShielded, isShackled, hasWall, blocked } from './rules.js';

export const CARDS = {
  shield:    { name: 'Щит', cost: 1, type: 'quick', rarity: 'common', set: 'core',
    text: 'Своя фигура до начала твоего следующего хода не может быть взята и не затрагивается картами.',
    prompt: ['Выбери свою фигуру'] },
  wall:      { name: 'Стена', cost: 1, type: 'quick', rarity: 'common', set: 'core',
    text: 'Камень на пустую клетку на 3 круга. Через него нельзя ходить и бить, он перекрывает линии. Конь перепрыгивает.',
    prompt: ['Выбери пустую клетку'] },
  ritual:    { name: 'Ритуал', cost: 0, type: 'quick', rarity: 'common', set: 'core',
    text: 'Пожертвуй свою пешку: +2 маны, можно сверх лимита.',
    prompt: ['Выбери свою пешку'] },
  blink:     { name: 'Рывок', cost: 2, type: 'spell', rarity: 'common', set: 'core',
    text: 'Перенеси свою фигуру на пустую клетку в радиусе 2. Без взятия; пешку нельзя на крайние горизонтали.',
    prompt: ['Выбери свою фигуру', 'Куда перенести?'] },
  hook:      { name: 'Крюк', cost: 3, type: 'spell', rarity: 'rare', set: 'core',
    text: 'Своя фигура и вражеская на одной линии или диагонали без преград, 2–4 клетки. Враг притягивается вплотную.',
    prompt: ['Выбери свою фигуру-якорь', 'Кого притянуть?'] },
  stasis:    { name: 'Стазис', cost: 3, type: 'quick', rarity: 'rare', set: 'core',
    text: 'Заморозь квадрат 2×2 на 1 круг: фигуры в нём не ходят, не бьют, не дают шах и неуязвимы.',
    prompt: ['Выбери левый верхний угол квадрата 2×2'] },
  mark:      { name: 'Метка охотника', cost: 3, type: 'quick', rarity: 'rare', set: 'core',
    text: 'Пометь вражескую фигуру (не ферзя). Если соперник не сходит ею в свой следующий ход — она погибает.',
    prompt: ['Выбери вражескую фигуру'] },
  meteor:    { name: 'Метеор', cost: 4, type: 'spell', rarity: 'epic', set: 'core',
    text: 'Выбери клетку. В начале твоего следующего хода метеор уничтожает всё в зоне 3×3, свои тоже. Короли и фигуры под Щитом выживают.',
    prompt: ['Куда упадёт метеор?'] },
  lightning: { name: 'Молния', cost: 5, type: 'spell', rarity: 'epic', set: 'core',
    text: 'Мгновенно уничтожь вражескую пешку, коня или слона.',
    prompt: ['Выбери цель'] },
  // ---------- Расширение ----------
  shackles:  { name: 'Оковы', cost: 1, type: 'quick', rarity: 'common', set: 'ext',
    text: 'Вражеская фигура не может ходить в следующий ход соперника. Шах она по-прежнему даёт.',
    prompt: ['Кого сковать?'] },
  insight:   { name: 'Озарение', cost: 1, type: 'quick', rarity: 'common', set: 'ext',
    text: 'Возьми 2 карты, затем сбрось 1 карту с руки.',
    prompt: [] },
  march:     { name: 'Марш', cost: 1, type: 'quick', rarity: 'common', set: 'ext',
    text: 'После хода фигурой сделай ещё шаг пешкой на 1 клетку вперёд — без взятия и превращения.',
    prompt: [] },
  swap:      { name: 'Подмена', cost: 2, type: 'spell', rarity: 'common', set: 'ext',
    text: 'Поменяй местами две свои фигуры (кроме короля). Пешку нельзя поставить на крайние горизонтали.',
    prompt: ['Первая фигура', 'С кем поменять?'] },
  ghost:     { name: 'Призрачный шаг', cost: 2, type: 'quick', rarity: 'rare', set: 'ext',
    text: 'В этот ход своя ладья, слон или ферзь проходит сквозь фигуры. Бить можно только конечную цель, стены держат.',
    prompt: ['Какая фигура станет призраком?'] },
  trap:      { name: 'Капкан', cost: 2, type: 'quick', rarity: 'rare', set: 'ext',
    text: 'Скрытый капкан на пустую клетку своей половины. Вражеская фигура, вставшая туда, погибает. Не больше 1 капкана.',
    prompt: ['Где спрятать капкан?'] },
  shockwave: { name: 'Ударная волна', cost: 3, type: 'spell', rarity: 'rare', set: 'ext',
    text: 'Все фигуры вокруг своей фигуры (кроме королей) отлетают на 1 клетку, если там свободно.',
    prompt: ['Центр волны — своя фигура'] },
  promote:   { name: 'Повышение', cost: 3, type: 'spell', rarity: 'rare', set: 'ext',
    text: 'Своя пешка становится конём или слоном.',
    prompt: ['Какую пешку повысить?'] },
  portal:    { name: 'Портал', cost: 3, type: 'spell', rarity: 'epic', set: 'ext',
    text: '2 связанных портала на пустых клетках на 3 круга. Фигура, вставшая в портал, выходит из второго, если он свободен. Король не ходит порталами.',
    prompt: ['Первый портал', 'Второй портал'] },
  rebirth:   { name: 'Возрождение', cost: 4, type: 'spell', rarity: 'epic', set: 'ext',
    text: 'Верни свою погибшую ладью, слона или коня на свободную клетку своей первой горизонтали.',
    prompt: ['Где возродить?'] },
  polymorph: { name: 'Порча', cost: 4, type: 'spell', rarity: 'epic', set: 'ext',
    text: 'Вражеская ладья, слон или конь превращается в пешку (не на крайних горизонталях).',
    prompt: ['Кого испортить?'] },
  quake:     { name: 'Землетрясение', cost: 4, type: 'spell', rarity: 'epic', set: 'ext',
    text: 'Все пешки на доске сдвигаются на 1 клетку вперёд, если свободно. Дошедшая до края становится ферзём.',
    prompt: [] },
  mirror:    { name: 'Зеркало', cost: 5, type: 'spell', rarity: 'legendary', set: 'ext',
    text: 'Копия своей пешки, коня или слона на соседней пустой клетке. Один раз за партию.',
    prompt: ['Что отразить?', 'Где появится копия?'] },
  // ---------- Набор 2 «Буря»: заряд +1 в начале каждого своего хода, пока карта в руке (максимум 3) ----------
  ward:      { name: 'Оберег', cost: 1, type: 'quick', rarity: 'common', set: 'storm', charge: true,
    text: 'Щит на свою фигуру на 1 + заряд кругов.', prompt: ['Выбери свою фигуру'] },
  bastion:   { name: 'Бастион', cost: 2, type: 'quick', rarity: 'common', set: 'storm', charge: true,
    text: 'Стена на пустую клетку на 3 + заряд кругов.', prompt: ['Выбери пустую клетку'] },
  tide:      { name: 'Прилив', cost: 1, type: 'quick', rarity: 'common', set: 'storm', charge: true,
    text: '+1 + заряд маны, можно сверх лимита (до 10).', prompt: [] },
  leap:      { name: 'Скачок', cost: 1, type: 'spell', rarity: 'common', set: 'storm', charge: true,
    text: 'Перенеси свою фигуру на пустую клетку в радиусе 1 + заряд. Пешку — не на крайние горизонтали.', prompt: ['Выбери свою фигуру', 'Куда перенести?'] },
  mentor:    { name: 'Наставник', cost: 2, type: 'spell', rarity: 'common', set: 'storm', charge: true,
    text: 'Своя пешка проходит вперёд до 1 + заряд клеток по свободной вертикали (не на последнюю горизонталь).', prompt: ['Какая пешка?', 'Докуда?'] },
  frost:     { name: 'Иней', cost: 2, type: 'quick', rarity: 'rare', set: 'storm', charge: true,
    text: 'Заморозь вражескую фигуру на 1 + заряд кругов: она не ходит, не бьёт и неуязвима.', prompt: ['Кого заморозить?'] },
  comet:     { name: 'Комета', cost: 3, type: 'spell', rarity: 'rare', set: 'storm', charge: true,
    text: 'В начале твоего следующего хода бьёт крестом из 5 клеток; с зарядом 2+ — квадратом 3×3. Короли и Щит выживают.', prompt: ['Куда упадёт комета?'] },
  harpoon:   { name: 'Гарпун', cost: 3, type: 'spell', rarity: 'rare', set: 'storm', charge: true,
    text: 'Как Крюк, но достаёт врага на расстоянии 2…(3 + заряд) клеток.', prompt: ['Выбери свою фигуру-якорь', 'Кого притянуть?'] },
  foresight: { name: 'Предвидение', cost: 2, type: 'quick', rarity: 'rare', set: 'storm', charge: true,
    text: 'Возьми столько карт, сколько заряда (минимум 1). Лишние сверх 5 сгорают.', prompt: [] },
  storm:     { name: 'Гроза', cost: 5, type: 'spell', rarity: 'epic', set: 'storm', charge: true,
    text: 'Уничтожь вражескую пешку, коня или слона; с зарядом 2+ — и ладью; с зарядом 3 — и ферзя.', prompt: ['Выбери цель'] },
  forge:     { name: 'Кузница', cost: 4, type: 'spell', rarity: 'epic', set: 'storm', charge: true,
    text: 'Своя пешка становится конём или слоном; с зарядом 2+ — можно ладьёй; с зарядом 3 — ферзём.', prompt: ['Какую пешку перековать?'] },
  phoenix:   { name: 'Феникс', cost: 5, type: 'spell', rarity: 'legendary', set: 'storm', charge: true,
    text: 'Верни погибшую фигуру (не ферзя) на свою первую горизонталь, пешку — на вторую; с зарядом 3 — и ферзя.', prompt: ['Где возродить?'] },
};
export const CARD_IDS = Object.keys(CARDS);
export const MAX_CHARGE = 3;
export const PIECE_NAME = { P: 'пешка', N: 'конь', B: 'слон', R: 'ладья', Q: 'ферзь', K: 'король' };

// ---------- колоды ----------
export const DECK_SIZE = 20;
export const copyLimit = id => (CARDS[id].rarity === 'legendary' ? 1 : CARDS[id].rarity === 'common' ? 3 : 2);
const deck = spec => Object.entries(spec).flatMap(([id, n]) => Array(n).fill(id));
export const PRESETS = {
  core:   { name: 'Основа', desc: 'Стартовая колода: всего понемногу', deck: deck({ shield: 3, wall: 3, blink: 3, ritual: 2, hook: 2, stasis: 2, mark: 2, meteor: 2, lightning: 1 }) },
  control:{ name: 'Контроль', desc: 'Стазис, Стена, Оковы: соперник не ходит, куда хочет', deck: deck({ wall: 3, shackles: 3, stasis: 2, shield: 2, insight: 2, trap: 2, mark: 2, meteor: 2, polymorph: 1, rebirth: 1 }) },
  aggro:  { name: 'Агрессия', desc: 'Крюк, Молния, Метка: давить с первого хода', deck: deck({ blink: 3, ritual: 3, hook: 2, lightning: 2, mark: 2, ghost: 2, march: 2, shockwave: 2, shield: 2 }) },
  storm:  { name: 'Буря', desc: 'Набор 2: копи заряд — карты крепнут в руке', deck: deck({ ward: 3, tide: 2, leap: 3, mentor: 2, frost: 2, comet: 2, harpoon: 2, foresight: 1, storm: 1, forge: 1, phoenix: 1 }) },
  chaos:  { name: 'Хаос', desc: 'Портал, Землетрясение, Подмена: доска не стоит на месте', deck: deck({ portal: 2, quake: 2, swap: 2, mirror: 1, meteor: 2, trap: 2, blink: 2, wall: 2, insight: 2, promote: 2, ritual: 1 }) },
};
export const START_DECK = PRESETS.core.deck;

// Ошибки колоды (пустой массив — колода годится).
export function deckErrors(ids) {
  const errs = [], cnt = {};
  for (const id of ids) {
    if (!CARDS[id]) { errs.push(`Неизвестная карта: ${id}`); continue; }
    cnt[id] = (cnt[id] || 0) + 1;
  }
  if (ids.length !== DECK_SIZE) errs.push(`В колоде ${ids.length} карт, нужно ${DECK_SIZE}`);
  for (const id in cnt) if (cnt[id] > copyLimit(id)) errs.push(`«${CARDS[id].name}»: не больше ${copyLimit(id)}`);
  if (ids.filter(id => CARDS[id]?.rarity === 'legendary').length > 1) errs.push('Легендарная карта — только одна');
  return errs;
}

// Карты, не меняющие доску в момент розыгрыша: на шах своему королю не влияют.
export const BOARD_NEUTRAL = new Set(['shield', 'wall', 'stasis', 'mark', 'meteor', 'shackles', 'insight', 'march', 'ghost', 'trap', 'portal',
  'ward', 'bastion', 'tide', 'frost', 'comet', 'foresight']);

export const affectable = (st, p) => p && p.t !== 'K' && !isFrozen(st, p) && !isShielded(st, p);
const half = (s, i) => (s === 'w' ? (i >> 3) >= 4 : (i >> 3) <= 3);
const edgeRow = i => (i >> 3) === 0 || (i >> 3) === 7;
export const isPortalSq = (st, i) => (st.portals || []).some(p => p.a === i || p.b === i);

// Пешки, которые сдвинет Землетрясение: [откуда, куда].
export function quakeMoves(st) {
  const B = st.board, want = [];
  for (let i = 0; i < 64; i++) {
    const p = B[i];
    if (!p || p.t !== 'P' || !affectable(st, p)) continue;
    const j = i + (p.s === 'w' ? -8 : 8);
    if (j >= 0 && j < 64 && !blocked(st, j)) want.push([i, j]);
  }
  const dst = {};
  for (const [, j] of want) dst[j] = (dst[j] || 0) + 1;
  return want.filter(([, j]) => dst[j] === 1); // две пешки в одну клетку — обе стоят
}

// Куда Ударная волна отбросит соседей центра c: [откуда, куда].
export function waveMoves(st, c) {
  const out = [], r = c >> 3, f = c & 7;
  for (const [dr, df] of KG) {
    if (!inb(r + dr, f + df) || !inb(r + 2 * dr, f + 2 * df)) continue;
    const a = idx(r + dr, f + df), b = idx(r + 2 * dr, f + 2 * df), p = st.board[a];
    if (affectable(st, p) && !blocked(st, b)) out.push([a, b]);
  }
  return out;
}

export function marchSteps(st, s) {
  const out = [];
  for (let i = 0; i < 64; i++) {
    const p = st.board[i];
    if (!p || p.s !== s || p.t !== 'P' || isFrozen(st, p) || isShackled(st, p)) continue;
    const j = i + (s === 'w' ? -8 : 8);
    if (j < 0 || j > 63 || edgeRow(j) || blocked(st, j)) continue;
    out.push([i, j]);
  }
  return out;
}

// Зона удара метеора или кометы.
export function zoneOf(m) {
  if (m.shape !== 'plus') return zone3(m.c);
  const r = m.c >> 3, f = m.c & 7, out = [m.c];
  for (const [dr, df] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inb(r + dr, f + df)) out.push(idx(r + dr, f + df));
  return out;
}

// ch — заряд разыгрываемой карты (для Набора 2).
export function cardTargets(st, id, s, ch = 0) {
  const B = st.board, out = [], o = opp(s);
  const own = i => B[i] && B[i].s === s && B[i].t !== 'K' && !isFrozen(st, B[i]);
  const mover = i => own(i) && !isShackled(st, B[i]);
  switch (id) {
    case 'shield':
      for (let i = 0; i < 64; i++) if (own(i) && !isShielded(st, B[i])) out.push([i]);
      break;
    case 'wall':
      for (let i = 0; i < 64; i++) if (!blocked(st, i) && !isPortalSq(st, i)) out.push([i]);
      break;
    case 'ritual':
      for (let i = 0; i < 64; i++) if (own(i) && B[i].t === 'P') out.push([i]);
      break;
    case 'blink':
      for (let i = 0; i < 64; i++) {
        if (!mover(i)) continue;
        for (let j = 0; j < 64; j++) {
          if (j === i || cheb(i, j) > 2 || blocked(st, j)) continue;
          if (B[i].t === 'P' && edgeRow(j)) continue;
          out.push([i, j]);
        }
      }
      break;
    case 'hook':
      for (let a = 0; a < 64; a++) {
        if (!own(a)) continue;
        for (const [dr, df] of KG) {
          let r = (a >> 3) + dr, f = (a & 7) + df;
          for (let d = 1; d <= 4 && inb(r, f); d++, r += dr, f += df) {
            const j = idx(r, f);
            if (hasWall(st, j)) break;
            const q = B[j];
            if (!q) continue;
            if (d >= 2 && q.s === o && affectable(st, q)) {
              const dest = idx((a >> 3) + dr, (a & 7) + df);
              const lastRow = q.s === 'w' ? 0 : 7;
              if (!(q.t === 'P' && (dest >> 3) === lastRow)) out.push([a, j]);
            }
            break;
          }
        }
      }
      break;
    case 'stasis':
      for (let r = 0; r < 7; r++) for (let f = 0; f < 7; f++) {
        if (stasisSquares(idx(r, f)).some(j => affectable(st, B[j]))) out.push([idx(r, f)]);
      }
      break;
    case 'mark':
      for (let i = 0; i < 64; i++) {
        const q = B[i];
        if (q && q.s === o && q.t !== 'Q' && affectable(st, q) && !st.marks.some(m => m.id === q.id)) out.push([i]);
      }
      break;
    case 'meteor':
      for (let i = 0; i < 64; i++) out.push([i]);
      break;
    case 'lightning':
      for (let i = 0; i < 64; i++) {
        const q = B[i];
        if (q && q.s === o && 'PNB'.includes(q.t) && affectable(st, q)) out.push([i]);
      }
      break;
    case 'shackles':
      for (let i = 0; i < 64; i++) {
        const q = B[i];
        if (q && q.s === o && affectable(st, q) && !isShackled(st, q)) out.push([i]);
      }
      break;
    case 'insight':
      if (st.deck[s].length + st.discard[s].length > 0) out.push([]);
      break;
    case 'march':
      if (marchSteps(st, s).length) out.push([]);
      break;
    case 'swap':
      for (let a = 0; a < 64; a++) {
        if (!mover(a)) continue;
        for (let b = a + 1; b < 64; b++) {
          if (!mover(b) || B[a].t === B[b].t) continue;
          if ((B[a].t === 'P' && edgeRow(b)) || (B[b].t === 'P' && edgeRow(a))) continue;
          out.push([a, b]);
        }
      }
      break;
    case 'ghost':
      for (let i = 0; i < 64; i++) if (mover(i) && 'RBQ'.includes(B[i].t)) out.push([i]);
      break;
    case 'trap':
      if ((st.traps || []).some(t => t.owner === s)) break;
      for (let i = 0; i < 64; i++) if (half(s, i) && !blocked(st, i) && !isPortalSq(st, i)) out.push([i]);
      break;
    case 'shockwave':
      for (let i = 0; i < 64; i++) if (own(i) && waveMoves(st, i).length) out.push([i]);
      break;
    case 'promote':
      for (let i = 0; i < 64; i++) if (own(i) && B[i].t === 'P') { out.push([i, 'N']); out.push([i, 'B']); }
      break;
    case 'portal': {
      if ((st.portals || []).some(p => p.owner === s)) break;
      const free = [];
      for (let i = 0; i < 64; i++) if (!blocked(st, i) && !isPortalSq(st, i)) free.push(i);
      for (const a of free) for (const b of free) if (b > a && cheb(a, b) >= 2) out.push([a, b]);
      break;
    }
    case 'rebirth': {
      const types = [...new Set((st.grave?.[s] || []).filter(t => 'RBN'.includes(t)))];
      const row = s === 'w' ? 7 : 0;
      for (let f = 0; f < 8; f++) {
        const i = idx(row, f);
        if (blocked(st, i)) continue;
        for (const t of types) out.push([i, t]);
      }
      break;
    }
    case 'polymorph':
      for (let i = 0; i < 64; i++) {
        const q = B[i];
        if (q && q.s === o && 'RBN'.includes(q.t) && affectable(st, q) && !edgeRow(i)) out.push([i]);
      }
      break;
    case 'quake':
      if (quakeMoves(st).length) out.push([]);
      break;
    case 'ward':
      return cardTargets(st, 'shield', s);
    case 'bastion':
      return cardTargets(st, 'wall', s);
    case 'tide': case 'foresight':
      if (id === 'tide' ? st.mana[s] < 10 : st.deck[s].length + st.discard[s].length > 0) out.push([]);
      break;
    case 'leap':
      for (let i = 0; i < 64; i++) {
        if (!mover(i)) continue;
        for (let j = 0; j < 64; j++) {
          if (j === i || cheb(i, j) > 1 + ch || blocked(st, j)) continue;
          if (B[i].t === 'P' && edgeRow(j)) continue;
          out.push([i, j]);
        }
      }
      break;
    case 'mentor':
      for (let i = 0; i < 64; i++) {
        if (!mover(i) || B[i].t !== 'P') continue;
        const d = s === 'w' ? -8 : 8;
        for (let k = 1, j = i + d; k <= 1 + ch && j >= 0 && j < 64 && !blocked(st, j) && !edgeRow(j); k++, j += d) out.push([i, j]);
      }
      break;
    case 'frost':
      for (let i = 0; i < 64; i++) { const q = B[i]; if (q && q.s === o && affectable(st, q)) out.push([i]); }
      break;
    case 'comet':
      for (let i = 0; i < 64; i++) out.push([i]);
      break;
    case 'harpoon':
      for (let a = 0; a < 64; a++) {
        if (!own(a)) continue;
        for (const [dr, df] of KG) {
          let r = (a >> 3) + dr, f = (a & 7) + df;
          for (let d = 1; d <= 3 + ch && inb(r, f); d++, r += dr, f += df) {
            const j = idx(r, f);
            if (hasWall(st, j)) break;
            const q = B[j];
            if (!q) continue;
            if (d >= 2 && q.s === o && affectable(st, q)) {
              const dest = idx((a >> 3) + dr, (a & 7) + df);
              if (!(q.t === 'P' && (dest >> 3) === (q.s === 'w' ? 0 : 7))) out.push([a, j]);
            }
            break;
          }
        }
      }
      break;
    case 'storm': {
      const types = 'PNB' + (ch >= 2 ? 'R' : '') + (ch >= 3 ? 'Q' : '');
      for (let i = 0; i < 64; i++) { const q = B[i]; if (q && q.s === o && types.includes(q.t) && affectable(st, q)) out.push([i]); }
      break;
    }
    case 'forge': {
      const types = ['N', 'B', ...(ch >= 2 ? ['R'] : []), ...(ch >= 3 ? ['Q'] : [])];
      for (let i = 0; i < 64; i++) if (own(i) && B[i].t === 'P') for (const t of types) out.push([i, t]);
      break;
    }
    case 'phoenix': {
      const types = [...new Set((st.grave?.[s] || []).filter(t => 'RBNP'.includes(t) || (t === 'Q' && ch >= 3)))];
      for (const t of types) {
        const row = t === 'P' ? (s === 'w' ? 6 : 1) : (s === 'w' ? 7 : 0);
        for (let f = 0; f < 8; f++) { const i = idx(row, f); if (!blocked(st, i)) out.push([i, t]); }
      }
      break;
    }
    case 'mirror':
      if (st.mirrorUsed?.[s]) break;
      for (let i = 0; i < 64; i++) {
        if (!own(i) || !'PNB'.includes(B[i].t)) continue;
        for (const [dr, df] of KG) {
          const r = (i >> 3) + dr, f = (i & 7) + df;
          if (!inb(r, f)) continue;
          const j = idx(r, f);
          if (blocked(st, j) || (B[i].t === 'P' && edgeRow(j))) continue;
          out.push([i, j]);
        }
      }
      break;
  }
  return out;
}

export const stasisSquares = c => [c, c + 1, c + 8, c + 9];
export function zone3(c) {
  const out = [], r = c >> 3, f = c & 7;
  for (let dr = -1; dr <= 1; dr++) for (let df = -1; df <= 1; df++) if (inb(r + dr, f + df)) out.push(idx(r + dr, f + df));
  return out;
}

// Цель карты: клетки (числа) и необязательный выбор типа фигуры (строка) последним элементом.
export const tgSquares = tg => tg.filter(x => typeof x === 'number');

// Применение эффекта к уже скопированному состоянию st.
// H — помощники игры: destroy(piece, sq, cause, by), land(sq) → клетка, где фигура остановилась, draw(n), rand().
export function resolveCard(st, id, tg, s, ev, H) {
  const B = st.board;
  switch (id) {
    case 'shield': {
      const p = B[tg[0]];
      st.shield[p.id] = st.ply + 2;
      ev.push({ t: 'shield', sq: tg[0], id: p.id });
      break;
    }
    case 'wall':
      st.walls[tg[0]] = st.ply + 6;
      ev.push({ t: 'wall', sq: tg[0] });
      if (st.traps.some(t => t.sq === tg[0])) { st.traps = st.traps.filter(t => t.sq !== tg[0]); ev.push({ t: 'trapGone', sq: tg[0] }); }
      break;
    case 'ritual': {
      const p = B[tg[0]];
      H.destroy(p, tg[0], 'ritual', s);
      st.mana[s] += 2;
      ev.push({ t: 'mana', side: s, d: 2, why: 'ritual' });
      break;
    }
    case 'blink': {
      const [a, b] = tg, p = B[a];
      B[a] = null; B[b] = { ...p, moved: true, lm: st.ply };
      ev.push({ t: 'blink', from: a, to: b, piece: p });
      H.land(b);
      break;
    }
    case 'hook': {
      const [a, e] = tg;
      const dr = Math.sign((e >> 3) - (a >> 3)), df = Math.sign((e & 7) - (a & 7));
      const dest = idx((a >> 3) + dr, (a & 7) + df), q = B[e];
      B[e] = null; B[dest] = { ...q, moved: true };
      ev.push({ t: 'hook', anchor: a, from: e, to: dest, piece: q });
      H.land(dest);
      break;
    }
    case 'stasis': {
      const sqs = stasisSquares(tg[0]), ids = [];
      for (const j of sqs) if (affectable(st, B[j])) { st.frozen[B[j].id] = st.ply + 2; ids.push(B[j].id); }
      ev.push({ t: 'stasis', sqs, ids });
      break;
    }
    case 'mark': {
      const q = B[tg[0]];
      st.marks = [...st.marks, { owner: s, id: q.id, placed: st.ply, at: st.ply + 2 }];
      ev.push({ t: 'mark', sq: tg[0], id: q.id });
      break;
    }
    case 'meteor':
      st.meteors = [...st.meteors, { owner: s, c: tg[0], at: st.ply + 2 }];
      ev.push({ t: 'meteorCast', sq: tg[0] });
      break;
    case 'lightning':
      ev.push({ t: 'lightning', sq: tg[0] });
      H.destroy(B[tg[0]], tg[0], 'lightning', s);
      break;
    case 'shackles': {
      const q = B[tg[0]];
      st.shackled[q.id] = st.ply + 2;
      ev.push({ t: 'shackles', sq: tg[0], id: q.id });
      break;
    }
    case 'insight':
      ev.push({ t: 'insight', side: s });
      H.draw(2);
      if (st.hand[s].length) st.pending = { k: 'discard', side: s };
      break;
    case 'march':
      st.march = true;
      ev.push({ t: 'marchOn', side: s });
      break;
    case 'swap': {
      const [a, b] = tg, pa = B[a], pb = B[b];
      B[a] = { ...pb, moved: true, lm: st.ply }; B[b] = { ...pa, moved: true, lm: st.ply };
      ev.push({ t: 'swap', a, b, pa, pb });
      break;
    }
    case 'ghost':
      st.ghost = B[tg[0]].id;
      ev.push({ t: 'ghost', sq: tg[0], id: st.ghost });
      break;
    case 'trap':
      st.traps = [...st.traps, { owner: s, sq: tg[0] }];
      ev.push({ t: 'trapSet', sq: tg[0], side: s });
      break;
    case 'shockwave': {
      const mv = waveMoves(st, tg[0]);
      ev.push({ t: 'wave', sq: tg[0], moves: mv.map(([a, b]) => ({ from: a, to: b, piece: B[a] })) });
      const ps = mv.map(([a]) => B[a]);
      for (const [a] of mv) B[a] = null;
      mv.forEach(([, b], i) => { B[b] = { ...ps[i], moved: true }; });
      for (const [, b] of mv) if (B[b]) { H.promoteIfEdge(b); H.land(b); }
      break;
    }
    case 'promote': {
      const p = B[tg[0]];
      B[tg[0]] = { ...p, t: tg[1] };
      ev.push({ t: 'promote', sq: tg[0], to: tg[1], why: 'card' });
      break;
    }
    case 'portal':
      st.portals = [...st.portals, { owner: s, a: tg[0], b: tg[1], until: st.ply + 6 }];
      ev.push({ t: 'portalOpen', a: tg[0], b: tg[1] });
      break;
    case 'rebirth': {
      const [sq, t] = tg, g = st.grave[s], k = g.indexOf(t);
      st.grave = { ...st.grave, [s]: [...g.slice(0, k), ...g.slice(k + 1)] };
      B[sq] = { id: st.nextId++, s, t, moved: true, lm: st.ply };
      ev.push({ t: 'rebirth', sq, piece: B[sq] });
      H.land(sq);
      break;
    }
    case 'polymorph': {
      const p = B[tg[0]];
      B[tg[0]] = { ...p, t: 'P', moved: true };
      ev.push({ t: 'polymorph', sq: tg[0], from: p.t });
      break;
    }
    case 'quake': {
      const mv = quakeMoves(st);
      ev.push({ t: 'quake', moves: mv.map(([a, b]) => ({ from: a, to: b, piece: B[a] })) });
      const ps = mv.map(([a]) => B[a]);
      for (const [a] of mv) B[a] = null;
      mv.forEach(([, b], i) => { B[b] = { ...ps[i], moved: true }; });
      for (const [, b] of mv) if (B[b]) { H.promoteIfEdge(b); H.land(b); }
      st.ep = -1;
      break;
    }
    case 'ward': {
      const p = B[tg[0]], n = 1 + (H.ch || 0);
      st.shield[p.id] = st.ply + 2 * n;
      ev.push({ t: 'shield', sq: tg[0], id: p.id });
      break;
    }
    case 'bastion':
      st.walls[tg[0]] = st.ply + 2 * (3 + (H.ch || 0));
      ev.push({ t: 'wall', sq: tg[0] });
      if (st.traps.some(t => t.sq === tg[0])) { st.traps = st.traps.filter(t => t.sq !== tg[0]); ev.push({ t: 'trapGone', sq: tg[0] }); }
      break;
    case 'tide': {
      const v = Math.min(10, st.mana[s] + 1 + (H.ch || 0));
      ev.push({ t: 'mana', side: s, d: v - st.mana[s], why: 'ritual' }); st.mana[s] = v;
      break;
    }
    case 'leap': {
      const [a, b] = tg, p = B[a];
      B[a] = null; B[b] = { ...p, moved: true, lm: st.ply };
      ev.push({ t: 'blink', from: a, to: b, piece: p });
      H.land(b);
      break;
    }
    case 'mentor': {
      const [a, b] = tg, p = B[a];
      B[a] = null; B[b] = { ...p, moved: true, lm: st.ply };
      ev.push({ t: 'move', from: a, to: b, piece: p });
      H.land(b); st.ep = -1;
      break;
    }
    case 'frost': {
      const q = B[tg[0]];
      st.frozen[q.id] = st.ply + 2 * (1 + (H.ch || 0));
      ev.push({ t: 'stasis', sqs: [tg[0]], ids: [q.id] });
      break;
    }
    case 'comet':
      st.meteors = [...st.meteors, { owner: s, c: tg[0], at: st.ply + 2, shape: (H.ch || 0) >= 2 ? 'sq' : 'plus' }];
      ev.push({ t: 'meteorCast', sq: tg[0], shape: (H.ch || 0) >= 2 ? 'sq' : 'plus' });
      break;
    case 'harpoon': {
      const [a, e] = tg;
      const dr = Math.sign((e >> 3) - (a >> 3)), df = Math.sign((e & 7) - (a & 7));
      const dest = idx((a >> 3) + dr, (a & 7) + df), q = B[e];
      B[e] = null; B[dest] = { ...q, moved: true };
      ev.push({ t: 'hook', anchor: a, from: e, to: dest, piece: q });
      H.land(dest);
      break;
    }
    case 'foresight':
      ev.push({ t: 'insight', side: s });
      for (let i = 0; i < Math.max(1, H.ch || 0); i++) H.drawCapped();
      break;
    case 'storm':
      ev.push({ t: 'lightning', sq: tg[0] });
      H.destroy(B[tg[0]], tg[0], 'storm', s);
      break;
    case 'forge': {
      const p = B[tg[0]];
      B[tg[0]] = { ...p, t: tg[1] };
      ev.push({ t: 'promote', sq: tg[0], to: tg[1], why: 'card' });
      break;
    }
    case 'phoenix': {
      const [sq, t] = tg, g = st.grave[s], k = g.indexOf(t);
      st.grave = { ...st.grave, [s]: [...g.slice(0, k), ...g.slice(k + 1)] };
      B[sq] = { id: st.nextId++, s, t, moved: true, lm: st.ply };
      ev.push({ t: 'rebirth', sq, piece: B[sq] });
      H.land(sq);
      break;
    }
    case 'mirror': {
      const [a, b] = tg, p = B[a];
      st.mirrorUsed = { ...st.mirrorUsed, [s]: true };
      B[b] = { id: st.nextId++, s, t: p.t, moved: true, lm: st.ply };
      ev.push({ t: 'mirror', from: a, to: b, piece: B[b] });
      H.land(b);
      break;
    }
  }
}
