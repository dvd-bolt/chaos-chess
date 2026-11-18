// Игровой Telegram-бот: /start с кнопкой игры, кнопка меню, оплата Stars (pre_checkout_query, successful_payment), /paysupport,
// турниры в группах (/tournament и кнопки регистрации). Работает длинным опросом getUpdates. Включается только если задан BOT_TOKEN.
// api() можно подменить в тестах.
import { parseStart, webQuery } from '../web/src/engine/links.js';

export function createBot({ token, publicUrl, log = console.log, api: apiOverride, hooks, apiBase = 'https://api.telegram.org' }) {
  // Запрос к Bot API с повтором при сетевых сбоях (длинный опрос повторяет сам цикл).
  const api = apiOverride || (async (method, body) => {
    const tries = method === 'getUpdates' ? 1 : 3;
    for (let i = 1; ; i++) {
      try {
        const r = await fetch(`${apiBase}/bot${token}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}),
          signal: AbortSignal.timeout(method === 'getUpdates' ? 40000 : 12000) });
        const j = await r.json();
        if (!j.ok) throw Object.assign(new Error(`${method}: ${j.description}`), { api: true });
        return j.result;
      } catch (e) {
        if (e.api || i >= tries) throw e;
        await new Promise(r => setTimeout(r, 700 * i));
      }
    }
  });
  let offset = 0, stopped = false, me = null;
  const playButton = (text = '♟ Играть', url = publicUrl) => ({ inline_keyboard: [[{ text, web_app: { url } }]] });
  // В группах кнопки web_app запрещены — ведём ссылкой (Mini App или бот с параметром).
  const linkButton = (text, param = '') => ({ inline_keyboard: [[{ text, url: hooks.appLink ? hooks.appLink(param) : publicUrl }]] });
  const cmd = (text, name) => new RegExp(`^/${name}(@\\w+)?(\\s|$)`, 'i').test(text);

  async function handle(u) {
    if (u.my_chat_member) { // бота добавили в канал или чат — сообщаем серверу
      const c = u.my_chat_member;
      hooks.membership?.(c.chat, c.new_chat_member.status, c.from);
      return;
    }
    if (u.callback_query) { // кнопки регистрации на турнир
      const q = u.callback_query, [kind, id] = String(q.data || '').split(':');
      let text = '';
      if (['tj', 'tl', 'tc'].includes(kind) && hooks.tournamentButton) {
        const from = { ...q.from };
        if (kind === 'tc' && q.message) { try { const cm = await api('getChatMember', { chat_id: q.message.chat.id, user_id: q.from.id }); from.admin = ['creator', 'administrator'].includes(cm.status); } catch { /* нет прав — только создатель */ } }
        text = await hooks.tournamentButton(kind, Number(id), from);
      }
      await api('answerCallbackQuery', { callback_query_id: q.id, text: text || undefined });
      return;
    }
    if (u.pre_checkout_query) {
      const q = u.pre_checkout_query, check = hooks.checkPayment(q.invoice_payload, q.from.id, q.total_amount, q.currency);
      await api('answerPreCheckoutQuery', check.ok ? { pre_checkout_query_id: q.id, ok: true } : { pre_checkout_query_id: q.id, ok: false, error_message: check.error || 'Покупка недоступна' });
      return;
    }
    const m = u.message;
    if (!m) return;
    if (m.successful_payment) {
      const p = m.successful_payment;
      const res = hooks.paid({ payload: p.invoice_payload, charge: p.telegram_payment_charge_id, tgId: m.from.id, stars: p.total_amount });
      await api('sendMessage', { chat_id: m.chat.id, text: res.ok ? `Спасибо за поддержку! «${res.title}» уже в игре — загляни в Коллекцию.${res.patron ? `\n⭐ Новая ступень: титул «${res.patron}» — его увидят соперники.` : ''}` : 'Оплата получена, но выдать покупку не вышло. Напиши /paysupport — разберёмся.' });
      return;
    }
    const text = m.text || '', group = m.chat.type === 'group' || m.chat.type === 'supergroup';
    if (cmd(text, 'tournament')) {
      if (!group) { await api('sendMessage', { chat_id: m.chat.id, text: 'Турниры проводятся в группах: добавь меня в группу и напиши там /tournament (или /tournament 4 — на четверых).' }); return; }
      const n = Number(text.split(/\s+/)[1]) === 4 ? 4 : 8;
      const r = await hooks.tournament?.(m.chat, n, m.from);
      if (r && r.error) await api('sendMessage', { chat_id: m.chat.id, text: r.error });
      return;
    }
    if (group) { // в группе отвечаем только на /start и /help — кнопкой-ссылкой
      if (cmd(text, 'start') || cmd(text, 'help')) await api('sendMessage', { chat_id: m.chat.id, text: 'Chaos Chess — шахматы с заклинаниями. Турнир для группы: /tournament', reply_markup: linkButton('♟ Играть') });
      return;
    }
    if (text.startsWith('/owner')) {
      const ok = hooks.claimOwner?.(m.from, text.split(' ')[1] || '');
      await api('sendMessage', { chat_id: m.chat.id, text: ok ? 'Готово: ты владелец игры. Сюда будут приходить покупки, обращения и сводка за день.' : 'Код не подошёл.' });
      return;
    }
    if (text.startsWith('/start')) {
      const param = text.split(' ')[1] || '', P = parseStart(param);
      hooks.started?.(m.from, param);
      const q = webQuery(param), url = q ? `${publicUrl}/${q}` : publicUrl;
      const intro = '<b>Chaos Chess</b> — шахматы с заклинаниями.\n\nПритяни ферзя Крюком, обрушь Метеор, заморозь фланг. Играй с ботом, проходи Башню Хаоса, решай головоломки и зови друзей в онлайн.';
      await api('sendMessage', { chat_id: m.chat.id, parse_mode: 'HTML',
        text: P.room ? 'Тебя позвали на партию! Жми кнопку — комната откроется сама.' : P.pz !== undefined ? '🧩 Головоломка ждёт. Жми кнопку!' : P.watch ? '👀 Партия идёт прямо сейчас — жми, чтобы смотреть.' :
          P.ref ? `${intro}\n\n🎁 Тебя пригласил друг: сыграй первую партию — и вы оба получите доску «Знамя».` : intro,
        reply_markup: playButton(P.room ? '♟ Войти в комнату' : P.pz !== undefined ? '🧩 Решить' : P.watch ? '👀 Смотреть' : '♟ Играть', url) });
      return;
    }
    if (text.startsWith('/paysupport')) {
      await api('sendMessage', { chat_id: m.chat.id, text: 'Вопросы по покупкам: опиши, что купил и что не так, — ответим и при необходимости вернём Stars. В игре продаётся только косметика: скины, доски, титулы.' });
      hooks.support?.(m.from, text);
      return;
    }
    if (text.startsWith('/help')) {
      await api('sendMessage', { chat_id: m.chat.id, text: 'Нажми «Играть», чтобы открыть игру. Партия с другом: Онлайн → Позвать друга. Вопросы по оплате: /paysupport', reply_markup: playButton() });
    }
  }

  async function setup() {
    me = await api('getMe');
    await api('setMyCommands', { commands: [{ command: 'start', description: 'Открыть игру' }, { command: 'help', description: 'Как играть' }, { command: 'paysupport', description: 'Помощь с покупками' }] });
    await api('setMyCommands', { scope: { type: 'all_group_chats' }, commands: [{ command: 'tournament', description: 'Турнир на 8 игроков (или /tournament 4)' }, { command: 'help', description: 'Что это за игра' }] }).catch(e => log('команды для групп:', e.message));
    await api('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Играть', web_app: { url: publicUrl } } });
    log(`игровой бот @${me.username} готов`);
    setInterval(() => api('getMe').then(m => { me = m; }).catch(() => {}), 10 * 60000); // подхватить включение Mini App без перезапуска
    return me;
  }

  async function loop() {
    while (!stopped) {
      try {
        const ups = await api('getUpdates', { offset, timeout: 30, allowed_updates: ['message', 'pre_checkout_query', 'my_chat_member', 'callback_query'] });
        for (const u of ups) { offset = u.update_id + 1; try { await handle(u); } catch (e) { log('бот: ошибка обработки', e.message); } }
      } catch (e) { log('бот: getUpdates', e.message); await new Promise(r => setTimeout(r, 5000)); }
    }
  }

  return {
    handle, setup, api,
    get me() { return me; },
    start() { setup().then(loop).catch(e => { log('бот не запустился:', e.message); }); },
    stop() { stopped = true; },
    send: (chat, text, extra = {}) => api('sendMessage', { chat_id: chat, text, ...extra }),
    // Сообщение для shareMessage в Mini App: картинка результата со ссылкой на игру (Bot API 8.0).
    prepareShare: (userId, { photoUrl, caption, button, url }) => api('savePreparedInlineMessage', { user_id: userId,
      result: { type: 'photo', id: 'r' + Date.now().toString(36), photo_url: photoUrl, thumbnail_url: photoUrl, caption, reply_markup: { inline_keyboard: [[{ text: button, url }]] } },
      allow_user_chats: true, allow_bot_chats: false, allow_group_chats: true, allow_channel_chats: true }),
    // Отправка картинки файлом (multipart): для поста с головоломкой.
    async sendPhoto(chat, png, caption, replyMarkup) {
      if (apiOverride) return apiOverride('sendPhoto', { chat_id: chat, caption });
      const fd = new FormData();
      fd.append('chat_id', String(chat)); fd.append('caption', caption); fd.append('parse_mode', 'HTML');
      if (replyMarkup) fd.append('reply_markup', JSON.stringify(replyMarkup));
      fd.append('photo', new Blob([png], { type: 'image/png' }), 'puzzle.png');
      const r = await (await fetch(`${apiBase}/bot${token}/sendPhoto`, { method: 'POST', body: fd, signal: AbortSignal.timeout(30000) })).json();
      if (!r.ok) throw new Error('sendPhoto: ' + r.description);
      return r.result;
    },
    createInvoiceLink: ({ title, description, payload, stars }) => api('createInvoiceLink', { title, description, payload, currency: 'XTR', prices: [{ label: title, amount: stars }] }),
    refund: (tgId, charge) => api('refundStarPayment', { user_id: tgId, telegram_payment_charge_id: charge }),
  };
}
