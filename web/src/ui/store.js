// Локальные данные игрока: настройки, прогресс, колоды, история партий, токен устройства.
import { PRESETS, deckErrors } from '../engine/cards.js';

export const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v && typeof d === 'object' && !Array.isArray(d) ? { ...d, ...v } : v ?? d; } catch { return d; } };
export const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* приватный режим */ } };

export const settings = load('cc_settings', { sound: true, music: true, vib: true, fast: false, clock: 'off', skin: 'classic', board: 'classic', cb: false, deck: 'core', chaos: false, onlineClock: '7+5' });
export const progress = load('cc_progress', { lessons: [], wins: {}, losses: {}, draws: 0, played: {}, puzzle: { last: -1, streak: 0, best: 0, solved: [] } });
for (const k of ['wins', 'losses']) progress[k] = { novice: 0, fighter: 0, master: 0, ...(progress[k] || {}) };
progress.played ||= {};
progress.puzzle = { last: -1, streak: 0, best: 0, solved: [], ...(progress.puzzle || {}) };
export const profile = load('cc_profile', { name: '', avatar: Math.floor(Math.random() * 12) });
export const saveSettings = () => save('cc_settings', settings);
export const saveProgress = () => save('cc_progress', progress);
export const saveProfile = () => save('cc_profile', profile);

// Секрет устройства для онлайна: по нему сервер узнаёт игрока без Telegram.
export function deviceToken() {
  let t = localStorage.getItem('cc_token');
  if (!t || !/^[a-f0-9]{32}$/.test(t)) {
    const b = new Uint8Array(16); crypto.getRandomValues(b);
    t = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
    try { localStorage.setItem('cc_token', t); } catch { /* без сохранения */ }
  }
  return t;
}

// ---------- колоды ----------
export let customDecks = (load('cc_decks', []) || []).filter(d => d && Array.isArray(d.cards));
export const saveDecks = list => { customDecks = list; save('cc_decks', list); };
export function deckList() {
  return [...Object.entries(PRESETS).map(([k, p]) => ({ key: k, name: p.name, desc: p.desc, cards: p.deck, preset: true })),
    ...customDecks.map((d, i) => ({ key: 'c' + i, name: d.name, desc: `${d.cards.length} карт`, cards: d.cards, preset: false, idx: i }))];
}
let lockCheck = () => true;
export const setLockCheck = f => { lockCheck = f; };
export function currentDeck() {
  const d = deckList().find(x => x.key === settings.deck);
  return d && !deckErrors(d.cards).length && d.cards.every(id => lockCheck(id)) ? d : deckList()[0];
}

// ---------- история партий (повторы) ----------
export const history = load('cc_history', []) || [];
export function addHistory(rec) {
  history.unshift(rec);
  history.length = Math.min(history.length, 25);
  save('cc_history', history);
}

export function countPlayed(stats) {
  for (const id in stats.played || {}) progress.played[id] = (progress.played[id] || 0) + stats.played[id];
  saveProgress();
}
export const favoriteCard = () => Object.entries(progress.played).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
