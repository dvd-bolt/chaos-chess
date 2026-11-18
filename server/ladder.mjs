// Рейтинг Эло, сезоны (6 недель) и лиги, прогресс игрока, аналитика, бан. Миграции добавляют колонки к существующей базе.
export const LEAGUES = [
  { name: 'Пешка', min: 0 }, { name: 'Конь', min: 1100 }, { name: 'Слон', min: 1250 },
  { name: 'Ладья', min: 1400 }, { name: 'Ферзь', min: 1550 }, { name: 'Король', min: 1700 },
];
export const leagueOf = r => { let i = 0; LEAGUES.forEach((L, j) => { if (r >= L.min) i = j; }); return i; };
import { SEASON_EPOCH, SEASON_DAYS, seasonOf, seasonEnds } from '../web/src/engine/rewards.js'; // сезоны общие с клиентом
export { SEASON_EPOCH, SEASON_DAYS, seasonOf, seasonEnds };
export const START_RATING = 1000;

export function expected(ra, rb) { return 1 / (1 + 10 ** ((rb - ra) / 400)); }
// K: 40 в первых 20 партиях сезона, потом 24.
export function eloDelta(ra, rb, score, gamesA) { return Math.round((gamesA < 20 ? 40 : 24) * (score - expected(ra, rb))); }

