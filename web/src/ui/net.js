// Клиент онлайна: WebSocket с автопереподключением и очередью обработчиков.
import { deviceToken, profile, settings } from './store.js';
import { initData, userName } from './tg.js';

// Сервер — тот же адрес, если игра открыта с него; иначе — основной адрес игры.
export const MAIN_SERVER = 'https://chess.138-124-126-138.sslip.io';
let base = null;
export async function serverBase() {
  if (base !== null) return base;
  for (const cand of [location.origin, MAIN_SERVER]) {
    try {
      const r = await fetch(cand + '/api/health', { cache: 'no-store' });
      if (r.ok && (await r.json()).ok) return (base = cand);
    } catch { /* следующий вариант */ }
  }
  return (base = '');
}

export class Net {
  constructor() { this.ws = null; this.handlers = {}; this.open = false; this.closing = false; this.retry = 0; this.me = null; this.queue = []; }
  on(t, fn) { this.handlers[t] = fn; return this; }
  async connect() {
    const b = await serverBase();
    if (!b) throw new Error('Сервер онлайна недоступен');
    if (this.ws && this.ws.readyState <= 1) return this.ready;
    this.closing = false;
    this.ready = new Promise((res, rej) => {
      const ws = new WebSocket(b.replace(/^http/, 'ws') + '/ws');
      this.ws = ws;
      const fail = setTimeout(() => rej(new Error('Нет ответа сервера')), 8000);
      ws.onopen = () => {
        this.open = true; this.retry = 0;
        let ref = null; try { ref = localStorage.getItem('cc_ref'); } catch { /* */ }
        ws.send(JSON.stringify({ t: 'hello', token: deviceToken(), initData: initData(), name: profile.name || userName() || 'Игрок', avatar: profile.avatar,
          ref, look: { skin: settings.skin, title: settings.title || '' } }));
      };
      ws.onmessage = e => {
        let m; try { m = JSON.parse(e.data); } catch { return; }
        if (m.t === 'welcome') { clearTimeout(fail); this.me = m.me; res(m); for (const q of this.queue.splice(0)) this.send(q); }
        (this.handlers[m.t] || this.handlers['*'] || (() => {}))(m);
      };
      ws.onclose = () => {
        this.open = false; clearTimeout(fail);
        (this.handlers.disconnect || (() => {}))();
        if (!this.closing && this.retry < 30) {
          const delay = Math.min(5000, 500 * 2 ** this.retry++);
          setTimeout(() => { if (!this.closing) this.connect().then(m => (this.handlers.reconnect || (() => {}))(m)).catch(() => {}); }, delay);
        }
      };
      ws.onerror = () => {};
    });
    return this.ready;
  }
  send(m) { if (this.ws && this.ws.readyState === 1 && this.me) this.ws.send(JSON.stringify(m)); else this.queue.push(m); }
  close() { this.closing = true; if (this.ws) this.ws.close(); }
}

export async function api(path, body) {
  const b = await serverBase();
  if (!b) throw new Error('Сервер недоступен');
  const r = await fetch(b + path, body ? { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {});
  return r.json();
}
