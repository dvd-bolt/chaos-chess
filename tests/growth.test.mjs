// Вирусность и монетизация без настоящего Telegram: приглашения, «Меценат», сезонный пропуск, турниры, ссылки, бот.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.mjs';
import { openLadder } from '../server/ladder.mjs';
import { openShop, catalog, paidAllowed } from '../server/shop.mjs';
import { openGrowth, NEW_PLAYER_MS } from '../server/growth.mjs';
import { openTournaments, MATCH_MS } from '../server/tournament.mjs';
import { createBot } from '../server/tgbot.mjs';
import { passUnlocked, passTrack, seasonLevel, patronTier, PATRON, REF_TIERS } from '../web/src/engine/rewards.js';
import { parseStart, parseQuery, webQuery, gameLink } from '../web/src/engine/links.js';
import { SKINS, BOARDS } from '../web/src/engine/cosmetics.js';

function base() {
  const D = openDb(':memory:'); openLadder(D.db);
  return { D, S: openShop(D.db), G: openGrowth(D.db) };
}

test('ссылки: параметр запуска ↔ адрес сайта, запасной вариант без Mini App', () => {
  const pid = '0123456789abcdef';
  assert.deepEqual(parseStart(`ref_${pid}`), { ref: pid });
  assert.deepEqual(parseStart('room_ABC23'), { room: 'ABC23' });
  assert.deepEqual(parseStart('pz_12_c'), { pz: 12, src: 'channel' });
  assert.deepEqual(parseStart(`pz_3_${pid}`), { pz: 3, ref: pid });
  assert.deepEqual(parseStart('puzzle'), { pz: 'today' });
  assert.deepEqual(parseStart('ref_bad'), {});
  assert.deepEqual(parseStart('x'.repeat(80)), {});
  for (const p of [`ref_${pid}`, 'room_ABC23', 'pz_12_c', `pz_3_${pid}`, 'watch_77']) {
    assert.deepEqual(parseQuery(webQuery(p)), parseStart(p), p);
    assert.ok(p.length <= 64 && /^[A-Za-z0-9_-]+$/.test(p), 'start_param в пределах правил Telegram');
  }
  assert.equal(gameLink(`ref_${pid}`, null, 'https://site'), `https://site/?ref=${pid}`, 'без бота — сайт');
  assert.equal(gameLink('pz_12_c', { base: 'https://t.me/bot', key: 'start' }, 'https://site'), 'https://t.me/bot?start=pz_12_c', 'бот без Mini App — /start');
  assert.equal(gameLink('room_ABC23', { base: 'https://t.me/bot/app', key: 'startapp' }, 'https://site'), 'https://t.me/bot/app?startapp=room_ABC23', 'прямая ссылка Mini App');
});

test('новая косметика есть в списках и в ассетах', async () => {
  const fs = await import('node:fs');
  for (const s of ['jade', 'crimson', 'herald']) { assert.ok(SKINS[s]); assert.ok(fs.existsSync(new URL(`../web/assets/skins/${s}/black_queen.png`, import.meta.url))); }
  for (const b of ['sunset', 'dusk', 'banner']) { assert.ok(BOARDS[b]); assert.ok(fs.existsSync(new URL(`../web/assets/boards/${b}_dark.png`, import.meta.url))); }
  const all = [...Object.values(passTrack(1)).flat(), ...REF_TIERS];
  for (const r of all) { if (r.skin) assert.ok(SKINS[r.skin], r.skin); if (r.board) assert.ok(BOARDS[r.board], r.board); }
});

test('пропуск сезона: уровни, бесплатная дорожка всем, платная — только с пропуском', () => {
  assert.equal(seasonLevel(0), 1); assert.equal(seasonLevel(249), 1); assert.equal(seasonLevel(250), 2); assert.equal(seasonLevel(99999), 10);
  const free = passUnlocked({ 1: 3 }, []);
  assert.ok(free.boards.includes('dusk')); assert.ok(!free.skins.includes('polar'), 'без пропуска платного нет');
  const paidL1 = passUnlocked({ 1: 1 }, [1]);
  assert.deepEqual(paidL1.skins, ['polar']); assert.ok(!paidL1.skins.includes('crimson'), 'багрянец — с 6-го уровня');
  const full = passUnlocked({ 1: 10 }, [1]);
  assert.ok(full.skins.includes('crimson') && full.titles.includes('Легенда сезона 1') && full.boards.includes('aurora'));
  assert.equal(passUnlocked({ 2: 10 }, [1]).skins.length, 0, 'пропуск 1-го сезона не открывает 2-й');
  const C = catalog(1);
  assert.equal(C.season1.pass, 1); assert.deepEqual(C.season1.grant, {}, 'пропуск сам по себе ничего, кроме дорожки, не даёт');
});

