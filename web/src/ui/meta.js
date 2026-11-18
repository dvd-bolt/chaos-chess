// Прогресс игрока: опыт и уровень, открытие карт, задания дня, достижения, косметика. Только косметика и карты за игру — без покупок силы.
import { CARDS, CARD_IDS, PRESETS } from '../engine/cards.js';
import { FLOORS } from '../engine/campaign.js';
import { load, save, history, progress } from './store.js';
import { puzzleDay } from '../engine/puzzle.js';

export const CORE = CARD_IDS.filter(id => CARDS[id].set === 'core');
// уровень, на котором карта открывается без кампании
export const CARD_LEVEL = { shackles: 2, insight: 2, march: 3, swap: 3, ghost: 4, trap: 4, shockwave: 5, promote: 6, portal: 7, rebirth: 8, polymorph: 9, quake: 10, mirror: 12,
  ward: 13, tide: 13, leap: 14, mentor: 14, bastion: 15, frost: 15, comet: 16, foresight: 16, harpoon: 17, forge: 17, storm: 18, phoenix: 18 };
export { SKINS, BOARDS, SHOP_ITEMS, ITEM_SOURCE } from '../engine/cosmetics.js';
import { seasonOf, seasonLevel, passUnlocked, passTrack, SXP_PER_LEVEL, SEASON_LEVELS } from '../engine/rewards.js';
// Купленное в магазине приходит с сервера; заработанное игрой — в meta.
// Выданное сервером: покупки, пропуска сезонов (passes), ступень «Меценат» (patron), награды за друзей (friends) и турниры.
const EMPTY = () => ({ skins: [], boards: [], titles: [], products: [], passes: [], patron: 0, friends: 0 });
export let paid = { ...EMPTY(), ...(load('cc_paid', null) || {}) };
export function setPaid(o) { if (!o) return; paid = { ...EMPTY(), ...o }; save('cc_paid', paid); }
const uniq = a => [...new Set(a)];
const pass = () => passUnlocked(meta.slv, paid.passes);
export const allSkins = () => uniq([...meta.skins, 'night', ...paid.skins, ...pass().skins]); // «Ночь» — открыта всем
export const allBoards = () => uniq([...meta.boards, ...paid.boards, ...pass().boards]);
export const allTitles = () => uniq([...meta.titles, ...paid.titles, ...pass().titles]);
// Сезон: опыт за текущий сезон, уровень 1..10, дорожки пропуска.
export function seasonInfo() {
  const s = seasonOf(), xp = meta.sxp && meta.sxp.s === s ? meta.sxp.xp : 0, lv = seasonLevel(xp);
  return { season: s, xp, lv, max: SEASON_LEVELS, into: lv >= SEASON_LEVELS ? SXP_PER_LEVEL : xp % SXP_PER_LEVEL, per: SXP_PER_LEVEL, track: passTrack(s), hasPass: (paid.passes || []).includes(s) };
}

export const xpFor = n => 50 * n * (n - 1);            // опыт, нужный для уровня n
export const levelOf = xp => { let n = 1; while (xp >= xpFor(n + 1)) n++; return n; };

const fresh = () => ({ xp: 0, sxp: null, slv: {}, unlocked: CORE.slice(), tower: 0, quests: null, ach: {}, skins: ['classic'], boards: ['classic'], titles: [],
  draft: null, draftBest: 0, kills: {}, wins: 0, games: 0 });
export const meta = load('cc_meta', null) || (() => {
  const m = fresh();
  // ветеранам v0.1–v0.2 открываем всё, что уже было доступно
  if (history.length || Object.values(progress.wins || {}).some(Boolean) || (progress.lessons || []).length) {
    m.unlocked = CARD_IDS.slice(); m.skins.push('icefire'); m.xp = xpFor(5); m.veteran = true;
  }
  return m;
})();
for (const [k, v] of Object.entries(fresh())) if (meta[k] === undefined) meta[k] = v;
// ветеранам (владельцу и первым тестерам) Набор 2 открывается сразу — чтобы попробовать новинку
if (meta.veteran && !meta.storm2) { for (const id of CARD_IDS) if (!meta.unlocked.includes(id)) meta.unlocked.push(id); meta.storm2 = true; }
export const saveMeta = () => save('cc_meta', meta);
saveMeta();

