// Генератор головоломок: node tools/make_puzzles.mjs [сколько] [потоков] > web/puzzles.json
// Боты играют партии разными колодами (все 34 карты); в позициях ищем мат за один ход, который НЕЛЬЗЯ
// поставить обычным ходом — нужна карта. Позицию упаковываем, распаковываем и проверяем ещё раз.
// Сложность: 1 — решений 3+, 3 — единственное решение из двух действий (быстрая карта + ход), иначе 2.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import fs from 'node:fs';
import { createGame, start, apply, settle } from '../web/src/engine/game.js';
import { chooseAction } from '../web/src/bot/bot.js';
import { PRESETS, CARDS, CARD_IDS, copyLimit } from '../web/src/engine/cards.js';
import { pack, unpack, solutions } from '../web/src/engine/puzzle.js';

function randomDeck(r) {
  const deck = [];
  while (deck.length < 20) {
    const id = CARD_IDS[Math.floor(r() * CARD_IDS.length)];
    if (deck.filter(x => x === id).length < copyLimit(id) && !(CARDS[id].rarity === 'legendary' && deck.some(x => CARDS[x].rarity === 'legendary'))) deck.push(id);
  }
  return deck;
}

function search(from, step, want) {
  const out = [], keys = Object.keys(PRESETS);
  for (let g = from; out.length < want && g < from + step * 4000; g += step) {
    let seed = g * 31 + 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const deck = () => (rnd() < 0.5 ? PRESETS[keys[Math.floor(rnd() * keys.length)]].deck : randomDeck(rnd));
    let st = start(createGame({ seed: 9000 + g, decks: { w: deck(), b: deck() } })).state;
    const lv = { w: rnd() < 0.5 ? 'fighter' : 'novice', b: rnd() < 0.5 ? 'fighter' : 'novice' };
    let lastFound = -99;
    for (let i = 0; i < 160 && !st.result; i++) {
      st = settle(st);
      if (st.result) break;
      if (!st.pending && i > 8 && i - lastFound > 12 && st.hand[st.turn].length) {
        const P = pack(st);
        if (P) {
          const sol = solutions(unpack(P), 12);
          if (sol.length && sol.length <= 6 && !sol.some(l => l.every(a => a.k === 'm'))) {
            const used = [...new Set(sol.flatMap(l => l.filter(a => a.k === 'c').map(a => a.id)))];
            const diff = sol.length >= 3 ? 1 : sol.length === 1 && sol[0].length >= 2 ? 3 : 2;
            out.push({ ...P, solutions: sol.length, cards: used, diff });
            parentPort.postMessage({ progress: 1 });
            lastFound = i; // из одной партии — не чаще раза в 12 ходов
          }
        }
      }
      st = apply(st, chooseAction(st, lv[st.turn], rnd)).state;
    }
  }
  return out;
}

if (!isMainThread) parentPort.postMessage({ done: search(workerData.from, workerData.step, workerData.want) });
else {
  const WANT = Number(process.argv[2] || 300), T = Number(process.argv[3] || 2), t0 = Date.now();
  let n = 0;
  const parts = await Promise.all(Array.from({ length: T }, (_, i) => new Promise((res, rej) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { from: i, step: T, want: Math.ceil((WANT - 45) * 1.12 / T) } });
    w.on('message', m => { if (m.progress) { n++; if (n % 20 === 0) process.stderr.write(`найдено ${n}\n`); } if (m.done) res(m.done); });
    w.on('error', rej);
  })));
  // старые головоломки (дни 1–45) сохраняем первыми — номера дней не сдвигаются
  let old = [];
  try { old = JSON.parse(fs.readFileSync(new URL('../web/puzzles.json', import.meta.url))).puzzles; } catch { /* нет файла */ }
  const seen = new Set(old.map(p => p.fen + p.turn)), fresh = [];
  const byKey = {};
  for (const p of parts.flat()) {
    if (seen.has(p.fen + p.turn)) continue; seen.add(p.fen + p.turn);
    const k = p.cards.join();
    byKey[k] = (byKey[k] || 0) + 1;
    if (byKey[k] > Math.max(6, WANT * 0.08)) continue; // одна и та же карта-решение — не больше 8%
    fresh.push(p);
  }
  // чередуем карты-решения
  const buckets = {}; for (const p of fresh) (buckets[p.cards.join()] ||= []).push(p);
  const mixed = []; while (Object.values(buckets).some(b => b.length)) for (const k in buckets) if (buckets[k].length) mixed.push(buckets[k].shift());
  for (const p of old) if (!p.diff) p.diff = p.solutions >= 3 ? 1 : p.solutions === 1 ? 2 : 2;
  const all = [...old, ...mixed.slice(0, Math.max(0, WANT - old.length))].map((p, i) => ({ ...p, id: i + 1 }));
  process.stderr.write(`готово: ${all.length} (старых ${old.length}, новых ${all.length - old.length}) за ${Math.round((Date.now() - t0) / 1000)} с\n`);
  console.log(JSON.stringify({ version: 2, made: new Date().toISOString().slice(0, 10), puzzles: all }));
}
