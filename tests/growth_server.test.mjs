// Сквозная проверка сервера с поддельным Telegram Bot API (TG_API_BASE): оплата Stars и «Меценат», приглашение друга,
// видимость скина/титула/значка у соперника, турнир в группе от /tournament до чемпиона, карточка для shareMessage.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import WebSocket from '../server/node_modules/ws/index.js';
import { signInitData } from '../server/auth.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 30000 + Math.floor(Math.random() * 9000), TGPORT = PORT + 10000;
const BOT = '424242:GROWTH_TEST';
const URL_ = `http://127.0.0.1:${PORT}`;
let srv, tgsrv;
const calls = [], updates = [];
let uid = 1, msgId = 100;

test.before(async () => {
  tgsrv = http.createServer((req, res) => {
    let d = ''; req.on('data', x => { d += x; });
    req.on('end', () => {
      const method = req.url.split('/').pop(), body = d ? JSON.parse(d) : {};
      const ok = result => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, result })); };
      if (method === 'getUpdates') {
        const send = () => ok(updates.splice(0).map(u => ({ update_id: uid++, ...u })));
        return updates.length ? send() : setTimeout(send, 150);
      }
      calls.push([method, body]);
      if (method === 'getMe') return ok({ id: 42, username: 'cc_test_bot', has_main_web_app: false });
      if (method === 'sendMessage') return ok({ message_id: ++msgId });
      if (method === 'savePreparedInlineMessage') return ok({ id: 'prep_1', expiration_date: 0 });
      return ok(true);
    });
  });
  await new Promise(r => tgsrv.listen(TGPORT, '127.0.0.1', r));
  srv = spawn(process.execPath, ['--no-warnings', 'server/server.mjs'], { cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DB_PATH: path.join(os.tmpdir(), `cc_growth_${PORT}.db`), BOT_TOKEN: BOT, TG_API_BASE: `http://127.0.0.1:${TGPORT}`, PUBLIC_URL: URL_, ADMIN_TOKEN: 'adm_growth' } });
  await new Promise((res, rej) => { srv.stdout.on('data', d => { if (String(d).includes('сервер')) res(); }); srv.on('exit', rej); });
  await until(() => calls.some(c => c[0] === 'getMe'), 'бот не запросил getMe');
});
test.after(() => { srv.kill(); tgsrv.close(); });

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, msg, ms = 6000) { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(50); } throw new Error(msg); }
const initData = (id, name, startParam) => signInitData({ user: JSON.stringify({ id, first_name: name }), auth_date: String(Math.floor(Date.now() / 1000)), ...(startParam ? { start_param: startParam } : {}) }, BOT);
const post = async (p, b) => (await fetch(URL_ + p, { method: 'POST', body: JSON.stringify(b) })).json();

function client(tgId, name, extra = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  const c = { ws, inbox: [], waiters: [] };
  c.send = m => ws.send(JSON.stringify(m));
  c.wait = (t, ms = 6000) => {
    const i = c.inbox.findIndex(m => m.t === t);
    if (i >= 0) return Promise.resolve(c.inbox.splice(i, 1)[0]);
    return new Promise((res, rej) => { c.waiters.push({ t, res }); setTimeout(() => rej(new Error(`${name}: нет ${t}`)), ms); });
  };
  ws.on('message', raw => {
    const m = JSON.parse(String(raw)), w = c.waiters.find(x => x.t === m.t);
    if (w) { c.waiters.splice(c.waiters.indexOf(w), 1); w.res(m); } else c.inbox.push(m);
  });
  ws.on('open', () => c.send({ t: 'hello', token: crypto.randomBytes(16).toString('hex'), initData: initData(tgId, name, extra.startParam), name, ...extra }));
  return c;
}

