// SQLite: игроки, партии (зерно + действия — этого достаточно для повтора), колоды, решения головоломок.
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';

export function openDb(file) {
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 3000;
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY, token_hash TEXT UNIQUE, tg_id INTEGER UNIQUE, name TEXT NOT NULL, avatar INTEGER DEFAULT 0,
      created INTEGER NOT NULL, last_seen INTEGER NOT NULL,
      games INTEGER DEFAULT 0, wins INTEGER DEFAULT 0, losses INTEGER DEFAULT 0, draws INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, white TEXT, black TEXT, seed INTEGER NOT NULL,
      decks TEXT NOT NULL, chaos INTEGER DEFAULT 0, clock TEXT, mulls TEXT, actions TEXT DEFAULT '[]',
      result TEXT, reason TEXT, plies INTEGER DEFAULT 0, started INTEGER NOT NULL, ended INTEGER);
    CREATE INDEX IF NOT EXISTS games_white ON games(white);
    CREATE INDEX IF NOT EXISTS games_black ON games(black);
    CREATE TABLE IF NOT EXISTS decks (player TEXT NOT NULL, slot INTEGER NOT NULL, name TEXT NOT NULL, cards TEXT NOT NULL,
      updated INTEGER NOT NULL, PRIMARY KEY (player, slot));
    CREATE TABLE IF NOT EXISTS puzzle_solves (player TEXT NOT NULL, day INTEGER NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY (player, day));
  `);
  const q = sql => db.prepare(sql);
  const S = {
    byToken: q('SELECT * FROM players WHERE token_hash = ?'),
    byTg: q('SELECT * FROM players WHERE tg_id = ?'),
    byId: q('SELECT * FROM players WHERE id = ?'),
    insert: q('INSERT INTO players (id, token_hash, tg_id, name, avatar, created, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    touch: q('UPDATE players SET last_seen = ?, name = ?, avatar = ?, token_hash = COALESCE(token_hash, ?) WHERE id = ?'),
    linkTg: q('UPDATE players SET tg_id = ? WHERE id = ? AND tg_id IS NULL'),
    gameNew: q('INSERT INTO games (code, white, black, seed, decks, chaos, clock, started) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
    gameMulls: q('UPDATE games SET mulls = ? WHERE id = ?'),
    gameActs: q('UPDATE games SET actions = ?, plies = ? WHERE id = ?'),
    gameEnd: q('UPDATE games SET result = ?, reason = ?, ended = ?, actions = ?, plies = ? WHERE id = ?'),
    gameGet: q('SELECT * FROM games WHERE id = ?'),
    history: q(`SELECT g.id, g.white, g.black, g.result, g.reason, g.plies, g.chaos, g.started, g.ended,
      pw.name AS wname, pb.name AS bname FROM games g LEFT JOIN players pw ON pw.id = g.white LEFT JOIN players pb ON pb.id = g.black
      WHERE (g.white = ? OR g.black = ?) AND g.ended IS NOT NULL ORDER BY g.id DESC LIMIT 30`),
    stat: q(`UPDATE players SET games = games + 1, wins = wins + ?, losses = losses + ?, draws = draws + ? WHERE id = ?`),
    deckPut: q('INSERT INTO decks (player, slot, name, cards, updated) VALUES (?, ?, ?, ?, ?) ON CONFLICT(player, slot) DO UPDATE SET name = excluded.name, cards = excluded.cards, updated = excluded.updated'),
    deckDel: q('DELETE FROM decks WHERE player = ? AND slot >= ?'),
    decks: q('SELECT slot, name, cards FROM decks WHERE player = ? ORDER BY slot'),
    solve: q('INSERT OR IGNORE INTO puzzle_solves (player, day, ts) VALUES (?, ?, ?)'),
    solvers: q('SELECT COUNT(*) AS n FROM puzzle_solves WHERE day = ?'),
    closeUnfinished: q("UPDATE games SET result = 'draw', reason = 'server', ended = ? WHERE ended IS NULL"),
  };
  const hash = t => crypto.createHash('sha256').update(String(t)).digest('hex');

  return {
    db,
    // Игрок по проверенному Telegram id или по секретному токену устройства.
    player({ token, tg, name, avatar }) {
      const now = Date.now();
      const th = token ? hash(token) : null;
      let p = (tg && S.byTg.get(tg.id)) || (th && S.byToken.get(th));
      const nm = String((tg && tg.name) || name || 'Игрок').slice(0, 32);
      const av = Number.isInteger(avatar) && avatar >= 0 && avatar < 24 ? avatar : 0;
      if (!p) {
        const id = crypto.randomBytes(8).toString('hex');
        S.insert.run(id, th, tg ? tg.id : null, nm, av, now, now);
        p = S.byId.get(id);
      } else {
        S.touch.run(now, nm, av, th, p.id);
        // игрок с этого устройства впервые зашёл через Telegram — привязываем аккаунт
        if (tg && !p.tg_id) S.linkTg.run(tg.id, p.id);
        p = S.byId.get(p.id);
      }
      return p;
    },
    getPlayer: id => S.byId.get(id),
    newGame: (g) => Number(S.gameNew.run(g.code, g.white, g.black, g.seed, JSON.stringify(g.decks), g.chaos ? 1 : 0, g.clock, Date.now()).lastInsertRowid),
    saveMulls: (id, m) => S.gameMulls.run(JSON.stringify(m), id),
    saveActs: (id, acts) => S.gameActs.run(JSON.stringify(acts), acts.length, id),
    endGame(id, result, acts, w, b) {
      S.gameEnd.run(result.winner || 'draw', result.reason, Date.now(), JSON.stringify(acts), acts.length, id);
      for (const [pid, side] of [[w, 'w'], [b, 'b']]) {
        if (!pid) continue;
        const win = result.winner === side ? 1 : 0, loss = result.winner && result.winner !== side ? 1 : 0;
        S.stat.run(win, loss, result.winner ? 0 : 1, pid);
      }
    },
    getGame: id => S.gameGet.get(id),
    history: pid => S.history.all(pid, pid),
    saveDecks(pid, list) {
      list.forEach((d, i) => S.deckPut.run(pid, i, String(d.name).slice(0, 24), JSON.stringify(d.cards), Date.now()));
      S.deckDel.run(pid, list.length);
    },
    decks: pid => S.decks.all(pid).map(d => ({ name: d.name, cards: JSON.parse(d.cards) })),
    solve: (pid, day) => S.solve.run(pid, day, Date.now()),
    solvers: day => S.solvers.get(day).n,
    abandonUnfinished() { // после перезапуска сервера незавершённые партии закрываются ничьей
      return Number(S.closeUnfinished.run(Date.now()).changes);
    },
  };
}
