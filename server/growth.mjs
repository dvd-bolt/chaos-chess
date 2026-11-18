// Приглашения друзей и наградные титулы (турниры). Только косметика.
// Защита от накрутки: приглашение привязано к Telegram id новичка (PRIMARY KEY — засчитывается один раз),
// пригласить себя нельзя, засчитываются только новые игроки, награда — после первой сыгранной партии.
import { REF_TIERS, REF_INVITEE } from '../web/src/engine/rewards.js';

export const NEW_PLAYER_MS = 30 * 60000; // «новый игрок»: появился не раньше получаса назад и ещё не играл онлайн

export function openGrowth(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS referrals (tg_id INTEGER PRIMARY KEY, invitee TEXT, inviter TEXT NOT NULL, src TEXT, ts INTEGER NOT NULL, done INTEGER);
    CREATE INDEX IF NOT EXISTS referrals_inviter ON referrals(inviter);
    CREATE INDEX IF NOT EXISTS referrals_invitee ON referrals(invitee);
    CREATE TABLE IF NOT EXISTS awards (player TEXT NOT NULL, title TEXT NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY (player, title));`);
  const q = sql => db.prepare(sql);
  const S = {
    player: q('SELECT * FROM players WHERE id = ?'),
    add: q('INSERT OR IGNORE INTO referrals (tg_id, invitee, inviter, src, ts) VALUES (?, ?, ?, ?, ?)'),
    attach: q('UPDATE referrals SET invitee = ? WHERE tg_id = ? AND invitee IS NULL'),
    open: q('SELECT * FROM referrals WHERE invitee = ? AND done IS NULL'),
    done: q('UPDATE referrals SET done = ? WHERE tg_id = ? AND done IS NULL'),
    count: q('SELECT COUNT(*) AS n FROM referrals WHERE inviter = ? AND done IS NOT NULL'),
    wasInvited: q('SELECT 1 FROM referrals WHERE invitee = ? AND done IS NOT NULL'),
    award: q('INSERT OR IGNORE INTO awards (player, title, ts) VALUES (?, ?, ?)'),
    awards: q('SELECT title FROM awards WHERE player = ? ORDER BY ts'),
    total: q('SELECT COUNT(*) AS n, SUM(CASE WHEN done IS NOT NULL THEN 1 ELSE 0 END) AS done FROM referrals'),
  };
  const isNew = p => !!p && (p.games || 0) === 0 && Date.now() - p.created < NEW_PLAYER_MS;
  return {
    isNew,
    // Записать приглашение. inviteePid может быть пустым (новичок пока только нажал /start в боте).
    // Возвращает 'ok' или причину отказа.
    register({ inviter, tgId, inviteePid = null, src = 'link', fresh }) {
      const I = S.player.get(String(inviter || ''));
      if (!I || !tgId) return 'bad';
      if (I.id === inviteePid || String(I.tg_id) === String(tgId)) return 'self';
      if (!fresh) return 'old';
      return Number(S.add.run(tgId, inviteePid, I.id, String(src).slice(0, 20), Date.now()).changes) ? 'ok' : 'dup';
    },
    attach: (tgId, pid) => S.attach.run(pid, tgId),
    // Новичок сыграл партию: закрываем приглашение. Возвращает { inviter, n } или null.
    played(pid) {
      const r = S.open.get(pid);
      if (!r || !Number(S.done.run(Date.now(), r.tg_id).changes)) return null;
      return { inviter: r.inviter, n: S.count.get(r.inviter).n };
    },
    friends: pid => S.count.get(pid).n,
    award: (pid, title) => Number(S.award.run(pid, title, Date.now()).changes) > 0,
    // Косметика за приглашения и наградные титулы.
    owned(pid) {
      const out = { skins: [], boards: [], titles: [] }, n = S.count.get(pid).n;
      const add = r => { if (r.skin) out.skins.push(r.skin); if (r.board) out.boards.push(r.board); if (r.title) out.titles.push(r.title); };
      for (const t of REF_TIERS) if (n >= t.n) add(t);
      if (S.wasInvited.get(pid)) add(REF_INVITEE);
      for (const a of S.awards.all(pid)) out.titles.push(a.title);
      for (const k in out) out[k] = [...new Set(out[k])];
      return out;
    },
    stats: () => S.total.get(),
  };
}

// Награда за новую ступень (для сообщения пригласившему).
export function tierReached(n) { return REF_TIERS.find(t => t.n === n) || null; }
