// Конвейер баланса: node tools/balance.mjs [партий] [потоков] > reports/balance.md
// Бот «sim» (глубина 1, без шума) играет сам с собой случайными колодами из всех 22 карт.
// Для каждой карты: % побед колод, где она есть (главная метрика, цель 45–58%), и % побед стороны, которая её сыграла.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { createGame, start, apply, settle } from '../web/src/engine/game.js';
import { chooseAction, LEVELS } from '../web/src/bot/bot.js';
import { CARDS, CARD_IDS, copyLimit } from '../web/src/engine/cards.js';

LEVELS.sim = { depth: 1, q: 2, noise: 6, blunder: 0, cardsPerId: 2, quickTop: 2 };

function randomDeck(r) {
  const deck = [];
  while (deck.length < 20) {
    const id = CARD_IDS[Math.floor(r() * CARD_IDS.length)];
    const n = deck.filter(x => x === id).length;
    if (n < copyLimit(id) && !(CARDS[id].rarity === 'legendary' && deck.some(x => CARDS[x].rarity === 'legendary'))) deck.push(id);
  }
  return deck;
}

function play(g) {
  let seed = g * 2654435761 % 2147483647 || 1;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const decks = { w: randomDeck(r), b: randomDeck(r) };
  let st = start(createGame({ seed: g + 1, decks })).state;
  for (let i = 0; i < 300; i++) {
    st = settle(st);
    if (st.result) break;
    st = apply(st, chooseAction(st, 'sim', r)).state;
  }
  return { decks, winner: st.result ? st.result.winner : null, reason: st.result ? st.result.reason : 'limit', plies: st.ply,
    played: { w: st.stats.w.played, b: st.stats.b.played }, cards: { w: st.stats.w.cards, b: st.stats.b.cards } };
}

if (!isMainThread) {
  const out = [];
  for (let g = workerData.from; g < workerData.to; g++) { out.push(play(g)); if (out.length % 20 === 0) parentPort.postMessage({ progress: 20 }); }
  parentPort.postMessage({ done: out });
} else {
  const N = Number(process.argv[2] || 200), T = Number(process.argv[3] || 2), t0 = Date.now();
  const parts = await Promise.all(Array.from({ length: T }, (_, i) => new Promise((res, rej) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { from: Math.floor(N * i / T), to: Math.floor(N * (i + 1) / T) } });
    w.on('message', m => { if (m.progress) process.stderr.write('.'); if (m.done) res(m.done); });
    w.on('error', rej);
  })));
  const games = parts.flat();
  const deckStat = {}, playStat = {}, res = {}; let whiteWins = 0, decisive = 0, plies = 0, cards = 0;
  for (const id of CARD_IDS) { deckStat[id] = { w: 0, n: 0 }; playStat[id] = { w: 0, n: 0, times: 0 }; }
  for (const g of games) {
    res[g.reason] = (res[g.reason] || 0) + 1; plies += g.plies; cards += g.cards.w + g.cards.b;
    if (!g.winner) continue;
    decisive++; if (g.winner === 'w') whiteWins++;
    for (const s of ['w', 'b']) {
      const won = g.winner === s ? 1 : 0;
      for (const id of new Set(g.decks[s])) { deckStat[id].n++; deckStat[id].w += won; }
      for (const id in g.played[s]) { playStat[id].n++; playStat[id].w += won; playStat[id].times += g.played[s][id]; }
    }
  }
  const pct = (a, b) => (b ? (100 * a / b).toFixed(1) : '—');
  const rows = CARD_IDS.map(id => ({ id, d: deckStat[id].n ? 100 * deckStat[id].w / deckStat[id].n : 50, ...deckStat[id], p: playStat[id] }))
    .sort((a, b) => b.d - a.d);
  const flag = d => (d > 58 ? '⬆ сильна' : d < 45 ? '⬇ слаба' : 'норма');
  console.log(`# Chaos Chess — отчёт баланса\n\nДата: ${new Date().toISOString().slice(0, 10)}. Партий: ${games.length} (бот «sim» против себя, случайные колоды из ${CARD_IDS.length} карт). Время: ${Math.round((Date.now() - t0) / 1000)} с.\n`);
  console.log(`- Результаты: ${Object.entries(res).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  console.log(`- Победы белых среди результативных: ${pct(whiteWins, decisive)}% (цель 50–56%)`);
  console.log(`- Средняя длина: ${Math.round(plies / games.length / 2)} ходов; карт за партию: ${(cards / games.length).toFixed(1)}\n`);
  console.log('| Карта | Мана | % побед колод с картой | Партий | % побед, когда сыграна | Розыгрышей | Оценка |\n|---|---|---|---|---|---|---|');
  for (const r of rows) console.log(`| ${CARDS[r.id].name} | ${CARDS[r.id].cost} | ${r.d.toFixed(1)} | ${r.n} | ${pct(r.p.w, r.p.n)} | ${r.p.times} | ${flag(r.d)} |`);
  const out = rows.filter(r => r.d > 58 || r.d < 45);
  console.log(`\nВне коридора 45–58%: ${out.length ? out.map(r => CARDS[r.id].name).join(', ') : 'нет'}.`);
  console.log('\nМетрика «% побед колод с картой» не зависит от того, кто выигрывал по ходу партии, поэтому по ней и принимаются решения. «Когда сыграна» показывает, помогает ли карта в руках бота.');
  process.stderr.write('\n');
}
