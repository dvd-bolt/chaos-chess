// Chaos Chess — онлайн-сервер: статика клиента, WebSocket-партии, API истории и головоломок.
// Сервер — арбитр: клиент присылает только действие, сервер проверяет его движком и рассылает урезанное состояние.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createGame, start, apply, legalActions, settle, mulligan, sameAction } from '../web/src/engine/game.js';
import { deckErrors, START_DECK, CARD_IDS } from '../web/src/engine/cards.js';
import { SKINS, BOARDS } from '../web/src/engine/cosmetics.js';
import { openDb } from './db.mjs';
import { checkInitData } from './auth.mjs';
import { redactState, redactEvents, redactAction, redactSpectator } from './redact.mjs';
import { openLadder, leagueOf, LEAGUES } from './ladder.mjs';
import { openShop, catalog, productInfo, paidAllowed } from './shop.mjs';
import { createBot } from './tgbot.mjs';
import { openGrowth, tierReached } from './growth.mjs';
import { openTournaments } from './tournament.mjs';
import { passUnlocked, PATRON, REF_TIERS, REF_INVITEE, seasonOf, SEASON_LEVELS, passTrack } from '../web/src/engine/rewards.js';
import { gameLink, parseStart } from '../web/src/engine/links.js';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, '../web');
const PORT = Number(process.env.PORT || 8099), HOST = process.env.HOST || '127.0.0.1';
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://${HOST}:${PORT}`).replace(/\/$/, '');
const TG_APP_LINK = (process.env.TG_APP_LINK || '').replace(/\/$/, '');
const ADSGRAM_BLOCK_ID = (process.env.ADSGRAM_BLOCK_ID || '').trim();
const DB = openDb(process.env.DB_PATH || path.resolve(HERE, '../data/chaos.db'));
const LADDER = openLadder(DB.db);
const SHOP = openShop(DB.db);
const GROWTH = openGrowth(DB.db);
const playerByTg = id => DB.db.prepare('SELECT * FROM players WHERE tg_id = ?').get(id);
// Настройки бота, которые выясняются на ходу: владелец (кому слать уведомления), канал для постов.
DB.db.exec('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)');
const kv = { get: k => DB.db.prepare('SELECT v FROM kv WHERE k = ?').get(k)?.v ?? null, set: (k, v) => DB.db.prepare('INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)').run(k, v == null ? null : String(v)) };
if (!kv.get('owner_code')) kv.set('owner_code', crypto.randomBytes(4).toString('hex'));
// Дело в напоминалку владельца (@tukmebot): то, что требует его действия. Без REMIND_TOKEN — тихо пропускаем.
const toRemind = task => { if (!process.env.REMIND_TOKEN) return;
  fetch(process.env.REMIND_URL || 'http://127.0.0.1:8098/add', { method: 'POST', headers: { 'content-type': 'application/json', 'x-token': process.env.REMIND_TOKEN },
    body: JSON.stringify({ project: 'chaos', ...task }), signal: AbortSignal.timeout(5000) }).catch(e => log('напоминалка:', e.message)); };
