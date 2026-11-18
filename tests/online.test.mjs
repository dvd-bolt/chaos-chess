// Интеграционный тест онлайна: поднимает сервер на свободном порту и играет двумя клиентами.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import WebSocket from '../server/node_modules/ws/index.js';
import { legalActions, createGame, start, apply, mulligan, settle } from '../web/src/engine/game.js';
import { PRESETS } from '../web/src/engine/cards.js';
import { checkInitData, signInitData } from '../server/auth.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 20000 + Math.floor(Math.random() * 20000);
const BOT = '123456:TEST_TOKEN_FOR_UNIT_TESTS';
let srv;

test.before(async () => {
  srv = spawn(process.execPath, ['--no-warnings', 'server/server.mjs'], { cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DB_PATH: path.join(os.tmpdir(), `cc_online_${PORT}.db`), BOT_TOKEN: BOT, ADMIN_TOKEN: 'adm_test_123' } });
  await new Promise((res, rej) => { srv.stdout.on('data', d => { if (String(d).includes('сервер')) res(); }); srv.on('exit', rej); });
});
test.after(() => srv.kill());

function client(token = crypto.randomBytes(16).toString('hex'), extra = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  const c = { ws, token, inbox: [], waiters: [] };
  c.send = m => ws.send(JSON.stringify(m));
  c.wait = (t, ms = 5000) => {
    const i = c.inbox.findIndex(m => m.t === t);
    if (i >= 0) return Promise.resolve(c.inbox.splice(i, 1)[0]);
    return new Promise((res, rej) => { const w = { t, res }; c.waiters.push(w); setTimeout(() => rej(new Error('нет ' + t)), ms); });
  };
  ws.on('message', raw => {
    const m = JSON.parse(String(raw));
    if (m.state) c.st = m.state;
    if (m.t === 'start') c.side = m.side;
    if (m.seq !== undefined) c.seq = m.seq;
    const w = c.waiters.find(x => x.t === m.t);
    if (w) { c.waiters.splice(c.waiters.indexOf(w), 1); w.res(m); } else c.inbox.push(m);
  });
  ws.on('open', () => c.send({ t: 'hello', token, name: extra.name || 'Тест', ...extra }));
  return c;
}

async function setup() {
  const a = client(), b = client();
  await a.wait('welcome'); await b.wait('welcome');
  a.send({ t: 'create', deck: PRESETS.aggro.deck, chaos: true, clock: '7+5' });
  const room = await a.wait('room');
  assert.match(room.link, /\?room=[A-Z0-9]{5}$/);
  b.send({ t: 'join', code: room.code, deck: PRESETS.chaos.deck });
  const sa = await a.wait('start'), sb = await b.wait('start');
  assert.notEqual(sa.side, sb.side);
  a.send({ t: 'mull', uids: [sa.state.hand[sa.side][0].uid] }); b.send({ t: 'mull', uids: [] });
  await a.wait('state'); await b.wait('state');
  const W = sa.side === 'w' ? a : b, B = W === a ? b : a;
  return { a, b, W, B, gid: sa.gid };
}

async function play(c, other) {
  const acts = legalActions(c.st).filter(x => x.k === 'm');
  c.send({ t: 'act', a: acts[0], seq: c.seq });
  await c.wait('state'); await other.wait('state');
}

test('initData: подпись Telegram проверяется', () => {
  const data = signInitData({ user: JSON.stringify({ id: 42, first_name: 'Аня' }), auth_date: String(Math.floor(Date.now() / 1000)), start_param: 'room_ABCDE' }, BOT);
  assert.deepEqual(checkInitData(data, BOT), { id: 42, name: 'Аня', startParam: 'room_ABCDE' });
  assert.equal(checkInitData(data.replace('42', '43'), BOT), null, 'подделка не проходит');
  assert.equal(checkInitData(data, 'другой:токен'), null);
  const old = signInitData({ user: JSON.stringify({ id: 1 }), auth_date: '1000' }, BOT);
  assert.equal(checkInitData(old, BOT), null, 'старые данные не принимаются');
});

test('партия по ссылке, обрыв связи и переподключение', async () => {
  const { W, B } = await setup();
  await play(W, B);
  W.ws.close();
  const st = await B.wait('oppStatus');
  assert.equal(st.online, false);
  const W2 = client(W.token);
  const wel = await W2.wait('welcome');
  assert.ok(wel.active, 'сервер помнит активную партию');
  W2.send({ t: 'resume' });
  const s = await W2.wait('start');
  assert.equal(s.phase, 'play');
  assert.equal((await B.wait('oppStatus')).online, true);
  await play(B, W2);
  await play(W2, B);
  W2.send({ t: 'emote', id: 'gg' });
  assert.equal((await B.wait('emote')).id, 'gg');
  W2.send({ t: 'drawOffer' });
  await B.wait('drawOffer');
  B.send({ t: 'drawAnswer', yes: true });
  const over = await W2.wait('over');
  assert.equal(over.result.reason, 'agreed');
  W2.ws.close(); B.ws.close();
});