test('донат и «Меценат»: повторяемые покупки, ступени по сумме, возврат снимает ступень', () => {
  const { D, S } = base(), p = D.player({ tg: { id: 1, name: 'Щедрый' } });
  const C = catalog();
  for (const k of ['donate50', 'donate150', 'donate500']) { assert.ok(C[k].repeat); assert.deepEqual(C[k].grant, {}); }
  for (const P of Object.values(C)) assert.deepEqual(Object.keys(P.grant).filter(k => !['skins', 'boards', 'titles'].includes(k)), [], 'только косметика');
  assert.equal(S.owned(p.id).patron, 0);
  S.record('c1', p.id, 1, 'donate50', 50);
  assert.equal(S.owned(p.id).patron, 1); assert.ok(S.owned(p.id).titles.includes('Меценат'));
  S.record('c2', p.id, 1, 'donate150', 150); S.record('c3', p.id, 1, 'donate50', 50);
  assert.equal(S.owned(p.id).spent, 250); assert.equal(S.owned(p.id).patron, 2);
  assert.ok(S.owned(p.id).titles.includes('Щедрый меценат'));
  assert.equal(S.record('c3', p.id, 1, 'donate50', 50), false, 'повторная доставка платежа не считается');
  S.markRefunded('c2');
  assert.equal(S.owned(p.id).patron, 1, 'после возврата ступень пересчитана');
  assert.equal(patronTier(1000), PATRON.length);
  S.record('c4', p.id, 1, 'season1', 200);
  const own = S.owned(p.id);
  assert.deepEqual(own.passes, [1]);
  assert.ok(paidAllowed(own).skins.includes('crimson'), 'сопернику можно показывать всю платную дорожку купленного пропуска');
});

test('приглашения: засчитывается один раз, себя нельзя, только новые, награда после первой партии', () => {
  const { D, G } = base();
  const A = D.player({ tg: { id: 100, name: 'Вербовщик' } });
  const B = D.player({ tg: { id: 200, name: 'Новичок' } });
  assert.equal(G.register({ inviter: A.id, tgId: 100, inviteePid: A.id, fresh: true }), 'self');
  assert.equal(G.register({ inviter: A.id, tgId: 100, fresh: true }), 'self', 'свой tg id под другим аккаунтом');
  assert.equal(G.register({ inviter: 'nope', tgId: 200, fresh: true }), 'bad');
  assert.equal(G.register({ inviter: A.id, tgId: 200, inviteePid: B.id, fresh: false }), 'old', 'старый игрок не считается');
  assert.equal(G.isNew(B), true);
  assert.equal(G.isNew({ ...B, created: Date.now() - NEW_PLAYER_MS - 1 }), false);
  assert.equal(G.isNew({ ...B, games: 1 }), false);
  assert.equal(G.register({ inviter: A.id, tgId: 200, inviteePid: B.id, fresh: true }), 'ok');
  assert.equal(G.register({ inviter: A.id, tgId: 200, inviteePid: B.id, fresh: true }), 'dup');
  const C = D.player({ tg: { id: 300, name: 'Ещё' } });
  assert.equal(G.register({ inviter: C.id, tgId: 200, inviteePid: B.id, fresh: true }), 'dup', 'один tg id — только одному пригласившему');
  assert.equal(G.friends(A.id), 0, 'до партии не засчитано');
  assert.deepEqual(G.played(B.id), { inviter: A.id, n: 1 });
  assert.equal(G.played(B.id), null, 'вторая партия не засчитывается');
  assert.ok(G.owned(A.id).titles.includes('Вербовщик') && G.owned(A.id).boards.includes('banner'));
  assert.ok(G.owned(B.id).boards.includes('banner'), 'новичку — подарок');
  assert.equal(G.owned(C.id).boards.length, 0);
  // через бота: новичок нажал /start, игрока ещё нет — привязка при первом входе
  assert.equal(G.register({ inviter: A.id, tgId: 400, fresh: true, src: 'bot' }), 'ok');
  const E = D.player({ tg: { id: 400, name: 'Из бота' } });
  G.attach(400, E.id);
  assert.equal(G.played(E.id).n, 2);
  for (let i = 0; i < 3; i++) { const X = D.player({ tg: { id: 500 + i, name: 'x' } }); G.register({ inviter: A.id, tgId: 500 + i, inviteePid: X.id, fresh: true }); G.played(X.id); }
  assert.equal(G.friends(A.id), 5); assert.ok(G.owned(A.id).skins.includes('herald'), '5 друзей — скин');
  assert.ok(G.award(A.id, 'Чемпион турнира')); assert.ok(!G.award(A.id, 'Чемпион турнира'));
  assert.ok(G.owned(A.id).titles.includes('Чемпион турнира'));
});

