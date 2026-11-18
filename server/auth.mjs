// Проверка Telegram WebApp initData по HMAC-SHA256 (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).
import crypto from 'node:crypto';

export function checkInitData(initData, botToken, maxAgeSec = 86400) {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const dcs = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calc = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
  if (calc.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(hash))) return null;
  const age = Date.now() / 1000 - Number(params.get('auth_date') || 0);
  if (!(age >= -60 && age < maxAgeSec)) return null;
  try {
    const user = JSON.parse(params.get('user') || 'null');
    return user && user.id ? { id: user.id, name: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || 'Игрок', startParam: params.get('start_param') || '' } : null;
  } catch { return null; }
}

// Для тестов: подписать initData так же, как это делает Telegram.
export function signInitData(fields, botToken) {
  const params = new URLSearchParams(fields);
  const dcs = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  params.set('hash', crypto.createHmac('sha256', secret).update(dcs).digest('hex'));
  return params.toString();
}