const notifyOwner = text => { const o = kv.get('owner_id'); if (BOT && o) BOT.send(o, text).catch(e => log('уведомление:', e.message)); };
// Владелец бота (kv owner_id, /owner в игровом боте) получает всё: карты, косметику, товары магазина.
const isOwner = p => !!(p && p.tg_id && String(p.tg_id) === kv.get('owner_id'));
// Всё, что выдаёт сервер: покупки, пропуска, «Меценат», награды за друзей и турниры.
function ownedFor(p) {
  const add = (o, k, x) => { if (!o[k].includes(x)) o[k].push(x); };
  let out;
  if (!isOwner(p)) out = SHOP.owned(p.id);
  else {
    out = { skins: [], boards: [], titles: [], products: [], passes: [seasonOf()], patron: PATRON.length };
    for (const [id, P] of Object.entries(catalog())) {
      if (P.repeat) continue;
      out.products.push(id);
      for (const k of ['skins', 'boards', 'titles']) for (const x of P.grant[k] || []) add(out, k, x);
    }
    for (const t of PATRON) add(out, 'titles', t.title);
    for (const t of [...REF_TIERS, REF_INVITEE]) { if (t.skin) add(out, 'skins', t.skin); if (t.board) add(out, 'boards', t.board); if (t.title) add(out, 'titles', t.title); }
  }
  const G = GROWTH.owned(p.id);
  for (const k of ['skins', 'boards', 'titles']) for (const x of G[k]) add(out, k, x);
  out.friends = GROWTH.friends(p.id);
  return out;
}
// Что игрок показывает сопернику: скин и титул из того, что у него действительно есть.
function lookFor(p, look) {
  if (!look || typeof look !== 'object') return {};
  const own = ownedFor(p), meta = LADDER.getMeta(p.id) || {}, paidA = paidAllowed(own), pass = passUnlocked(meta.slv, []);
  const ok = (k, x) => typeof x === 'string' && ((meta[k] || []).includes(x) || paidA[k].includes(x) || pass[k].includes(x) || (isOwner(p) && k !== 'titles'));
  const out = {};
  if (ok('skins', look.skin) || ['classic', 'night'].includes(look.skin)) out.skin = look.skin;
  if (ok('titles', look.title) || (isOwner(p) && own.titles.includes(look.title))) out.title = String(look.title).slice(0, 40);
  if (own.patron) out.badge = PATRON[own.patron - 1].badge;
  return out;
}
function ownerMeta(pid) {
  const m = LADDER.getMeta(pid) || {}, uniq = a => [...new Set(a)];
  Object.assign(m, { xp: Math.max(m.xp || 0, 50 * 30 * 29), unlocked: CARD_IDS.slice(), skins: Object.keys(SKINS), boards: Object.keys(BOARDS),
    titles: uniq([...(m.titles || []), 'Покоритель башни']), veteran: true, storm2: true, slv: { ...(m.slv || {}), [seasonOf()]: SEASON_LEVELS } });
  LADDER.putMeta(pid, m);
  return m;
}
// Сообщить игроку в открытую игру, что покупка пришла.
function pushOwned(pid, why = 'buy') { const p = DB.getPlayer(pid); if (!p) return; for (const [ws, c] of conns) if (c.player && c.player.id === pid) send(ws, { t: 'owned', owned: ownedFor(p), why }); }
const BOT = BOT_TOKEN ? createBot({ token: BOT_TOKEN, publicUrl: PUBLIC_URL, log: (...a) => log(...a), apiBase: process.env.TG_API_BASE || undefined, hooks: {
  // payload = «id игрока|товар»: проверяем игрока, цену, валюту и что товар ещё не куплен
  checkPayment(payload, tgId, amount, currency) {
    const [pid, product] = String(payload).split('|'), P = productInfo(product), p = DB.getPlayer(pid);
    if (!P || !p || currency !== 'XTR' || amount !== P.stars) return { ok: false, error: 'Товар недоступен' };
    if (p.tg_id && p.tg_id !== tgId) return { ok: false, error: 'Покупка оформлена на другой аккаунт' };
    if (!P.repeat && SHOP.products(pid).includes(product)) return { ok: false, error: 'Это уже куплено' };
    if (P.season && !catalog()[product]) return { ok: false, error: 'Этот сезон закончился' };
    return { ok: true };
  },
  paid({ payload, charge, tgId, stars }) {
    const [pid, product] = String(payload).split('|'), P = productInfo(product);
    if (!P || !DB.getPlayer(pid)) return { ok: false };
    const tierBefore = SHOP.owned(pid).patron;
    if (!SHOP.record(charge, pid, tgId, product, stars)) return { ok: true, title: P.title }; // повторная доставка того же платежа
    const tierAfter = SHOP.owned(pid).patron;
    LADDER.event(pid, 'purchase', { product, stars });
    notifyOwner(`⭐ Покупка: «${P.title}» за ${stars} Stars (игрок ${DB.getPlayer(pid)?.name || pid})`);
    log(`покупка: ${product} за ${stars}⭐`);
    pushOwned(pid);
    return { ok: true, title: P.title, patron: tierAfter > tierBefore ? PATRON[tierAfter - 1].title : null };
  },
  started(from, param) {
    const P = parseStart(param);
    LADDER.event(null, 'bot_start', { param: param || null, src: P.src || (P.ref ? 'ref' : P.room ? 'room' : null) });
    // новичок пришёл по приглашению: записываем, засчитаем после первой партии
    if (P.ref && !playerByTg(from.id)) GROWTH.register({ inviter: P.ref, tgId: from.id, src: 'bot', fresh: true });
  },
  appLink: param => appLink(param),
  tournament: (chat, size, from) => TOUR.create(chat.id, size, from),
  tournamentButton: (kind, id, from) => TOUR.button(kind, id, from),
  support(from, text) {
    LADDER.event(null, 'paysupport', { from: from.id });
    notifyOwner(`🆘 /paysupport от ${from.first_name || ''} (@${from.username || from.id}): ${text.slice(0, 300)}`);
    toRemind({ text: `Ответить игроку по оплате: ${from.first_name || from.username || from.id}`.slice(0, 80), source: 'chaos:paysupport',
      note: `Сообщение: ${text.slice(0, 500)}\nИгрок: ${from.username ? '@' + from.username : 'id ' + from.id}. Возврат — кнопкой в админке. Если непонятно, напиши Claude: \`Разберись с /paysupport\`` });
  },
  claimOwner(from, code) {
    if (!code || code !== kv.get('owner_code')) return false;
    kv.set('owner_id', from.id); kv.set('owner_code', crypto.randomBytes(4).toString('hex')); log(`владелец бота: ${from.id}`);
    return true;
  },
  membership(chat, status) {
    if (chat.type !== 'channel') return;
    if (status === 'administrator') { kv.set('channel_id', chat.id); kv.set('channel_title', chat.title || ''); log(`канал подключён: ${chat.title}`); notifyOwner(`📢 Канал «${chat.title}» подключён. Головоломка дня будет выходить там каждый день в 10:00 МСК. Первый пост — сейчас.`); setTimeout(() => postPuzzle(true), 3000); }
    else if (String(kv.get('channel_id')) === String(chat.id)) { kv.set('channel_id', null); notifyOwner(`📢 Бот больше не админ в канале «${chat.title}» — посты остановлены.`); }
  },
} }) : null;

// ---------- ежедневный пост «Головоломка дня» и сводка владельцу ----------
const PUZ_EPOCH = Date.UTC(2026, 10, 15);
// Ссылка на игру с параметром запуска: Mini App из настроек → главный Mini App бота → бот с /start → сайт.
const tgCfg = () => (TG_APP_LINK ? { base: TG_APP_LINK, key: 'startapp' } : BOT && BOT.me ? { base: `https://t.me/${BOT.me.username}`, key: BOT.me.has_main_web_app ? 'startapp' : 'start' } : null);
const appLink = param => gameLink(param, tgCfg(), PUBLIC_URL);
const dayNow = () => Math.floor((Date.now() - PUZ_EPOCH) / 86400000);
async function postPuzzle(force = false) {
  const ch = kv.get('channel_id'), day = dayNow();
  if (!BOT || !ch || (!force && kv.get('posted_day') === String(day))) return;
  try {
    const list = JSON.parse(fs.readFileSync(path.join(WEB, 'puzzles.json'), 'utf8')).puzzles, P = list[((day % list.length) + list.length) % list.length];
    const out = path.join(path.dirname(path.resolve(process.env.DB_PATH || path.resolve(HERE, '../data/chaos.db'))), 'puzzle_post.png');
    execFileSync('python3', ['-I', path.resolve(HERE, '../tools/render_puzzle.py'), out], { input: JSON.stringify(P), timeout: 30000 });
    const png = fs.readFileSync(out);
    const NM = { shield: 'Щит', wall: 'Стена', ritual: 'Ритуал', blink: 'Рывок', hook: 'Крюк', stasis: 'Стазис', mark: 'Метка', meteor: 'Метеор', lightning: 'Молния', shackles: 'Оковы', insight: 'Озарение', march: 'Марш', swap: 'Подмена', ghost: 'Призрачный шаг', trap: 'Капкан', shockwave: 'Ударная волна', promote: 'Повышение', portal: 'Портал', rebirth: 'Возрождение', polymorph: 'Порча', quake: 'Землетрясение', mirror: 'Зеркало', ward: 'Оберег', bastion: 'Бастион', tide: 'Прилив', leap: 'Скачок', mentor: 'Наставник', frost: 'Иней', comet: 'Комета', harpoon: 'Гарпун', foresight: 'Предвидение', storm: 'Гроза', forge: 'Кузница', phoenix: 'Феникс' };
    const caption = `🧩 <b>Головоломка дня №${day + 1}</b>\nМат за один ход: можно сыграть быструю карту и сходить.\nИграешь ${P.turn === 'w' ? 'белыми' : 'чёрными'}, маны: ${P.mana}. Карты: ${P.hand.map(id => NM[id] || id).join(', ')}.\nУ соперника карт нет. Сможешь?`;
    const link = appLink(`pz_${day}_c`); // прямо на эту головоломку, с меткой канала
    await BOT.sendPhoto(ch, png, caption, { inline_keyboard: [[{ text: '🧩 Решить в игре', url: link }]] });
    kv.set('posted_day', day); log(`пост головоломки дня №${day + 1} опубликован`);
  } catch (e) { log('пост головоломки:', e.message); notifyOwner('Не удалось опубликовать головоломку дня: ' + e.message); toRemind({ text: 'Не вышла головоломка дня в канале', note: `Ошибка: ${e.message.slice(0, 300)}\nНапиши Claude: \`Почини пост головоломки\``, source: 'chaos:puzzlepost' }); }
}
function dailySummary() {
  const st = LADDER.stats(), sh = SHOP.total();
  notifyOwner(`📊 Сводка Chaos Chess\nИгроков: ${st.players} (за сутки ${st.dau}, за неделю ${st.wau})\nУдержание D1: ${st.d1 ?? '—'}%, D7: ${st.d7 ?? '—'}%\nОнлайн-партий сегодня: ${st.gamesToday || 0}\nПокупок: ${sh.n} на ${sh.s} ⭐`);
}
// раз в минуту: в 07:00 UTC (10:00 МСК) — пост и сводка
setInterval(() => {
  const d = new Date();
  if (d.getUTCHours() === 7 && d.getUTCMinutes() < 2) {
    if (kv.get('posted_day') !== String(dayNow())) postPuzzle();
    if (kv.get('summary_day') !== String(dayNow())) { kv.set('summary_day', dayNow()); dailySummary(); }
  }
}, 60000);
if (BOT && process.env.BOT_POLL !== '0') BOT.start();
else if (BOT && process.env.TG_API_BASE) BOT.setup().catch(e => log('бот:', e.message)); // тесты: getMe без опроса