test('оплата доната через бота: pre_checkout, выдача, ступень «Меценат», сообщение покупателю; значок и скин видит соперник', async () => {
  const A = client(7001, 'Даритель', { look: { skin: 'amethyst', title: 'Меценат' } });
  const wA = await A.wait('welcome');
  assert.equal(wA.me.skin, undefined, 'некупленный скин сопернику не показывается');
  // два доната по 50 и 150 — повторяемые покупки
  const inv = await post('/api/shop/invoice', { initData: initData(7001, 'Даритель'), product: 'donate50' });
  assert.equal(calls.at(-1)[0], 'createInvoiceLink'); assert.equal(calls.at(-1)[1].currency, 'XTR'); assert.ok(inv.link !== undefined);
  const payload = calls.at(-1)[1].payload;
  updates.push({ pre_checkout_query: { id: 'pq1', from: { id: 7001 }, currency: 'XTR', total_amount: 50, invoice_payload: payload } });
  await until(() => calls.find(c => c[0] === 'answerPreCheckoutQuery' && c[1].pre_checkout_query_id === 'pq1'), 'нет ответа pre_checkout');
  assert.equal(calls.find(c => c[1].pre_checkout_query_id === 'pq1')[1].ok, true);
  updates.push({ message: { chat: { id: 7001, type: 'private' }, from: { id: 7001 }, successful_payment: { currency: 'XTR', total_amount: 50, invoice_payload: payload, telegram_payment_charge_id: 'don_1' } } });
  const own = await A.wait('owned');
  assert.equal(own.owned.patron, 1); assert.ok(own.owned.titles.includes('Меценат'));
  const thanks = await until(() => calls.find(c => c[0] === 'sendMessage' && c[1].chat_id === 7001 && /Спасибо/.test(c[1].text)), 'нет спасибо');
  assert.match(thanks[1].text, /Меценат/, 'сообщение о новой ступени');
  // повтор доната тем же товаром разрешён
  updates.push({ pre_checkout_query: { id: 'pq2', from: { id: 7001 }, currency: 'XTR', total_amount: 50, invoice_payload: payload } });
  await until(() => calls.find(c => c[1].pre_checkout_query_id === 'pq2'), 'нет pq2');
  assert.equal(calls.find(c => c[1].pre_checkout_query_id === 'pq2')[1].ok, true, 'донат можно повторить');
  // покупка скина: теперь он виден сопернику
  await post('/api/shop/invoice', { initData: initData(7001, 'Даритель'), product: 'skin_amethyst' });
  const p2 = calls.at(-1)[1].payload;
  updates.push({ message: { chat: { id: 7001, type: 'private' }, from: { id: 7001 }, successful_payment: { currency: 'XTR', total_amount: 75, invoice_payload: p2, telegram_payment_charge_id: 'skin_1' } } });
  await A.wait('owned');
  A.send({ t: 'look', look: { skin: 'amethyst', title: 'Меценат' } });
  A.send({ t: 'create', chaos: false, clock: '7+5' });
  const room = await A.wait('room');
  const B = client(7002, 'Соперник', { look: { skin: 'gold' } }); await B.wait('welcome');
  B.send({ t: 'join', code: room.code });
  const sb = await B.wait('start'), sa = await A.wait('start');
  assert.equal(sb.opp.skin, 'amethyst'); assert.equal(sb.opp.title, 'Меценат'); assert.equal(sb.opp.badge, '★');
  assert.equal(sa.opp.skin, undefined, 'скин «Золото» не заработан — не показываем');
  B.send({ t: 'resign' }); await B.wait('over'); await A.wait('over');
  A.ws.close(); B.ws.close();
});

