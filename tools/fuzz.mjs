// Случайные партии со случайными легальными действиями; проверка инвариантов. node tools/fuzz.mjs [N]
// Колоды — пресеты и случайные из всех 22 карт, каждая вторая партия в режиме «Хаос».
import { createGame, start, apply, legalActions, settle } from '../web/src/engine/game.js';
import { PRESETS, CARD_IDS, CARDS, copyLimit, deckErrors } from '../web/src/engine/cards.js';

const N = Number(process.argv[2] || 1000);
const res = {}; let plies = 0, cards = 0;
const played = {};
const t0 = Date.now();

export function randomDeck(r) {
  const deck = [];
  while (deck.length < 20) {
    const id = CARD_IDS[Math.floor(r() * CARD_IDS.length)];
    const n = deck.filter(x => x === id).length;
    if (n < copyLimit(id) && !(CARDS[id].rarity === 'legendary' && deck.some(x => CARDS[x].rarity === 'legendary'))) deck.push(id);
  }
  return deck;
}

for (let g = 0; g < N; g++) {
  let rnd = g * 7919 + 1;
  const r = () => ((rnd = (rnd * 1103515245 + 12345) % 2147483648) / 2147483648);
  const presets = Object.values(PRESETS).map(p => p.deck);
  const pick = () => (r() < 0.5 ? presets[Math.floor(r() * presets.length)] : randomDeck(r));
  const decks = { w: pick(), b: pick() };
  for (const s of 'wb') if (deckErrors(decks[s]).length) throw new Error('плохая колода ' + deckErrors(decks[s]));
  let st = start(createGame({ seed: g + 1, decks, chaos: g % 2 === 1, fog: true, boss: g % 3 === 0 ? ['ice', 'necro', 'bomber', 'mirror'][(g / 3) % 4] : null })).state;
  for (let i = 0; i < 500 && !st.result; i++) {
    st = settle(st);
    if (st.result) break;
    const acts = legalActions(st);
    const cs = acts.filter(a => a.k === 'c');
    const a = cs.length && r() < 0.4 ? cs[Math.floor(r() * cs.length)] : acts[Math.floor(r() * acts.length)];
    if (a.k === 'c') { cards++; played[a.id] = (played[a.id] || 0) + 1; }
    const before = st;
    st = apply(st, a).state; plies++;
    const where = `партия ${g}, ход ${i}, действие ${JSON.stringify(a)}`;
    for (const s of ['w', 'b']) {
      const total = st.deck[s].length + st.hand[s].length + st.discard[s].length;
      if (total !== 20 + st.extra[s]) throw new Error(`${where}: карт ${total}`);
      if (st.hand[s].length > 5 && !(st.pending && st.pending.k === 'discard' && st.turn === s)) throw new Error(`${where}: рука ${st.hand[s].length}`);
      if (st.mana[s] < 0) throw new Error(`${where}: мана < 0`);
      const kings = st.board.filter(p => p && p.t === 'K' && p.s === s).length;
      if (kings !== 1) throw new Error(`${where}: королей ${kings}`);
      if (st.traps.filter(t => t.owner === s).length > 1) throw new Error(`${where}: два капкана`);
      if (st.portals.filter(t => t.owner === s).length > 1) throw new Error(`${where}: два портала`);
    }
    for (let j = 0; j < 64; j++) {
      const p = st.board[j];
      if (!p) continue;
      if (st.walls[j] !== undefined) throw new Error(`${where}: фигура на стене`);
      if (p.t === 'P' && (j >> 3) === (p.s === 'w' ? 0 : 7)) throw new Error(`${where}: пешка на последней горизонтали`);
    }
    if (new Set(st.board.filter(Boolean).map(p => p.id)).size !== st.board.filter(Boolean).length) throw new Error(`${where}: дубли id`);
    if (st.result && st.result.reason === 'king') throw new Error(`${where}: взят король`);
    if (!st.pending && st.turn !== before.turn && !st.result && legalActions(st).some(x => x.k === 'm' && st.board[x.to] && st.board[x.to].t === 'K')) throw new Error(`${where}: можно бить короля`);
  }
  const k = st.result ? st.result.reason : 'limit';
  res[k] = (res[k] || 0) + 1;
}
console.log(JSON.stringify({ games: N, plies, cards, results: res, sec: (Date.now() - t0) / 1000 }));
console.log('сыграно по картам:', JSON.stringify(played));