// ---------- турниры в группах ----------
const TOUR = openTournaments(DB.db, {
  post: (chat, html, kb) => (BOT ? BOT.send(chat, html, { parse_mode: 'HTML', ...(kb.length ? { reply_markup: { inline_keyboard: kb } } : {}) }).then(m => m.message_id) : Promise.resolve(null)),
  edit: (chat, msg, html, kb) => (BOT && msg ? BOT.api('editMessageText', { chat_id: chat, message_id: msg, text: html, parse_mode: 'HTML', reply_markup: { inline_keyboard: kb } }) : Promise.resolve()),
  code: () => { let c; do c = code5(); while (rooms.has(c)); return c; },
  link: code => appLink(`room_${code}`),
  award(tg, name, title) {
    const p = playerByTg(tg) || DB.player({ tg: { id: tg, name } });
    GROWTH.award(p.id, title); pushOwned(p.id); LADDER.event(p.id, 'tourney_win', {});
    log(`турнир: победитель ${name}`);
  },
  log: (...a) => log(...a),
});
const tWait = new Map(); // код турнирного матча -> первый пришедший { player, ws, deck }
setInterval(() => TOUR.tick().catch(e => log('турнир:', e.message)), 30000);

// Новичок сыграл первую партию: награды обоим, пригласившему — сообщение в Telegram.
function refPlayed(pid) {
  const r = GROWTH.played(pid);
  if (!r) return;
  const me = DB.getPlayer(pid), inv = DB.getPlayer(r.inviter);
  LADDER.event(pid, 'ref_done', { inviter: r.inviter, n: r.n });
  log(`приглашение засчитано: ${inv?.name} → ${me?.name} (друзей: ${r.n})`);
  pushOwned(pid, 'ref_new'); pushOwned(r.inviter, 'ref');
  const T = tierReached(r.n);
  if (BOT && inv?.tg_id) BOT.send(inv.tg_id, `🎉 ${me?.name || 'Друг'} сыграл первую партию по твоему приглашению. Друзей в игре: ${r.n}.` +
    (T ? `\nНовая награда: ${[T.title && `титул «${T.title}»`, T.board && 'доска «Знамя»', T.skin && 'скин «Глашатай»'].filter(Boolean).join(', ')}.` : '')).catch(() => {});
}
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const SHARE_DIR = path.join(path.dirname(path.resolve(process.env.DB_PATH || path.resolve(HERE, '../data/chaos.db'))), 'share');
setInterval(() => { // картинки для пересылки живут неделю
  try { for (const f of fs.readdirSync(SHARE_DIR)) { const F = path.join(SHARE_DIR, f); if (Date.now() - fs.statSync(F).mtimeMs > 7 * 86400000) fs.unlinkSync(F); } } catch { /* папки ещё нет */ }
}, 3600000);
const RECONNECT_MS = 60000, MULL_MS = 45000, QUICK_WAIT_MS = 20000, ROOM_TTL = 30 * 60000;
const CLOCKS = { '3+2': [180000, 2000], '7+5': [420000, 5000], '15+10': [900000, 10000] };
const EMOTES = ['like', 'hmm', 'haha', 'gg', 'wow', 'angry', 'heart', 'oops'];
const log = (...a) => console.log(new Date().toISOString(), ...a);

const closed = DB.abandonUnfinished();
if (closed) log(`закрыто незавершённых партий после перезапуска: ${closed}`);

// ---------- состояние сервера ----------
const conns = new Map();   // ws -> { player, gid }
const rooms = new Map();   // code -> { host, deck, chaos, clock, created }
const games = new Map();   // gid -> game
const byPlayer = new Map(); // pid -> gid активной партии
let queue = [];             // очередь быстрой игры: { player, ws, deck, since, rating }

const send = (ws, msg) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); };
const code5 = () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (const b of crypto.randomBytes(5)) s += A[b % A.length]; return s; };
// Ссылка-приглашение: Mini App из настроек, иначе главный Mini App бота, иначе сайт.
const tgBase = () => tgCfg()?.base || '';
// startapp открывает игру сразу, если у бота включён главный Mini App; иначе start — бот пришлёт кнопку входа в комнату.
const inviteLink = code => appLink(`room_${code}`);
const cleanDeck = d => (Array.isArray(d) && !deckErrors(d).length ? d.slice() : START_DECK.slice());
const pub = p => ({ name: p.name, avatar: p.avatar, games: p.games, wins: p.wins, rating: p.rating ?? 1000, league: leagueOf(p.rating ?? 1000), ...(p.look || {}) });
const withLook = (P, c) => ({ ...P, look: c.look || {} });