export function openLadder(db) {
  for (const sql of [
    'ALTER TABLE players ADD COLUMN rating INTEGER DEFAULT 1000', 'ALTER TABLE players ADD COLUMN peak INTEGER DEFAULT 1000',
    'ALTER TABLE players ADD COLUMN season INTEGER DEFAULT 0', 'ALTER TABLE players ADD COLUMN sgames INTEGER DEFAULT 0',
    'ALTER TABLE players ADD COLUMN swins INTEGER DEFAULT 0', 'ALTER TABLE players ADD COLUMN banned INTEGER DEFAULT 0',
    'ALTER TABLE players ADD COLUMN meta TEXT', 'ALTER TABLE games ADD COLUMN rated INTEGER DEFAULT 0',
    'ALTER TABLE games ADD COLUMN dw INTEGER', 'ALTER TABLE games ADD COLUMN db INTEGER',
  ]) { try { db.exec(sql); } catch { /* колонка уже есть */ } }
  db.exec(`
    CREATE TABLE IF NOT EXISTS season_results (player TEXT NOT NULL, season INTEGER NOT NULL, rating INTEGER NOT NULL, peak INTEGER NOT NULL,
      league INTEGER NOT NULL, games INTEGER NOT NULL, PRIMARY KEY (player, season));
    CREATE TABLE IF NOT EXISTS events (ts INTEGER NOT NULL, player TEXT, name TEXT NOT NULL, data TEXT);
    CREATE INDEX IF NOT EXISTS events_ts ON events(ts);
  `);
  const q = sql => db.prepare(sql);
  const S = {
    get: q('SELECT * FROM players WHERE id = ?'),
    archive: q('INSERT OR REPLACE INTO season_results (player, season, rating, peak, league, games) VALUES (?, ?, ?, ?, ?, ?)'),
    reset: q('UPDATE players SET season = ?, rating = ?, peak = ?, sgames = 0, swins = 0 WHERE id = ?'),
    rate: q('UPDATE players SET rating = ?, peak = MAX(peak, ?), sgames = sgames + 1, swins = swins + ? WHERE id = ?'),
    gameRated: q('UPDATE games SET rated = 1, dw = ?, db = ? WHERE id = ?'),
    top: q('SELECT id, name, avatar, rating, sgames, swins FROM players WHERE season = ? AND sgames > 0 AND banned = 0 ORDER BY rating DESC LIMIT ?'),
    rank: q('SELECT COUNT(*) + 1 AS r FROM players WHERE season = ? AND sgames > 0 AND banned = 0 AND rating > ?'),
    results: q('SELECT season, rating, peak, league, games FROM season_results WHERE player = ? ORDER BY season DESC'),
    metaGet: q('SELECT meta FROM players WHERE id = ?'),
    metaPut: q('UPDATE players SET meta = ? WHERE id = ?'),
    event: q('INSERT INTO events (ts, player, name, data) VALUES (?, ?, ?, ?)'),
    ban: q('UPDATE players SET banned = ? WHERE id = ?'),
  };
  // Новый сезон: прошлый результат в архив, рейтинг сжимается к 1000 наполовину.
  function ensureSeason(pid) {
    const p = S.get.get(pid), cur = seasonOf();
    if (!p || p.season === cur) return p;
    if (p.season && p.sgames > 0) S.archive.run(p.id, p.season, p.rating, p.peak, leagueOf(p.peak), p.sgames);
    const r = p.season ? Math.round(START_RATING + (p.rating - START_RATING) / 2) : START_RATING;
    S.reset.run(cur, r, r, p.id);
    return S.get.get(pid);
  }
  return {
    ensureSeason,
    // Рейтинговая партия: возвращает изменения { w, b }.
    rateGame(gid, wid, bid, winner) {
      const w = ensureSeason(wid), b = ensureSeason(bid);
      if (!w || !b || w.id === b.id) return null;
      const sw = winner === 'w' ? 1 : winner === 'b' ? 0 : 0.5;
      const dw = eloDelta(w.rating, b.rating, sw, w.sgames), dbb = eloDelta(b.rating, w.rating, 1 - sw, b.sgames);
      S.rate.run(w.rating + dw, w.rating + dw, sw === 1 ? 1 : 0, w.id);
      S.rate.run(b.rating + dbb, b.rating + dbb, sw === 0 ? 1 : 0, b.id);
      S.gameRated.run(dw, dbb, gid);
      return { w: { delta: dw, rating: w.rating + dw }, b: { delta: dbb, rating: b.rating + dbb } };
    },
    card(pid) {
      const p = ensureSeason(pid); if (!p) return null;
      const season = seasonOf();
      return { rating: p.rating, peak: p.peak, league: leagueOf(p.rating), games: p.sgames, wins: p.swins, season, ends: seasonEnds(season),
        rank: p.sgames ? S.rank.get(season, p.rating).r : null, history: S.results.all(p.id) };
    },
    top: (n = 50) => S.top.all(seasonOf(), n).map(p => ({ ...p, league: leagueOf(p.rating) })),
    getMeta(pid) { const r = S.metaGet.get(pid); try { return r && r.meta ? JSON.parse(r.meta) : null; } catch { return null; } },
    putMeta(pid, m) { const s = JSON.stringify(m); if (s.length < 60000) S.metaPut.run(s, pid); },
    event(pid, name, data) { S.event.run(Date.now(), pid || null, String(name).slice(0, 40), data ? JSON.stringify(data).slice(0, 2000) : null); },
    ban: (pid, v) => S.ban.run(v ? 1 : 0, pid),
    // Админ-сводка: игроки, удержание D1/D7, партии, популярность карт.
    stats() {
      const day = 86400000, now = Date.now();
      const one = sql => db.prepare(sql).get();
      const players = one('SELECT COUNT(*) n FROM players').n;
      const dau = db.prepare('SELECT COUNT(*) n FROM players WHERE last_seen > ?').get(now - day).n;
      const wau = db.prepare('SELECT COUNT(*) n FROM players WHERE last_seen > ?').get(now - 7 * day).n;
      const ret = d => { const r = db.prepare('SELECT COUNT(*) total, SUM(CASE WHEN last_seen - created >= ? THEN 1 ELSE 0 END) kept FROM players WHERE created < ?').get(d * day, now - d * day); return r.total ? Math.round(100 * r.kept / r.total) : null; };
      const games = db.prepare('SELECT COUNT(*) n, AVG(plies) avg, SUM(CASE WHEN ended > ? THEN 1 ELSE 0 END) today FROM games WHERE ended IS NOT NULL').get(now - day);
      const reasons = db.prepare('SELECT reason, COUNT(*) n FROM games WHERE ended IS NOT NULL GROUP BY reason ORDER BY n DESC').all();
      const cards = {};
      for (const g of db.prepare('SELECT actions FROM games WHERE ended IS NOT NULL ORDER BY id DESC LIMIT 500').all()) {
        try { for (const a of JSON.parse(g.actions)) if (a.k === 'c') cards[a.id] = (cards[a.id] || 0) + 1; } catch { /* */ }
      }
      const ev = db.prepare('SELECT name, COUNT(*) n FROM events WHERE ts > ? GROUP BY name ORDER BY n DESC LIMIT 30').all(now - 7 * day);
      const recent = db.prepare(`SELECT g.id, g.result, g.reason, g.plies, g.rated, g.ended, pw.name w, pb.name b FROM games g
        LEFT JOIN players pw ON pw.id = g.white LEFT JOIN players pb ON pb.id = g.black WHERE g.ended IS NOT NULL ORDER BY g.id DESC LIMIT 20`).all();
      const list = db.prepare('SELECT id, name, rating, games, wins, banned, created, last_seen FROM players ORDER BY last_seen DESC LIMIT 50').all();
      return { players, dau, wau, d1: ret(1), d7: ret(7), games: games.n, gamesToday: games.today, avgMoves: Math.round((games.avg || 0) / 2),
        reasons, cards: Object.entries(cards).sort((a, b) => b[1] - a[1]), events: ev, recent, list, season: seasonOf() };
    },
  };
}