export const isUnlocked = id => meta.unlocked.includes(id);
export const deckLocked = cards => [...new Set(cards.filter(id => !isUnlocked(id)))];

// ---------- задания дня ----------
const QUESTS = {
  win_bot:  { text: 'Победи бота', n: 1, xp: 60 },
  win_any:  { text: 'Выиграй 2 партии', n: 2, xp: 80 },
  cards:    { text: 'Сыграй 10 карт', n: 10, xp: 50 },
  kills:    { text: 'Уничтожь 3 фигуры картами', n: 3, xp: 60 },
  puzzle:   { text: 'Реши головоломку', n: 1, xp: 50 },
  online:   { text: 'Сыграй онлайн-партию', n: 1, xp: 70 },
  tower:    { text: 'Пройди этаж Башни Хаоса', n: 1, xp: 80 },
  chaos:    { text: 'Сыграй партию в режиме «Хаос»', n: 1, xp: 50 },
  draft:    { text: 'Сыграй партию драфта', n: 1, xp: 60 },
  card3:    { text: 'Сыграй 3 карты «{card}»', n: 3, xp: 60 },
};
function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }
export function questsToday() {
  const day = puzzleDay();
  if (!meta.quests || meta.quests.day !== day) {
    const r = rng(day * 7919 + 13), ids = Object.keys(QUESTS), pick = [];
    while (pick.length < 3) { const id = ids[Math.floor(r() * ids.length)]; if (!pick.includes(id)) pick.push(id); }
    const card = meta.unlocked[Math.floor(r() * meta.unlocked.length)];
    meta.quests = { day, list: pick.map(id => ({ id, p: 0, done: false, card: id === 'card3' ? card : undefined })) };
    saveMeta();
  }
  return meta.quests.list.map(q => ({ ...q, ...QUESTS[q.id], text: QUESTS[q.id].text.replace('{card}', CARDS[q.card]?.name || '') }));
}

// ---------- достижения ----------
export const ACH = {
  first_win:  { name: 'Первая кровь', text: 'Выиграй первую партию', reward: { board: 'marble' } },
  master_win: { name: 'Ученик превзошёл', text: 'Победи бота «Мастер»' },
  online_win: { name: 'Арена', text: 'Выиграй онлайн-партию' },
  online_10:  { name: 'Гладиатор', text: 'Выиграй 10 онлайн-партий', reward: { board: 'night' } },
  chaos_win:  { name: 'Дитя хаоса', text: 'Выиграй в режиме «Хаос»' },
  meteor3:    { name: 'Звездопад', text: 'Уничтожь 3 фигуры Метеором за партию' },
  quick_mate: { name: 'Блиц', text: 'Поставь мат быстрее чем за 20 ходов' },
  all_cards:  { name: 'Знаток', text: 'Сыграй каждую из 34 карт хотя бы раз' },
  charged:    { name: 'Полный заряд', text: 'Сыграй карту Набора 2 с зарядом 3' },
  puzzle7:    { name: 'Неделя ума', text: 'Серия головоломок 7 дней', reward: { board: 'forest' } },
  puzzle50:   { name: 'Решатель', text: 'Реши 50 головоломок из сборника' },
  tower5:     { name: 'Лёд тронулся', text: 'Победи Ледяную королеву' },
  tower10:    { name: 'Упокоитель', text: 'Победи Некроманта' },
  tower15:    { name: 'Покоритель башни', text: 'Пройди все 15 этажей' },
  draft3:     { name: 'Драфтер', text: '3 победы за один забег драфта' },
  draft7:     { name: 'Чемпион арены', text: '7 побед за один забег драфта', reward: { skin: 'neon' } },
  level10:    { name: 'Ветеран', text: 'Достигни 10-го уровня' },
  collector:  { name: 'Коллекционер', text: 'Открой все 34 карты' },
  league3:    { name: 'Слон', text: 'Достигни лиги «Слон» в рейтинге' },
  league5:    { name: 'Ферзь', text: 'Достигни лиги «Ферзь» в рейтинге', reward: { skin: 'gold' } },
};