// ---------- партии ----------
function createOnlineGame(wSide, bSide, opts) {
  const seed = crypto.randomBytes(4).readUInt32LE();
  const decks = { w: wSide.deck, b: bSide.deck };
  const clk = CLOCKS[opts.clock] ? opts.clock : '7+5';
  const g = {
    id: 0, code: opts.code || null, seed, decks, chaos: !!opts.chaos, clockName: clk,
    st: createGame({ seed, decks, chaos: !!opts.chaos, fog: true }), rated: !!opts.rated, watchers: new Set(),
    p: { w: { ...wSide.player, ws: wSide.ws, off: 0 }, b: { ...bSide.player, ws: bSide.ws, off: 0 } },
    mulls: { w: null, b: null }, actions: [], phase: 'mull', seq: 0,
    clock: { w: CLOCKS[clk][0], b: CLOCKS[clk][0], inc: CLOCKS[clk][1], since: 0 },
    drawOffer: null, created: Date.now(), mullUntil: Date.now() + MULL_MS, lastEmote: { w: 0, b: 0 },
  };
  g.id = DB.newGame({ code: g.code, white: g.p.w.id, black: g.p.b.id, seed, decks, chaos: g.chaos, clock: clk });
  games.set(g.id, g);
  for (const s of 'wb') { byPlayer.set(g.p[s].id, g.id); const c = conns.get(g.p[s].ws); if (c) c.gid = g.id; }
  log(`партия ${g.id}: ${g.p.w.name} vs ${g.p.b.name}${g.chaos ? ' (хаос)' : ''} ${clk}`);
  for (const s of 'wb') sendStart(g, s);
  return g;
}

function clockView(g) {
  const c = { w: g.clock.w, b: g.clock.b, run: null };
  if (g.phase === 'play' && g.clock.since) { c.run = g.st.turn; c[g.st.turn] -= Date.now() - g.clock.since; }
  return c;
}

function sendStart(g, s) {
  const o = s === 'w' ? 'b' : 'w';
  send(g.p[s].ws, { t: 'start', gid: g.id, side: s, phase: g.phase, opp: pub(g.p[o]), me: pub(g.p[s]), chaos: g.chaos,
    clockName: g.clockName, clock: clockView(g), state: redactState(g.st, s), seq: g.seq, mullDone: !!g.mulls[s],
    oppOnline: !!g.p[o].ws, mullLeft: Math.max(0, g.mullUntil - Date.now()), log: g.actions.map(x => ({ side: x.side, a: redactAction(x.a, s, x.side) })) });
}

function broadcast(g, events, act, actor) {
  g.seq++;
  for (const w of g.watchers) send(w, { t: 'state', gid: g.id, seq: g.seq, state: redactSpectator(g.st), events: redactEvents(events, null),
    act: redactAction(act, null, actor), actor, clock: clockView(g) });
  for (const s of 'wb') {
    send(g.p[s].ws, { t: 'state', gid: g.id, seq: g.seq, state: redactState(g.st, s), events: redactEvents(events, s),
      act: redactAction(act, s, actor), actor, clock: clockView(g) });
  }
}

function finishMull(g) {
  for (const s of 'wb') if (g.mulls[s] === null) g.mulls[s] = [];
  let st = g.st;
  for (const s of 'wb') if (g.mulls[s].length) st = mulligan(st, s, g.mulls[s]);
  const r = start(st);
  g.st = r.state; g.phase = 'play'; g.clock.since = Date.now();
  DB.saveMulls(g.id, g.mulls);
  broadcast(g, r.events, null, null);
}

function endOnline(g, result) {
  if (g.phase === 'over') return;
  if (g.phase === 'play' && g.clock.since) { g.clock[g.st.turn] -= Date.now() - g.clock.since; g.clock.since = 0; }
  g.phase = 'over';
  g.st = { ...g.st, result };
  DB.endGame(g.id, result, g.actions.map(x => x.a), g.p.w.id, g.p.b.id);
  let rating = null;
  if (g.rated && result.reason !== 'server' && !(result.reason === 'resign' && g.actions.length < 2)) {
    try { rating = LADDER.rateGame(g.id, g.p.w.id, g.p.b.id, result.winner); } catch (e) { log('рейтинг', e.message); }
  }
  for (const s of 'wb') send(g.p[s].ws, { t: 'over', gid: g.id, result, clock: clockView(g), stats: g.st.stats, replay: g.id,
    rating: rating && { ...rating[s], league: leagueOf(rating[s].rating) } });
  for (const w of g.watchers) send(w, { t: 'over', gid: g.id, result, clock: clockView(g), stats: g.st.stats, replay: g.id });
  LADDER.event(null, 'game_end', { gid: g.id, reason: result.reason, plies: g.st.ply, rated: g.rated });
  if (result.reason !== 'server' && g.actions.length >= 4) for (const s of 'wb') refPlayed(g.p[s].id);
  if (g.tmatch) {
    const tg = s => g.p[s].tg_id;
    TOUR.result(g.tmatch, { winner: result.winner ? tg(result.winner) : null, black: tg('b'), reason: result.reason }).catch(e => log('турнир:', e.message));
  }
  for (const s of 'wb') if (byPlayer.get(g.p[s].id) === g.id) byPlayer.delete(g.p[s].id);
  log(`партия ${g.id} окончена: ${result.winner || 'ничья'} / ${result.reason}`);
  setTimeout(() => games.delete(g.id), 5 * 60000);
}

