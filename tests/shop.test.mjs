// Магазин за Stars и игровой бот: без настоящего Telegram (api подменяется).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../server/db.mjs';
import { openLadder } from '../server/ladder.mjs';
import { openShop, catalog } from '../server/shop.mjs';
import { createBot } from '../server/tgbot.mjs';
import { signInitData } from '../server/auth.mjs';

function setup() {
  const D = openDb(':memory:'); openLadder(D.db); const S = openShop(D.db);
  const p = D.player({ tg: { id: 555, name: 'Покупатель' } });
  const calls = [];
  const bot = createBot({ token: 'x', publicUrl: 'https://game.example', log: () => {}, api: async (m, b) => { calls.push([m, b]); return m === 'getMe' ? { username: 'cc_test_bot' } : true; },
    hooks: {
      checkPayment(payload, tgId, amount, currency) {
        const [pid, product] = payload.split('|'), P = catalog()[product];
        if (!P || currency !== 'XTR' || amount !== P.stars) return { ok: false, error: 'Товар недоступен' };
        if (S.products(pid).includes(product)) return { ok: false, error: 'Это уже куплено' };
        return { ok: true };
      },
      paid({ payload, charge, tgId, stars }) { const [pid, product] = payload.split('|'); S.record(charge, pid, tgId, product, stars); return { ok: true, title: catalog()[product].title }; },
    } });
  return { D, S, p, bot, calls };
}

test('каталог: только косметика, есть пакет поддержки и пропуск сезона', () => {
  const C = catalog(1);
  assert.ok(C.supporter && C.season1);
  for (const P of Object.values(C)) {
    assert.ok(P.stars > 0);
    assert.deepEqual(Object.keys(P.grant).filter(k => !['skins', 'boards', 'titles'].includes(k)), [], 'никаких карт, маны и опыта за деньги');
  }
});

test('бот: /start с кнопкой игры, приглашение в комнату', async () => {
  const { bot, calls } = setup();
  await bot.handle({ message: { chat: { id: 1 }, from: { id: 1 }, text: '/start' } });
  assert.equal(calls[0][1].reply_markup.inline_keyboard[0][0].web_app.url, 'https://game.example');
  await bot.handle({ message: { chat: { id: 1 }, from: { id: 1 }, text: '/start room_ABCDE' } });
  assert.equal(calls[1][1].reply_markup.inline_keyboard[0][0].web_app.url, 'https://game.example/?room=ABCDE');
});

test('оплата: проверка перед оплатой, выдача, повтор не дублирует, подделка цены отклоняется', async () => {
  const { S, p, bot, calls } = setup();
  const payload = `${p.id}|supporter`, price = catalog().supporter.stars;
  await bot.handle({ pre_checkout_query: { id: 'q1', from: { id: 555 }, currency: 'XTR', total_amount: price - 1, invoice_payload: payload } });
  assert.equal(calls.at(-1)[1].ok, false, 'неверная сумма');
  await bot.handle({ pre_checkout_query: { id: 'q2', from: { id: 555 }, currency: 'XTR', total_amount: price, invoice_payload: payload } });
  assert.equal(calls.at(-1)[0], 'answerPreCheckoutQuery'); assert.equal(calls.at(-1)[1].ok, true);
  const pay = { message: { chat: { id: 555 }, from: { id: 555 }, successful_payment: { currency: 'XTR', total_amount: price, invoice_payload: payload, telegram_payment_charge_id: 'ch_1' } } };
  await bot.handle(pay); await bot.handle(pay);
  const own = S.owned(p.id);
  assert.deepEqual(own.products, ['supporter'], 'одна покупка, без дублей');
  assert.ok(own.skins.includes('amethyst') && own.boards.includes('ocean') && own.titles.includes('Меценат'));
  await bot.handle({ pre_checkout_query: { id: 'q3', from: { id: 555 }, currency: 'XTR', total_amount: price, invoice_payload: payload } });
  assert.equal(calls.at(-1)[1].ok, false, 'второй раз не продаём');
  S.markRefunded('ch_1');
  assert.deepEqual(S.owned(p.id).products, [], 'после возврата предметы снимаются');
});

test('сервер: магазин виден, но купить можно только из Telegram', async () => {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), PORT = 41000 + Math.floor(Math.random() * 9000), BOT = '777:SHOP_TEST';
  const srv = spawn(process.execPath, ['--no-warnings', 'server/server.mjs'], { cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DB_PATH: path.join(os.tmpdir(), `cc_shop_${PORT}.db`), BOT_TOKEN: BOT, BOT_POLL: '0' } });
  await new Promise((res, rej) => { srv.stdout.on('data', d => { if (String(d).includes('сервер')) res(); }); srv.on('exit', rej); });
  try {
    const cfg = await (await fetch(`http://127.0.0.1:${PORT}/api/config`)).json();
    assert.equal(cfg.shop, true);
    const anon = await (await fetch(`http://127.0.0.1:${PORT}/api/shop`, { method: 'POST', body: '{}' })).json();
    assert.equal(anon.enabled, true); assert.equal(anon.canBuy, false); assert.ok(anon.products.length >= 5);
    const initData = signInitData({ user: JSON.stringify({ id: 9001, first_name: 'Тг' }), auth_date: String(Math.floor(Date.now() / 1000)) }, BOT);
    const tg = await (await fetch(`http://127.0.0.1:${PORT}/api/shop`, { method: 'POST', body: JSON.stringify({ initData }) })).json();
    assert.equal(tg.canBuy, true);
    const no = await fetch(`http://127.0.0.1:${PORT}/api/shop/invoice`, { method: 'POST', body: JSON.stringify({ product: 'supporter' }) });
    assert.equal(no.status, 403, 'без Telegram счёт не выставляется');
  } finally { srv.kill(); }
});