// ---------- начисление ----------
// Возвращает список событий для показа игроку: опыт, новый уровень, открытые карты, достижения, задания.
function grant(out, reward) {
  if (!reward) return;
  for (const id of reward.cards || []) if (!meta.unlocked.includes(id)) { meta.unlocked.push(id); out.push({ t: 'card', id }); }
  if (reward.skin && !meta.skins.includes(reward.skin)) { meta.skins.push(reward.skin); out.push({ t: 'skin', id: reward.skin }); }
  if (reward.board && !meta.boards.includes(reward.board)) { meta.boards.push(reward.board); out.push({ t: 'board', id: reward.board }); }
  if (reward.title && !meta.titles.includes(reward.title)) { meta.titles.push(reward.title); out.push({ t: 'title', id: reward.title }); }
}
function addXp(out, n, why) {
  const before = levelOf(meta.xp);
  meta.xp += n; out.push({ t: 'xp', n, why });
  const after = levelOf(meta.xp);
  for (let L = before + 1; L <= after; L++) {
    out.push({ t: 'level', n: L });
    grant(out, { cards: Object.keys(CARD_LEVEL).filter(id => CARD_LEVEL[id] === L) });
  }
  if (after >= 10) achieve(out, 'level10');
  // опыт сезона и награды дорожек пропуска
  const s = seasonOf();
  if (!meta.sxp || meta.sxp.s !== s) meta.sxp = { s, xp: 0 };
  const sb = seasonLevel(meta.sxp.xp);
  meta.sxp.xp += n;
  const sa = seasonLevel(meta.sxp.xp);
  meta.slv = { ...(meta.slv || {}), [s]: Math.max(meta.slv?.[s] || 1, sa) };
  for (let L = sb + 1; L <= sa; L++) {
    out.push({ t: 'slevel', n: L });
    const T = passTrack(s);
    for (const r of T.free.filter(x => x.lv === L)) out.push({ t: 'pass', r, free: true });
    for (const r of T.paid.filter(x => x.lv === L)) out.push({ t: 'pass', r, free: false, got: (paid.passes || []).includes(s) });
  }
}
function achieve(out, id) {
  if (meta.ach[id]) return;
  meta.ach[id] = Date.now(); out.push({ t: 'ach', id });
  grant(out, ACH[id].reward); addXp(out, 50, 'достижение');
}
function quest(out, id, d = 1, card) {
  for (const q of questsToday()) {
    const raw = meta.quests.list.find(x => x.id === q.id);
    if (raw.id !== id || raw.done || (id === 'card3' && raw.card !== card)) continue;
    raw.p = Math.min(q.n, raw.p + d);
    if (raw.p >= q.n) { raw.done = true; out.push({ t: 'quest', text: q.text }); addXp(out, q.xp, 'задание'); }
  }
}