function onAct(g, s, msg) {
  if (g.phase !== 'play' || g.st.turn !== s) return send(g.p[s].ws, { t: 'error', msg: 'Сейчас не твой ход' });
  if (msg.seq !== undefined && msg.seq !== g.seq) return send(g.p[s].ws, { t: 'resync' }), sendStart(g, s);
  const legal = legalActions(g.st).find(a => sameAction(a, msg.a));
  if (!legal) { send(g.p[s].ws, { t: 'error', msg: 'Недопустимое действие' }); return sendStart(g, s); }
  const now = Date.now();
  const { state, events } = apply(g.st, legal);
  g.actions.push({ side: s, a: legal });
  g.st = settle(state);
  g.drawOffer = null;
  if (g.st.turn !== s) { g.clock[s] -= now - g.clock.since; g.clock[s] += g.clock.inc; g.clock.since = now; }
  broadcast(g, events, legal, s);
  if (g.actions.length % 6 === 0) DB.saveActs(g.id, g.actions.map(x => x.a));
  if (g.st.result) endOnline(g, g.st.result);
}

// Часы, отключения, мульлиган, очередь быстрой игры
setInterval(() => {
  const now = Date.now();
  for (const g of games.values()) {
    if (g.phase === 'mull' && now > g.mullUntil) finishMull(g);
    if (g.phase === 'play') {
      const s = g.st.turn;
      if (g.clock[s] - (now - g.clock.since) <= 0) endOnline(g, { winner: s === 'w' ? 'b' : 'w', reason: 'time' });
    }
    if (g.phase !== 'over') for (const s of 'wb') {
      if (g.p[s].off && now - g.p[s].off > RECONNECT_MS) { endOnline(g, { winner: s === 'w' ? 'b' : 'w', reason: 'abandon' }); break; }
    }
  }
  // подбор по рейтингу: окно расширяется на 15 очков в секунду ожидания
  queue = queue.filter(q => q.ws.readyState === 1);
  for (let i = 0; i < queue.length; i++) for (let j = i + 1; j < queue.length; j++) {
    const a = queue[i], b = queue[j];
    const win = 150 + 15 * Math.min(now - a.since, now - b.since) / 1000;
    if (a.player.id !== b.player.id && Math.abs(a.rating - b.rating) <= win) {
      queue = queue.filter(x => x !== a && x !== b);
      const aW = crypto.randomInt(2) === 0;
      createOnlineGame(aW ? a : b, aW ? b : a, { chaos: false, clock: '7+5', rated: true });
      i = queue.length; break;
    }
  }
  for (const q of queue.filter(q => now - q.since > QUICK_WAIT_MS)) send(q.ws, { t: 'quickTimeout' });
  queue = queue.filter(q => now - q.since <= QUICK_WAIT_MS);
  for (const [c, r] of rooms) if (now - r.created > ROOM_TTL) rooms.delete(c);
}, 500);

