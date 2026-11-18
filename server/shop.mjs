// Магазин за Telegram Stars: только косметика. Покупки хранятся на сервере и привязаны к игроку.
import { seasonOf } from './ladder.mjs';
import { passAll, patronTier, PATRON } from '../web/src/engine/rewards.js';

// Что даёт товар: скины, доски, титулы. Цены в Stars (XTR) — правятся здесь.
// repeat — можно покупать сколько угодно раз (поддержка разработчика); pass — сезонный пропуск (платная дорожка, награды по уровням сезона).
export function catalog(season = seasonOf()) {
  return {
    skin_amethyst: { title: 'Скин «Аметист»', desc: 'Фигуры из фиолетового кристалла', stars: 75, grant: { skins: ['amethyst'] } },
    skin_retro: { title: 'Скин «Ретро»', desc: 'Зелёный экран старой карманной консоли', stars: 75, grant: { skins: ['retro'] } },
    skin_jade: { title: 'Скин «Нефрит»', desc: 'Резные фигуры из зелёного камня', stars: 75, grant: { skins: ['jade'] } },
    board_starry: { title: 'Доска «Звёздная ночь»', desc: 'Тёмно-синее небо в золотых искрах', stars: 50, grant: { boards: ['starry'] } },
    board_ocean: { title: 'Доска «Океан»', desc: 'Бирюзовая вода и глубина', stars: 50, grant: { boards: ['ocean'] } },
    board_sunset: { title: 'Доска «Закат»', desc: 'Тёплое вечернее небо', stars: 50, grant: { boards: ['sunset'] } },
    [`season${season}`]: { title: `Пропуск сезона ${season}`, desc: 'Платная дорожка сезона: скины «Полярная звезда» и «Багрянец», доска «Сияние», три сезонных титула. Награды открываются уровнями сезона и остаются навсегда',
      stars: 200, grant: {}, pass: season, season },
    supporter: { title: 'Пакет поддержки', desc: 'Все скины и доски магазина + титул «Меценат». Спасибо, что помогаешь игре расти!', stars: 250,
      grant: { skins: ['amethyst', 'retro', 'jade'], boards: ['starry', 'ocean', 'sunset'], titles: ['Меценат'] } },
    donate50: { title: 'Поддержать: чашка чая', desc: 'Просто спасибо разработчику. Считается в ступени «Меценат»', stars: 50, grant: {}, repeat: true },
    donate150: { title: 'Поддержать: пицца', desc: 'Хорошая поддержка. Считается в ступени «Меценат»', stars: 150, grant: {}, repeat: true },
    donate500: { title: 'Поддержать: новая карта', desc: 'Большое спасибо — на это делаются новые карты и режимы', stars: 500, grant: {}, repeat: true },
  };
}

// Сезонные пропуска прошлых сезонов тоже распознаём (для выдачи уже купленного).
export function productInfo(id) {
  const cur = catalog();
  if (cur[id]) return cur[id];
  const m = /^season(\d+)$/.exec(id);
  return m ? catalog(Number(m[1]))[id] : null;
}

export function openShop(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS purchases (charge_id TEXT PRIMARY KEY, player TEXT NOT NULL, tg_id INTEGER, product TEXT NOT NULL,
    stars INTEGER NOT NULL, ts INTEGER NOT NULL, refunded INTEGER DEFAULT 0);
    CREATE INDEX IF NOT EXISTS purchases_player ON purchases(player);`);
  const S = {
    add: db.prepare('INSERT OR IGNORE INTO purchases (charge_id, player, tg_id, product, stars, ts) VALUES (?, ?, ?, ?, ?, ?)'),
    mine: db.prepare('SELECT product, stars FROM purchases WHERE player = ? AND refunded = 0'),
    get: db.prepare('SELECT * FROM purchases WHERE charge_id = ?'),
    refund: db.prepare('UPDATE purchases SET refunded = 1 WHERE charge_id = ?'),
    list: db.prepare('SELECT p.*, pl.name FROM purchases p LEFT JOIN players pl ON pl.id = p.player ORDER BY ts DESC LIMIT 100'),
    total: db.prepare('SELECT COALESCE(SUM(stars), 0) AS s, COUNT(*) AS n FROM purchases WHERE refunded = 0'),
  };
  return {
    // Возвращает true, если покупка новая (повторная доставка того же платежа не дублирует).
    record: (charge, pid, tgId, product, stars) => Number(S.add.run(charge, pid, tgId, product, stars, Date.now()).changes) > 0,
    products: pid => S.mine.all(pid).map(r => r.product),
    spent: pid => S.mine.all(pid).reduce((a, r) => a + r.stars, 0),
    // Все косметические предметы игрока по его покупкам. passes — сезоны с пропуском, patron — ступень «Меценат» (0..3).
    owned(pid) {
      const out = { skins: [], boards: [], titles: [], products: [], passes: [], patron: 0 };
      const add = (k, x) => { if (!out[k].includes(x)) out[k].push(x); };
      for (const id of this.products(pid)) {
        const P = productInfo(id); if (!P) continue;
        if (!out.products.includes(id)) out.products.push(id);
        if (P.pass) add('passes', P.pass);
        for (const k of ['skins', 'boards', 'titles']) for (const x of P.grant[k] || []) add(k, x);
      }
      out.spent = this.spent(pid);
      out.patron = patronTier(out.spent);
      for (const t of PATRON.slice(0, out.patron)) add('titles', t.title);
      return out;
    },
    get: charge => S.get.get(charge),
    markRefunded: charge => S.refund.run(charge),
    list: () => S.list.all(),
    total: () => S.total.get(),
  };
}

// Что игрок вправе показывать сопернику из платного: покупки + вся платная дорожка купленных пропусков.
export function paidAllowed(owned) {
  const out = { skins: [...owned.skins], boards: [...owned.boards], titles: [...owned.titles] };
  for (const s of owned.passes || []) { const A = passAll(s); for (const k of ['skins', 'boards', 'titles']) out[k].push(...A[k]); }
  return out;
}