function tourneyKit() {
  const D = openDb(':memory:'); let clock = 1e12, n = 0;
  const posts = [], edits = [], awards = [];
  const fx = {
    post: async (chat, html, kb) => { posts.push({ chat, html, kb }); return ++n; },
    edit: async (chat, msg, html, kb) => { edits.push({ chat, msg, html, kb }); },
    code: () => 'C' + String(++n).padStart(4, '0'),
    link: code => `https://t.me/bot?start=room_${code}`,
    award: (tg, name, title) => awards.push({ tg, name, title }),
  };
  const T = openTournaments(D.db, fx, () => clock);
  return { D, T, fx, posts, edits, awards, tick: ms => { clock += ms; }, reopen: () => openTournaments(D.db, fx, () => clock) };
}
const user = id => ({ id, first_name: 'Игрок' + id });

test('турнир на 4: регистрация, сетка, ничья — проходят чёрные, финал, титул победителю', async () => {
  const K = tourneyKit();
  const { t } = await K.T.create(-100, 4, user(1));
  assert.match(K.posts[0].html, /Турнир Chaos Chess на 4/);
  assert.equal(K.posts[0].kb[0][0].callback_data, `tj:${t.id}`);
  assert.equal((await K.T.create(-100, 8, user(2))).error ? 1 : 0, 1, 'второй турнир в том же чате нельзя');
  assert.equal(await K.T.button('tj', t.id, user(1)), 'Ты в турнире!');
  assert.equal(await K.T.button('tj', t.id, user(1)), 'Ты уже в списке');
  assert.equal(await K.T.button('tc', t.id, user(2)), 'Отменить может только тот, кто создал турнир');
  await K.T.button('tj', t.id, user(2)); await K.T.button('tj', t.id, user(3));
  assert.equal(await K.T.button('tj', t.id, user(4)), 'Ты в турнире! Начинаем');
  assert.equal(await K.T.button('tj', t.id, user(5)), 'Регистрация закрыта');
  const st = K.T.get(t.id);
  assert.equal(st.status, 'play'); assert.equal(st.rounds[0].length, 2);
  const bracketPost = K.posts.at(-1);
  assert.match(bracketPost.html, /Полуфинал/); assert.equal(bracketPost.kb.length, 2);
  assert.match(bracketPost.kb[0][0].url, /start=room_C\d{4}$/);
  const [m1, m2] = st.rounds[0];
  assert.equal(K.T.arrive(m1.code, 999), 'Это турнирная партия других игроков');
  assert.equal(K.T.arrive(m1.code, m1.a), null);
  K.T.started(m1.code, 11);
  await K.T.result(m1.code, { winner: m1.a, black: m1.b, reason: 'mate' });
  await K.T.result(m2.code, { winner: null, black: m2.b, reason: 'agreed' });
  const st2 = K.T.get(t.id);
  assert.equal(st2.rounds[0][1].winner, m2.b, 'ничья — проходит игравший чёрными');
  assert.equal(st2.rounds.length, 2); assert.match(K.posts.at(-1).html, /Финал/);
  const fin = st2.rounds[1][0];
  assert.deepEqual([fin.a, fin.b], [m1.a, m2.b]);
  // перезапуск сервера посреди финала: партия переигрывается
  K.T.started(fin.code, 22);
  K.reopen();
  assert.equal(K.T.get(t.id).rounds[1][0].gid, null);
  await K.T.result(fin.code, { winner: fin.b, black: fin.a, reason: 'time' });
  assert.equal(K.T.get(t.id).status, 'done');
  assert.deepEqual(K.awards, [{ tg: fin.b, name: 'Игрок' + fin.b, title: 'Чемпион турнира' }]);
  assert.match(K.posts.at(-1).html, /Победитель/);
  assert.equal(K.T.find(fin.code), null, 'сыгранный матч больше не принимает игроков');
});

