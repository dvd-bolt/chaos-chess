// Награды вне партии — только косметика: сезонный пропуск (бесплатная и платная дорожки), «Меценат» по ступеням,
// приглашения друзей, турниры. Общий модуль для клиента и сервера.
export const SEASON_EPOCH = Date.UTC(2026, 10, 16), SEASON_DAYS = 42;
export const seasonOf = (t = Date.now()) => Math.floor((t - SEASON_EPOCH) / (SEASON_DAYS * 86400000)) + 1;
export const seasonEnds = s => SEASON_EPOCH + s * SEASON_DAYS * 86400000;

// Уровни сезона: опыт, набранный за сезон (любые партии, головоломки, задания). 10 уровней по 250 опыта.
export const SEASON_LEVELS = 10, SXP_PER_LEVEL = 250;
export const seasonLevel = sxp => Math.min(SEASON_LEVELS, 1 + Math.floor((sxp || 0) / SXP_PER_LEVEL));

// Дорожки пропуска. Награда: { lv, skin?, board?, title? }. Бесплатная — всем, платная — купившим пропуск сезона.
export function passTrack(season) {
  return {
    free: [
      { lv: 3, board: 'dusk' },
      { lv: 7, title: `Сезон ${season}` },
    ],
    paid: [
      { lv: 1, skin: 'polar' },
      { lv: 2, board: 'aurora' },
      { lv: 4, title: `Звезда сезона ${season}` },
      { lv: 6, skin: 'crimson' },
      { lv: 10, title: `Легенда сезона ${season}` },
    ],
  };
}
// Всё, что даёт платная дорожка (для проверки, что соперник показывает честный предмет).
export function passAll(season) {
  const out = { skins: [], boards: [], titles: [] };
  for (const r of passTrack(season).paid) { if (r.skin) out.skins.push(r.skin); if (r.board) out.boards.push(r.board); if (r.title) out.titles.push(r.title); }
  return out;
}
// Открытые награды пропуска: slv — { сезон: достигнутый уровень }, passes — сезоны с купленным пропуском.
export function passUnlocked(slv = {}, passes = []) {
  const out = { skins: [], boards: [], titles: [] };
  const add = r => { if (r.skin) out.skins.push(r.skin); if (r.board) out.boards.push(r.board); if (r.title) out.titles.push(r.title); };
  for (const [s, lv] of Object.entries(slv || {})) {
    const T = passTrack(Number(s));
    for (const r of T.free) if (r.lv <= lv) add(r);
    if (passes.includes(Number(s))) for (const r of T.paid) if (r.lv <= lv) add(r);
  }
  return out;
}

// «Меценат»: ступени по сумме всех покупок в Stars (возвраты не считаются).
export const PATRON = [
  { stars: 50, title: 'Меценат', badge: '★' },
  { stars: 250, title: 'Щедрый меценат', badge: '★★' },
  { stars: 1000, title: 'Великий меценат', badge: '★★★' },
];
export const patronTier = stars => PATRON.filter(t => stars >= t.stars).length; // 0..3

// Приглашения: друг пришёл по ссылке и сыграл первую партию. Ступени для пригласившего и подарок новичку.
export const REF_TIERS = [
  { n: 1, title: 'Вербовщик', board: 'banner' },
  { n: 5, skin: 'herald' },
  { n: 20, title: 'Полководец' },
];
export const REF_INVITEE = { board: 'banner' };
export const TOURNEY_TITLE = 'Чемпион турнира';