test('приглашение: друг пришёл по ссылке, сыграл партию — награды обоим и сообщение пригласившему; себя пригласить нельзя', async () => {
  const A = client(8001, 'Зовущий'); const wA = await A.wait('welcome');
  const prof = await post('/api/profile', { initData: initData(8001, 'Зовущий') });
  assert.equal(prof.pid, wA.pid); assert.equal(prof.refLink, `https://t.me/cc_test_bot?start=ref_${wA.pid}`, 'без Mini App — ссылка на бота с /start');
  // сам себя
  const self = client(8001, 'Зовущий', { startParam: `ref_${wA.pid}` }); await self.wait('welcome'); self.ws.close();
  // новичок из бота: /start ref_… — потом открывает игру
  updates.push({ message: { chat: { id: 8002, type: 'private' }, from: { id: 8002, first_name: 'Друг' }, text: `/start ref_${wA.pid}` } });
  const reply = await until(() => calls.find(c => c[0] === 'sendMessage' && c[1].chat_id === 8002), 'бот не ответил на /start');
  assert.equal(reply[1].reply_markup.inline_keyboard[0][0].web_app.url, `${URL_}/?ref=${wA.pid}`);
  const B = client(8002, 'Друг', { startParam: `ref_${wA.pid}` }); await B.wait('welcome');
  // партия с ботом в клиенте засчитывается событием game_end
  B.send({ t: 'event', name: 'game_end', data: { mode: 'bot', plies: 30 } });
  const oa = await A.wait('owned'), ob = await B.wait('owned');
  assert.equal(oa.why, 'ref'); assert.equal(oa.owned.friends, 1); assert.ok(oa.owned.titles.includes('Вербовщик')); assert.ok(oa.owned.boards.includes('banner'));
  assert.equal(ob.why, 'ref_new'); assert.ok(ob.owned.boards.includes('banner'));
  await until(() => calls.find(c => c[0] === 'sendMessage' && c[1].chat_id === 8001 && /первую партию/.test(c[1].text)), 'пригласивший не получил сообщение');
  // повторная партия и повторный вход не добавляют друзей
  B.send({ t: 'event', name: 'game_end', data: { plies: 30 } });
  const C = client(8002, 'Друг', { startParam: `ref_${wA.pid}` }); await C.wait('welcome');
  await sleep(300);
  assert.equal((await post('/api/profile', { initData: initData(8001, 'Зовущий') })).friends, 1);
  // ссылка на комнату тоже приглашение: новичок играет с хостом по ссылке
  A.send({ t: 'create', clock: '7+5' }); const room = await A.wait('room');
  const D = client(8003, 'Гость'); await D.wait('welcome');
  D.send({ t: 'join', code: room.code }); await D.wait('start'); await A.wait('start');
  D.send({ t: 'resign' }); await D.wait('over');
  await sleep(200);
  assert.equal((await post('/api/profile', { initData: initData(8001, 'Зовущий') })).friends, 1, 'партия короче 4 полуходов не считается');
  for (const x of [A, B, C, D]) x.ws.close();
});

test('карточка результата для shareMessage: картинка сохраняется и отдаётся, сообщение готовится с кнопкой игры', async () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const C = client(8101, 'Хвастун'); const w = await C.wait('welcome'); C.ws.close();
  const r = await post('/api/share', { initData: initData(8101, 'Хвастун'), png, caption: 'Победа!', param: '' });
  assert.equal(r.id, 'prep_1');
  const prep = calls.filter(c => c[0] === 'savePreparedInlineMessage').at(-1)[1];
  assert.equal(prep.user_id, 8101); assert.equal(prep.result.type, 'photo');
  assert.equal(prep.result.reply_markup.inline_keyboard[0][0].url, `https://t.me/cc_test_bot?start=ref_${w.pid}`);
  const img = await fetch(prep.result.photo_url.replace(URL_, URL_));
  assert.equal(img.status, 200); assert.equal(img.headers.get('content-type'), 'image/png');
  assert.equal((await post('/api/share', { png, caption: 'x' })).error, 'Только из Telegram');
  assert.equal((await post('/api/share', { initData: initData(8101, 'Хвастун'), png: 'data:image/png;base64,AAAA' })).error, 'Нет картинки');
});

