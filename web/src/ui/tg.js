// Интеграция с Telegram Mini App; вне Telegram всё работает как обычный сайт.
const tg = window.Telegram?.WebApp;
export const inTelegram = !!(tg && tg.platform && tg.platform !== 'unknown');
let vib = true, backCb = null;
export const setVibration = v => { vib = v; };

export function initTelegram() {
  if (!inTelegram) return;
  tg.ready(); tg.expand();
  try { tg.setHeaderColor('#1a1922'); tg.setBackgroundColor('#1a1922'); } catch { /* старый клиент */ }
  try { tg.disableVerticalSwipes?.(); } catch { /* старый клиент */ }
  // Назад — системной кнопкой Telegram; в полноэкранном режиме сверху ещё вырез и кнопки Telegram
  document.documentElement.classList.add('tg');
  const insets = () => {
    const r = document.documentElement.style, sa = tg.safeAreaInset?.top || 0, csa = tg.contentSafeAreaInset?.top || 0;
    r.setProperty('--sa-top', `${sa}px`); r.setProperty('--csa-top', `${csa}px`);
    document.documentElement.classList.toggle('tg-full', !!tg.isFullscreen && csa > 0);
  };
  insets();
  for (const ev of ['safeAreaChanged', 'contentSafeAreaChanged', 'fullscreenChanged', 'viewportChanged']) try { tg.onEvent(ev, insets); } catch { /* старый клиент */ }
}

export function haptic(kind) {
  if (!vib) return;
  try {
    const h = tg?.HapticFeedback;
    if (inTelegram && h) {
      if (['light', 'medium', 'heavy', 'rigid', 'soft'].includes(kind)) h.impactOccurred(kind);
      else if (kind === 'select') h.selectionChanged();
      else h.notificationOccurred(kind);
    } else if (navigator.vibrate) {
      navigator.vibrate({ light: 8, medium: 15, heavy: [30, 20, 40], rigid: 12, soft: 6, select: 4,
        success: [15, 40, 15], error: [40, 30, 40], warning: 25 }[kind] || 8);
    }
  } catch { /* вибрация не критична */ }
}

export function setBack(handler) {
  if (!inTelegram || !tg.BackButton) return;
  if (backCb) tg.BackButton.offClick(backCb);
  backCb = handler;
  if (handler) { tg.BackButton.onClick(handler); tg.BackButton.show(); } else tg.BackButton.hide();
}
export const userName = () => tg?.initDataUnsafe?.user?.first_name || '';
export const initData = () => (inTelegram ? tg.initData || '' : '');
export const startParam = () => tg?.initDataUnsafe?.start_param || '';
export function openLink(url) {
  try { if (inTelegram && /^https:\/\/t\.me\//.test(url)) return tg.openTelegramLink(url); if (inTelegram) return tg.openLink(url); } catch { /* ниже */ }
  window.open(url, '_blank');
}

// Переслать подготовленное сервером сообщение (картинка + кнопка игры) в любой чат: Bot API 8.0. Иначе — false.
export const canShareMessage = () => !!(inTelegram && tg.shareMessage && tg.isVersionAtLeast?.('8.0'));
export function shareMessage(id) {
  return new Promise(res => { try { tg.shareMessage(id, ok => res(!!ok)); } catch { res(false); } });
}

// Окно оплаты Telegram Stars; колбэк получает 'paid' | 'cancelled' | 'failed' | 'pending'.
export function openInvoice(link) {
  return new Promise(res => { try { tg.openInvoice(link, status => res(status)); } catch { res('failed'); } });
}
