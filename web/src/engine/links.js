// Параметры запуска игры: start_param Telegram (≤64 символов, A-Z a-z 0-9 _ -) и запасной вариант — адрес сайта с ?query.
//   room_ABCDE — комната (и турнирный матч)    watch_123 — смотреть партию
//   ref_<id>   — приглашение от игрока          pz_<день>[_c | _<id>] — головоломка дня (из канала / от игрока)
//   puzzle     — сегодняшняя головоломка
const ID = '[a-f0-9]{16}';
export function parseStart(p) {
  p = String(p || '');
  let m;
  if ((m = /^room_([A-Z0-9]{5})$/.exec(p))) return { room: m[1] };
  if ((m = /^watch_(\d{1,9})$/.exec(p))) return { watch: Number(m[1]) };
  if ((m = new RegExp(`^ref_(${ID})$`).exec(p))) return { ref: m[1] };
  if ((m = new RegExp(`^pz_(\\d{1,5})(?:_(c)|_(${ID}))?$`).exec(p))) return { pz: Number(m[1]), ...(m[2] ? { src: 'channel' } : {}), ...(m[3] ? { ref: m[3] } : {}) };
  if (p === 'puzzle') return { pz: 'today' };
  return {};
}
// Те же параметры — из адреса сайта (?room=, ?watch=, ?ref=, ?pz=&src=, ?puzzle=1).
export function parseQuery(search) {
  const q = new URLSearchParams(search), out = {};
  const room = (q.get('room') || '').toUpperCase(); if (/^[A-Z0-9]{5}$/.test(room)) out.room = room;
  if (/^\d{1,9}$/.test(q.get('watch') || '')) out.watch = Number(q.get('watch'));
  if (new RegExp(`^${ID}$`).test(q.get('ref') || '')) out.ref = q.get('ref');
  if (/^\d{1,5}$/.test(q.get('pz') || '')) out.pz = Number(q.get('pz')); else if (q.get('puzzle')) out.pz = 'today';
  if (q.get('src') === 'channel') out.src = 'channel';
  return out;
}
// start_param → ?query сайта (для запасной ссылки и кнопки web_app в боте).
export function webQuery(p) {
  const s = parseStart(p), q = new URLSearchParams();
  if (s.room) q.set('room', s.room);
  if (s.watch) q.set('watch', s.watch);
  if (s.pz === 'today') q.set('puzzle', '1'); else if (s.pz !== undefined) q.set('pz', s.pz);
  if (s.ref) q.set('ref', s.ref);
  if (s.src) q.set('src', s.src);
  const t = q.toString();
  return t ? '?' + t : '';
}
// Ссылка на игру с параметром. tg — { base: 't.me/…' или ссылка Mini App, key: 'startapp' | 'start' } или null; site — адрес сайта.
export function gameLink(param, tg, site) {
  if (tg && tg.base) return param ? `${tg.base}?${tg.key || 'start'}=${param}` : tg.base;
  return `${site}/${webQuery(param)}`;
}