test('турнир в группе: /tournament 4, регистрация кнопками, партии по ссылкам, сетка и чемпион с титулом', async () => {
  const chat = -100777;
  updates.push({ message: { chat: { id: chat, type: 'supergroup', title: 'Клуб' }, from: { id: 9001, first_name: 'Орг' }, text: '/tournament 4' } });
  const reg = await until(() => calls.find(c => c[0] === 'sendMessage' && c[1].chat_id === chat && /Турнир Chaos Chess на 4/.test(c[1].text)), 'нет поста регистрации');
  const cb = reg[1].reply_markup.inline_keyboard[0][0].callback_data;
  const players = [9001, 9002, 9003, 9004];
  players.forEach((id, i) => updates.push({ callback_query: { id: 'q' + i, data: cb, from: { id, first_name: 'Игрок' + id }, message: { chat: { id: chat }, message_id: reg[1].message_id } } }));
  const br = await until(() => calls.find(c => c[0] === 'sendMessage' && c[1].chat_id === chat && /Полуфинал/.test(c[1].text) && c[1].reply_markup), 'нет сетки');
  assert.ok(calls.filter(c => c[0] === 'answerCallbackQuery').length >= 4);
  const C = {}; for (const id of players) { C[id] = client(id, 'Игрок' + id); await C[id].wait('welcome'); }
  const stranger = client(9999, 'Чужой'); await stranger.wait('welcome');
  const codeOf = btn => /room_([A-Z0-9]{5})$/.exec(btn.url)[1];
  // сыграть пару: оба заходят по ссылке, белые сдаются — проходят чёрные
  async function play(btn) {
    const code = codeOf(btn), [na, nb] = btn.text.replace('⚔ ', '').split(' — '), a = Number(na.replace('Игрок', '')), b = Number(nb.replace('Игрок', ''));
    stranger.send({ t: 'join', code }); assert.match((await stranger.wait('error')).msg, /других игроков/);
    C[a].send({ t: 'join', code }); assert.equal((await C[a].wait('tmatchWait')).opp, 'Игрок' + b);
    C[b].send({ t: 'join', code });
    const sa = await C[a].wait('start'), sb = await C[b].wait('start');
    assert.equal(sa.clockName, '3+2');
    const W = sa.side === 'w' ? a : b, Bk = W === a ? b : a;
    C[W].send({ t: 'resign' }); await C[a].wait('over'); await C[b].wait('over');
    return Bk;
  }
  const [b1, b2] = br[1].reply_markup.inline_keyboard.map(r => r[0]);
  const w1 = await play(b1), w2 = await play(b2);
  const fin = await until(() => calls.find(c => c[0] === 'sendMessage' && c[1].chat_id === chat && /Финал!/.test(c[1].text)), 'нет финала');
  const champ = await play(fin[1].reply_markup.inline_keyboard[0][0]);
  assert.ok([w1, w2].includes(champ));
  const win = await until(() => calls.find(c => c[0] === 'sendMessage' && c[1].chat_id === chat && /👑/.test(c[1].text)), 'нет объявления победителя');
  assert.match(win[1].text, new RegExp('Игрок' + champ));
  const o = await C[champ].wait('owned');
  assert.ok(o.owned.titles.includes('Чемпион турнира'));
  for (const x of [...Object.values(C), stranger]) x.ws.close();
});

test('владелец получает всё бесплатно: пропуск, все ступени «Меценат», награды за друзей, уровень сезона', async () => {
  const st = await (await fetch(URL_ + '/api/admin/stats', { headers: { 'x-admin-token': 'adm_growth' } })).json();
  assert.ok(st.bot.ownerCode); assert.ok('referrals' in st && Array.isArray(st.tournaments));
  updates.push({ message: { chat: { id: 6001, type: 'private' }, from: { id: 6001 }, text: `/owner ${st.bot.ownerCode}` } });
  await until(() => calls.find(c => c[0] === 'sendMessage' && c[1].chat_id === 6001 && /владелец/.test(c[1].text)), 'владелец не назначен');
  const O = client(6001, 'Владелец', { look: { skin: 'crimson', title: 'Великий меценат' } }); const w = await O.wait('welcome');
  assert.equal(w.owned.patron, 3); assert.ok(w.owned.passes.length === 1);
  assert.ok(w.owned.products.includes('supporter') && !w.owned.products.includes('donate50'), 'донаты не «покупаются» владельцем');
  assert.ok(w.owned.skins.includes('herald') && w.owned.boards.includes('banner') && w.owned.titles.includes('Полководец'));
  assert.equal(Object.values(w.meta.slv)[0], 10, 'уровень сезона — максимум');
  assert.equal(w.me.skin, 'crimson'); assert.equal(w.me.title, 'Великий меценат'); assert.equal(w.me.badge, '★★★');
  O.ws.close();
});