test('турнир: неявка — техническая победа пришедшему, никто — жребий; отмена создателем', async () => {
  const K = tourneyKit();
  const { t } = await K.T.create(-5, 4, user(1));
  for (const u of [1, 2, 3, 4]) await K.T.button('tj', t.id, user(u));
  const [m1, m2] = K.T.get(t.id).rounds[0];
  K.T.arrive(m1.code, m1.b);
  K.tick(MATCH_MS - 1000); await K.T.tick();
  assert.equal(K.T.get(t.id).rounds[0][0].winner, null, 'время на явку ещё не вышло');
  K.tick(2000); await K.T.tick();
  const R = K.T.get(t.id).rounds[0];
  assert.equal(R[0].winner, m1.b); assert.match(R[0].note, /не пришёл/);
  assert.ok([m2.a, m2.b].includes(R[1].winner)); assert.match(R[1].note, /жребий/);
  assert.equal(K.T.get(t.id).rounds.length, 2, 'начался финал');
  const K2 = tourneyKit();
  const { t: t2 } = await K2.T.create(-6, 8, user(7));
  await K2.T.button('tj', t2.id, user(8));
  assert.equal(await K2.T.button('tc', t2.id, { ...user(9), admin: true }), 'Турнир отменён', 'админ группы может отменить');
  assert.equal(K2.T.get(t2.id).status, 'cancel');
  assert.ok(!(await K2.T.create(-6, 4, user(7))).error, 'после отмены можно новый');
});

test('бот: /tournament в группе и в личке, кнопки регистрации, /start по приглашению', async () => {
  const calls = [], hooked = [];
  const bot = createBot({ token: 'x', publicUrl: 'https://game.example', log: () => {}, api: async (m, b) => { calls.push([m, b]); return m === 'getChatMember' ? { status: 'member' } : true; },
    hooks: {
      tournament: async (chat, n, from) => { hooked.push(['t', chat.id, n, from.id]); return {}; },
      tournamentButton: async (kind, id, from) => { hooked.push([kind, id, from.id, !!from.admin]); return 'ок'; },
      started: (from, param) => hooked.push(['start', param]),
      appLink: p => `https://t.me/cc_test_bot?start=${p}`,
    } });
  await bot.handle({ message: { chat: { id: -10, type: 'supergroup' }, from: { id: 5 }, text: '/tournament@cc_test_bot 4' } });
  await bot.handle({ message: { chat: { id: -10, type: 'group' }, from: { id: 5 }, text: '/tournament' } });
  assert.deepEqual(hooked.slice(0, 2), [['t', -10, 4, 5], ['t', -10, 8, 5]]);
  await bot.handle({ message: { chat: { id: 5, type: 'private' }, from: { id: 5 }, text: '/tournament' } });
  assert.match(calls.at(-1)[1].text, /в группах/);
  await bot.handle({ message: { chat: { id: -10, type: 'group' }, from: { id: 5 }, text: '/start' } });
  assert.ok(calls.at(-1)[1].reply_markup.inline_keyboard[0][0].url, 'в группе — кнопка-ссылка, не web_app');
  await bot.handle({ message: { chat: { id: -10, type: 'group' }, from: { id: 5 }, text: 'просто текст' } });
  assert.equal(calls.at(-1)[0], 'sendMessage'); const n = calls.length;
  await bot.handle({ callback_query: { id: 'cb1', data: 'tj:7', from: { id: 6 }, message: { chat: { id: -10 } } } });
  assert.deepEqual(hooked.at(-1), ['tj', 7, 6, false]);
  assert.deepEqual(calls.at(-1), ['answerCallbackQuery', { callback_query_id: 'cb1', text: 'ок' }]);
  await bot.handle({ callback_query: { id: 'cb2', data: 'tc:7', from: { id: 6 }, message: { chat: { id: -10 } } } });
  assert.ok(calls.slice(n).some(c => c[0] === 'getChatMember'), 'для отмены проверяется админ');
  await bot.handle({ message: { chat: { id: 9, type: 'private' }, from: { id: 9 }, text: '/start ref_0123456789abcdef' } });
  assert.deepEqual(hooked.at(-1), ['start', 'ref_0123456789abcdef']);
  assert.equal(calls.at(-1)[1].reply_markup.inline_keyboard[0][0].web_app.url, 'https://game.example/?ref=0123456789abcdef');
  assert.match(calls.at(-1)[1].text, /пригласил друг/);
  await bot.handle({ message: { chat: { id: 9, type: 'private' }, from: { id: 9 }, text: '/start pz_4_c' } });
  assert.equal(calls.at(-1)[1].reply_markup.inline_keyboard[0][0].web_app.url, 'https://game.example/?pz=4&src=channel');
});