// ---------- сообщения ----------
function onMessage(ws, raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }
  if (!msg || typeof msg.t !== 'string') return;
  const c = conns.get(ws);
  if (msg.t === 'hello') {
    const tg = BOT_TOKEN ? checkInitData(msg.initData, BOT_TOKEN) : null;
    const token = typeof msg.token === 'string' && /^[a-f0-9]{32,64}$/.test(msg.token) ? msg.token : null;
    if (!tg && !token) return send(ws, { t: 'error', msg: 'Нет токена устройства' });
    let p = DB.player({ token, tg, name: msg.name, avatar: msg.avatar });
    if (p.banned) { send(ws, { t: 'error', msg: 'Доступ к онлайну закрыт' }); return ws.close(); }
    LADDER.ensureSeason(p.id); p = DB.getPlayer(p.id);
    if (tg) {
      GROWTH.attach(tg.id, p.id);
      const ref = parseStart(tg.startParam).ref || (typeof msg.ref === 'string' ? msg.ref : null);
      if (ref) GROWTH.register({ inviter: ref, tgId: tg.id, inviteePid: p.id, src: 'app', fresh: GROWTH.isNew(p) });
    }
    c.player = p; c.look = lookFor(p, msg.look);
    const gid = byPlayer.get(p.id);
    send(ws, { t: 'welcome', me: pub(withLook(p, c)), pid: p.id, decks: DB.decks(p.id), active: gid && games.get(gid)?.phase !== 'over' ? gid : null, verified: !!tg,
      ladder: LADDER.card(p.id), meta: isOwner(p) ? ownerMeta(p.id) : LADDER.getMeta(p.id), owned: ownedFor(p) });
    return;
  }
  if (!c.player) return send(ws, { t: 'error', msg: 'Сначала hello' });
  const P = c.player;
  const gid = byPlayer.get(P.id), g = gid && games.get(gid);
  const side = g ? (g.p.w.id === P.id ? 'w' : 'b') : null;
  switch (msg.t) {
    case 'resume': {
      if (!g || g.phase === 'over') return send(ws, { t: 'noGame' });
      const o = side === 'w' ? 'b' : 'w';
      g.p[side].ws = ws; g.p[side].off = 0; c.gid = g.id;
      sendStart(g, side);
      send(g.p[o].ws, { t: 'oppStatus', online: true });
      return;
    }
    case 'create': {
      if (g && g.phase !== 'over') return send(ws, { t: 'error', msg: 'У тебя идёт партия' });
      for (const [k, r] of rooms) if (r.host.player.id === P.id) rooms.delete(k);
      let code; do code = code5(); while (rooms.has(code));
      rooms.set(code, { host: { player: withLook(P, c), ws, deck: cleanDeck(msg.deck) }, chaos: !!msg.chaos, clock: msg.clock, created: Date.now() });
      return send(ws, { t: 'room', code, link: inviteLink(code), chaos: !!msg.chaos, clock: CLOCKS[msg.clock] ? msg.clock : '7+5' });
    }
    case 'cancelRoom':
      for (const [k, r] of rooms) if (r.host.player.id === P.id) rooms.delete(k);
      for (const [k, w] of tWait) if (w.player.id === P.id) tWait.delete(k);
      return;
    case 'join': {
      const code = String(msg.code || '').toUpperCase().replace(/^ROOM_/, '');
      if (TOUR.find(code)) return joinTournament(ws, c, P, g, code, msg);
      const r = rooms.get(code);
      if (!r) return send(ws, { t: 'error', msg: 'Комната не найдена или устарела' });
      if (r.host.player.id === P.id) return send(ws, { t: 'error', msg: 'Это твоя комната — отправь ссылку другу' });
      if (g && g.phase !== 'over') return send(ws, { t: 'error', msg: 'У тебя идёт партия' });
      rooms.delete(code);
      const guest = { player: withLook(P, c), ws, deck: cleanDeck(msg.deck) };
      // друг пришёл по ссылке на комнату — это тоже приглашение (засчитается после партии)
      if (P.tg_id && GROWTH.isNew(DB.getPlayer(P.id))) GROWTH.register({ inviter: r.host.player.id, tgId: P.tg_id, inviteePid: P.id, src: 'room', fresh: true });
      const hostW = crypto.randomInt(2) === 0;
      createOnlineGame(hostW ? r.host : guest, hostW ? guest : r.host, { chaos: r.chaos, clock: r.clock, code });
      return;
    }
    case 'quick': {
      if (g && g.phase !== 'over') return send(ws, { t: 'error', msg: 'У тебя идёт партия' });
      queue = queue.filter(q => q.player.id !== P.id);
      queue.push({ player: withLook(P, c), ws, deck: cleanDeck(msg.deck), since: Date.now(), rating: DB.getPlayer(P.id).rating ?? 1000 });
      send(ws, { t: 'queued', wait: QUICK_WAIT_MS });
      return;
    }
    case 'cancelQuick':
      queue = queue.filter(q => q.player.id !== P.id);
      return;
    case 'watch': {
      const wg = games.get(Number(msg.gid));
      if (!wg || wg.phase === 'over') return send(ws, { t: 'error', msg: 'Партия уже закончилась' });
      if (wg.p.w.id === P.id || wg.p.b.id === P.id) return send(ws, { t: 'error', msg: 'Это твоя партия' });
      wg.watchers.add(ws); c.watching = wg.id;
      send(ws, { t: 'start', gid: wg.id, side: 'watch', phase: wg.phase, players: { w: pub(wg.p.w), b: pub(wg.p.b) }, chaos: wg.chaos,
        clock: clockView(wg), state: redactSpectator(wg.st), seq: wg.seq, log: wg.actions.map(x => ({ side: x.side, a: redactAction(x.a, null, x.side) })) });
      for (const s of 'wb') send(wg.p[s].ws, { t: 'watchers', n: wg.watchers.size });
      return;
    }
    case 'unwatch': { const wg = games.get(c.watching); if (wg) wg.watchers.delete(ws); c.watching = null; return; }
    case 'saveMeta':
      if (msg.meta && typeof msg.meta === 'object') LADDER.putMeta(P.id, msg.meta);
      return;
    case 'event':
      if (typeof msg.name === 'string') LADDER.event(P.id, msg.name, msg.data);
      if (msg.name === 'game_end' && Number(msg.data?.plies) >= 4) refPlayed(P.id);
      return;
    case 'look':
      c.look = lookFor(DB.getPlayer(P.id), msg.look);
      return;
    case 'saveDecks':
      if (Array.isArray(msg.decks) && msg.decks.length <= 12) {
        const ok = msg.decks.filter(d => d && Array.isArray(d.cards) && !deckErrors(d.cards).length);
        DB.saveDecks(P.id, ok);
      }
      return;
  }
  if (!g || g.phase === 'over') return send(ws, { t: 'noGame' });
  const o = side === 'w' ? 'b' : 'w';
  switch (msg.t) {
    case 'mull':
      if (g.phase !== 'mull' || g.mulls[side]) return;
      g.mulls[side] = (Array.isArray(msg.uids) ? msg.uids : []).filter(u => g.st.hand[side].some(c => c.uid === u));
      if (g.mulls.w && g.mulls.b) finishMull(g); else send(ws, { t: 'mullWait' });
      return;
    case 'act': return onAct(g, side, msg);
    case 'resign': return endOnline(g, { winner: o, reason: 'resign' });
    case 'drawOffer':
      if (g.phase !== 'play') return;
      if (g.drawOffer === o) return endOnline(g, { winner: null, reason: 'agreed' });
      g.drawOffer = side; send(g.p[o].ws, { t: 'drawOffer' });
      return;
    case 'drawAnswer':
      if (g.drawOffer !== o) return;
      if (msg.yes) return endOnline(g, { winner: null, reason: 'agreed' });
      g.drawOffer = null; send(g.p[o].ws, { t: 'drawDeclined' });
      return;
    case 'emote':
      if (!EMOTES.includes(msg.id) || Date.now() - g.lastEmote[side] < 2500) return;
      g.lastEmote[side] = Date.now();
      send(g.p[o].ws, { t: 'emote', id: msg.id });
      return;
  }
}

// Турнирный матч: пускаем только двух игроков пары (по Telegram id); партия начинается, когда пришли оба.
function joinTournament(ws, c, P, g, code, msg) {
  if (g && g.phase !== 'over') return send(ws, { t: 'error', msg: 'У тебя идёт партия' });
  if (!P.tg_id) return send(ws, { t: 'error', msg: 'Турнирные партии — только из Telegram: открой ссылку из группы в Telegram' });
  const err = TOUR.arrive(code, P.tg_id);
  if (err) return send(ws, { t: 'error', msg: err });
  const me = { player: withLook(P, c), ws, deck: cleanDeck(msg.deck) }, w = tWait.get(code);
  if (w && w.player.id !== P.id && w.ws.readyState === 1) {
    tWait.delete(code);
    const meW = crypto.randomInt(2) === 0;
    const ng = createOnlineGame(meW ? me : w, meW ? w : me, { chaos: false, clock: '3+2', code });
    ng.tmatch = code; TOUR.started(code, ng.id);
    return;
  }
  tWait.set(code, me);
  const f = TOUR.find(code), oppTg = f.m.a === P.tg_id ? f.m.b : f.m.a;
  send(ws, { t: 'tmatchWait', code, opp: f.t.players.find(x => x.tg === oppTg)?.name || 'соперник' });
}

function onClose(ws) {
  const c = conns.get(ws);
  conns.delete(ws);
  if (!c || !c.player) return;
  queue = queue.filter(q => q.ws !== ws);
  for (const [k, w] of tWait) if (w.ws === ws) tWait.delete(k);
  if (c.watching) { const wg = games.get(c.watching); if (wg) { wg.watchers.delete(ws); for (const s of 'wb') send(wg.p[s].ws, { t: 'watchers', n: wg.watchers.size }); } }
  const g = games.get(byPlayer.get(c.player.id));
  if (!g || g.phase === 'over') return;
  const side = g.p.w.id === c.player.id ? 'w' : 'b', o = side === 'w' ? 'b' : 'w';
  if (g.p[side].ws !== ws) return;
  g.p[side].ws = null; g.p[side].off = Date.now();
  send(g.p[o].ws, { t: 'oppStatus', online: false, wait: RECONNECT_MS });
}

