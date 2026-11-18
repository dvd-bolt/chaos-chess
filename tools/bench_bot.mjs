// Матч уровней бота и замер скорости: node tools/bench_bot.mjs [партий] [уровень A] [уровень B] [chaos]
// Колоды — случайные пресеты (у обоих одинаковые в паре партий со сменой цвета).
import { createGame, start, apply, settle } from '../web/src/engine/game.js';
import { chooseAction } from '../web/src/bot/bot.js';
import { PRESETS } from '../web/src/engine/cards.js';

const N = Number(process.argv[2] || 10), A = process.argv[3] || 'fighter', Bl = process.argv[4] || 'novice';
const chaos = process.argv[5] === 'chaos';
const times = { [A]: [], [Bl]: [] }, score = { [A]: 0, [Bl]: 0, draw: 0 };
const keys = Object.keys(PRESETS);
let cardsPlayed = 0, plies = 0;
for (let g = 0; g < N; g++) {
  const pk = keys[Math.floor(g / 2) % keys.length], dk = keys[(Math.floor(g / 2) + 1) % keys.length];
  const lv = g % 2 ? { w: Bl, b: A } : { w: A, b: Bl };
  const decks = g % 2 ? { w: PRESETS[dk].deck, b: PRESETS[pk].deck } : { w: PRESETS[pk].deck, b: PRESETS[dk].deck };
  let st = start(createGame({ seed: 1000 + Math.floor(g / 2), decks, chaos })).state;
  let seed = g + 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 400; i++) {
    st = settle(st);
    if (st.result) break;
    const t0 = performance.now();
    const a = chooseAction(st, lv[st.turn], rnd);
    if (!st.pending) times[lv[st.turn]].push(performance.now() - t0);
    if (a.k === 'c') cardsPlayed++;
    st = apply(st, a).state; plies++;
  }
  const w = st.result?.winner;
  if (w) score[lv[w]]++; else score.draw++;
  process.stdout.write(`партия ${g + 1}: ${st.result ? (w ? lv[w] : 'ничья') + ' / ' + st.result.reason : 'лимит'}, ходов ${st.ply}\n`);
}
const stat = a => { const s = [...a].sort((x, y) => x - y); return { avg: Math.round(s.reduce((x, y) => x + y, 0) / s.length), p95: Math.round(s[Math.floor(s.length * 0.95)]), max: Math.round(s[s.length - 1]) }; };
console.log(JSON.stringify({ score, cardsPerGame: +(cardsPlayed / N).toFixed(1), pliesPerGame: Math.round(plies / N), ['ms_' + A]: stat(times[A]), ['ms_' + Bl]: stat(times[Bl]) }));
