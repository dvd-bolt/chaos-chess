// Турниры в группах Telegram: на вылет, 4 или 8 игроков. Регистрация кнопкой, пары играют онлайн-партии по ссылке,
// бот публикует сетку и победителя. Состояние хранится в SQLite и переживает перезапуск сервера.
// Правила: часы 3+2; ничья — проходит игравший чёрными; соперник не пришёл за MATCH_MS — техническая победа пришедшему,
// не пришёл никто — жребий.
import crypto from 'node:crypto';

export const SIZES = [4, 8], MATCH_MS = 15 * 60000, REG_MS = 24 * 3600000;
const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const ROUND_NAME = (n, i) => (n - i === 1 ? 'Финал' : n - i === 2 ? 'Полуфинал' : 'Четвертьфинал');

// fx: { post(chat, html, keyboard) → message_id, edit(chat, msgId, html, keyboard), code() → свободный код комнаты,
//       link(code) → ссылка на матч, award(tgId, name, title), log }
export function openTournaments(db, fx, now = () => Date.now()) {
  db.exec(`CREATE TABLE IF NOT EXISTS tournaments (id INTEGER PRIMARY KEY AUTOINCREMENT, chat INTEGER NOT NULL, size INTEGER NOT NULL,
    status TEXT NOT NULL, data TEXT NOT NULL, msg INTEGER, created INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS tournaments_status ON tournaments(status);`);
  const S = {
    ins: db.prepare('INSERT INTO tournaments (chat, size, status, data, created) VALUES (?, ?, ?, ?, ?)'),
    put: db.prepare('UPDATE tournaments SET status = ?, data = ?, msg = ? WHERE id = ?'),
    get: db.prepare('SELECT * FROM tournaments WHERE id = ?'),
    active: db.prepare("SELECT * FROM tournaments WHERE status IN ('reg', 'play')"),
    inChat: db.prepare("SELECT * FROM tournaments WHERE chat = ? AND status IN ('reg', 'play')"),
  };
  const load = r => r && { id: r.id, chat: r.chat, size: r.size, status: r.status, msg: r.msg, created: r.created, ...JSON.parse(r.data) };
  const save = t => S.put.run(t.status, JSON.stringify({ creator: t.creator, players: t.players, rounds: t.rounds }), t.msg ?? null, t.id);
  const name = (t, tg) => t.players.find(p => p.tg === tg)?.name || '?';
  const regKb = t => [[{ text: '✋ Участвовать', callback_data: `tj:${t.id}` }, { text: 'Выйти', callback_data: `tl:${t.id}` }], [{ text: 'Отменить турнир', callback_data: `tc:${t.id}` }]];
  const regText = t => `🏆 <b>Турнир Chaos Chess на ${t.size} игроков</b>\nНа вылет, партии 3+2 онлайн. Победитель получает титул «Чемпион турнира».\n\n` +
    `Записались ${t.players.length}/${t.size}: ${t.players.map(p => esc(p.name)).join(', ') || '—'}\n\nЖми «Участвовать». Турнир начнётся, когда наберутся все.`;

  function bracket(t) {
    const lines = [`🏆 <b>Турнир на ${t.size}</b>`];
    t.rounds.forEach((R, i) => {
      lines.push('', `<b>${roundTitle(t, i)}</b>`);
      for (const m of R) {
        const a = esc(name(t, m.a)), b = esc(name(t, m.b));
        lines.push(m.winner ? `${m.winner === m.a ? `<b>${a}</b>` : a} — ${m.winner === m.b ? `<b>${b}</b>` : b}${m.note ? ` (${m.note})` : ''}` : `${a} — ${b} · играют`);
      }
    });
    return lines.join('\n');
  }
  const totalRounds = t => Math.log2(t.size);
  const roundTitle = (t, i) => ROUND_NAME(totalRounds(t), i);
  const roundKb = t => t.rounds.at(-1).filter(m => !m.winner).map(m => [{ text: `⚔ ${name(t, m.a)} — ${name(t, m.b)}`.slice(0, 60), url: fx.link(m.code) }]);

  function makeRound(t, pairs) {
    const ts = now();
    t.rounds.push(pairs.map(([a, b]) => ({ a, b, code: fx.code(), winner: null, gid: null, arrived: {}, ready: ts })));
  }
  async function begin(t) {
    const pl = t.players.map(p => p.tg);
    for (let i = pl.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [pl[i], pl[j]] = [pl[j], pl[i]]; }
    t.status = 'play'; t.rounds = [];
    makeRound(t, Array.from({ length: pl.length / 2 }, (_, i) => [pl[2 * i], pl[2 * i + 1]]));
    save(t);
    await fx.edit(t.chat, t.msg, regText(t) + '\n\n✅ Все в сборе — начинаем!', []).catch(() => {});
    await fx.post(t.chat, `${bracket(t)}\n\nИгроки, жмите свою пару — партия начнётся, когда зайдёте оба. На явку ${MATCH_MS / 60000} минут. Ничья — проходит игравший чёрными.`, roundKb(t)).catch(e => fx.log?.('турнир: пост', e.message));
  }
  async function advance(t) {
    const R = t.rounds.at(-1);
    if (R.some(m => !m.winner)) return save(t);
    if (R.length === 1) {
      t.status = 'done'; save(t);
      const w = R[0].winner;
      fx.award(w, name(t, w), 'Чемпион турнира');
      await fx.post(t.chat, `${bracket(t)}\n\n👑 <b>Победитель — ${esc(name(t, w))}!</b> Титул «Чемпион турнира» уже в игре.\nЕщё турнир: /tournament`, []).catch(() => {});
      return;
    }
    makeRound(t, Array.from({ length: R.length / 2 }, (_, i) => [R[2 * i].winner, R[2 * i + 1].winner]));
    save(t);
    await fx.post(t.chat, `${bracket(t)}\n\n${roundTitle(t, t.rounds.length - 1)}! Жмите свою пару.`, roundKb(t)).catch(() => {});
  }
  function find(code) {
    for (const r of S.active.all()) {
      const t = load(r);
      if (t.status !== 'play') continue;
      const m = t.rounds.at(-1).find(x => x.code === code && !x.winner);
      if (m) return { t, m };
    }
    return null;
  }

  // После перезапуска: партии, оборванные сервером, переигрываются — снимаем gid и даём новое время на явку.
  for (const r of S.active.all()) {
    const t = load(r); if (t.status !== 'play') continue;
    for (const m of t.rounds.at(-1)) if (!m.winner && m.gid) { m.gid = null; m.arrived = {}; m.ready = now(); }
    save(t);
  }

  return {
    get: id => load(S.get.get(id)),
    active: () => S.active.all().map(load),
    async create(chat, size, from) {
      if (!SIZES.includes(size)) size = 8;
      if (S.inChat.get(chat)) return { error: 'В этом чате уже идёт турнир. Дождитесь конца или отмените его кнопкой.' };
      const id = Number(S.ins.run(chat, size, 'reg', JSON.stringify({ creator: from.id, players: [], rounds: [] }), now()).lastInsertRowid);
      const t = load(S.get.get(id));
      t.msg = await fx.post(chat, regText(t), regKb(t));
      save(t);
      return { t };
    },
    // Кнопки регистрации. Возвращает текст всплывающего ответа.
    async button(kind, id, from) {
      const t = load(S.get.get(id));
      if (!t || t.status !== 'reg') return 'Регистрация закрыта';
      const nm = String([from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || 'Игрок').slice(0, 24);
      if (kind === 'tj') {
        if (t.players.some(p => p.tg === from.id)) return 'Ты уже в списке';
        if (t.players.length >= t.size) return 'Мест нет';
        t.players.push({ tg: from.id, name: nm });
        if (t.players.length === t.size) { await begin(t); return 'Ты в турнире! Начинаем'; }
        save(t); await fx.edit(t.chat, t.msg, regText(t), regKb(t)).catch(() => {});
        return 'Ты в турнире!';
      }
      if (kind === 'tl') {
        if (!t.players.some(p => p.tg === from.id)) return 'Тебя нет в списке';
        t.players = t.players.filter(p => p.tg !== from.id); save(t);
        await fx.edit(t.chat, t.msg, regText(t), regKb(t)).catch(() => {});
        return 'Ты вышел из турнира';
      }
      if (kind === 'tc') {
        if (from.id !== t.creator && !from.admin) return 'Отменить может только тот, кто создал турнир';
        t.status = 'cancel'; save(t);
        await fx.edit(t.chat, t.msg, regText(t) + '\n\n❌ Турнир отменён.', []).catch(() => {});
        return 'Турнир отменён';
      }
      return '';
    },
    // Матч по коду комнаты: { t, m } или null.
    find,
    // Игрок с этим tg пришёл в матч. Возвращает текст ошибки или null.
    arrive(code, tg) {
      const f = find(code); if (!f) return 'Матч не найден или уже сыгран';
      if (f.m.a !== tg && f.m.b !== tg) return 'Это турнирная партия других игроков';
      f.m.arrived[tg] = now(); save(f.t);
      return null;
    },
    started(code, gid) { const f = find(code); if (f) { f.m.gid = gid; save(f.t); } },
    // Итог партии: winnerTg или null (ничья → проходит чёрные), reason 'server' — переигровка.
    async result(code, { winner, black, reason }) {
      const f = find(code); if (!f) return;
      const { t, m } = f;
      if (reason === 'server') { m.gid = null; m.arrived = {}; m.ready = now(); save(t); return; }
      m.winner = winner || black; if (!winner) m.note = 'ничья, прошли чёрные';
      await fx.post(t.chat, `⚔ ${esc(name(t, m.a))} — ${esc(name(t, m.b))}: проходит <b>${esc(name(t, m.winner))}</b>${m.note ? ` (${m.note})` : ''}`, []).catch(() => {});
      await advance(t);
    },
    // Раз в минуту: неявки и протухшая регистрация.
    async tick() {
      for (const r of S.active.all()) {
        const t = load(r);
        if (t.status === 'reg' && now() - t.created > REG_MS) {
          t.status = 'cancel'; save(t);
          await fx.edit(t.chat, t.msg, regText(t) + '\n\n⌛ Не набралось игроков за сутки — турнир отменён.', []).catch(() => {});
          continue;
        }
        if (t.status !== 'play') continue;
        let changed = false;
        for (const m of t.rounds.at(-1)) {
          if (m.winner || m.gid || now() - m.ready < MATCH_MS) continue;
          const came = [m.a, m.b].filter(x => m.arrived[x]);
          if (came.length === 1) { m.winner = came[0]; m.note = 'соперник не пришёл'; }
          else if (!came.length) { m.winner = crypto.randomInt(2) ? m.a : m.b; m.note = 'никто не пришёл, жребий'; }
          else { m.winner = m.arrived[m.a] <= m.arrived[m.b] ? m.a : m.b; m.note = 'партия не началась, прошёл пришедший первым'; }
          changed = true;
          await fx.post(t.chat, `⏱ ${esc(name(t, m.a))} — ${esc(name(t, m.b))}: проходит <b>${esc(name(t, m.winner))}</b> (${m.note})`, []).catch(() => {});
        }
        if (changed) await advance(t);
      }
    },
    bracket,
  };
}
