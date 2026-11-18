import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { openLadder, eloDelta, leagueOf, seasonOf, SEASON_EPOCH, SEASON_DAYS } from '../server/ladder.mjs';
import { openDb } from '../server/db.mjs';

test('Эло: равные соперники ±20 в начале, фаворит получает меньше', () => {
  assert.equal(eloDelta(1000, 1000, 1, 0), 20);
  assert.equal(eloDelta(1000, 1000, 0, 0), -20);
  assert.ok(eloDelta(1400, 1000, 1, 30) < 5);
  assert.ok(eloDelta(1000, 1400, 1, 30) > 20);
});
test('лиги и сезоны', () => {
  assert.equal(leagueOf(999), 0); assert.equal(leagueOf(1100), 1); assert.equal(leagueOf(1720), 5);
  assert.equal(seasonOf(SEASON_EPOCH), 1);
  assert.equal(seasonOf(SEASON_EPOCH + SEASON_DAYS * 86400000), 2);
});
test('новый сезон архивирует результат и сжимает рейтинг', () => {
  const D = openDb(':memory:'), L = openLadder(D.db);
  const p = D.player({ token: 'a'.repeat(32), name: 'A' });
  L.ensureSeason(p.id);
  D.db.prepare('UPDATE players SET rating = 1400, peak = 1450, sgames = 30, season = -1 WHERE id = ?').run(p.id);
  const c = L.card(p.id);
  assert.equal(c.rating, 1200); assert.equal(c.games, 0);
  assert.equal(c.history[0].peak, 1450); assert.equal(c.history[0].league, leagueOf(1450));
});
