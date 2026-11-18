// Нагрузочный тест онлайна и проверка утечек: node tools/load_test.mjs ws://127.0.0.1:8099/ws [партий] [ходов на партию]
// Каждая пара клиентов создаёт комнату, играет случайными легальными действиями (по урезанному состоянию),
// меряет задержку «действие → новое состояние» и проверяет, что в трафике нет чужой руки, колоды и капканов.
import WebSocket from '../server/node_modules/ws/index.js';
import crypto from 'node:crypto';
import { legalActions } from '../web/src/engine/game.js';
import { PRESETS } from '../web/src/engine/cards.js';

const URL_ = process.argv[2] || 'ws://127.0.0.1:8099/ws', GAMES = Number(process.argv[3] || 50), MAXACT = Number(process.argv[4] || 60);
const lat = [], leaks = [];
let finished = 0, actsSent = 0, errors = 0;

function client(name) {
  const ws = new WebSocket(URL_), token = crypto.randomBytes(16).toString('hex');
  const c = { ws, name, side: null, st: null, seq: 0, pending: 0, acts: 0, done: false, handlers: [] };
  c.send = m => ws.send(JSON.stringify(m));
  c.wait = t => new Promise(res => c.handlers.push({ t, res }));
  ws.on('message', raw => {
    const m = JSON.parse(String(raw));
    check(c, m, String(raw));
    if (m.t === 'error') errors++;
    if (m.t === 'start') { c.side = m.side; c.st = m.state; c.seq = m.seq; }
    if (m.t === 'state') { c.st = m.state; c.seq = m.seq; if (c.pending && m.actor === c.side) { lat.push(performance.now() - c.pending); c.pending = 0; } }
    for (const h of c.handlers.slice()) if (h.t === m.t) { c.handlers.splice(c.handlers.indexOf(h), 1); h.res(m); }
    if (m.t === 'over') { c.done = true; }
    if ((m.t === 'state' || m.t === 'start') && m.state.started) setTimeout(() => act(c), 20 + Math.random() * 60);
  });
  ws.on('open', () => c.send({ t: 'hello', token, name }));
  return c;
}

// Утечки: чужие карты в руке/колоде, чужие капканы, зерно генератора, чужой дар хаоса.
function check(c, m, raw) {
  if (!c.side || !m.state) return;
  const o = c.side === 'w' ? 'b' : 'w', st = m.state;
  if (st.hand[o].some(x => x.id !== '?')) leaks.push('рука соперника');
  if (st.deck.w.concat(st.deck.b).some(x => x.id !== '?')) leaks.push('колода');
  if (st.traps.some(t => t.owner !== c.side)) leaks.push('капкан соперника');
  if (st.rng) leaks.push('зерно');
  if (st.chaos && st.chaos.gift[o] && st.chaos.gift[o].length) leaks.push('дар соперника');
  for (const e of m.events || []) {
    if (e.t === 'draw' && e.side === o && e.card.id !== '?') leaks.push('добор соперника');
    if (e.t === 'trapSet' && e.side === o) leaks.push('событие капкана');
    if (e.t === 'card' && e.id === 'trap' && e.side === o && e.tg.length) leaks.push('цель капкана');
  }
}

function act(c) {
  if (c.done || !c.st || c.pending || c.st.turn !== c.side || c.st.result) return;
  if (c.acts >= MAXACT) { c.send({ t: 'resign' }); c.done = true; return; }
  const acts = legalActions(c.st);
  if (!acts.length) return;
  const cards = acts.filter(a => a.k === 'c');
  const a = cards.length && Math.random() < 0.4 ? cards[Math.floor(Math.random() * cards.length)] : acts[Math.floor(Math.random() * acts.length)];
  c.acts++; actsSent++;
  c.pending = performance.now();
  c.send({ t: 'act', a, seq: c.seq });
}

async function pair(i) {
  const a = client('A' + i), b = client('B' + i);
  await Promise.all([a.wait('welcome'), b.wait('welcome')]);
  const keys = Object.keys(PRESETS);
  a.send({ t: 'create', deck: PRESETS[keys[i % 4]].deck, chaos: i % 2 === 0, clock: '15+10' });
  const room = await a.wait('room');
  b.send({ t: 'join', code: room.code, deck: PRESETS[keys[(i + 1) % 4]].deck });
  await Promise.all([a.wait('start'), b.wait('start')]);
  a.send({ t: 'mull', uids: [] }); b.send({ t: 'mull', uids: [] });
  await Promise.race([Promise.all([a.wait('over'), b.wait('over')]), new Promise(r => setTimeout(r, 300000))]);
  finished++;
  a.ws.close(); b.ws.close();
}

const t0 = Date.now();
await Promise.all(Array.from({ length: GAMES }, (_, i) => pair(i)));
const s = lat.sort((x, y) => x - y), pc = p => Math.round(s[Math.floor(s.length * p)] || 0);
console.log(JSON.stringify({ games: GAMES, finished, actions: actsSent, errors, sec: Math.round((Date.now() - t0) / 1000),
  latencyMs: { avg: Math.round(s.reduce((x, y) => x + y, 0) / s.length), p50: pc(0.5), p95: pc(0.95), p99: pc(0.99), max: Math.round(s[s.length - 1]) },
  leaks: [...new Set(leaks)] }));
process.exit(0);