// ---------- HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function json(res, code, obj) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function body(req, max = 1e5) {
  return new Promise(res => { let d = ''; req.on('data', x => { d += x; if (d.length > max) req.destroy(); }); req.on('end', () => { try { res(JSON.parse(d || '{}')); } catch { res({}); } }); });
}
function playerFromToken(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{32,64}$/.test(token)) return null;
  const h = crypto.createHash('sha256').update(token).digest('hex');
  return DB.db.prepare('SELECT * FROM players WHERE token_hash = ?').get(h) || null;
}

async function api(req, res, url) {
  if (url.pathname === '/api/health') return json(res, 200, { ok: true, games: games.size, conns: conns.size, rooms: rooms.size });
  if (url.pathname === '/api/config') return json(res, 200, { publicUrl: PUBLIC_URL, tgApp: tgBase() || null, tg: tgCfg(), verified: !!BOT_TOKEN, shop: !!BOT, adsgram: ADSGRAM_BLOCK_ID || null,
    season: seasonOf(), pass: passTrack(seasonOf()) });
  if (url.pathname === '/api/profile' && req.method === 'POST') { // друзья, награды, ссылка-приглашение
    const b = await body(req), tg = BOT_TOKEN ? checkInitData(b.initData, BOT_TOKEN) : null;
    const p = (tg && playerByTg(tg.id)) || playerFromToken(b.token);
    if (!p) return json(res, 200, { pid: null });
    return json(res, 200, { pid: p.id, owned: ownedFor(p), friends: GROWTH.friends(p.id), refLink: appLink(`ref_${p.id}`), tiers: REF_TIERS });
  }
  if (url.pathname === '/api/share' && req.method === 'POST') { // картинка результата → сообщение для shareMessage в Telegram
    const b = await body(req, 300000), tg = BOT_TOKEN ? checkInitData(b.initData, BOT_TOKEN) : null;
    if (!BOT || !tg) return json(res, 400, { error: 'Только из Telegram' });
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.png || ''));
    const png = m && Buffer.from(m[1], 'base64');
    if (!png || png.length < 8 || png.length > 200000 || png.readUInt32BE(0) !== 0x89504e47) return json(res, 400, { error: 'Нет картинки' });
    const p = playerByTg(tg.id), name = crypto.randomBytes(9).toString('hex') + '.png';
    fs.mkdirSync(SHARE_DIR, { recursive: true }); fs.writeFileSync(path.join(SHARE_DIR, name), png);
    const P = parseStart(String(b.param || '')), param = P.pz !== undefined && P.pz !== 'today' ? `pz_${P.pz}${p ? '_' + p.id : ''}` : p ? `ref_${p.id}` : '';
    try {
      const r = await BOT.prepareShare(tg.id, { photoUrl: `${PUBLIC_URL}/share/${name}`, caption: String(b.caption || 'Chaos Chess').slice(0, 300), button: P.pz !== undefined ? '🧩 Решить' : '♟ Сыграть', url: appLink(param) });
      LADDER.event(p?.id, 'share_prepared', { kind: P.pz !== undefined ? 'puzzle' : 'result' });
      return json(res, 200, { id: r.id });
    } catch (e) { log('share:', e.message); return json(res, 502, { error: 'Telegram не принял сообщение' }); }
  }
  if (url.pathname === '/api/shop' && req.method === 'POST') {
    const b = await body(req), tg = BOT_TOKEN ? checkInitData(b.initData, BOT_TOKEN) : null;
    const p = (tg && playerByTg(tg.id)) || playerFromToken(b.token);
    const owned = p ? ownedFor(p) : { skins: [], boards: [], titles: [], products: [] };
    return json(res, 200, { enabled: !!BOT, canBuy: !!(BOT && tg), owned, season: seasonOf(),
      products: Object.entries(catalog()).map(([id, P]) => ({ id, title: P.title, desc: P.desc, stars: P.stars, grant: P.grant, repeat: !!P.repeat, pass: P.pass || null,
        owned: !P.repeat && owned.products.includes(id) })) });
  }
  if (url.pathname === '/api/shop/invoice' && req.method === 'POST') {
    if (!BOT) return json(res, 503, { error: 'Магазин ещё не подключён' });
    const b = await body(req), tg = checkInitData(b.initData, BOT_TOKEN);
    if (!tg) return json(res, 403, { error: 'Покупки доступны только из Telegram' });
    const p = playerByTg(tg.id) || DB.player({ tg, name: tg.name });
    const P = catalog()[b.product];
    if (!P) return json(res, 404, { error: 'Нет такого товара' });
    if (!P.repeat && SHOP.products(p.id).includes(b.product)) return json(res, 409, { error: 'Уже куплено' });
    try {
      const link = await BOT.createInvoiceLink({ title: P.title, description: P.desc, payload: `${p.id}|${b.product}`, stars: P.stars });
      LADDER.event(p.id, 'invoice', { product: b.product });
      return json(res, 200, { link });
    } catch (e) { log('счёт:', e.message); return json(res, 502, { error: 'Telegram не создал счёт, попробуй позже' }); }
  }
  if (url.pathname === '/api/history' && req.method === 'POST') {
    const b = await body(req), p = playerFromToken(b.token);
    if (!p) return json(res, 200, { games: [], me: null });
    return json(res, 200, { me: pub(p), games: DB.history(p.id).map(g => ({ id: g.id, side: g.white === p.id ? 'w' : 'b', opp: g.white === p.id ? g.bname : g.wname,
      result: g.result, reason: g.reason, plies: g.plies, chaos: !!g.chaos, ended: g.ended })) });
  }
  const m = url.pathname.match(/^\/api\/game\/(\d+)$/);
  if (m) {
    const g = DB.getGame(Number(m[1]));
    if (!g || !g.ended) return json(res, 404, { error: 'Партия не найдена или ещё идёт' });
    const w = DB.getPlayer(g.white), b = DB.getPlayer(g.black);
    return json(res, 200, { id: g.id, seed: g.seed, decks: JSON.parse(g.decks), chaos: !!g.chaos, mulls: JSON.parse(g.mulls || '{"w":[],"b":[]}'),
      actions: JSON.parse(g.actions || '[]'), result: g.result, reason: g.reason, names: { w: w?.name || '?', b: b?.name || '?' } });
  }
  if (url.pathname === '/api/ping' && req.method === 'POST') { // учёт игроков без онлайна: для удержания D1/D7
    const b = await body(req);
    if (typeof b.token === 'string' && /^[a-f0-9]{32,64}$/.test(b.token)) DB.player({ token: b.token, name: b.name, avatar: b.avatar });
    return json(res, 200, { ok: true });
  }
  if (url.pathname === '/api/event' && req.method === 'POST') {
    const b = await body(req), p = playerFromToken(b.token);
    if (typeof b.name === 'string' && /^[a-z_0-9]{2,40}$/.test(b.name)) LADDER.event(p?.id, b.name, b.data);
    if (p && b.name === 'game_end' && Number(b.data?.plies) >= 4) refPlayed(p.id);
    return json(res, 200, { ok: true });
  }
  if (url.pathname === '/api/leaderboard') {
    const b = req.method === 'POST' ? await body(req) : {}, p = playerFromToken(b.token);
    return json(res, 200, { leagues: LEAGUES, top: LADDER.top(50), me: p ? { ...LADDER.card(p.id), name: p.name } : null });
  }
  if (url.pathname.startsWith('/api/admin/')) {
    const tok = req.headers['x-admin-token'] || '';
    if (!ADMIN_TOKEN || tok.length !== ADMIN_TOKEN.length || !crypto.timingSafeEqual(Buffer.from(tok), Buffer.from(ADMIN_TOKEN))) return json(res, 403, { error: 'нет доступа' });
    if (url.pathname === '/api/admin/stats') return json(res, 200, { ...LADDER.stats(), live: { games: games.size, conns: conns.size, queue: queue.length, rooms: rooms.size },
      shop: { enabled: !!BOT, total: SHOP.total(), purchases: SHOP.list() }, referrals: GROWTH.stats(), tournaments: TOUR.active().map(t => ({ id: t.id, size: t.size, status: t.status, players: t.players.length })),
      bot: { username: BOT?.me?.username || null, mainApp: !!BOT?.me?.has_main_web_app, owner: !!kv.get('owner_id'), channel: kv.get('channel_title'), ownerCode: kv.get('owner_id') ? null : kv.get('owner_code') } });
    if (url.pathname === '/api/admin/refund' && req.method === 'POST') {
      const b = await body(req), pur = SHOP.get(String(b.charge));
      if (!pur || pur.refunded) return json(res, 404, { error: 'Платёж не найден или уже возвращён' });
      if (!BOT) return json(res, 503, { error: 'Бот не подключён' });
      try { await BOT.refund(pur.tg_id, pur.charge_id); } catch (e) { return json(res, 502, { error: e.message }); }
      SHOP.markRefunded(pur.charge_id); pushOwned(pur.player); LADDER.event(pur.player, 'refund', { product: pur.product });
      return json(res, 200, { ok: true });
    }
    if (url.pathname === '/api/admin/ban' && req.method === 'POST') { const b = await body(req); LADDER.ban(String(b.id), !!b.banned); return json(res, 200, { ok: true }); }
  }
  if (url.pathname === '/api/puzzle' && req.method === 'POST') {
    const b = await body(req), day = Number(b.day);
    if (!Number.isInteger(day)) return json(res, 400, { error: 'day' });
    const p = b.solved ? playerFromToken(b.token) : null;
    if (p) DB.solve(p.id, day);
    return json(res, 200, { solvers: DB.solvers(day) });
  }
  return json(res, 404, { error: 'not found' });
}