// Итог партии. ctx: { mode, won, draw, chaos, stats (своей стороны), level, plies, mate, floor, draft }
export function onGameEnd(ctx) {
  const out = [];
  meta.games++;
  addXp(out, ctx.won ? 60 : ctx.draw ? 35 : 25, ctx.won ? 'победа' : ctx.draw ? 'ничья' : 'партия');
  const st = ctx.stats || { played: {}, kills: {} };
  const cardsN = Object.values(st.played || {}).reduce((a, b) => a + b, 0);
  const kills = Object.entries(st.kills || {}).filter(([c]) => c !== 'capture').reduce((a, [, v]) => a + v, 0);
  quest(out, 'cards', cardsN); quest(out, 'kills', kills);
  for (const [id, n] of Object.entries(st.played || {})) quest(out, 'card3', n, id);
  if (ctx.chaos) quest(out, 'chaos');
  if (ctx.mode === 'online') quest(out, 'online');
  if (ctx.draft) quest(out, 'draft');
  for (const [k, v] of Object.entries(st.kills || {})) meta.kills[k] = (meta.kills[k] || 0) + v;
  meta.playedAll = { ...(meta.playedAll || {}), ...Object.fromEntries(Object.keys(st.played || {}).map(k => [k, 1])) };
  if (CARD_IDS.every(id => meta.playedAll[id])) achieve(out, 'all_cards');
  if ((st.kills || {}).meteor >= 3) achieve(out, 'meteor3');
  if (ctx.won) {
    meta.wins++;
    achieve(out, 'first_win'); quest(out, 'win_any');
    if (ctx.mode === 'bot' || ctx.mode === 'tower' || ctx.mode === 'draft') quest(out, 'win_bot');
    if (ctx.level === 'master' && !ctx.assisted) achieve(out, 'master_win');
    if (ctx.mode === 'online') { achieve(out, 'online_win'); meta.onlineWins = (meta.onlineWins || 0) + 1; if (meta.onlineWins >= 10) achieve(out, 'online_10'); }
    if (ctx.chaos) achieve(out, 'chaos_win');
    if (ctx.mate && ctx.plies < 40 && !ctx.assisted) achieve(out, 'quick_mate');
  }
  if (ctx.mode === 'tower' && ctx.won && ctx.floor === meta.tower) {
    meta.tower++; const F = FLOORS[ctx.floor];
    out.push({ t: 'floor', n: ctx.floor + 1 }); grant(out, F.reward); addXp(out, 100 + 20 * ctx.floor, 'этаж башни'); quest(out, 'tower');
    if (meta.tower >= 5) achieve(out, 'tower5'); if (meta.tower >= 10) achieve(out, 'tower10'); if (meta.tower >= 15) achieve(out, 'tower15');
  }
  if (meta.unlocked.length >= CARD_IDS.length) achieve(out, 'collector');
  saveMeta();
  return out;
}
// hints — сколько ступеней подсказки открыто (0–2): опыта меньше.
export function onPuzzleSolved(streak, hints = 0) {
  const out = []; addXp(out, [40, 30, 20][hints] ?? 20, hints ? 'головоломка с подсказкой' : 'головоломка'); quest(out, 'puzzle');
  if (streak >= 7) achieve(out, 'puzzle7');
  saveMeta(); return out;
}
export function onArchivePuzzle(hints = 0) {
  const out = []; addXp(out, [15, 10, 5][hints] ?? 5, hints ? 'головоломка с подсказкой' : 'головоломка'); quest(out, 'puzzle');
  meta.puzzles = (meta.puzzles || 0) + 1;
  if (meta.puzzles >= 50) achieve(out, 'puzzle50');
  saveMeta(); return out;
}
export function onDraftRun(wins) {
  const out = [];
  meta.draftBest = Math.max(meta.draftBest, wins);
  if (wins >= 3) achieve(out, 'draft3'); if (wins >= 7) achieve(out, 'draft7');
  saveMeta(); return out;
}
export function onLeague(idx) {
  const out = []; if (idx >= 2) achieve(out, 'league3'); if (idx >= 4) achieve(out, 'league5');
  saveMeta(); return out;
}

export function onCharged() { const out = []; achieve(out, 'charged'); saveMeta(); return out; }

// ---------- драфт ----------
// Забег: 20 выборов «1 из 3» из всех 22 карт (лимиты копий соблюдаются), потом партии против ботов до 3 поражений или 7 побед.
export const DRAFT_BOTS = ['novice', 'novice', 'fighter', 'fighter', 'fighter', 'master', 'master', 'master', 'master', 'master'];
export function draftOptions(picks, seed) {
  const r = rng(seed + picks.length * 101 + 7), lim = id => (CARDS[id].rarity === 'legendary' ? 1 : CARDS[id].rarity === 'common' ? 3 : 2);
  const ok = CARD_IDS.filter(id => picks.filter(x => x === id).length < lim(id) && !(CARDS[id].rarity === 'legendary' && picks.some(x => CARDS[x].rarity === 'legendary')));
  const out = [];
  while (out.length < 3 && out.length < ok.length) { const id = ok[Math.floor(r() * ok.length)]; if (!out.includes(id)) out.push(id); }
  return out;
}
export const botDeckFor = r => Object.values(PRESETS)[Math.floor(r * 4)].deck;