test('недопустимое действие отклоняется, сдача, повтор партии совпадает', async () => {
  const { W, B, gid } = await setup();
  W.send({ t: 'act', a: { k: 'm', from: 0, to: 63 }, seq: W.seq });
  assert.equal((await W.wait('error')).msg, 'Недопустимое действие');
  await W.wait('start');
  for (let i = 0; i < 6; i++) { if (i % 2) await play(B, W); else await play(W, B); }
  B.send({ t: 'resign' });
  const over = await W.wait('over');
  assert.equal(over.result.winner, W.side);
  const r = await (await fetch(`http://127.0.0.1:${PORT}/api/game/${gid}`)).json();
  let st = createGame({ seed: r.seed, decks: r.decks, chaos: r.chaos, fog: true });
  for (const s of 'wb') if (r.mulls[s].length) st = mulligan(st, s, r.mulls[s]);
  st = start(st).state;
  for (const a of r.actions) st = settle(apply(st, a).state);
  assert.deepEqual(st.board.map(p => p && p.t + p.s), W.st.board.map(p => p && p.t + p.s), 'повтор воспроизводит позицию');
  const h = await (await fetch(`http://127.0.0.1:${PORT}/api/history`, { method: 'POST', body: JSON.stringify({ token: W.token }) })).json();
  assert.equal(h.games[0].id, gid);
  W.ws.close(); B.ws.close();
});

test('быстрая игра: двое в очереди находят друг друга', async () => {
  const a = client(), b = client();
  await a.wait('welcome'); await b.wait('welcome');
  a.send({ t: 'quick', deck: PRESETS.core.deck });
  await a.wait('queued');
  b.send({ t: 'quick', deck: PRESETS.core.deck });
  const [sa, sb] = [await a.wait('start'), await b.wait('start')];
  assert.notEqual(sa.side, sb.side);
  a.send({ t: 'resign' });
  await b.wait('over');
  a.ws.close(); b.ws.close();
});

test('вход через Telegram: проверенный пользователь', async () => {
  const initData = signInitData({ user: JSON.stringify({ id: 777, first_name: 'Тг' }), auth_date: String(Math.floor(Date.now() / 1000)) }, BOT);
  const c = client(undefined, { initData });
  const w = await c.wait('welcome');
  assert.equal(w.verified, true); assert.equal(w.me.name, 'Тг');
  c.ws.close();
});

test('быстрая игра рейтинговая: рейтинг меняется, есть таблица лидеров', async () => {
  const a = client(), b = client();
  await a.wait('welcome'); await b.wait('welcome');
  a.send({ t: 'quick', deck: PRESETS.core.deck }); b.send({ t: 'quick', deck: PRESETS.core.deck });
  const sa = await a.wait('start'); await b.wait('start');
  a.send({ t: 'mull', uids: [] }); b.send({ t: 'mull', uids: [] });
  await a.wait('state'); await b.wait('state');
  const W = sa.side === 'w' ? a : b, B = W === a ? b : a;
  await play(W, B); await play(B, W);
  B.send({ t: 'resign' });
  const ow = await W.wait('over'), ob = await B.wait('over');
  assert.ok(ow.rating.delta > 0 && ob.rating.delta < 0, JSON.stringify([ow.rating, ob.rating]));
  assert.equal(ow.rating.rating, 1000 + ow.rating.delta);
  const lb = await (await fetch(`http://127.0.0.1:${PORT}/api/leaderboard`, { method: 'POST', body: JSON.stringify({ token: W.token }) })).json();
  assert.equal(lb.top[0].rating, ow.rating.rating); assert.equal(lb.me.rank, 1); assert.equal(lb.leagues.length, 6);
  a.ws.close(); b.ws.close();
});

test('зритель видит партию без рук обоих игроков', async () => {
  const { W, B, gid } = await setup();
  const v = client(); await v.wait('welcome');
  v.send({ t: 'watch', gid });
  const s = await v.wait('start');
  assert.equal(s.side, 'watch');
  assert.ok(s.state.hand.w.concat(s.state.hand.b).every(c => c.id === '?'));
  assert.equal((await W.wait('watchers')).n, 1);
  await play(W, B);
  const st = await v.wait('state');
  assert.ok(st.state.hand.w.concat(st.state.hand.b).every(c => c.id === '?'));
  assert.ok((st.events || []).every(e => e.t !== 'draw' || e.card.id === '?'));
  B.send({ t: 'resign' }); await v.wait('over');
  W.ws.close(); B.ws.close(); v.ws.close();
});

test('админка: без токена 403, с токеном сводка; бан закрывает онлайн', async () => {
  const no = await fetch(`http://127.0.0.1:${PORT}/api/admin/stats`);
  assert.equal(no.status, 403);
  const r = await (await fetch(`http://127.0.0.1:${PORT}/api/admin/stats`, { headers: { 'x-admin-token': 'adm_test_123' } })).json();
  assert.ok(r.players >= 2 && r.games >= 1 && Array.isArray(r.list));
  const c = client(); const w = await c.wait('welcome'); c.ws.close();
  const id = r.list.find(p => p.name === 'Тест').id;
  await fetch(`http://127.0.0.1:${PORT}/api/admin/ban`, { method: 'POST', headers: { 'x-admin-token': 'adm_test_123' }, body: JSON.stringify({ id, banned: true }) });
  const r2 = await (await fetch(`http://127.0.0.1:${PORT}/api/admin/stats`, { headers: { 'x-admin-token': 'adm_test_123' } })).json();
  assert.equal(r2.list.find(p => p.id === id).banned, 1);
  assert.ok(w.ladder && w.ladder.season >= 1);
});