// Версия веб-клиента = свежайшее время изменения файлов в web/. Меняется при любой выкладке,
// и Telegram получает новые адреса картинок вместо закэшированных старых.
let verCache = { at: 0, v: '' };
function webVersion() {
  if (Date.now() - verCache.at < 30000) return verCache.v;
  let max = 0;
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else max = Math.max(max, fs.statSync(f).mtimeMs); } };
  walk(WEB);
  verCache = { at: Date.now(), v: Math.floor(max / 1000).toString(36) };
  return verCache.v;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    const sh = /^\/share\/([a-f0-9]{18}\.png)$/.exec(url.pathname);
    if (sh) { // картинки результатов для пересылки в Telegram
      const f = path.join(SHARE_DIR, sh[1]);
      if (!fs.existsSync(f)) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=604800' }); return fs.createReadStream(f).pipe(res);
    }
    let p = decodeURIComponent(url.pathname);
    const ver = p.match(/^\/v\/[\w-]+(?=\/)/); // /v/<версия>/… — адрес выкладки, см. webVersion()
    if (ver) p = p.slice(ver[0].length);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.resolve(WEB, '.' + p);
    if (!file.startsWith(WEB + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('not found'); }
    const ext = path.extname(file), st = fs.statSync(file);
    // Картинки и шрифты под /v/<версия>/ неизменны — кэш на год; без версии — всегда сверка с сервером
    const cache = ver && (ext === '.png' || ext === '.woff2') ? 'public, max-age=31536000, immutable' : 'no-cache';
    const head = { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': cache, 'x-content-type-options': 'nosniff' };
    if (p === '/index.html') {
      const html = fs.readFileSync(file, 'utf8').replace('<head>', `<head>\n<base href="/v/${webVersion()}/">`);
      res.writeHead(200, head); return res.end(html);
    }
    const lm = st.mtime.toUTCString();
    if (req.headers['if-modified-since'] === lm) { res.writeHead(304, { 'cache-control': cache, 'last-modified': lm }); return res.end(); }
    res.writeHead(200, { ...head, 'last-modified': lm });
    fs.createReadStream(file).pipe(res);
  } catch (e) { log('http error', e.message); if (!res.headersSent) res.writeHead(500); res.end(); }
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
wss.on('connection', ws => {
  conns.set(ws, { player: null, gid: null });
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', raw => { try { onMessage(ws, String(raw)); } catch (e) { log('ошибка сообщения', e.stack); send(ws, { t: 'error', msg: 'Ошибка сервера' }); } });
  ws.on('close', () => onClose(ws));
  ws.on('error', () => {});
});
setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); } }, 20000);

server.listen(PORT, HOST, () => log(`Chaos Chess сервер: http://${HOST}:${PORT} (публичный адрес ${PUBLIC_URL}; проверка Telegram ${BOT_TOKEN ? 'вкл' : 'выкл'})`));
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { log('остановка'); for (const g of games.values()) if (g.phase === 'play') DB.saveActs(g.id, g.actions.map(x => x.a)); process.exit(0); });
export { server };
