// Chaos Chess — интерфейс: меню, партия (бот, вдвоём, онлайн, головоломка, повтор, обучение), колоды, профиль.
import { createGame, start, apply, legalActions, settle, mulligan, sameAction, CARDS, inCheck, kingSq, CHAOS } from '../engine/game.js';
import { sqName, opp } from '../engine/rules.js';
import { zone3, zoneOf, PRESETS, CARD_IDS, deckErrors, copyLimit, DECK_SIZE, PIECE_NAME, tgSquares } from '../engine/cards.js';
import { unpack, puzzleDay, solutions } from '../engine/puzzle.js';
import { BoardView } from './board.js';
import { sfx, unlockAudio, setSound, audioCtx } from './sfx.js';
import { initTelegram, haptic, setBack, setVibration, inTelegram, userName, startParam, openLink, openInvoice, initData, canShareMessage, shareMessage } from './tg.js';
import { parseStart, parseQuery, gameLink } from '../engine/links.js';
import { PATRON, REF_TIERS, REF_INVITEE } from '../engine/rewards.js';
import { LESSONS } from './tutorial.js';
import { settings, progress, profile, saveSettings, saveProgress, saveProfile, deckList, currentDeck, customDecks, saveDecks,
  history, addHistory, countPlayed, favoriteCard, deviceToken, setLockCheck } from './store.js';
import { Net, api, serverBase } from './net.js';
import * as music from './music.js';
import { resultCard, highlight, shareText } from './share.js';
import { meta, saveMeta, levelOf, xpFor, isUnlocked, deckLocked, CARD_LEVEL, SKINS, BOARDS, questsToday, ACH, onGameEnd, onPuzzleSolved, onArchivePuzzle, onDraftRun, onLeague, onCharged, draftOptions, DRAFT_BOTS, botDeckFor, setPaid, paid, allSkins, allBoards, allTitles, SHOP_ITEMS, ITEM_SOURCE, seasonInfo } from './meta.js';
import { FLOORS, floorGame } from '../engine/campaign.js';
import { BOSSES } from '../engine/game.js';
const BOTLIKE = new Set(['bot', 'tower', 'draft']);
const vsBot = m => BOTLIKE.has(m);
setLockCheck(id => isUnlocked(id));

const $ = s => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const VERSION = 'v0.5 · Друзья и сезон';
const PIECE_RU = { K: 'Кр', Q: 'Ф', R: 'Л', B: 'С', N: 'К', P: '' };
const REASON = { mate: 'Мат', stalemate: 'Пат', repetition: 'Троекратное повторение', fifty: '60 ходов без событий',
  material: 'Недостаточно фигур', time: 'Время вышло', resign: 'Сдача', agreed: 'Ничья по согласию', abandon: 'Соперник не вернулся', server: 'Сервер перезапущен' };
const LEVEL_RU = { novice: 'Новичок', fighter: 'Боец', master: 'Мастер' };
const EMOTES = { like: '👍', hmm: 'Хм…', haha: 'Ха-ха', gg: 'GG', wow: 'Ого!', angry: 'Грр', heart: '♥', oops: 'Упс' };
const BOT_AVATAR = { novice: 4, fighter: 0, master: 1 };

const AVATARS = 24; // 12 персонажей + 12 портретов фигур
let A, view, G = null, worker = null, workerReq = 0, net = null, puzzleSet = null, cfg = { tgApp: null };

// ---------- загрузка ----------
function img(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(src)); i.src = src; }); }
async function loadAssets() {
  const names = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'];
  const out = { pieces: {}, tiles: {}, icons: {}, fx: {}, skins: {}, boards: {}, avatars: [] }, jobs = [];
  for (const s of ['white', 'black']) for (const n of names) {
    jobs.push(img(`assets/pieces/${s}_${n}.png`).then(i => { out.pieces[`${s}_${n}`] = i; }));
  }
  for (const t of ['light', 'dark', 'ov_select', 'ov_move', 'ov_capture', 'ov_danger', 'ov_frozen', 'ov_shadow', 'ov_lava', 'ov_trap']) jobs.push(img(`assets/tiles/${t}.png`).then(i => { out.tiles[t] = i; }));
  for (const t of ['wall', 'meteor', 'hook', 'mana', 'shackles', 'trap']) jobs.push(img(`assets/icons/${t}.png`).then(i => { out.icons[t] = i; }));
  for (const t of ['explosion', 'meteor_fall', 'freeze', 'teleport', 'lightning', 'shield', 'mark', 'portal']) jobs.push(img(`assets/fx/${t}.png`).then(i => { out.fx[t] = i; }));
  for (let i = 0; i < AVATARS; i++) jobs.push(img(`assets/avatars/${i}.png`).then(im => { out.avatars[i] = im; }));
  jobs.push(img('assets/ui/logo.png').then(i => { out.logo = i; }));
  await Promise.all(jobs);
  try { await Promise.all(['500 16px "Golos Text"', '800 16px "Golos Text"', '16px "Press Start 2P"'].map(f => document.fonts.load(f, 'АБВ abc'))); } catch { /* системный шрифт */ }
  return out;
}

// Скины фигур и доски подгружаются, когда их выбирают (раньше на доске работал только «Лёд и пламя»).
async function ensureSkin(id) {
  if (id === 'classic' || A.skins[id]) return;
  const set = {};
  await Promise.all(['white', 'black'].flatMap(s => ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn']
    .map(n => img(`assets/skins/${id}/${s}_${n}.png`).then(i => { set[`${s}_${n}`] = i; }))));
  A.skins[id] = set;
}
async function ensureBoard(id) {
  if (id === 'classic' || A.boards[id]) return;
  const [light, dark] = await Promise.all([img(`assets/boards/${id}_light.png`), img(`assets/boards/${id}_dark.png`)]);
  A.boards[id] = { light, dark };
}

// ---------- экраны и модалки ----------
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  if (id === 'menu') { setBack(null); renderMenu(); playMusic('menu'); }
}
function modal(html, buttons = [], opts = {}) {
  return new Promise(res => {
    const m = el('div', 'modal' + (opts.cls ? ' ' + opts.cls : '')), box = el('div', 'box', html);
    const row = el('div', 'btns' + (opts.row ? ' row' : ''));
    for (const [label, val, cls] of buttons) {
      const b = el('button', 'btn ' + (cls || ''), label);
      b.onclick = () => { sfx('select'); m.remove(); res(val); };
      row.append(b);
    }
    if (buttons.length) box.append(row);
    const exit = [...buttons].reverse().find(([label, val]) => (val === null || val === false) && EXIT_RE.test(label));
    if (exit || opts.dismiss) addClose(box, () => { m.remove(); res(exit ? exit[1] : null); });
    m.append(box);
    if (opts.dismiss) m.onclick = e => { if (e.target === m) { m.remove(); res(null); } };
    if (opts.onOpen) opts.onOpen(box, v => { m.remove(); res(v); });
    $('#modals').append(m);
  });
}
// Модалка, которая не закрывается от кнопок-действий (копировать, поделиться); закрывается вызовом close().
function sheet(html, buttons) {
  const m = el('div', 'modal'), box = el('div', 'box', html), row = el('div', 'btns');
  for (const [label, fn, cls] of buttons) { const b = el('button', 'btn ' + (cls || ''), label); b.onclick = () => { sfx('select'); fn(b); }; row.append(b); }
  box.append(row); m.append(box); $('#modals').append(m);
  const exit = [...buttons].reverse().find(([label]) => EXIT_RE.test(label));
  if (exit) addClose(box, () => exit[1]());
  return { el: box, close: () => m.remove() };
}
// Крестик в углу окна: закреплён сверху, чтобы не листать до кнопки «Закрыть».
const EXIT_RE = /^(Закрыть|Назад|Отмена|Ок|Готово|Позже|Не сейчас)$/;
function addClose(box, fn) {
  const w = el('div', 'x-close'), b = el('button', 'icon-btn', '✕');
  b.title = 'Закрыть'; b.onclick = e => { e.stopPropagation(); sfx('select'); fn(); };
  w.append(b); box.prepend(w);
}
const closeModals = () => { $('#modals').innerHTML = ''; };
function toast(txt, cls = '') { const t = el('div', 'toast ' + cls, txt); document.body.append(t); setTimeout(() => t.remove(), 2600); }

function cardHTML(id, extra = '', ch = null) {
  const c = CARDS[id];
  if (!c) return `<div class="card back ${extra}" style="background-image:url(assets/cards/_back.png)"></div>`;
  const label = SHORT[id] || c.name;
  const pips = c.charge && ch !== null ? `<span class="charge">${[0, 1, 2].map(i => `<i class="${i < ch ? 'on' : ''}"></i>`).join('')}</span>` : '';
  return `<div class="card ${c.type} ${c.charge ? 'chg' : ''} ${extra}" data-id="${id}" style="background-image:url(assets/cards/${id}.png)"><span class="cname${label.length >= 10 ? ' long' : ''}">${label}</span>${pips}</div>`;
}
// короткие подписи на маленьких картах; полное имя — в описании
const SHORT = { mark: 'Метка', ghost: 'Призрак', shockwave: 'Волна', foresight: 'Предвидение' };
const RARITY_RU = { common: 'обычная', rare: 'редкая', epic: 'эпическая', legendary: 'легендарная' };
function cardInfoHTML(id, ch = null) {
  const c = CARDS[id];
  if (c.charge) return cardInfoBase(id) + `<p class="ch-note">⚡ Заряд${ch !== null ? `: <b>${ch}/3</b>` : ''} — растёт на 1 в начале каждого твоего хода, пока карта в руке.</p>`;
  return cardInfoBase(id);
}
function cardInfoBase(id) {
  const c = CARDS[id];
  return `<div class="ci-head"><span class="ci-cost">${c.cost}</span><b>${c.name}</b><span class="ci-type ${c.type}">${c.type === 'quick' ? '⚡ быстрая — до хода' : '★ основная — вместо хода'}</span><span class="ci-rar ${c.rarity}">${RARITY_RU[c.rarity]}</span></div><p>${c.text}</p>`;
}
const avatarURL = i => `assets/avatars/${(i | 0) % AVATARS}.png`;

function playMusic(name) { const ctx = audioCtx(); if (ctx && settings.music) music.play(name, ctx); }

// ---------- меню ----------
function renderMenu() {
  const w = Object.values(progress.wins).reduce((a, b) => a + b, 0), l = Object.values(progress.losses).reduce((a, b) => a + b, 0);
  const nm = profile.name || userName();
  $('#menu-stats').textContent = w + l ? `Побед над ботом: ${w} · поражений: ${l}` : (nm ? `Привет, ${nm}!` : '');
  $('#btn-tutorial').classList.toggle('new', progress.lessons.length < LESSONS.length);
  const day = puzzleDay(), P = progress.puzzle;
  $('#btn-puzzle').classList.toggle('new', !P.solved.includes(day));
  $('#btn-puzzle').querySelector('small').textContent = P.streak > 1 && P.last >= day - 1 ? `серия ${P.streak} дн.` : `решено ${(P.done || []).length}`;
  $('#menu-deck').textContent = `Колода: ${currentDeck().name}`;
  $('#menu-ava').style.backgroundImage = `url(${avatarURL(profile.avatar)})`;
  $('.ver').textContent = VERSION;
  $('#btn-bot').innerHTML = `Против бота<small>${LEVEL_RU[settings.botLevel || 'fighter']}</small>`;
  const { L, pct } = xpBar();
  $('#menu-lvl').innerHTML = `<b>${L}</b><span class="mb"><i style="width:${pct}%"></i></span>`;
  const q = questsToday(); $('#btn-quests').classList.toggle('new', q.some(x => !x.done));
  $('#btn-tower').querySelector('small').textContent = meta.tower >= 15 ? 'башня покорена' : `этаж ${meta.tower + 1} из 15`;
  const lk = CARD_IDS.length - meta.unlocked.length; $('#btn-coll').querySelector('small').textContent = lk ? `закрыто карт: ${lk}` : 'всё открыто';
}

// Окно с переключателями: «название — значение», нажатие меняет значение прямо в окне.
function optionsModal(title, rows, buttons, sub = '') {
  return modal(`<h2>${title}</h2>${sub}`, buttons, { dismiss: true, onOpen: box => {
    const list = el('div', 'opts');
    const draw = () => {
      list.innerHTML = '';
      for (const r of rows) {
        if (r.section) { list.append(el('div', 'opt-sec', r.section)); continue; }
        if (r.hidden && r.hidden()) continue;
        const row = el('button', 'opt', `<span>${r.label}${r.hint ? `<small>${typeof r.hint === 'function' ? r.hint() : r.hint}</small>` : ''}</span><b>${r.value()}</b>`);
        row.onclick = () => { sfx('select'); haptic('select'); r.next(); draw(); };
        list.append(row);
      }
    };
    draw(); box.insertBefore(list, box.querySelector('.btns'));
  } });
}
const cycle = (arr, cur) => arr[(arr.indexOf(cur) + 1) % arr.length];
const LEVEL_HINT = { novice: 'учится и ошибается', fighter: 'считает на 2 хода', master: 'считает на 3 хода, видит маты' };
const TDIFF_RU = { easy: 'лёгкая', normal: 'обычная', hard: 'сложная' };
const TDIFF_HINT = { easy: 'бот слабее на уровень, без бонусной маны', normal: 'как задумано на этаже', hard: 'бот сильнее на уровень и +1 мана' };
const CLOCK_RU = { off: 'без часов', '3+2': '3 мин + 2 с', '7+5': '7 мин + 5 с', '15+10': '15 мин + 10 с' };

async function botSetup() {
  const o = { level: settings.botLevel || 'fighter', side: settings.botSide || 'r', deck: settings.botDeck || 'random', chaos: !!settings.chaos, clock: settings.clock || 'off' };
  const deckKeys = ['random', ...Object.keys(PRESETS)];
  const go = await optionsModal('Против бота', [
    { label: 'Соперник', hint: () => LEVEL_HINT[o.level], value: () => LEVEL_RU[o.level], next: () => { o.level = cycle(['novice', 'fighter', 'master'], o.level); } },
    { label: 'Твой цвет', value: () => ({ w: 'белые', b: 'чёрные', r: 'случайно' })[o.side], next: () => { o.side = cycle(['w', 'b', 'r'], o.side); } },
    { label: 'Колода бота', value: () => (o.deck === 'random' ? 'случайная' : PRESETS[o.deck].name), next: () => { o.deck = cycle(deckKeys, o.deck); } },
    { label: 'Режим «Хаос»', hint: 'событие каждые 8 кругов', value: () => (o.chaos ? 'вкл' : 'выкл'), next: () => { o.chaos = !o.chaos; } },
    { label: 'Часы', value: () => CLOCK_RU[o.clock], next: () => { o.clock = cycle(['off', '3+2', '7+5', '15+10'], o.clock); } },
  ], [['Играть', true, 'hot'], ['Отмена', false, 'ghost']], `<p class="muted">Твоя колода: ${esc(currentDeck().name)}</p>`);
  if (!go) return;
  Object.assign(settings, { botLevel: o.level, botSide: o.side, botDeck: o.deck, chaos: o.chaos, clock: o.clock }); saveSettings();
  newGame(botOpts(o.level, o.side, o.deck, o.chaos));
}
function botOpts(level, side, deckKey, chaos) {
  const keys = Object.keys(PRESETS), k = deckKey && deckKey !== 'random' ? deckKey : keys[Math.floor(Math.random() * keys.length)];
  return { mode: 'bot', level, chaos, human: side === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : side, side, deckKey: deckKey || 'random', botDeck: PRESETS[k].deck, botDeckName: PRESETS[k].name };
}

async function tutorialMenu() {
  const btns = LESSONS.map((l, i) => [`${progress.lessons.includes(l.id) ? '✔ ' : ''}${i + 1}. ${l.title}`, i]);
  const i = await modal('<h2>Обучение</h2><p>Три задачи по минуте — и ты знаешь всё, чтобы играть.</p>', [...btns, ['Назад', null, 'ghost']], { dismiss: true });
  if (i !== null && i !== undefined) startLesson(i);
}

function gallery() {
  const set = (name, ids) => `<h3>${name}</h3>` + ids.map(id => `<div class="gal-item">${cardHTML(id)}${cardInfoHTML(id)}</div>`).join('');
  const core = CARD_IDS.filter(id => CARDS[id].set === 'core'), ext = CARD_IDS.filter(id => CARDS[id].set === 'ext'), storm = CARD_IDS.filter(id => CARDS[id].set === 'storm');
  modal(`<h2>Карты</h2><p class="muted">В колоде 20 карт: до 3 копий обычной, до 2 редкой или эпической, 1 легендарная. ⚡ быстрая — перед ходом (одна за ход). ★ основная — вместо хода. Король неуязвим для карт.</p>
    <div class="gallery">${set('Основа · 9', core)}${set('Расширение · 13', ext)}${set('Набор 2 «Буря» · 12 — заряд', storm)}</div>
    <h3>Хаос-события</h3><div class="chaos-list">${Object.values(CHAOS).map(c => `<p><b>${c.name}.</b> ${c.text}</p>`).join('')}</div>`,
  [['Закрыть', null]], { cls: 'wide', dismiss: true });
}

async function settingsMenu() {
  const t = k => () => (settings[k] ? 'вкл' : 'выкл'), flip = k => () => { settings[k] = !settings[k]; applySettings(); saveSettings(); };
  const on = (k, d = true) => (settings[k] === undefined ? d : settings[k]);
  await optionsModal('Настройки', [
    { section: 'Сложность' },
    { label: 'Бот: «Против бота»', hint: () => LEVEL_HINT[settings.botLevel || 'fighter'], value: () => LEVEL_RU[settings.botLevel || 'fighter'],
      next: () => { settings.botLevel = cycle(['novice', 'fighter', 'master'], settings.botLevel || 'fighter'); saveSettings(); renderMenu(); } },
    { label: 'Башня Хаоса', hint: () => TDIFF_HINT[settings.towerDiff || 'normal'], value: () => TDIFF_RU[settings.towerDiff || 'normal'],
      next: () => { settings.towerDiff = cycle(['easy', 'normal', 'hard'], settings.towerDiff || 'normal'); saveSettings(); } },
    { label: 'Твой цвет против бота', value: () => ({ w: 'белые', b: 'чёрные', r: 'случайно' })[settings.botSide || 'w'], next: () => { settings.botSide = cycle(['w', 'b', 'r'], settings.botSide || 'w'); saveSettings(); } },
    { section: 'Звук' },
    { label: 'Звуки', value: t('sound'), next: flip('sound') },
    { label: 'Музыка', value: t('music'), next: flip('music') },
    { label: 'Вибрация', value: t('vib'), next: flip('vib') },
    { section: 'Игра' },
    { label: 'Анимации', value: () => (settings.fast ? 'быстрые' : 'обычные'), next: flip('fast') },
    { label: 'Скорость бота', hint: 'пауза перед ответом', value: () => (settings.botFast ? 'быстро' : 'обычно'), next: flip('botFast') },
    { label: 'Подсказки ходов', hint: 'точки, куда может пойти фигура', value: () => (on('hints') ? 'вкл' : 'выкл'), next: () => { settings.hints = !on('hints'); saveSettings(); } },
    { label: 'Координаты на доске', value: () => (on('coords', false) ? 'вкл' : 'выкл'), next: () => { settings.coords = !on('coords', false); applySettings(); saveSettings(); } },
    { label: 'Подтверждать ★ карты', hint: 'основная карта заменяет ход', value: () => (on('confirm') ? 'вкл' : 'выкл'), next: () => { settings.confirm = !on('confirm'); saveSettings(); } },
    { label: 'Часы с ботом', value: () => CLOCK_RU[settings.clock || 'off'], next: () => { settings.clock = cycle(['off', '3+2', '7+5', '15+10'], settings.clock || 'off'); saveSettings(); } },
    { section: 'Вид' },
    { label: 'Фигуры', value: () => SKINS[settings.skin] || 'Классика', next: () => { settings.skin = cycle(allSkins(), settings.skin); applySettings(); saveSettings(); } },
    { label: 'Доска', value: () => BOARDS[settings.board] || 'Камень', next: () => { settings.board = cycle(allBoards(), settings.board); applySettings(); saveSettings(); } },
    { label: 'Палитра для дальтоников', hint: 'опасность — штриховкой', value: t('cb'), next: flip('cb') },
  ], [['Готово', null, 'hot']], `<p class="muted">Новые скины и доски открываются в Башне Хаоса и за достижения.</p>`);
}
function applySettings() {
  setSound(settings.sound); setVibration(settings.vib);
  music.setMusic(settings.music);
  if (settings.music) playMusic(G && G.mode !== 'replay' ? 'game' : 'menu');
  if (!allSkins().includes(settings.skin)) settings.skin = 'classic';
  if (!allBoards().includes(settings.board)) settings.board = 'classic';
  if (view) { view.coords = !!settings.coords; view.speed = settings.fast ? 1.8 : 1; view.cb = settings.cb; }
  const skin = settings.skin, board = settings.board;
  ensureSkin(skin).then(() => { if (view && settings.skin === skin) view.skin = skin; }).catch(() => {});
  ensureBoard(board).then(() => { if (view && settings.board === board && view.theme !== board) { view.theme = board; view.resize(); } }).catch(() => {});
  document.body.classList.toggle('cb', !!settings.cb);
  if (!allTitles().includes(settings.title)) settings.title = '';
  if (net && net.me) net.send({ t: 'look', look: { skin: settings.skin, title: settings.title || '' } });
}

// ---------- колоды ----------
let deckEdit = null; // { idx|null, name, cards:[] }
function decksScreen() { show('decks'); setBack(() => { if (deckEdit) { deckEdit = null; renderDecks(); } else show('menu'); }); deckEdit = null; renderDecks(); }
function renderDecks() {
  const box = $('#decks-body'); box.innerHTML = '';
  if (!deckEdit) {
    $('#decks-title').textContent = 'Колоды';
    const cur = currentDeck().key;
    for (const d of deckList()) {
      const row = el('div', 'deck-row' + (d.key === cur ? ' cur' : ''), `<div class="deck-icons">${[...new Set(d.cards)].slice(0, 5).map(id => `<img src="assets/icons/${id}.png">`).join('')}</div>
        <div class="deck-info"><b>${esc(d.name)}</b><small>${deckLocked(d.cards).length ? '🔒 нужно открыть: ' + deckLocked(d.cards).map(id => CARDS[id].name).join(', ') : esc(d.desc)}</small></div>`);
      const pick = el('button', 'btn small' + (d.key === cur ? ' hot' : ''), d.key === cur ? '✔' : 'Играть');
      pick.onclick = e => { e.stopPropagation(); if (deckLocked(d.cards).length) { sfx('error'); return toast('В колоде есть закрытые карты'); } settings.deck = d.key; saveSettings(); sfx('select'); renderDecks(); };
      row.append(pick);
      row.onclick = () => { sfx('select'); deckEdit = { idx: d.preset ? null : d.idx, name: d.preset ? d.name + ' (копия)' : d.name, cards: d.cards.slice(), preset: d.preset }; renderDecks(); };
      box.append(row);
    }
    if (customDecks.length < 8) {
      const nb = el('button', 'btn big', '+ Новая колода');
      nb.onclick = () => { sfx('select'); deckEdit = { idx: null, name: `Моя колода ${customDecks.length + 1}`, cards: [], preset: false }; renderDecks(); };
      box.append(nb);
    }
    return;
  }
  const D = deckEdit, cnt = {};
  for (const id of D.cards) cnt[id] = (cnt[id] || 0) + 1;
  const errs = deckErrors(D.cards), avg = D.cards.length ? (D.cards.reduce((s, id) => s + CARDS[id].cost, 0) / D.cards.length).toFixed(1) : '0';
  $('#decks-title').textContent = D.preset ? 'Готовая колода' : 'Колода';
  const head = el('div', 'deck-head', `<input id="deck-name" maxlength="24" value="${esc(D.name)}"><div class="deck-count ${D.cards.length === DECK_SIZE ? 'ok' : ''}">${D.cards.length}/${DECK_SIZE}</div>
    <div class="muted">Средняя цена ${avg} · нажми на карту — добавить, «−» — убрать, долгое нажатие — описание</div>`);
  box.append(head);
  head.querySelector('input').oninput = e => { D.name = e.target.value; };
  const grid = el('div', 'deck-grid');
  for (const id of CARD_IDS) {
    const n = cnt[id] || 0, lim = copyLimit(id), open = isUnlocked(id);
    const cell = el('div', 'deck-cell' + (n ? ' has' : '') + (open ? '' : ' lock'), cardHTML(id, n >= lim ? 'max' : '') + (open ? `<span class="cnt">${n}/${lim}</span>` : `<span class="why">ур. ${CARD_LEVEL[id]}</span>`));
    let pressT = null, long = false;
    cell.onpointerdown = () => { long = false; pressT = setTimeout(() => { long = true; modal(cardInfoHTML(id), [['Закрыть', null]], { dismiss: true }); }, 450); };
    cell.onpointerup = cell.onpointerleave = () => clearTimeout(pressT);
    cell.onclick = () => {
      if (long) return;
      if (!open) { sfx('error'); return toast(`«${CARDS[id].name}» откроется на ${CARD_LEVEL[id]}-м уровне или в Башне Хаоса`); }
      if (n >= lim || D.cards.length >= DECK_SIZE || (CARDS[id].rarity === 'legendary' && D.cards.some(x => CARDS[x].rarity === 'legendary'))) { sfx('error'); haptic('error'); return; }
      D.cards.push(id); sfx('draw'); haptic('select'); renderDecks();
    };
    if (n) { const m = el('button', 'minus', '−'); m.onclick = e => { e.stopPropagation(); D.cards.splice(D.cards.lastIndexOf(id), 1); sfx('select'); renderDecks(); }; cell.append(m); }
    grid.append(cell);
  }
  box.append(grid);
  box.append(el('div', 'deck-errs', errs.filter(e => !e.startsWith('В колоде')).map(esc).join('<br>')));
  const btns = el('div', 'btns row');
  const saveB = el('button', 'btn hot', D.preset ? 'Сохранить копию' : 'Сохранить');
  saveB.disabled = !!errs.length || deckLocked(D.cards).length > 0;
  saveB.onclick = () => {
    const list = customDecks.slice(), rec = { name: D.name.trim() || 'Колода', cards: D.cards.slice().sort((a, b) => CARDS[a].cost - CARDS[b].cost) };
    if (D.idx === null || D.idx === undefined) { if (list.length >= 8) return toast('Не больше 8 своих колод'); list.push(rec); D.idx = list.length - 1; } else list[D.idx] = rec;
    saveDecks(list); settings.deck = 'c' + D.idx; saveSettings();
    if (net && net.me) net.send({ t: 'saveDecks', decks: list });
    sfx('win'); toast('Колода сохранена и выбрана'); deckEdit = null; renderDecks();
  };
  btns.append(saveB);
  if (!D.preset && D.idx !== null && D.idx !== undefined) {
    const del = el('button', 'btn ghost', 'Удалить');
    del.onclick = async () => {
      if (!(await modal('<h2>Удалить колоду?</h2>', [['Удалить', true], ['Нет', false, 'ghost']]))) return;
      const list = customDecks.slice(); list.splice(D.idx, 1); saveDecks(list);
      if (settings.deck.startsWith('c')) settings.deck = 'core'; saveSettings(); deckEdit = null; renderDecks();
    };
    btns.append(del);
  }
  const back = el('button', 'btn ghost', 'Назад'); back.onclick = () => { deckEdit = null; renderDecks(); };
  btns.append(back);
  box.append(btns);
}

// ---------- партия ----------
function bottomSide() {
  if (!G) return 'w';
  if (G.mode === 'local') return G.st.turn;
  return G.human;
}
const humanSide = s => G && (G.mode === 'local' || (G.mode !== 'replay' && s === G.human));
const isHumanTurn = () => G && !G.st.result && !G.over && G.mode !== 'replay' && G.mode !== 'watch' && (G.mode === 'local' || G.st.turn === G.human);

function resetView(st) {
  handKey = ''; document.querySelectorAll('.mana').forEach(m => { delete m.dataset.n; });
  view.setState(st); view.last = null; view.parts = []; view.hints = emptyHints(); view.rings = [];
  view.floaters = []; view.hidden.clear(); view.fx = []; view.texts = []; view.chain = null; view.dropWall = null; view.sel = -1;
}

async function newGame(opts) {
  closeModals();
  const seed = (Math.random() * 2 ** 32) >>> 0;
  const myDeck = opts.deck || currentDeck().cards;
  let decks = { w: myDeck, b: myDeck };
  if (vsBot(opts.mode)) decks = opts.human === 'w' ? { w: myDeck, b: opts.botDeck } : { w: opts.botDeck, b: myDeck };
  let st;
  if (opts.state) st = opts.state;
  else if (opts.setup) st = createGame({ ...opts.setup, decks: { w: [], b: [] }, seed: 1 });
  else st = createGame({ seed, decks, chaos: !!opts.chaos, fog: vsBot(opts.mode), boss: opts.boss || null, bossSide: opp(opts.human || 'w'),
    mana: opts.botMana ? { [opp(opts.human || 'w')]: (opts.human === 'b' ? 0 : 1) + opts.botMana } : undefined });
  G = { mode: opts.mode, level: opts.level, human: opts.human || 'w', lesson: opts.lesson ?? null, busy: true, sel: null, opts,
    log: [], acts: null, clock: null, over: false, startAt: Date.now(), st, turnEv: [], puzzle: opts.puzzle || null, undo: [], assisted: false,
    rec: { seed, decks, chaos: !!opts.chaos, fog: vsBot(opts.mode), boss: opts.boss || null, botMana: opts.botMana || 0, human: opts.human || 'w', mulls: { w: [], b: [] }, actions: [] } };
  show('game');
  window.dispatchEvent(new Event('resize'));
  setBack(() => leaveGame());
  view.flip = bottomSide() === 'b'; view.viewer = G.mode === 'local' ? null : G.human; view.showTraps = G.mode === 'local' ? 'all' : 'own';
  view.sideSkin = null;
  resetView(st);
  renderHUD(); renderChaos(); setReplayBar(false);
  playMusic('game');
  if (vsBot(opts.mode) || opts.mode === 'local') {
    for (const s of opts.mode === 'local' ? ['w', 'b'] : [G.human]) {
      if (opts.mode === 'local') { view.flip = s === 'b'; await passScreen(s, 'Выбор стартовой руки'); }
      const marked = await mulliganScreen(st, s);
      if (marked.length) { st = mulligan(st, s, marked); G.rec.mulls[s] = marked; }
      G.st = st;
    }
  }
  const CL = { '3+2': [180000, 2000], '7+5': [420000, 5000], '15+10': [900000, 10000] }[settings.clock];
  if (CL && opts.mode === 'bot') G.clock = { w: CL[0], b: CL[0], inc: CL[1], tick: performance.now() };
  if (!st.started) { const r = start(st); G.st = r.state; } else G.st = st;
  view.setState(G.st); view.flip = bottomSide() === 'b';
  renderHUD();
  if (opts.mode === 'tutorial') await lessonIntro();
  if (opts.mode === 'puzzle') { if (!opts.quiet) await puzzleIntro(); view.glow = (G.puzzle.hint || 0) >= 2 ? hintSquares() : []; }
  else view.glow = [];
  nextTurn();
}

const emptyHints = () => ({ moves: [], caps: [], targets: [], zone: [], picked: [] });

function mulliganScreen(st, s, timeout = 0) {
  const marked = new Set();
  return new Promise(res => {
    const m = el('div', 'modal mull-modal'), box = el('div', 'box');
    box.innerHTML = `<h2>Стартовая рука</h2><p>Отметь карты, которые хочешь заменить. Это можно сделать один раз.</p>`;
    const row = el('div', 'mull');
    for (const c of st.hand[s]) {
      const d = el('div', 'mull-card', cardHTML(c.id) + `<small>${CARDS[c.id].cost} маны</small>`);
      d.onclick = () => { sfx('select'); haptic('select'); marked.has(c.uid) ? marked.delete(c.uid) : marked.add(c.uid); d.classList.toggle('x', marked.has(c.uid)); ok.textContent = marked.size ? `Заменить (${marked.size})` : 'Оставить'; };
      row.append(d);
    }
    const ok = el('button', 'btn hot', 'Оставить');
    ok.onclick = () => { sfx('card'); m.remove(); res([...marked]); };
    box.append(row, ok);
    if (timeout) { const t = el('p', 'muted'); box.append(t); const end = Date.now() + timeout; const iv = setInterval(() => { if (!m.isConnected) return clearInterval(iv); const left = Math.ceil((end - Date.now()) / 1000); t.textContent = `Осталось ${Math.max(0, left)} с`; if (left <= 0) { clearInterval(iv); m.remove(); res([...marked]); } }, 250); }
    m.append(box); $('#modals').append(m);
  });
}

function passScreen(side, sub = '') {
  return new Promise(res => {
    const m = el('div', 'modal pass', `<div class="box"><div class="pass-king ${side}"></div><h2>Ход ${side === 'w' ? 'белых' : 'чёрных'}</h2><p>${sub || 'Передай телефон сопернику'}</p><button class="btn hot">Я готов</button></div>`);
    m.querySelector('button').onclick = () => { sfx('select'); m.remove(); res(); };
    $('#modals').append(m);
  });
}

async function nextTurn() {
  if (!G || G.mode === 'online' || G.mode === 'replay') return;
  G.st = settle(G.st);
  G.acts = null;
  if (G.st.result) return endGame(G.st.result);
  view.setState(G.st); renderChaos();
  if (view.checkSq >= 0) { sfx('check'); haptic('warning'); view.text('Шах!', view.checkSq, '#ff3344', true); }
  if (G.mode === 'local') {
    G.busy = true; renderHUD(true);
    await passScreen(G.st.turn);
    view.flip = G.st.turn === 'b'; view.resize();
  }
  G.busy = false;
  renderHUD();
  if (vsBot(G.mode) && G.st.turn !== G.human) botTurn();
  else {
    if (G.mode === 'bot' && !G.st.pending) { G.undo.push({ st: G.st, log: G.log.length, acts: G.rec.actions.length }); if (G.undo.length > 60) G.undo.shift(); }
    sfx('turn'); setStatus(defaultStatus()); promptPending();
  }
}

function defaultStatus() {
  if (G.mode === 'tutorial') return LESSONS[G.lesson].hint;
  if (G.mode === 'puzzle') return 'Поставь мат за один ход';
  const S = G.st.turn, P = G.st.pending;
  if (P && P.side === S && isHumanTurn()) return { discard: 'Озарение: выбери карту, которую сбросить', march: 'Марш: нажми пешку, которая шагнёт вперёд', gift: 'Дар хаоса: выбери карту' }[P.k];
  if (G.mode === 'local') return `Ход ${S === 'w' ? 'белых' : 'чёрных'}${G.st.quick ? ': теперь ход' : ''}`;
  if (G.mode === 'online' && S !== G.human) return 'Ход соперника…';
  if (inCheck(G.st, S) && (G.mode === 'local' || S === G.human)) return 'Шах! Закрой короля: ход или карта, которая его защищает';
  return G.st.quick ? 'Теперь ход фигурой или ★ карта' : 'Твой ход: фигура или карта';
}
function setStatus(t, cls = '') { const s = $('#status'); s.textContent = t || ''; s.className = cls; }
function actions() { return G.acts || (G.acts = legalActions(G.st)); }

// Довыборы в рамках хода: сброс (Озарение), дар хаоса, шаг Марша.
async function promptPending() {
  const P = G && G.st.pending;
  if (!P || !isHumanTurn() || G.busy || P.side !== G.st.turn) return;
  if (P.k === 'discard' || P.k === 'gift') {
    const opts = P.k === 'discard' ? actions().filter(a => a.k === 'd') : actions().filter(a => a.k === 'g');
    const pick = await modal(`<h2>${P.k === 'discard' ? 'Озарение' : 'Дар хаоса'}</h2><p>${P.k === 'discard' ? 'Выбери карту, которую сбросить.' : 'Выбери карту себе в руку.'}</p>`, [], {
      onOpen: (box, done) => {
        const row = el('div', 'mull pick');
        for (const a of opts) { const d = el('div', 'mull-card', cardHTML(a.id) + `<small>${CARDS[a.id].name}</small>`); d.onclick = () => { sfx('card'); done(a); }; row.append(d); }
        box.append(row);
      } });
    if (pick && G && G.st.pending) doAction(pick);
    return;
  }
  if (P.k === 'march') {
    const steps = actions().filter(a => a.k === 'p');
    view.hints = emptyHints(); view.hints.targets = steps.map(a => a.from); view.hints.moves = steps.map(a => a.to);
    const box = $('#cardinfo');
    box.innerHTML = `<div class="ci-head"><b>Марш</b></div><p>Нажми пешку — она шагнёт на клетку вперёд. Или пропусти.</p>`;
    const row = el('div', 'btns'), skip = el('button', 'btn ghost', 'Пропустить');
    skip.onclick = () => doAction({ k: 'skip' }); row.append(skip); box.append(row); box.classList.add('open');
  }
}

// ---------- HUD ----------
function hudName(s) {
  if (G.mode === 'tower') return s === G.human ? (profile.name || userName() || 'Ты') : `${G.opts.floor + 1}. ${FLOORS[G.opts.floor].name}`;
  if (G.mode === 'draft') return s === G.human ? (profile.name || userName() || 'Ты') : `Драфт · ${LEVEL_RU[G.level]}`;
  if (G.mode === 'watch') return G.players?.[s]?.name || (s === 'w' ? 'Белые' : 'Чёрные');
  if (G.mode === 'bot') return s === G.human ? (profile.name || userName() || 'Ты') : `Бот · ${LEVEL_RU[G.level]}`;
  if (G.mode === 'tutorial') return s === 'w' ? 'Ты' : 'Соперник';
  if (G.mode === 'puzzle') return s === G.human ? 'Ты' : 'Соперник (без карт)';
  if (G.mode === 'online') { const I = s === G.human ? G.me : G.oppInfo; return `${I?.badge ? I.badge + ' ' : ''}${I?.name || (s === G.human ? 'Ты' : 'Соперник')}${I?.title ? ' · ' + I.title : ''}`; }
  if (G.mode === 'replay') return G.names?.[s] || (s === 'w' ? 'Белые' : 'Чёрные');
  return s === 'w' ? 'Белые' : 'Чёрные';
}
function hudAvatar(s) {
  if (G.mode === 'watch') return G.players?.[s]?.avatar ?? null;
  if (G.mode === 'tower') return s === G.human ? profile.avatar : [4, 9, 10, 7, 8, 6, 5, 2, 0, 3, 11, 1, 6, 7, 3][G.opts.floor];
  if (vsBot(G.mode)) return s === G.human ? profile.avatar : BOT_AVATAR[G.level];
  if (G.mode === 'online') return s === G.human ? profile.avatar : (G.oppInfo?.avatar ?? 3);
  return null;
}
function renderHUD(hideHand = false) {
  if (!G) return;
  const st = G.st, bot = bottomSide(), top = opp(bot);
  for (const [pos, s] of [['top', top], ['bot', bot]]) {
    const hud = $(`#hud-${pos}`), av = hudAvatar(s), avEl = hud.querySelector('.av');
    avEl.className = `av ${s}`; avEl.style.backgroundImage = av === null ? '' : `url(${avatarURL(av)})`; avEl.classList.toggle('pic', av !== null);
    hud.querySelector('.name').textContent = hudName(s);
    const mana = hud.querySelector('.mana'), n = st.mana[s], prev = Number(mana.dataset.n ?? -1);
    if (prev !== n) { // меняем только кристаллы, а «прыгают» лишь новые
      mana.dataset.n = n; mana.innerHTML = '';
      for (let i = 0; i < Math.min(9, Math.max(7, n)); i++) mana.append(el('i', i < n ? (i >= 7 ? 'on over' : 'on') + (prev >= 0 && i >= prev ? ' pop' : '') : ''));
      if (n > 9) mana.append(el('b', 'mana-more', `+${n - 9}`));
    }
    hud.querySelector('.backs').textContent = pos === 'top' ? `🂠 ${st.hand[s].length}` : `колода ${st.deck[s].length}`;
    hud.classList.toggle('active', st.started && !st.result && st.turn === s);
  }
  $('#hud-top').classList.toggle('offline', !!(G.mode === 'online' && G.oppOffline));
  $('#btn-emote').style.display = G.mode === 'online' ? '' : 'none';
  $('#btn-last').style.display = canReplayTurn() ? '' : 'none';
  const hb = $('#btn-hint'); hb.style.display = G.mode === 'puzzle' ? '' : 'none';
  if (G.mode === 'puzzle') { const h = G.puzzle.hint || 0; hb.dataset.n = h ? `${h}/3` : ''; hb.classList.toggle('used', h > 0); }
  renderClock();
  renderHand(hideHand);
}

function renderClock() {
  if (!G) return;
  for (const [pos, s] of [['top', opp(bottomSide())], ['bot', bottomSide()]]) {
    const c = $(`#hud-${pos} .clock`);
    if (!G.clock) { c.textContent = ''; continue; }
    let ms = G.clock[s];
    if (G.mode === 'online' && G.clock.run === s && !G.over) ms -= performance.now() - G.clock.at;
    ms = Math.max(0, ms);
    const m = Math.floor(ms / 60000), sec = Math.floor(ms / 1000) % 60;
    c.textContent = `${m}:${String(sec).padStart(2, '0')}`;
    c.classList.toggle('low', ms < 30000);
  }
}

function renderChaos() {
  const bar = $('#chaosbar'), C = G && G.st.chaos;
  if (!C) { bar.innerHTML = ''; bar.className = ''; return; }
  const ply = G.st.ply, chips = [];
  if (C.ann) chips.push(`<span class="chip warn">⚠ Через круг: ${CHAOS[C.ann.id]?.name || 'хаос'}</span>`);
  if (C.lava > ply) chips.push(`<span class="chip lava">Лава · ${Math.ceil((C.lava - ply) / 2)}</span>`);
  if (C.cavalry > ply) chips.push('<span class="chip">Кавалерия</span>');
  if (C.silence > ply) chips.push('<span class="chip">Тихий час</span>');
  if (C.fog > ply) chips.push('<span class="chip">Туман</span>');
  if (C.haste?.[G.st.turn]) chips.push('<span class="chip">Ускорение: 2 ⚡</span>');
  if (!chips.length) { const left = Math.ceil((C.next - ply) / 2); chips.push(`<span class="chip dim">Хаос через ${left} кр.</span>`); }
  bar.innerHTML = chips.join(''); bar.className = 'on';
}

// Рука перерисовывается только когда что-то изменилось; во время анимаций карты не исчезают, а гаснут.
let handKey = '';
function renderHand(hide = false) {
  const hand = $('#hand');
  const s = G ? bottomSide() : 'w', st = G && G.st;
  const visible = G && G.mode !== 'replay' && (G.mode === 'local' || s === G.human) && !(hide && G.mode === 'local' && G.st.turn !== s);
  const myTurn = visible && !hide && isHumanTurn() && st.turn === s && !G.busy && !st.pending;
  const playable = new Set(myTurn ? actions().filter(a => a.k === 'c').map(a => a.id) : []);
  const cards = visible ? st.hand[s].filter(c => CARDS[c.id]) : [];
  const key = [s, hide, G && G.sel && G.sel.uid, G && G.mode === 'tutorial' && G.lesson, G && G.mode === 'puzzle' && (G.puzzle.hint || 0), ...cards.map(c => c.uid + ':' + (c.ch || 0) + (playable.has(c.id) ? '+' : '-'))].join('|');
  hand.classList.toggle('locked', !!hide);
  if (key === handKey && hand.children.length === cards.length) return;
  handKey = key;
  hand.innerHTML = '';
  for (const c of cards) {
    const d = el('div', 'slot', cardHTML(c.id, playable.has(c.id) || hide ? 'ok' : 'off', c.ch || 0));
    const card = d.firstChild;
    if (G.sel && G.sel.kind === 'card' && G.sel.uid === c.uid) card.classList.add('sel');
    if (G.mode === 'tutorial' && LESSONS[G.lesson].focus === c.id && !G.sel) card.classList.add('focus');
    if (G.mode === 'puzzle' && (G.puzzle.hint || 0) >= 1 && puzzleLine()?.some(a => a.k === 'c' && a.uid === c.uid) && !G.sel) card.classList.add('focus');
    let pressT = null, long = false;
    card.onpointerdown = () => { long = false; pressT = setTimeout(() => { long = true; showCardInfo(c.id, null, false, c.ch || 0); haptic('select'); }, 450); };
    card.onpointerup = card.onpointerleave = () => clearTimeout(pressT);
    card.onclick = () => { if (!long) onCard(c, playable.has(c.id)); };
    hand.append(d);
  }
}

function showCardInfo(id, prompt, confirm = false, ch = null) {
  const box = $('#cardinfo');
  if (ch === null && G && G.sel && G.sel.kind === 'card' && G.sel.id === id) ch = G.st.hand[G.st.turn].find(c => c.uid === G.sel.uid)?.ch || 0;
  box.innerHTML = cardInfoHTML(id, ch) + (prompt ? `<div class="ci-prompt">${prompt}</div>` : '');
  const row = el('div', 'btns');
  if (confirm) { const b = el('button', 'btn hot', `Сыграть «${CARDS[id].name}»`); b.onclick = () => { const a = G.sel?.ready; if (a) doAction(a); }; row.append(b); }
  const x = el('button', 'btn ghost', prompt ? 'Отмена' : 'Закрыть'); x.onclick = () => { clearSel(); sfx('select'); };
  row.append(x); box.append(row);
  box.classList.add('open');
}
function hideCardInfo() { $('#cardinfo').classList.remove('open'); }

function clearSel() {
  if (!G) return;
  G.sel = null; view.sel = -1; view.hints = emptyHints(); hideCardInfo(); renderHand();
  if (isHumanTurn() && !G.busy) { setStatus(defaultStatus()); if (G.st.pending?.k === 'march') promptPending(); }
}

// ---------- ввод ----------
function onCard(c, ok) {
  unlockAudio();
  if (!isHumanTurn() || G.busy || G.st.pending) { showCardInfo(c.id, null); return; }
  if (G.sel && G.sel.kind === 'card' && G.sel.uid === c.uid) { clearSel(); return; }
  if (!ok) {
    sfx('error'); haptic('error');
    const d = CARDS[c.id], C = G.st.chaos;
    const why = C && C.silence > G.st.ply ? 'Тихий час: карты молчат' : d.cost > G.st.mana[G.st.turn] ? `Не хватает маны: нужно ${d.cost}`
      : (d.type === 'quick' && G.st.quick ? 'Быстрая карта за этот ход уже сыграна' : inCheck(G.st, G.st.turn) ? 'Шах: эта карта сейчас не защитит короля' : 'Сейчас нет подходящих целей');
    showCardInfo(c.id, why); setStatus(why, 'warn');
    return;
  }
  sfx('select'); haptic('select');
  G.sel = { kind: 'card', id: c.id, uid: c.uid, ch: c.ch || 0, picks: [], ready: null };
  view.sel = -1;
  const cands = cardCands();
  if (cands.length && cands[0].tg.length === 0) { // карта без цели
    const a = cands[0];
    if (CARDS[a.id].type === 'quick' || settings.confirm === false) return doAction(a);
    G.sel.ready = a;
  }
  updateCardHints();
  renderHand();
}

// Для карт с зарядом берём варианты именно того заряда, что у выбранной копии.
function cardCands() {
  const hand = G.st.hand[G.st.turn], chOf = u => hand.find(c => c.uid === u)?.ch || 0;
  return actions().filter(a => a.k === 'c' && a.id === G.sel.id && (!CARDS[a.id].charge || chOf(a.uid) === G.sel.ch) && G.sel.picks.every((p, i) => a.tg[i] === p));
}

function updateCardHints() {
  const sel = G.sel, cands = cardCands(), step = sel.picks.length;
  view.hints = emptyHints();
  view.hints.picked = tgSquares(sel.picks);
  if (sel.ready) {
    view.hints.zone = sel.id === 'meteor' ? zone3(sel.ready.tg[0]) : sel.id === 'comet' ? zoneOf({ c: sel.ready.tg[0], shape: sel.ch >= 2 ? 'sq' : 'plus' }) : [];
    showCardInfo(sel.id, sel.ready.tg.length ? 'Нажми «Сыграть» или ту же клетку ещё раз' : 'Нажми «Сыграть»', true);
    setStatus(`«${CARDS[sel.id].name}» заменит твой ход`);
    return;
  }
  view.hints.targets = [...new Set(cands.map(a => a.tg[step]).filter(x => typeof x === 'number'))];
  let prompt = CARDS[sel.id].prompt[step] || 'Выбери цель';
  if (inCheck(G.st, G.st.turn)) prompt = `Шах! Подсвечено только то, что защищает короля. ${prompt}`;
  showCardInfo(sel.id, prompt); setStatus(prompt);
}

async function pickType(cands, step) {
  const types = [...new Set(cands.map(a => a.tg[step]))];
  const s = G.st.turn === 'w' ? 'white' : 'black', names = { Q: 'queen', N: 'knight', R: 'rook', B: 'bishop' };
  return modal('<h2>Кем стать?</h2>', types.map(t => [`<img class="promo" src="assets/pieces/${s}_${names[t]}.png"><small>${PIECE_NAME[t]}</small>`, t]), { cls: 'promo-modal', row: true });
}

async function onSquare(i) {
  unlockAudio();
  if (!G || !isHumanTurn() || G.busy || i < 0) return;
  const st = G.st, sel = G.sel;
  if (st.pending) {
    if (st.pending.k === 'march') {
      const a = actions().find(x => x.k === 'p' && (x.from === i || x.to === i));
      if (a) return doAction(a);
      sfx('error'); setStatus('Выбери подсвеченную пешку или «Пропустить»', 'warn');
    }
    return;
  }
  if (sel && sel.kind === 'card') {
    if (sel.ready) {
      const sq = tgSquares(sel.ready.tg);
      if (sq.length && sq[sq.length - 1] === i) return doAction(sel.ready);
      if (!sel.ready.tg.length) return;
      sel.ready = null; sel.picks = [];
    }
    const cands = cardCands(), step = sel.picks.length;
    if (cands.some(a => a.tg[step] === i)) {
      sel.picks.push(i); sfx('select'); haptic('select');
      let rest = cardCands();
      if (rest.length && typeof rest[0].tg[sel.picks.length] === 'string') {
        const t = await pickType(rest, sel.picks.length);
        if (!t || !G || G.sel !== sel) return clearSel();
        sel.picks.push(t); rest = cardCands();
      }
      const full = rest.find(a => a.tg.length === sel.picks.length);
      if (full) {
        if (CARDS[full.id].type === 'quick' || settings.confirm === false) return doAction(full);
        sel.ready = full;
      }
      updateCardHints();
    } else { sfx('error'); haptic('error'); setStatus('Сюда нельзя — выбери подсвеченную клетку', 'warn'); }
    return;
  }
  const moves = actions().filter(a => a.k === 'm');
  if (sel && sel.kind === 'piece') {
    const ms = moves.filter(m => m.from === sel.sq && m.to === i);
    if (ms.length) {
      if (ms.length > 1) return promoChoice(ms);
      return doAction(ms[0]);
    }
  }
  const p = st.board[i];
  if (p && p.s === st.turn) {
    const ms = moves.filter(m => m.from === i);
    if (!ms.length) {
      sfx('error');
      setStatus(st.frozen[p.id] !== undefined ? 'Фигура заморожена' : st.shackled?.[p.id] !== undefined ? 'Фигура в оковах' : inCheck(st, st.turn) ? 'Шах: эта фигура не может закрыть короля' : 'Этой фигурой ходить нельзя', 'warn');
      clearSelSoft(); return;
    }
    sfx('select'); haptic('select');
    G.sel = { kind: 'piece', sq: i };
    view.sel = i;
    view.hints = emptyHints();
    if (settings.hints !== false) {
      view.hints.moves = [...new Set(ms.filter(m => !m.cap).map(m => m.to))];
      view.hints.caps = [...new Set(ms.filter(m => m.cap).map(m => m.to))];
    }
    hideCardInfo(); renderHand();
    return;
  }
  clearSel();
}
function clearSelSoft() { G.sel = null; view.sel = -1; view.hints = emptyHints(); }

async function promoChoice(ms) {
  const s = G.st.turn === 'w' ? 'white' : 'black';
  const names = { Q: 'queen', N: 'knight', R: 'rook', B: 'bishop' };
  const t = await modal('<h2>Превращение</h2>', ms.map(m => [`<img class="promo" src="assets/pieces/${s}_${names[m.promo]}.png">`, m.promo]), { cls: 'promo-modal', row: true });
  const m = ms.find(x => x.promo === t);
  if (m) doAction(m);
}

// ---------- применение действий ----------
function describe(a, st) {
  if (!a) return '';
  if (a.k === 'm') {
    const p = st.board[a.from];
    if (a.castle) return a.castle === 'K' ? '0-0' : '0-0-0';
    return `${PIECE_RU[p?.t] || ''}${sqName(a.from)}${a.cap ? '×' : '–'}${sqName(a.to)}${a.promo ? '=' + PIECE_RU[a.promo] : ''}`;
  }
  if (a.k === 'c') { const sq = tgSquares(a.tg || []); return `${CARDS[a.id].type === 'quick' ? '⚡' : '★'}${CARDS[a.id].name}${sq.length ? ' ' + sq.map(sqName).join('→') : a.id === 'trap' ? ' (скрыто)' : ''}${a.tg && typeof a.tg[a.tg.length - 1] === 'string' ? ' ' + PIECE_NAME[a.tg[a.tg.length - 1]] : ''}`; }
  if (a.k === 'p') return `марш ${sqName(a.from)}–${sqName(a.to)}`;
  if (a.k === 'd') return `сброс: ${CARDS[a.id]?.name || 'карта'}`;
  if (a.k === 'g') return `дар хаоса${CARDS[a.id] ? ': ' + CARDS[a.id].name : ''}`;
  if (a.k === 'skip') return 'марш пропущен';
  return '';
}

async function doAction(a) {
  if (!G || G.busy) return;
  if (G.mode === 'online') return sendOnline(a);
  G.busy = true;
  const prev = G.st, side = prev.turn;
  clearSelSoft(); hideCardInfo();
  G.log.push({ side, n: prev.tn[side], txt: describe(a, prev) });
  G.rec.actions.push(a);
  if (a.k === 'c' && CARDS[a.id].charge && humanSide(side) && (prev.hand[side].find(c => c.uid === a.uid)?.ch || 0) >= 3) { const r = onCharged(); if (r.length) { syncMeta(); toast('🏆 Полный заряд'); } }
  const { state, events } = apply(prev, a);
  recordTurn(side, prev, events, state);
  G.turnEv = (G.turnEv || []).concat(events);
  renderHand(true);
  await playEvents(events, side);
  if (!G) return;
  G.st = state; G.acts = null;
  if (state.turn !== side && G.clock) G.clock[side] += G.clock.inc;
  view.setState(state); renderChaos();
  if (state.turn !== side) {
    const all = G.turnEv; G.turnEv = [];
    if (G.mode === 'tutorial') return lessonCheck(state, all);
    if (G.mode === 'puzzle') return puzzleCheck(state);
  }
  if (state.turn === side) {
    G.busy = false; renderHUD();
    if (vsBot(G.mode) && side !== G.human) botTurn(); else { setStatus(defaultStatus()); promptPending(); }
    return;
  }
  renderHUD();
  nextTurn();
}

// Прошлый ход соперника: состояние перед последним действием, которое передало ему ход, и все события до текущего момента.
// В начало попадает хвост собственного хода (skip — до события 'turn'), его прокручиваем мгновенно; так в повтор входят
// и эффекты начала хода (метеоры, боссы, хаос), и то, что случилось в начале нашего хода.
function recordTurn(side, before, events, after) {
  if (!G.turnRec || G.turnRec.side !== side) G.turnRec = { side, st: before, ev: [], skip: 0 };
  G.turnRec.ev.push(...events);
  if (after.turn === side) return;
  if (G.mode === 'local' || side !== G.human) G.lastTurn = G.turnRec;
  const k = events.findIndex(e => e.t === 'turn' && e.side === after.turn);
  G.turnRec = { side: after.turn, st: before, ev: events.slice(), skip: k < 0 ? events.length : k };
}
function canReplayTurn() { return !!(G && G.lastTurn && !G.over && !G.st.result && ['bot', 'tower', 'draft', 'online', 'local'].includes(G.mode)); }
async function replayLastTurn() {
  if (!canReplayTurn()) return toast('Соперник ещё не ходил', 'warn');
  if (G.busy || !isHumanTurn()) return toast('Посмотреть можно в свой ход', 'warn');
  const g = G, R = G.lastTurn, cur = G.st;
  let done; G.replay = new Promise(r => { done = r; });
  G.busy = true; clearSelSoft(); hideCardInfo(); renderHand(true);
  $('#btn-last').classList.add('on');
  setStatus('Повтор прошлого хода…', 'think');
  G.st = R.st; view.setState(R.st); renderHUD(true);
  const sp = view.speed; view.speed = 60; setSound(false);
  try {
    for (const ev of R.ev.slice(0, R.skip)) {
      if (G !== g) break;
      if (ev.t === 'card' || ev.t === 'mana') { G.st = { ...G.st, mana: { ...G.st.mana, [ev.side]: G.st.mana[ev.side] + (ev.t === 'card' ? -CARDS[ev.id].cost : ev.d) } }; continue; }
      if (['draw', 'burn', 'discard', 'boss', 'chaosAnn'].includes(ev.t)) continue;
      await view.handle(ev);
    }
  } finally { view.speed = sp; setSound(settings.sound); }
  if (G === g) { renderHUD(true); await sleep(300); await playEvents(R.ev.slice(R.skip), R.side); await sleep(500); }
  $('#btn-last').classList.remove('on');
  g.replay = null; done();
  if (G !== g) return;
  G.st = cur; view.setState(cur); G.busy = false; renderHUD(); renderChaos();
  setStatus(defaultStatus()); promptPending();
}

async function playEvents(events, actor) {
  for (const ev of events) {
    if (!G) return;
    if (ev.t === 'card') { sfx('card'); await flyCard(ev.id, ev.side); G.st = { ...G.st, mana: { ...G.st.mana, [ev.side]: G.st.mana[ev.side] - CARDS[ev.id].cost } }; renderHUD(true); continue; }
    if (ev.t === 'mana') {
      G.st = { ...G.st, mana: { ...G.st.mana, [ev.side]: G.st.mana[ev.side] + ev.d } };
      renderHUD(true);
      if (ev.why === 'rage') { sfx('rage'); floatHud(ev.side, `Ярость +${ev.d}`, 'rage'); await sleep(250); }
      else if (ev.why === 'ritual' || ev.why === 'chaos') { floatHud(ev.side, `+${ev.d} маны`, 'mana'); }
      else sfx('mana');
      continue;
    }
    if (ev.t === 'draw') { if (humanSide(ev.side)) { sfx('draw'); if (ev.gift) floatHud(ev.side, 'Дар хаоса!', 'mana'); } continue; }
    if (ev.t === 'burn') { floatHud(ev.side, 'Карта сгорела', 'rage'); continue; }
    if (ev.t === 'discard') { if (CARDS[ev.card?.id]) floatHud(ev.side, `Сброс: ${CARDS[ev.card.id].name}`, 'rage'); continue; }
    if (ev.t === 'boss') { sfx('chaos'); haptic('warning'); toast(ev.id === 'mirror' ? `${BOSSES.mirror.name} копирует «${CARDS[ev.card].name}»` : `${BOSSES[ev.id].name}: ${{ ice: 'лёд!', necro: 'павшие встают!', bomber: 'метеор летит!' }[ev.id]}`, 'warn'); continue; }
    if (ev.t === 'chaosAnn') { renderChaos(); toast(`⚠ Через круг хаос: ${CHAOS[ev.id].name}`, 'warn'); sfx('check'); }
    await view.handle(ev);
  }
}

async function chaosBanner(id) {
  const b = el('div', 'chaos-banner', `<div class="cb-title">ХАОС</div><div class="cb-name">${CHAOS[id].name}</div><div class="cb-text">${CHAOS[id].text}</div>`);
  $('#game').append(b);
  await sleep(1800 / (view.speed || 1));
  b.classList.add('out'); setTimeout(() => b.remove(), 300);
  if (G) { G.st = { ...G.st }; renderChaos(); }
}

function floatHud(side, txt, cls) {
  const pos = side === bottomSide() ? 'bot' : 'top', h = $(`#hud-${pos}`);
  const f = el('div', 'float ' + cls, txt); h.append(f); setTimeout(() => f.remove(), 1300);
}

function flyCard(id, side) {
  return new Promise(res => {
    const mine = humanSide(side) || G.mode === 'tutorial' || G.mode === 'replay';
    const f = el('div', 'fly ' + (mine ? 'mine' : 'theirs'), cardHTML(id) + (mine ? '' : `<div class="fly-text">${cardInfoHTML(id)}</div>`));
    $('#game').append(f);
    const ms = (mine ? 650 : 1500) / view.speed;
    f.style.animationDuration = ms + 'ms';
    setTimeout(() => { f.remove(); res(); }, ms);
  });
}

// ---------- бот ----------
function getWorker() {
  if (worker !== null) return worker;
  try {
    worker = new Worker(new URL('../bot/worker.js', import.meta.url), { type: 'module' });
    worker.onerror = () => { worker = false; };
  } catch { worker = false; }
  return worker;
}
async function askBot(st, level) {
  const w = getWorker();
  if (w) {
    const id = ++workerReq;
    const r = await new Promise(res => {
      const on = e => { if (e.data.id === id) { w.removeEventListener('message', on); res(e.data.action); } };
      w.addEventListener('message', on);
      w.postMessage({ state: st, level, id });
      setTimeout(() => res(undefined), 15000);
    });
    if (r) return r;
  }
  const { chooseAction } = await import('../bot/bot.js');
  await sleep(30);
  return chooseAction(st, level);
}
async function botTurn() {
  G.busy = true; G.botThinking = true;
  setStatus(G.st.pending ? 'Бот выбирает' : 'Бот думает', 'think');
  const t0 = Date.now(), st = G.st, g = G;
  const a = await askBot(st, G.level);
  await sleep(Math.max(0, (st.pending ? 300 : settings.botFast ? 120 : 650) - (Date.now() - t0)));
  if (G !== g) return;
  G.botThinking = false;
  if (!G || G.st !== st || G.st.result) return;
  G.busy = false;
  if (!a) return;
  setStatus('');
  await doAction(a);
}

// ---------- конец партии ----------
async function endGame(result, extra = {}) {
  if (!G || G.over) return;
  G.over = true; G.busy = true;
  G.st = { ...G.st, result };
  hideCardInfo(); renderHUD(true);
  const loser = result.winner ? opp(result.winner) : null;
  if (result.reason === 'mate' && loser) { const k = kingSq(G.st, loser); if (k >= 0) await view.tipKing(k); }
  const vsMode = vsBot(G.mode) || G.mode === 'online';
  const humanWon = vsMode ? result.winner === G.human : !!result.winner;
  let title = 'Ничья';
  if (result.winner) title = vsMode ? (humanWon ? 'Победа!' : 'Поражение') : `Победили ${result.winner === 'w' ? 'белые' : 'чёрные'}!`;
  if (result.winner && humanWon) { sfx('win'); haptic('success'); view.confetti(); } else if (result.winner) { sfx('lose'); haptic('error'); }
  const stats = extra.stats || G.st.stats;
  if (G.mode === 'bot') {
    if (!result.winner) progress.draws++; else if (humanWon) progress.wins[G.level]++; else progress.losses[G.level]++;
    saveProgress();
  }
  if (vsMode || G.mode === 'local') {
    countPlayed(G.mode === 'local' ? { played: { ...stats.w.played, ...Object.fromEntries(Object.entries(stats.b.played).map(([k, v]) => [k, v + (stats.w.played[k] || 0)])) } } : stats[G.human]);
    addHistory({ date: Date.now(), mode: G.mode, level: G.level, human: G.human, result, plies: G.st.ply, names: { w: hudName('w'), b: hudName('b') },
      ...(G.mode === 'online' ? { online: G.gid } : { rec: G.rec }) });
  }
  if (G.mode === 'online') { try { localStorage.removeItem('cc_online'); } catch { /* */ } if (net?.lastWelcome) net.lastWelcome.active = null; }
  G.rewards = [];
  if (vsMode) {
    G.rewards = onGameEnd({ assisted: G.assisted, mode: G.mode, won: humanWon, draw: !result.winner, chaos: !!G.st.chaos, stats: stats[G.human], level: G.level,
      plies: G.st.ply, mate: result.reason === 'mate', floor: G.opts?.floor, draft: G.mode === 'draft' });
    if (G.mode === 'draft') G.rewards.push(...draftAfterGame(humanWon));
    if (extra.rating) { G.rewards.push({ t: 'rating', ...extra.rating }); G.rewards.push(...onLeague(extra.rating.league)); }
    syncMeta(); track('game_end', { mode: G.mode, won: humanWon, plies: G.st.ply, level: G.level });
  }
  await sleep(500);
  resultModal(result, humanWon, title, stats);
}

// Яркий момент: победа или две и больше фигур, снятых картами, — тогда «Поделиться» выходит на первый план.
function brightLine(result, humanWon, stats) {
  const side = G.mode === 'local' ? (result.winner || 'w') : G.human, st = stats[side] || {};
  const cardKills = Object.entries(st.kills || {}).filter(([c]) => c !== 'capture').reduce((a, [, v]) => a + v, 0);
  return (humanWon || cardKills >= 2) && ['bot', 'tower', 'draft', 'online', 'local'].includes(G.mode) ? highlight(st) : '';
}
async function resultModal(result, humanWon, title, stats) {
  const s = stats, moves = Math.ceil(G.st.ply / 2), bright = brightLine(result, humanWon, stats);
  const again = [G.mode === 'tower' ? (humanWon && G.opts.floor < FLOORS.length - 1 ? 'Следующий этаж' : 'Ещё раз') : G.mode === 'draft' ? 'К драфту' : 'Реванш', 'again', bright ? '' : 'hot'];
  const share = [bright ? '📣 Похвастаться' : 'Поделиться', 'share', bright ? 'hot' : ''];
  const r = await modal(`<h2 class="${humanWon ? 'win' : result.winner ? 'lose' : ''}">${title}</h2><p>${REASON[result.reason] || ''}</p>${bright ? `<p class="hl-line">✨ ${esc(bright)}</p>` : ''}
    <table class="sum"><tr><th></th><th>Белые</th><th>Чёрные</th></tr>
    <tr><td>Сыграно карт</td><td>${s.w.cards}</td><td>${s.b.cards}</td></tr>
    <tr><td>Уничтожено фигур</td><td>${s.w.caps}</td><td>${s.b.caps}</td></tr></table>
    <p class="muted">Ходов: ${moves}${G.st.chaos ? ' · режим «Хаос»' : ''}</p>${rewardsHTML(G.rewards)}`,
  [...(bright ? [share, again] : [again, share]), ['Повтор партии', 'replay'], ['Журнал', 'log'], ['В меню', 'menu', 'ghost']]);
  if (r === 'log') { await showLog(); return resultModal(result, humanWon, title, stats); }
  if (r === 'share') { await shareResult(result, humanWon, title, stats); return resultModal(result, humanWon, title, stats); }
  if (r === 'replay') return history[0] && openReplay(history[0]);
  if (r === 'again') {
    if (G.mode === 'online') return onlineMenu();
    if (G.mode === 'tower') return towerFloor(humanWon ? Math.min(meta.tower, FLOORS.length - 1) : G.opts.floor);
    if (G.mode === 'draft') return draftMenu();
    if (G.mode === 'bot') return newGame({ ...G.opts, human: opp(G.human) });
    return newGame({ mode: G.mode, chaos: G.opts.chaos });
  }
  G = null; show('menu');
}

async function shareResult(result, humanWon, title, stats) {
  const side = G.mode === 'local' ? (result.winner || 'w') : G.human;
  const line = highlight(stats[side]), turns = Math.ceil(G.st.ply / 2);
  const sub = G.mode === 'bot' ? `против бота «${LEVEL_RU[G.level]}»` : G.mode === 'online' ? `против ${G.oppInfo?.name || 'соперника'}` : 'вдвоём на одном экране';
  const ttl = G.mode === 'local' ? title.replace('!', '') : humanWon ? 'Победа' : result.winner ? 'Поражение' : 'Ничья';
  const blob = await resultCard({ title: ttl, turns, line, sub, win: humanWon, A, avatar: A.avatars[profile.avatar] });
  await shareFlow({ blob, kind: 'result', param: await refParam(), text: shareText({ title: ttl, turns, line, link: '' }) + ' Сыграем?' });
}

// ---------- ссылки и «Поделиться» ----------
// Свой id игрока (для ссылок-приглашений): из онлайна или с сервера.
async function myPid() {
  try { const c = localStorage.getItem('cc_pid'); if (c) return c; } catch { /* */ }
  const pid = net?.lastWelcome?.pid || (await api('/api/profile', { token: deviceToken(), initData: initData() }).catch(() => ({}))).pid;
  if (pid) try { localStorage.setItem('cc_pid', pid); } catch { /* */ }
  return pid || null;
}
const refParam = async () => { const pid = await myPid(); return pid ? `ref_${pid}` : ''; };
// Ссылка на игру: Mini App / бот с параметром, без Telegram-бота — адрес сайта.
async function linkFor(param) {
  const base = await serverBase().catch(() => '');
  if (base && !('tg' in cfg)) try { cfg = { ...cfg, ...(await api('/api/config')) }; } catch { /* без настроек — ссылка на сайт */ }
  return gameLink(param, cfg.tg, base || location.origin);
}
async function blobURL(blob) { return new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(''); r.readAsDataURL(blob); }); }
// Окно «Поделиться»: в Telegram — карточка с кнопкой игры в любой чат (shareMessage) или ссылка; вне Telegram — системное меню или копирование.
async function shareFlow({ blob = null, kind, param = '', text }) {
  const link = await linkFor(param), url = blob ? URL.createObjectURL(blob) : '';
  const file = blob && new File([blob], 'chaos-chess.png', { type: 'image/png' });
  track('share_open', { kind });
  await modal(`<h2>Поделиться</h2>${url ? `<img class="share-img" src="${url}" alt="результат">` : ''}<p class="muted">${esc(text)}</p><p class="link-box">${esc(link)}</p>`, [], {
    onOpen: (box, done) => {
      const row = el('div', 'btns');
      const add = (label, fn, cls = '') => { const b = el('button', 'btn ' + cls, label); b.onclick = () => { sfx('select'); fn(b); }; row.append(b); };
      const viaUrl = () => { track('share', { kind, via: 'tg_url' }); openLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`); };
      if (inTelegram) {
        if (blob && canShareMessage()) add('Отправить карточку в чат', async b => {
          b.disabled = true; b.textContent = 'Готовим…';
          const r = await api('/api/share', { initData: initData(), png: await blobURL(blob), caption: `${text}\n${link}`, param }).catch(() => ({}));
          b.disabled = false; b.textContent = 'Отправить карточку в чат';
          if (!r.id) return viaUrl();
          const ok = await shareMessage(r.id); track('share', { kind, via: 'tg_card', ok });
          if (ok) toast('Отправлено!');
        }, 'hot');
        add('Отправить ссылкой', viaUrl, blob && canShareMessage() ? '' : 'hot');
      } else if (navigator.share) {
        add('Поделиться', () => {
          const data = file && navigator.canShare?.({ files: [file] }) ? { files: [file], text: `${text} ${link}` } : { text, url: link };
          navigator.share(data).then(() => track('share', { kind, via: 'web_share' })).catch(() => {});
        }, 'hot');
      } else add('Отправить в Telegram', viaUrl, 'hot');
      add('Скопировать ссылку', b => { navigator.clipboard?.writeText(`${text} ${link}`).then(() => { b.textContent = 'Скопировано ✔'; track('share', { kind, via: 'copy' }); }).catch(() => { b.textContent = 'Не вышло — выдели ссылку выше'; }); });
      if (url) add('Скачать картинку', () => { const a = document.createElement('a'); a.href = url; a.download = 'chaos-chess.png'; a.click(); });
      add('Назад', () => done(null), 'ghost');
      box.append(row);
    } });
}
// Позвать друга: ссылка-приглашение и ступени наград.
async function inviteMenu() {
  let d = {};
  try { d = await api('/api/profile', { token: deviceToken(), initData: initData() }); } catch { /* офлайн */ }
  if (d.owned) { setPaid(d.owned); applySettings(); }
  const n = d.friends || 0, give = t => [t.title && `титул «${t.title}»`, t.board && `доска «${BOARDS[t.board]}»`, t.skin && `скин «${SKINS[t.skin]}»`].filter(Boolean).join(', ');
  const r = await modal(`<h2>Позвать друга</h2><p>Друг заходит по твоей ссылке и играет первую партию — вы <b>оба</b> получаете подарок: ${give(REF_INVITEE)}.</p>
    <div class="ref-tiers">${REF_TIERS.map(t => `<div class="${n >= t.n ? 'got' : ''}">${n >= t.n ? '✔' : '·'} ${t.n} ${t.n === 1 ? 'друг' : t.n < 5 ? 'друга' : 'друзей'}: ${give(t)}</div>`).join('')}</div>
    <p class="muted">Друзей уже в игре: <b>${n}</b>. Засчитываются новые игроки из Telegram, каждый один раз.</p>`,
  [['Отправить приглашение', 'share', 'hot'], ['Партия с другом онлайн', 'room'], ['Закрыть', null, 'ghost']], { dismiss: true });
  if (r === 'share') { await shareFlow({ kind: 'invite', param: d.pid ? `ref_${d.pid}` : await refParam(), text: 'Chaos Chess — шахматы с заклинаниями: Метеор, Крюк, Заморозка. Сыграем? Зайди по ссылке — получим подарок оба 🎁' }); return inviteMenu(); }
  if (r === 'room') return createRoom();
}

async function showLog() {
  const rows = [];
  for (const e of G.log) rows.push(`<div class="logrow ${e.side}"><span>${e.side === 'w' ? '○' : '●'} ${e.n ?? ''}</span>${esc(e.txt)}</div>`);
  await modal(`<h2>Журнал</h2><div class="log">${rows.join('') || '<p class="muted">Пока пусто</p>'}</div>`, [['Закрыть', null]], { dismiss: true });
}

// Меню паузы: набор пунктов зависит от режима.
async function leaveGame() {
  if (!G) return show('menu');
  if (G.mode === 'replay') { stopReplay(); G = null; return show('menu'); }
  if (G.mode === 'watch') { net?.send({ t: 'unwatch' }); G = null; return show('menu'); }
  if (G.over) { G = null; return show('menu'); }
  const m = G.mode, online = m === 'online';
  const canUndo = m === 'bot' && G.undo && G.undo.length && !G.busy && G.st.turn === G.human;
  const items = [['Продолжить', 'go', 'hot']];
  if (m === 'bot') items.push([`Отменить ход${canUndo ? '' : '<small>доступно в свой ход</small>'}`, 'undo']);
  if (['bot', 'local', 'tower', 'tutorial', 'puzzle'].includes(m)) items.push([m === 'tower' ? 'Начать этаж заново' : m === 'tutorial' ? 'Начать урок заново' : m === 'puzzle' ? 'Начать головоломку заново' : 'Начать заново', 'restart']);
  if (m === 'bot') items.push([`Сложность: ${LEVEL_RU[G.level]}<small>сменить и начать заново</small>`, 'level']);
  if (m === 'tower') items.push([`Сложность башни: ${TDIFF_RU[G.opts.diff || 'normal']}<small>соперник: ${LEVEL_RU[G.level]} · сменить и начать этаж заново</small>`, 'tdiff']);
  if (m === 'puzzle') items.push([`Подсказка${G.puzzle.hint ? ` (открыто ${G.puzzle.hint}/3)` : ''}`, 'hint']);
  if (online) items.push(['Предложить ничью', 'draw'], ['Позвать зрителя', 'watch']);
  items.push(['Настройки', 'settings']);
  if (!['tutorial', 'puzzle'].includes(m)) items.push(['Журнал', 'log']);
  if (!['tutorial', 'puzzle'].includes(m)) items.push(['Сдаться', 'resign']);
  if (!online) items.push(['В меню', 'menu', 'ghost']);
  const sub = online ? '<p class="muted">Онлайн-партия не останавливается: часы идут.</p>' : m === 'draft' ? '<p class="muted">Драфт: перезапуска нет — каждая партия идёт в забег.</p>' : '';
  const r = await modal('<h2>Пауза</h2>' + sub, items, { dismiss: true, cls: 'pause' });
  if (!G) return;
  if (r === 'log') return showLog();
  if (r === 'settings') {
    await settingsMenu();
    if (G && G.mode === 'tower' && (settings.towerDiff || 'normal') !== (G.opts.diff || 'normal')) {
      const go = await modal(`<h2>Сменить сложность башни?</h2><p>Новая: ${TDIFF_RU[settings.towerDiff]}. Этаж начнётся заново.</p>`, [['Начать заново', true, 'hot'], ['Доиграть этот', false, 'ghost']]);
      if (go) { const fl = G.opts.floor, g = floorGame(fl, settings.towerDiff); return newGame({ mode: 'tower', floor: fl, diff: settings.towerDiff, level: g.level, human: Math.random() < 0.5 ? 'w' : 'b', botDeck: g.botDeck, chaos: g.chaos, boss: g.boss, botMana: g.botMana }); }
    }
    if (G && G.mode === 'bot' && settings.botLevel && settings.botLevel !== G.level) {
      const go = await modal(`<h2>Сменить сложность?</h2><p>Сейчас: ${LEVEL_RU[G.level]}. Новая: ${LEVEL_RU[settings.botLevel]}. Партия начнётся заново.</p>`, [['Начать заново', true, 'hot'], ['Доиграть эту', false, 'ghost']]);
      if (go) return newGame(botOpts(settings.botLevel, G.opts.side || G.human, G.opts.deckKey, G.opts.chaos));
    }
    return leaveGame();
  }
  if (r === 'undo') return undoMove();
  if (r === 'restart') return restartGame();
  if (r === 'hint') return puzzleHint();
  if (r === 'level') {
    const lvl = await modal('<h2>Сложность</h2><p class="muted">Партия начнётся заново.</p>', [...['novice', 'fighter', 'master'].map(l => [`${LEVEL_RU[l]}${l === G.level ? ' ✔' : ''}<small>${LEVEL_HINT[l]}</small>`, l, l === G.level ? 'hot' : '']), ['Отмена', null, 'ghost']], { dismiss: true });
    if (!lvl || !G) return;
    settings.botLevel = lvl; saveSettings();
    return newGame(botOpts(lvl, G.opts.side || G.human, G.opts.deckKey, G.opts.chaos));
  }
  if (r === 'tdiff') {
    const d = await modal('<h2>Сложность башни</h2><p class="muted">Этаж начнётся заново.</p>', [...['easy', 'normal', 'hard'].map(x => [`${TDIFF_RU[x][0].toUpperCase() + TDIFF_RU[x].slice(1)}${x === (G.opts.diff || 'normal') ? ' ✔' : ''}<small>${TDIFF_HINT[x]}</small>`, x, x === (G.opts.diff || 'normal') ? 'hot' : '']), ['Отмена', null, 'ghost']], { dismiss: true });
    if (!d || !G) return;
    settings.towerDiff = d; saveSettings();
    const fl = G.opts.floor, g = floorGame(fl, d);
    return newGame({ mode: 'tower', floor: fl, diff: d, level: g.level, human: Math.random() < 0.5 ? 'w' : 'b', botDeck: g.botDeck, chaos: g.chaos, boss: g.boss, botMana: g.botMana });
  }
  if (r === 'draw') { net.send({ t: 'drawOffer' }); toast('Ничья предложена'); return; }
  if (r === 'watch') {
    const base = (await serverBase().catch(() => '')) || location.origin, link = `${base}/?watch=${G.gid}`;
    return openLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Смотри мою партию в Chaos Chess вживую')}`);
  }
  if (r === 'resign') {
    if (!(await modal('<h2>Сдаться?</h2>', [['Сдаюсь', true], ['Играю дальше', false, 'ghost']]))) return;
    if (online) return net.send({ t: 'resign' });
    const loser = G.mode === 'local' ? G.st.turn : G.human;
    G.busy = true; return endGame({ winner: opp(loser), reason: 'resign' });
  }
  if (r === 'menu') {
    const sure = ['tutorial', 'puzzle'].includes(m) || await modal('<h2>Выйти в меню?</h2><p>Партия будет потеряна.</p>', [['Выйти', true], ['Остаться', false, 'ghost']]);
    if (sure) { G = null; show('menu'); }
  }
}

async function restartGame() {
  const m = G.mode;
  if (!['tutorial', 'puzzle'].includes(m) && !(await modal('<h2>Начать заново?</h2><p>Текущая партия не засчитается.</p>', [['Заново', true, 'hot'], ['Отмена', false, 'ghost']]))) return;
  track('restart', { mode: m });
  if (m === 'tutorial') return startLesson(G.lesson);
  if (m === 'puzzle') { const P = G.puzzle; return newGame({ mode: 'puzzle', human: P.turn, state: unpack(P), puzzle: P }); }
  if (m === 'bot') return newGame(botOpts(G.level, G.opts.side || G.human, G.opts.deckKey, G.opts.chaos));
  if (m === 'local') return newGame({ mode: 'local', chaos: G.opts.chaos });
  if (m === 'tower') return newGame({ ...G.opts });
}

// Отмена хода против бота: возврат к началу своего прошлого хода. Достижения за такую партию не даются.
function undoMove() {
  if (!G || G.mode !== 'bot' || G.busy || G.st.turn !== G.human) return toast('Отменить можно в свой ход', 'warn');
  let snap = G.undo.pop();
  if (snap && snap.st === G.st) snap = G.undo.pop();
  if (!snap) { G.undo.push({ st: G.st, log: G.log.length, acts: G.rec.actions.length }); return toast('Отменять нечего'); }
  G.st = snap.st; G.turnRec = G.lastTurn = null; G.log.length = snap.log; G.rec.actions.length = snap.acts; G.acts = null; G.assisted = true;
  G.undo.push(snap);
  clearSelSoft(); hideCardInfo(); closeModals();
  view.setState(G.st); view.last = null; renderHUD(); renderChaos();
  sfx('blink'); setStatus('Ход отменён — твой ход'); toast('Ход отменён');
}

// ---------- обучение ----------
function startLesson(i) {
  const L = LESSONS[i];
  newGame({ mode: 'tutorial', lesson: i, human: 'w', setup: L.setup });
}
async function lessonIntro() {
  const L = LESSONS[G.lesson];
  await modal(`<h2>Урок ${G.lesson + 1}. ${L.title}</h2><p class="pre">${L.intro}</p>`, [['Поехали!', true, 'hot']]);
}
async function lessonCheck(state, events) {
  const L = LESSONS[G.lesson], st2 = settle(state);
  const r = L.check(st2, events, st2.result);
  if (st2.result && st2.result.winner === 'w') { await view.tipKing(kingSq(st2, 'b')); }
  if (r.ok) {
    sfx('win'); haptic('success'); view.confetti();
    if (!progress.lessons.includes(L.id)) { progress.lessons.push(L.id); saveProgress(); }
    const last = G.lesson === LESSONS.length - 1;
    const b = await modal(`<h2 class="win">Отлично!</h2><p>${r.msg}</p>`, last ? [['Играть с ботом', 'bot', 'hot'], ['В меню', 'menu', 'ghost']] : [['Следующий урок', 'next', 'hot'], ['В меню', 'menu', 'ghost']]);
    if (b === 'next') return startLesson(G.lesson + 1);
    if (b === 'bot') return newGame({ mode: 'bot', level: 'novice', human: 'w', botDeck: PRESETS.core.deck });
    G = null; return show('menu');
  }
  sfx('lose'); haptic('error');
  const b = await modal(`<h2>Почти!</h2><p>${r.msg}</p>`, [['Ещё раз', 'again', 'hot'], ['В меню', 'menu', 'ghost']]);
  if (b === 'again') return startLesson(G.lesson);
  G = null; show('menu');
}

// ---------- головоломка дня ----------
async function loadPuzzles() {
  if (puzzleSet) return puzzleSet;
  const r = await fetch('puzzles.json', { cache: 'no-cache' });
  return (puzzleSet = (await r.json()).puzzles);
}
const DIFF_RU = { 1: 'лёгкая', 2: 'средняя', 3: 'сложная' };
const doneSet = () => new Set(progress.puzzle.done || []);
// Меню головоломок: головоломка дня + сборник по сложности.
async function puzzleMenu() {
  let list;
  try { list = await loadPuzzles(); } catch { return modal('<h2>Не загрузилось</h2><p>Проверь соединение и попробуй ещё раз.</p>', [['Ок', null]]); }
  const day = puzzleDay(), done = doneSet(), daily = progress.puzzle.solved.includes(day);
  const left = d => list.filter(p => (p.diff || 2) === d && !done.has(p.id)).length, tot = d => list.filter(p => (p.diff || 2) === d).length;
  const r = await modal(`<h2>Головоломки</h2><p>Поставь мат за один ход с помощью карты.</p><p class="muted">Сборник: решено ${done.size} из ${list.length} · серия дней: ${progress.puzzle.streak}</p>`, [
    [`Головоломка дня №${day + 1}${daily ? ' ✔' : ''}<small>${daily ? 'сегодня решена' : 'для серии дней'}</small>`, 'daily', daily ? '' : 'hot'],
    [`Следующая нерешённая<small>по порядку</small>`, 'next', daily ? 'hot' : ''],
    [`Лёгкие<small>осталось ${left(1)} из ${tot(1)}</small>`, 1], [`Средние<small>осталось ${left(2)} из ${tot(2)}</small>`, 2], [`Сложные<small>осталось ${left(3)} из ${tot(3)}</small>`, 3],
    ['Случайная', 'rnd'], ['Назад', null, 'ghost']], { dismiss: true });
  if (!r) return;
  if (r === 'daily') return startPuzzle();
  const pool = list.filter(p => !done.has(p.id) && (typeof r !== 'number' || (p.diff || 2) === r));
  const pick = r === 'rnd' ? list[Math.floor(Math.random() * list.length)] : pool[0];
  if (!pick) { toast('Здесь всё решено — загляни в другие'); return puzzleMenu(); }
  startArchive(pick);
}
function startArchive(P) { newGame({ mode: 'puzzle', human: P.turn, state: unpack(P), puzzle: { ...P, archive: true } }); }
// day — номер головоломки дня (ссылка из канала или от друга); прошедший день открывается как головоломка сборника.
async function startPuzzle(day = puzzleDay()) {
  let list;
  try { list = await loadPuzzles(); } catch { return modal('<h2>Не загрузилось</h2><p>Проверь соединение и попробуй ещё раз.</p>', [['Ок', null]]); }
  if (!Number.isInteger(day) || day < 0 || day > puzzleDay()) day = puzzleDay();
  const P = list[((day % list.length) + list.length) % list.length];
  if (day !== puzzleDay()) return startArchive(P);
  newGame({ mode: 'puzzle', human: P.turn, state: unpack(P), puzzle: { ...P, day } });
}
async function puzzleIntro() {
  const P = G.puzzle, solved = P.archive ? doneSet().has(P.id) : progress.puzzle.solved.includes(P.day);
  await modal(`<h2>${P.archive ? `Головоломка №${P.id} · ${DIFF_RU[P.diff || 2]}` : `Головоломка дня №${P.day + 1}`}</h2><p>Поставь <b>мат за один ход</b>: можно сыграть быструю карту, а потом сходить или сыграть основную.</p>
    <div class="mull">${P.hand.map((id, i) => `<div class="mull-card">${cardHTML(id, '', P.ch ? P.ch[i] : null)}</div>`).join('')}</div>
    <p>У тебя ${P.mana} маны, играешь ${P.turn === 'w' ? 'белыми' : 'чёрными'}. У соперника карт нет.</p>${solved ? `<p class="muted">${P.archive ? 'Уже решена ✔' : 'Сегодня уже решена ✔'}</p>` : ''}`, [['Решать', true, 'hot']]);
}
async function puzzleCheck(state) {
  const st2 = settle(state), P = G.puzzle;
  if (st2.result && st2.result.winner === G.human && st2.result.reason === 'mate') {
    await view.tipKing(kingSq(st2, opp(G.human)));
    sfx('win'); haptic('success'); view.confetti();
    if (P.shown) return solutionShown(P);
    if (P.archive) {
      const done = doneSet(), first = !done.has(P.id);
      if (first) { progress.puzzle.done = [...done, P.id]; saveProgress(); G.rewards = onArchivePuzzle(paidHints(P)); syncMeta(); track('puzzle_archive', { id: P.id }); }
      const list = await loadPuzzles(), d2 = doneSet(), nxt = list.find(p => !d2.has(p.id) && (p.diff || 2) === (P.diff || 2)) || list.find(p => !d2.has(p.id));
      const b = await modal(`<h2 class="win">Мат!</h2><p>Решено ${d2.size} из ${list.length}</p>${first ? rewardsHTML(G.rewards) : ''}`,
        [...(nxt ? [['Следующая', 'next', 'hot']] : []), ['Все головоломки', 'list'], ['В меню', 'menu', 'ghost']]);
      if (b === 'next') return startArchive(nxt);
      if (b === 'list') { G = null; show('menu'); return puzzleMenu(); }
      G = null; return show('menu');
    }
    const pz = progress.puzzle, first = !pz.solved.includes(P.day);
    if (first) {
      pz.streak = pz.last === P.day - 1 ? pz.streak + 1 : 1; pz.last = P.day; pz.best = Math.max(pz.best, pz.streak);
      pz.solved = [...pz.solved.slice(-60), P.day]; saveProgress();
      G.rewards = onPuzzleSolved(pz.streak, paidHints(P)); syncMeta(); track('puzzle_solved', { day: P.day });
    }
    let solvers = '';
    try { const r = await api('/api/puzzle', { day: P.day, solved: first, token: deviceToken() }); if (r.solvers) solvers = `<p class="muted">Сегодня решили: ${r.solvers}</p>`; } catch { /* офлайн */ }
    const b = await modal(`<h2 class="win">Мат!</h2><p>Серия: ${pz.streak} дн. · рекорд ${pz.best}</p>${solvers}${first ? rewardsHTML(G.rewards) : ''}<p class="muted">Новая головоломка — завтра.</p>`,
      [['Ещё головоломки', 'more', 'hot'], ['Поделиться', 'share'], ['В меню', 'menu', 'ghost']]);
    if (b === 'more') { G = null; show('menu'); return puzzleMenu(); }
    if (b === 'share') {
      const pid = await myPid();
      await shareFlow({ kind: 'puzzle', param: `pz_${P.day}${pid ? '_' + pid : ''}`, text: `Chaos Chess: решил головоломку дня №${P.day + 1} (мат в один ход с картой), серия ${pz.streak} дн. Попробуешь?` });
    }
    G = null; return show('menu');
  }
  sfx('lose'); haptic('error');
  const b = await modal('<h2>Не мат</h2><p>Соперник выкручивается. Подумай, какая карта меняет позицию.</p>', [['Ещё раз', 'again', 'hot'], [(P.hint || 0) >= 3 ? 'Показать решение ещё раз' : `Подсказка ${(P.hint || 0) + 1}/3`, 'hint'], ...(P.archive ? [['Другая головоломка', 'skip']] : []), ['В меню', 'menu', 'ghost']]);
  if (b === 'again' || b === 'hint') {
    await newGame({ mode: 'puzzle', human: P.turn, state: unpack(P), puzzle: P, quiet: true });
    if (b === 'hint') puzzleHint();
    return;
  }
  if (b === 'skip') { G = null; show('menu'); return puzzleMenu(); }
  G = null; show('menu');
}

// ---------- ступенчатые подсказки в головоломках ----------
// Решение берём из движка на месте: первая найденная линия ходов.
function puzzleLine() {
  const P = G && G.puzzle; if (!P) return null;
  if (!P._line) { const st = unpack(P), sol = solutions(st, 20); P._line = sol[0] || null; P._start = st; }
  if (!P._line) return null;
  // uid карт в текущей партии совпадают с распакованной позицией — одна и та же раздача
  return P._line;
}
const sqList = tg => tgSquares(tg || []).map(sqName).join(' → ');
function hintSquares() {
  const line = puzzleLine(); if (!line) return [];
  const a = line.find(x => x.k === 'c') || line[0];
  return a.k === 'c' ? tgSquares(a.tg) : [a.from, a.to];
}
function lineText(line) {
  return line.map((a, i) => {
    if (a.k === 'c') return `${i + 1}. ${CARDS[a.id].type === 'quick' ? '⚡' : '★'} «${CARDS[a.id].name}»${tgSquares(a.tg).length ? ' на ' + sqList(a.tg) : ''}${typeof a.tg[a.tg.length - 1] === 'string' ? ' (' + PIECE_NAME[a.tg[a.tg.length - 1]] + ')' : ''}`;
    if (a.k === 'm') return `${i + 1}. Ход ${sqName(a.from)} → ${sqName(a.to)}`;
    return `${i + 1}. ${describe(a, G.st)}`;
  }).join('<br>');
}
async function puzzleHint() {
  if (!G || G.mode !== 'puzzle' || G.over) return;
  const P = G.puzzle, line = puzzleLine();
  if (!line) return toast('Подсказки для этой позиции нет');
  const cardA = line.find(a => a.k === 'c'), lvl = P.hint || 0;
  if (lvl >= 3) return showSolution();
  const next = lvl + 1;
  const what = next === 1 ? `Ступень 1 из 3: <b>какая карта нужна</b>.` : next === 2 ? 'Ступень 2 из 3: <b>куда её сыграть</b>.' : 'Ступень 3 из 3: <b>показать решение</b>. Головоломка не засчитается, но её можно будет решить заново.';
  const cost = P.archive ? `Опыт за решение: ${[15, 10, 5][Math.min(2, lvl)]} → ${[15, 10, 5, 0][next]}` : `Опыт за решение: ${[40, 30, 20][Math.min(2, lvl)]} → ${[40, 30, 20, 0][next]}${next === 3 ? ', серия дней не продлится' : ''}`;
  const canAd = next < 3 && adsReady();
  let ok = await modal(`<h2>Подсказка</h2><p>${what}</p><p class="muted">${cost}</p>`, [...(canAd ? [['📺 Посмотреть ролик<small>подсказка без потери опыта</small>', 'ad', 'hot']] : []),
    [next === 3 ? 'Показать решение' : 'Открыть', true, canAd ? '' : 'hot'], ['Подумаю сам', false, 'ghost']], { dismiss: true });
  if (ok === 'ad') {
    if (await showAd()) { P.freeHints = (P.freeHints || 0) + 1; track('ad_reward', { kind: 'hint' }); toast('Спасибо! Подсказка бесплатная'); }
    else { toast('Ролик не загрузился — попробуй позже', 'warn'); return; }
  }
  if (!ok || !G || G.mode !== 'puzzle') return;
  P.hint = next; track('puzzle_hint', { id: P.id || null, day: P.day ?? null, level: next });
  if (next === 1) {
    renderHUD();
    setStatus(`Подсказка: нужна карта «${CARDS[cardA.id].name}»`, 'warn');
    await modal(`<h2>Нужна карта</h2><div class="mull">${`<div class="mull-card">${cardHTML(cardA.id)}</div>`}</div><p>«${CARDS[cardA.id].name}» — ${CARDS[cardA.id].text}</p><p class="muted">Карта мигает в руке.</p>`, [['Понятно', true, 'hot']]);
  } else if (next === 2) {
    view.glow = hintSquares(); renderHUD();
    const quick = line.length > 1 && line[0].k === 'c' && CARDS[line[0].id].type === 'quick';
    const txt = `«${CARDS[cardA.id].name}» — ${sqList(cardA.tg) ? 'на ' + sqList(cardA.tg) : 'без цели'}${quick ? ', а потом ещё один ход' : ''}`;
    setStatus('Подсказка: ' + txt, 'warn');
    await modal(`<h2>Куда играть</h2><p>${txt}.</p><p class="muted">Нужные клетки горят золотым.</p>`, [['Понятно', true, 'hot']]);
  } else return showSolution();
}
// Показать решение: позиция сбрасывается и игра сама разыгрывает линию.
async function showSolution() {
  const P = G.puzzle, line = puzzleLine();
  P.shown = true; P.hint = 3;
  await newGame({ mode: 'puzzle', human: P.turn, state: unpack(P), puzzle: P, quiet: true });
  setStatus('Решение');
  toast('Смотри решение');
  for (const a of line) {
    if (!G || G.mode !== 'puzzle') return;
    await sleep(500);
    const fresh = legalActions(G.st).find(x => sameAction(x, a)) || a;
    await doAction(fresh);
  }
}
async function solutionShown(P) {
  const b = await modal(`<h2>Решение</h2><p class="pre">${lineText(puzzleLine())}</p><p class="muted">С показанным решением головоломка не засчитывается — попробуй сыграть её сам.</p>`,
    [['Решить самому', 'again', 'hot'], ...(P.archive ? [['Другая головоломка', 'skip']] : []), ['В меню', 'menu', 'ghost']]);
  if (b === 'again') { P.shown = false; return newGame({ mode: 'puzzle', human: P.turn, state: unpack(P), puzzle: P, quiet: true }); }
  if (b === 'skip') { G = null; show('menu'); return puzzleMenu(); }
  G = null; show('menu');
}

// Подсказки, за которые снимается опыт (без тех, что получены за рекламу).
const paidHints = P => Math.max(0, (P.hint || 0) - (P.freeHints || 0));

// ---------- реклама за награду (Adsgram) ----------
// Включается, если на сервере задан ADSGRAM_BLOCK_ID и игра открыта в Telegram. Никакой рекламы без согласия игрока.
let adCtl = null, adLoading = null;
function loadAds() {
  if (adCtl || adLoading || !cfg.adsgram || !inTelegram) return adLoading;
  adLoading = new Promise(res => {
    const sc = document.createElement('script'); sc.src = 'https://sad.adsgram.ai/js/sad.min.js';
    sc.onload = () => { try { adCtl = window.Adsgram.init({ blockId: String(cfg.adsgram) }); } catch { adCtl = null; } res(adCtl); };
    sc.onerror = () => res(null);
    document.head.append(sc);
  });
  return adLoading;
}
const adsReady = () => !!adCtl;
async function showAd() {
  if (!adCtl) await loadAds();
  if (!adCtl) return false;
  music.stop();
  try { const r = await adCtl.show(); return !!(r && (r.done ?? true)); } catch { return false; } finally { playMusic(G && G.mode !== 'replay' ? 'game' : 'menu'); }
}

// ---------- магазин (Telegram Stars) ----------
const boardPrev = id => { const L = id === 'classic' ? 'tiles/light' : `boards/${id}_light`, D = id === 'classic' ? 'tiles/dark' : `boards/${id}_dark`;
  return `<span class="bprev" style="background-image:url(assets/${L}.png),url(assets/${D}.png),url(assets/${D}.png),url(assets/${L}.png)"></span>`; };
const PREVIEW = {
  skins: id => `<img src="assets/skins/${id}/white_king.png"><img src="assets/skins/${id}/black_queen.png">`,
  boards: boardPrev,
};
async function shopMenu() {
  let d;
  try { d = await api('/api/shop', { token: deviceToken(), initData: initData() }); } catch { return modal('<h2>Магазин</h2><p>Сервер недоступен, попробуй позже.</p>', [['Ок', null]]); }
  setPaid(d.owned); applySettings();
  const note = !d.enabled ? '<p class="shop-note">Магазин откроется после запуска игрового бота в Telegram.</p>'
    : !d.canBuy ? `<p class="shop-note">Покупки — через Telegram: открой игру из бота.</p>` : '';
  const tier = d.owned.patron || 0, next = PATRON[tier], spent = d.owned.spent || 0;
  const patron = `<div class="patron-box">${tier ? `Ты — <b>${PATRON[tier - 1].badge} ${PATRON[tier - 1].title}</b>. Значок видят соперники в онлайне.` : 'Любая покупка делает тебя <b>★ Меценатом</b> — значок видят соперники.'}${next ? `<br><small>До «${next.title}» ${next.badge}: ещё ${Math.max(0, next.stars - spent)} ⭐</small>` : ''}</div>`;
  const pick = await modal(`<h2>Магазин</h2><p class="muted">Только внешний вид — карты, мана и сила за деньги не продаются. Покупки остаются навсегда. Скин и титул видит соперник.</p>${note}${patron}`, [['Пропуск сезона', 'season'], ['Закрыть', null, 'ghost']], { dismiss: true, cls: 'wide', onOpen: (box, done) => {
    const list = el('div', 'shop');
    const sec = t => list.append(el('div', 'shop-sec', t));
    const item = P => {
      const pics = [...(P.grant.skins || []).map(PREVIEW.skins), ...(P.grant.boards || []).map(PREVIEW.boards)].join('') || (P.pass ? PREVIEW.skins('polar') : P.repeat ? '<span class="shop-heart">❤</span>' : '');
      const row = el('div', 'shop-item' + (P.owned ? ' owned' : '') + (P.id === 'supporter' || P.pass ? ' best' : ''),
        `<div class="shop-pics">${pics}</div><div class="shop-info"><b>${esc(P.title)}</b><small>${esc(P.desc)}</small>${(P.grant.titles || []).length ? `<small class="shop-title">Титул: ${P.grant.titles.map(esc).join(', ')}</small>` : ''}</div>`);
      const b = el('button', 'btn small ' + (P.owned ? '' : 'hot'), P.owned ? '✔ есть' : `⭐ ${P.stars}`);
      b.disabled = P.owned || !d.canBuy;
      b.onclick = () => done(P);
      row.append(b); list.append(row);
    };
    const pass = d.products.filter(P => P.pass), cos = d.products.filter(P => !P.pass && !P.repeat), don = d.products.filter(P => P.repeat);
    if (pass.length) { sec(`Сезон ${d.season}`); pass.forEach(item); }
    sec('Скины и доски'); cos.forEach(item);
    if (don.length) { sec('Поддержать разработчика'); don.forEach(item); }
    box.insertBefore(list, box.querySelector('.btns'));
  } });
  if (pick === 'season') return seasonMenu();
  if (!pick) return;
  return buy(pick, shopMenu);
}
// Покупка за Stars: счёт от сервера, окно оплаты Telegram, ожидание выдачи от бота.
async function buy(pick, back) {
  track('shop_click', { product: pick.id });
  let r;
  try { r = await api('/api/shop/invoice', { initData: initData(), product: pick.id }); } catch { r = { error: 'Сервер недоступен' }; }
  if (!r.link) { toast(r.error || 'Не получилось выставить счёт', 'warn'); return back(); }
  const before = paid.spent || 0;
  const status = await openInvoice(r.link);
  if (status === 'paid') {
    toast('Оплата прошла, выдаём покупку…');
    for (let i = 0; i < 10; i++) { // покупку выдаёт бот после successful_payment — ждём её
      await sleep(1000);
      const d2 = await api('/api/shop', { token: deviceToken(), initData: initData() }).catch(() => null);
      if (d2 && (pick.repeat ? (d2.owned.spent || 0) > before : d2.owned.products.includes(pick.id))) { setPaid(d2.owned); applySettings(); renderMenu(); sfx('win'); view.confetti?.(); break; }
    }
  } else if (status === 'failed') toast('Оплата не прошла', 'warn');
  return back();
}
// Пропуск сезона: уровни сезона, бесплатная и платная дорожки.
const rewardChip = r => r.skin ? `${PREVIEW.skins(r.skin).split('><')[0]}>${SKINS[r.skin]}` : r.board ? `${boardPrev(r.board)}${BOARDS[r.board]}` : `«${esc(r.title)}»`;
async function seasonMenu() {
  const shop = await api('/api/shop', { token: deviceToken(), initData: initData() }).catch(() => null);
  if (shop) { setPaid(shop.owned); }
  const I = seasonInfo(), P = shop?.products.find(x => x.pass === I.season), has = I.hasPass;
  const levels = [...new Set([...I.track.free, ...I.track.paid].map(r => r.lv))].sort((a, b) => a - b);
  const cell = (r, paidTrack) => !r ? '<div></div>' : `<div class="${I.lv >= r.lv && (!paidTrack || has) ? 'got' : 'lock'}">${rewardChip(r)}${I.lv >= r.lv && (!paidTrack || has) ? ' ✔' : paidTrack && !has ? ' 🔒' : ''}</div>`;
  const grid = `<div class="pass-grid"><div class="ph">Ур.</div><div class="ph">Бесплатно</div><div class="ph">⭐ Пропуск</div>${levels.map(L =>
    `<div class="lvn ${I.lv === L ? 'cur' : ''}">${L}</div>${cell(I.track.free.find(r => r.lv === L), false)}${cell(I.track.paid.find(r => r.lv === L), true)}`).join('')}</div>`;
  const days = Math.max(0, Math.ceil((Date.UTC(2026, 10, 16) + I.season * 42 * 86400000 - Date.now()) / 86400000));
  const r = await modal(`<h2>Сезон ${I.season}</h2><div class="lvl-box"><b>Уровень сезона ${I.lv} из ${I.max}</b><div class="xpbar"><i style="width:${Math.round(100 * I.into / I.per)}%"></i></div><small>${I.lv >= I.max ? 'максимум!' : `до следующего: ${I.per - I.into} опыта`} · до конца сезона ${days} дн.</small></div>
    <p class="muted">Опыт сезона идёт за любые партии, головоломки и задания. Только внешний вид — силы за деньги нет.</p>${grid}
    ${has ? '<p>✔ Пропуск сезона у тебя есть.</p>' : ''}`,
  [...(!has && P ? [[`Купить пропуск · ⭐ ${P.stars}`, 'buy', 'hot']] : []), ['Закрыть', null, 'ghost']], { dismiss: true, cls: 'wide' });
  if (r === 'buy') { if (!shop?.canBuy) { toast(shop?.enabled ? 'Покупки — через Telegram: открой игру из бота' : 'Магазин пока не подключён', 'warn'); return seasonMenu(); } return buy(P, seasonMenu); }
}

// ---------- онлайн ----------
const inbox = []; let pumping = false;
function enqueue(m) { inbox.push(m); if (!pumping) pump(); }
async function pump() {
  pumping = true;
  while (inbox.length) { const m = inbox.shift(); try { await handleNet(m); } catch (e) { console.error(e); } }
  pumping = false;
}
let waitSheet = null;
function closeWait() { if (waitSheet) { waitSheet.close(); waitSheet = null; } }

async function ensureNet() {
  if (net && net.me && net.open) return net;
  if (!net) {
    net = new Net();
    net.on('*', enqueue);
    net.on('disconnect', () => { if (G && G.mode === 'online' && !G.over) setStatus('Связь потеряна, переподключаемся…', 'warn'); });
    net.on('reconnect', m => { if (m.active && G && G.mode === 'online' && !G.over) net.send({ t: 'resume' }); });
  }
  const w = await net.connect();
  net.lastWelcome = w;
  if (w.pid) try { localStorage.setItem('cc_pid', w.pid); if (localStorage.getItem('cc_ref') === w.pid) localStorage.removeItem('cc_ref'); } catch { /* */ }
  if (w.owned) { setPaid(w.owned); applySettings(); }
  if (w.meta && typeof w.meta.xp === 'number' && w.meta.xp > meta.xp) { Object.assign(meta, w.meta); saveMeta(); renderMenu(); toast('Прогресс загружен с сервера'); }
  else net.send({ t: 'saveMeta', meta });
  if (w.decks && w.decks.length && !customDecks.length) saveDecks(w.decks);
  return net;
}

async function onlineMenu() {
  closeModals();
  const t = sheet('<h2>Онлайн</h2><p class="muted">Подключаемся…</p>', [['Отмена', () => t.close(), 'ghost']]);
  try { await ensureNet(); } catch (e) { t.close(); return modal(`<h2>Онлайн недоступен</h2><p>${esc(e.message)}. Можно сыграть с ботом.</p>`, [['Понятно', null]]); }
  t.close();
  if (net.lastWelcome?.active) return net.send({ t: 'resume' });
  const r = await modal(`<h2>Онлайн</h2><p class="muted">Ты: ${esc(net.me.name)} · колода «${esc(currentDeck().name)}»</p>`,
    [['Позвать друга<small>ссылка-приглашение</small>', 'room', 'hot'], ['Быстрая игра<small>случайный соперник</small>', 'quick'], ['Ввести код комнаты', 'code'], ['Отмена', null, 'ghost']], { dismiss: true });
  if (r === 'room') return createRoom();
  if (r === 'quick') return quickGame();
  if (r === 'code') {
    const code = await modal('<h2>Код комнаты</h2><input id="room-code" class="code-input" maxlength="5" placeholder="ABCDE" autocomplete="off">', [], {
      onOpen: (box, done) => {
        const inp = box.querySelector('input'); setTimeout(() => inp.focus(), 50);
        const row = el('div', 'btns'), ok = el('button', 'btn hot', 'Войти'), no = el('button', 'btn ghost', 'Отмена');
        ok.onclick = () => done(inp.value.trim().toUpperCase()); no.onclick = () => done(null); row.append(ok, no); box.append(row);
      } });
    if (code) joinRoom(code);
  }
}

async function createRoom() {
  let chaos = settings.chaos, clock = settings.onlineClock;
  for (;;) {
    const r = await modal('<h2>Позвать друга</h2><p>Настрой партию и отправь ссылку.</p>', [['Создать комнату', 'go', 'hot'],
      [`Режим «Хаос»: ${chaos ? 'вкл' : 'выкл'}`, 'chaos'], [`Часы: ${clock.replace('+', ' мин + ')} с`, 'clock'], ['Отмена', null, 'ghost']], { dismiss: true });
    if (!r) return;
    if (r === 'chaos') { chaos = !chaos; continue; }
    if (r === 'clock') { const order = ['3+2', '7+5', '15+10']; clock = order[(order.indexOf(clock) + 1) % order.length]; continue; }
    settings.chaos = chaos; settings.onlineClock = clock; saveSettings();
    net.send({ t: 'create', deck: currentDeck().cards, chaos, clock });
    return;
  }
}
function joinRoom(code) { net.send({ t: 'join', code, deck: currentDeck().cards }); }
function quickGame() {
  net.send({ t: 'quick', deck: currentDeck().cards });
}

async function handleNet(m) {
  switch (m.t) {
    case 'welcome': net.lastWelcome = m; return;
    case 'room': {
      closeWait();
      const text = `Сыграем в Chaos Chess? Шахматы с заклинаниями${m.chaos ? ', режим «Хаос»' : ''}. Комната ${m.code}`;
      waitSheet = sheet(`<h2>Комната ${m.code}</h2><p>Отправь ссылку другу. Партия начнётся, как только он откроет её.</p><p class="link-box">${esc(m.link)}</p><p class="muted">${m.chaos ? 'Хаос · ' : ''}часы ${m.clock}</p>`, [
        ['Отправить в Telegram', () => openLink(`https://t.me/share/url?url=${encodeURIComponent(m.link)}&text=${encodeURIComponent(text)}`), 'hot'],
        ['Скопировать ссылку', b => { navigator.clipboard?.writeText(m.link).then(() => { b.textContent = 'Скопировано ✔'; }).catch(() => { b.textContent = m.code; }); }],
        ['Отмена', () => { net.send({ t: 'cancelRoom' }); closeWait(); }, 'ghost']]);
      return;
    }
    case 'queued': {
      closeWait();
      const end = Date.now() + m.wait;
      waitSheet = sheet('<h2>Ищем соперника</h2><p class="q-left">…</p>', [['Отмена', () => { net.send({ t: 'cancelQuick' }); closeWait(); }, 'ghost']]);
      const box = waitSheet.el, iv = setInterval(() => { if (!box.isConnected) return clearInterval(iv); box.querySelector('.q-left').textContent = `Ещё ${Math.max(0, Math.ceil((end - Date.now()) / 1000))} с`; }, 250);
      return;
    }
    case 'quickTimeout': {
      closeWait();
      const r = await modal('<h2>Пока никого</h2><p>Сейчас нет свободных соперников. Сыграть с ботом?</p>', [['Бой с Бойцом', 'bot', 'hot'], ['Подождать ещё', 'again'], ['В меню', null, 'ghost']]);
      if (r === 'bot') return newGame({ mode: 'bot', level: 'fighter', human: Math.random() < 0.5 ? 'w' : 'b', botDeck: PRESETS.core.deck });
      if (r === 'again') quickGame();
      return;
    }
    case 'error': closeWait(); toast(m.msg, 'warn'); if (G && G.mode === 'online') G.busy = false; return;
    case 'noGame': try { localStorage.removeItem('cc_online'); } catch { /* */ } return;
    case 'start': return onStart(m);
    case 'mullWait': setStatus('Ждём, пока соперник выберет руку…', 'think'); return;
    case 'state': return onState(m);
    case 'over': return onOver(m);
    case 'oppStatus':
      if (!G || G.mode !== 'online') return;
      G.oppOffline = !m.online; renderHUD();
      toast(m.online ? 'Соперник вернулся' : 'Соперник отключился — ждём до 60 с', m.online ? '' : 'warn');
      return;
    case 'emote': if (G && G.mode === 'online') emoteBubble('top', m.id); return;
    case 'drawOffer': {
      if (!G || G.over) return;
      const yes = await modal('<h2>Ничья?</h2><p>Соперник предлагает ничью.</p>', [['Согласен', true, 'hot'], ['Играем дальше', false, 'ghost']]);
      net.send({ t: 'drawAnswer', yes }); return;
    }
    case 'drawDeclined': toast('Соперник отказался от ничьей'); return;
    case 'resync': return;
    case 'owned':
      setPaid(m.owned); applySettings(); renderMenu(); sfx('win');
      toast(m.why === 'ref' ? `Друг сыграл первую партию по твоей ссылке! Друзей: ${m.owned.friends || 1} 🎁` : m.why === 'ref_new' ? `Подарок за приглашение: доска «${BOARDS[REF_INVITEE.board]}» 🎁` : 'Покупка получена — спасибо!');
      return;
    case 'tmatchWait':
      closeWait();
      waitSheet = sheet(`<h2>Турнирный матч</h2><p>Ждём соперника: <b>${esc(m.opp)}</b>. Партия начнётся, как только он откроет свою пару в группе.</p><p class="muted">Часы 3+2. Если соперник не придёт за 15 минут — победа твоя.</p>`,
        [['Выйти', () => { net.send({ t: 'cancelRoom' }); closeWait(); }, 'ghost']]);
      return;
    case 'watchers': if (G && G.mode === 'online') toast(m.n ? `Зрителей: ${m.n}` : 'Зрители ушли'); return;
  }
}

async function onStart(m) {
  closeWait();
  if (m.side === 'watch') { // зритель: только смотрит, руки обоих скрыты
    closeModals();
    G = { mode: 'watch', gid: m.gid, human: 'w', busy: false, sel: null, log: (m.log || []).map(x => ({ side: x.side, txt: describe(x.a, m.state) })), acts: null,
      over: false, st: m.state, turnEv: [], opts: {}, players: m.players, seq: m.seq };
    show('game'); window.dispatchEvent(new Event('resize'));
    setBack(() => leaveGame()); setReplayBar(false);
    view.flip = false; view.viewer = null; view.showTraps = 'own';
    resetView(m.state); setClock(m.clock); renderHUD(); renderChaos(); playMusic('game');
    setStatus(m.state.started ? `Ход ${m.state.turn === 'w' ? 'белых' : 'чёрных'}` : 'Игроки выбирают руку'); toast('Ты зритель');
    return;
  }
  const fresh = !G || G.mode !== 'online' || G.gid !== m.gid;
  if (fresh) {
    closeModals();
    G = { mode: 'online', gid: m.gid, human: m.side, busy: true, sel: null, log: [], acts: null, over: false, st: m.state, turnEv: [], opts: {},
      me: m.me, oppInfo: m.opp, seq: m.seq, rec: null, oppOffline: !m.oppOnline };
    try { localStorage.setItem('cc_online', String(m.gid)); } catch { /* */ }
    show('game'); window.dispatchEvent(new Event('resize'));
    setBack(() => leaveGame()); setReplayBar(false);
    view.flip = m.side === 'b'; view.viewer = m.side; view.showTraps = 'own';
    view.sideSkin = null;
    const os = m.opp.skin, oside = m.side === 'w' ? 'b' : 'w'; // фигуры соперника — в его скине
    if (os && os !== settings.skin && SKINS[os]) ensureSkin(os).then(() => { if (G && G.gid === m.gid) { view.sideSkin = { [oside]: os, [m.side]: settings.skin }; view.setState(G.st); } }).catch(() => {});
    resetView(m.state); playMusic('game');
    sfx('win'); toast(`Соперник: ${m.opp.badge ? m.opp.badge + ' ' : ''}${m.opp.name}${m.opp.title ? ' · «' + m.opp.title + '»' : ''}${os && os !== 'classic' && SKINS[os] ? ` · скин «${SKINS[os]}»` : ''}`);
  }
  G.st = m.state; G.seq = m.seq; G.acts = null; setClock(m.clock);
  G.log = (m.log || []).map(x => ({ side: x.side, txt: describe(x.a, G.st) }));
  view.setState(G.st); renderHUD(); renderChaos();
  if (m.phase === 'mull' && !m.mullDone) {
    setStatus('Выбери стартовую руку');
    const marked = await mulliganScreen(G.st, G.human, m.mullLeft);
    if (G && G.mode === 'online' && !G.st.started) { net.send({ t: 'mull', uids: marked }); setStatus('Ждём, пока соперник выберет руку…', 'think'); }
    return;
  }
  if (m.phase === 'mull') { setStatus('Ждём, пока соперник выберет руку…', 'think'); return; }
  afterOnlineState();
}

function setClock(c) { if (G && c) G.clock = { w: c.w, b: c.b, run: c.run, at: performance.now() }; }

async function onState(m) {
  if (G && G.replay) await G.replay;
  if (!G || (G.mode !== 'online' && G.mode !== 'watch') || G.gid !== m.gid) return;
  if (!G.st.started) document.querySelectorAll('.mull-modal').forEach(x => x.remove());
  const prev = G.st;
  if (m.act) G.log.push({ side: m.actor, n: prev.tn[m.actor], txt: describe(m.act, prev) });
  if (m.actor && m.state) recordTurn(m.actor, prev, m.events || [], m.state);
  G.busy = true; clearSelSoft(); hideCardInfo(); renderHand(true);
  view.setState(prev);
  G.st = prev;
  await playEvents(m.events || [], m.actor);
  if (!G || (G.mode !== 'online' && G.mode !== 'watch')) return;
  G.st = m.state; G.seq = m.seq; G.acts = null; setClock(m.clock);
  if (G.mode === 'watch') { view.setState(G.st); renderChaos(); G.busy = false; renderHUD(); setStatus(`Ход ${G.st.turn === 'w' ? 'белых' : 'чёрных'}`); return; }
  view.setState(G.st); renderChaos();
  afterOnlineState();
}

function afterOnlineState() {
  G.busy = false;
  renderHUD();
  if (G.st.result || G.over) return;
  if (view.checkSq >= 0 && G.st.turn === G.human && !G.st.quick) { sfx('check'); haptic('warning'); view.text('Шах!', view.checkSq, '#ff3344', true); }
  if (G.st.turn === G.human) { if (!G.st.quick && !G.st.pending) { sfx('turn'); haptic('light'); } setStatus(defaultStatus()); promptPending(); }
  else setStatus('Ход соперника…');
}

function sendOnline(a) {
  if (G.busy || !isHumanTurn()) return;
  G.busy = true; clearSelSoft(); hideCardInfo(); renderHand(true);
  setStatus('…');
  net.send({ t: 'act', a, seq: G.seq });
}

async function onOver(m) {
  if (G && G.replay) await G.replay;
  if (!G || (G.mode !== 'online' && G.mode !== 'watch') || G.gid !== m.gid) return;
  setClock(m.clock); G.clock.run = null;
  await endGame(m.result, { stats: m.stats, rating: m.rating });
}

function emoteBubble(pos, id) {
  sfx('emote');
  const h = $(`#hud-${pos}`), b = el('div', 'emote-bubble', `<img src="assets/emotes/${id}.png"><span>${EMOTES[id]}</span>`);
  h.append(b); setTimeout(() => b.remove(), 2600);
}
async function emotePicker() {
  if (!G || G.mode !== 'online') return;
  const id = await modal('<h2>Эмоция</h2>', [], { dismiss: true, cls: 'emotes', onOpen: (box, done) => {
    const g = el('div', 'emote-grid');
    for (const k in EMOTES) { const b = el('button', 'emote-btn', `<img src="assets/emotes/${k}.png"><small>${EMOTES[k]}</small>`); b.onclick = () => done(k); g.append(b); }
    box.append(g);
  } });
  if (!id) return;
  net.send({ t: 'emote', id }); emoteBubble('bot', id);
}

// ---------- профиль и история ----------
async function profileMenu() {
  let online = null;
  try { const b = await serverBase(); if (b) online = await api('/api/history', { token: deviceToken() }); } catch { /* офлайн */ }
  try { const pr = await api('/api/profile', { token: deviceToken(), initData: initData() }); if (pr.owned) { setPaid(pr.owned); applySettings(); } if (pr.pid) localStorage.setItem('cc_pid', pr.pid); } catch { /* офлайн */ }
  const pz = progress.puzzle, fav = favoriteCard();
  const W = progress.wins, L = progress.losses;
  const me = online?.me;
  const r = await modal(`<h2>Профиль</h2>
    <div class="prof-head"><button class="ava-big" style="background-image:url(${avatarURL(profile.avatar)})"></button>
    <input id="prof-name" maxlength="24" placeholder="Имя" value="${esc(profile.name || userName())}"></div>
    <table class="sum"><tr><th>Против бота</th><th>Победы</th><th>Поражения</th></tr>
    ${['novice', 'fighter', 'master'].map(l => `<tr><td>${LEVEL_RU[l]}</td><td>${W[l]}</td><td>${L[l]}</td></tr>`).join('')}</table>
    <p>Онлайн: ${me ? `${me.games} партий, ${me.wins} побед` : 'ещё не играл'}</p>
    <p>Головоломки: серия ${pz.streak} дн., рекорд ${pz.best}, решено ${pz.solved.length}</p>
    ${paid.patron ? `<p>Значок: <b>${PATRON[paid.patron - 1].badge} ${PATRON[paid.patron - 1].title}</b></p>` : ''}
    ${allTitles().length ? `<p>Титулы: <b>${allTitles().map(esc).join(', ')}</b></p><p>Показываю сопернику: <b>${settings.title ? '«' + esc(settings.title) + '»' : 'без титула'}</b></p>` : ''}
    <p>Друзей приглашено: <b>${paid.friends || 0}</b> · сезон ${seasonInfo().season}, уровень ${seasonInfo().lv}</p>
    ${fav ? `<p>Любимая карта: <b>${CARDS[fav].name}</b> (${progress.played[fav]} раз)</p>` : ''}`,
  [['История и повторы', 'hist', 'hot'], ...(allTitles().length ? [['Выбрать титул', 'title']] : []), ['🎁 Позвать друга', 'invite'], ['Пропуск сезона', 'season'], ['Готово', null, 'ghost']], { dismiss: true, onOpen: (box, done) => {
    box.querySelector('.ava-big').onclick = () => done('ava');
    box.querySelector('input').onchange = e => { profile.name = e.target.value.trim().slice(0, 24); saveProfile(); };
  } });
  const inp = document.querySelector('#prof-name'); if (inp) { profile.name = inp.value.trim().slice(0, 24); saveProfile(); }
  if (r === 'ava') {
    const a = await modal('<h2>Аватар</h2>', [], { dismiss: true, onOpen: (box, done) => {
      const g = el('div', 'ava-grid');
      for (let i = 0; i < AVATARS; i++) { const b = el('button', 'ava-pick' + (i === profile.avatar ? ' cur' : '')); b.style.backgroundImage = `url(${avatarURL(i)})`; b.onclick = () => done(i); g.append(b); }
      box.append(g);
    } });
    if (a !== null && a !== undefined) { profile.avatar = a; saveProfile(); sfx('select'); renderMenu(); }
    return profileMenu();
  }
  if (r === 'hist') return historyMenu(online?.games || []);
  if (r === 'invite') return inviteMenu();
  if (r === 'season') return seasonMenu();
  if (r === 'title') {
    const t = await modal('<h2>Титул</h2><p class="muted">Его видит соперник в онлайне рядом с именем.</p>', [...allTitles().map(x => [`${x === settings.title ? '✔ ' : ''}${esc(x)}`, x]), ['Без титула', '-'], ['Назад', null, 'ghost']], { dismiss: true });
    if (t) { settings.title = t === '-' ? '' : t; saveSettings(); applySettings(); }
    return profileMenu();
  }
}

async function historyMenu(onlineGames) {
  const items = history.map((h, i) => ({ ...h, key: 'l' + i }));
  for (const g of onlineGames) if (!items.some(h => h.online === g.id)) items.push({ date: g.ended, mode: 'online', human: g.side, result: { winner: g.result === 'draw' ? null : g.result, reason: g.reason }, plies: g.plies, online: g.id, names: { [g.side]: 'Ты', [g.side === 'w' ? 'b' : 'w']: g.opp } });
  items.sort((a, b) => b.date - a.date);
  if (!items.length) return modal('<h2>История</h2><p>Пока нет сыгранных партий.</p>', [['Ок', null]]);
  const pick = await modal('<h2>История</h2><p class="muted">Нажми на партию, чтобы посмотреть повтор.</p>', [['Назад', null, 'ghost']], { dismiss: true, onOpen: (box, done) => {
    const list = el('div', 'hist');
    for (const h of items.slice(0, 30)) {
      const res = !h.result.winner ? 'ничья' : (h.mode === 'local' ? `победа ${h.result.winner === 'w' ? 'белых' : 'чёрных'}` : h.result.winner === h.human ? 'победа' : 'поражение');
      const who = h.mode === 'bot' ? `Бот · ${LEVEL_RU[h.level]}` : h.mode === 'online' ? `Онлайн · ${esc(h.names?.[opp(h.human)] || 'соперник')}` : 'Вдвоём';
      const row = el('button', 'hist-row ' + (h.mode !== 'local' && h.result.winner === h.human ? 'win' : !h.result.winner ? '' : h.mode === 'local' ? '' : 'lose'),
        `<b>${who}</b><span>${res} · ${Math.ceil((h.plies || 0) / 2)} ход. · ${new Date(h.date).toLocaleDateString('ru-RU')}</span>`);
      row.onclick = () => done(h); list.append(row);
    }
    box.insertBefore(list, box.querySelector('.btns'));
  } });
  if (pick) openReplay(pick);
}

// ---------- повтор ----------
let replayTimer = null;
function stopReplay() { if (replayTimer) clearInterval(replayTimer); replayTimer = null; }
async function openReplay(h) {
  let data = h.rec, names = h.names, human = h.human;
  if (h.online) {
    try { const r = await api(`/api/game/${h.online}`); if (r.error) throw new Error(r.error); data = { seed: r.seed, decks: r.decks, chaos: r.chaos, fog: true, mulls: r.mulls, actions: r.actions }; names = r.names; }
    catch (e) { return modal(`<h2>Повтор недоступен</h2><p>${esc(e.message)}</p>`, [['Ок', null]]); }
  }
  if (!data) return modal('<h2>Повтор недоступен</h2>', [['Ок', null]]);
  let st = createGame({ seed: data.seed, decks: data.decks, chaos: data.chaos, fog: data.fog, boss: data.boss || null, bossSide: opp(data.human || 'w'),
    mana: data.botMana ? { [opp(data.human || 'w')]: (data.human === 'b' ? 0 : 1) + data.botMana } : undefined });
  for (const s of 'wb') if (data.mulls?.[s]?.length) st = mulligan(st, s, data.mulls[s]);
  st = start(st).state;
  const states = [st], evs = [null], log = [];
  try {
    for (const a of data.actions) { const r = apply(st, a); log.push({ side: st.turn, n: st.tn[st.turn], txt: describe(a, st) }); st = settle(r.state); states.push(st); evs.push(r.events); }
  } catch (e) { console.error(e); }
  closeModals();
  G = { mode: 'replay', human: human || 'w', busy: false, over: true, st: states[0], states, evs, i: 0, log, names, sel: null, opts: {} };
  show('game'); window.dispatchEvent(new Event('resize'));
  setBack(() => leaveGame());
  view.flip = G.human === 'b'; view.viewer = null; view.showTraps = 'all';
  resetView(G.st); renderHUD(); renderChaos(); setReplayBar(true); replayGo(0);
  playMusic('menu');
}
function setReplayBar(on) { $('#replaybar').classList.toggle('on', on); $('#hand').style.display = on ? 'none' : ''; }
async function replayGo(i, animate = false) {
  if (!G || G.mode !== 'replay') return;
  i = Math.max(0, Math.min(G.states.length - 1, i));
  const seq = G.rseq = (G.rseq || 0) + 1; // новый переход отменяет недоигранную анимацию
  if (animate && i === G.i + 1 && !G.busy) {
    G.busy = true;
    view.setState(G.states[G.i]); G.st = G.states[G.i];
    await playEvents(G.evs[i], G.states[G.i].turn);
    if (G) G.busy = false;
  }
  if (!G || G.mode !== 'replay' || seq !== G.rseq) return;
  G.i = i; G.st = G.states[i]; view.setState(G.st); renderHUD(); renderChaos();
  const last = G.log[i - 1];
  $('#rp-pos').textContent = `${i}/${G.states.length - 1}`;
  setStatus(i === 0 ? 'Начало партии' : `${last.side === 'w' ? '○' : '●'} ${last.txt}`);
  if (i === G.states.length - 1 && G.st.result) setStatus(`${REASON[G.st.result.reason] || ''}${G.st.result.winner ? ` — победа ${G.st.result.winner === 'w' ? 'белых' : 'чёрных'}` : ''}`);
}

// ---------- прогресс: награды, синхронизация, аналитика ----------
const LEAGUE_RU = ['Пешка', 'Конь', 'Слон', 'Ладья', 'Ферзь', 'Король'];
const LEAGUE_PIECE = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];
function rewardsHTML(list) {
  if (!list || !list.length) return '';
  const xp = list.filter(r => r.t === 'xp').reduce((a, r) => a + r.n, 0), rows = [];
  if (xp) rows.push(`<div class="rw xp">+${xp} опыта</div>`);
  for (const r of list) {
    if (r.t === 'level') rows.push(`<div class="rw lvl">Уровень ${r.n}!</div>`);
    if (r.t === 'slevel') rows.push(`<div class="rw lvl">Уровень сезона ${r.n}!</div>`);
    if (r.t === 'pass') rows.push(`<div class="rw">${r.free ? 'Сезон' : r.got ? 'Пропуск сезона' : '🔒 Пропуск сезона'}: ${rewardChip(r.r)}</div>`);
    if (r.t === 'floor') rows.push(`<div class="rw lvl">Этаж ${r.n} пройден</div>`);
    if (r.t === 'card') rows.push(`<div class="rw card-r">${cardHTML(r.id)}<span>Новая карта: <b>${CARDS[r.id].name}</b></span></div>`);
    if (r.t === 'skin') rows.push(`<div class="rw">Новый скин фигур: <b>${SKINS[r.id]}</b></div>`);
    if (r.t === 'board') rows.push(`<div class="rw">Новая доска: <b>${BOARDS[r.id]}</b></div>`);
    if (r.t === 'title') rows.push(`<div class="rw lvl">Титул: «${esc(r.id)}»</div>`);
    if (r.t === 'ach') rows.push(`<div class="rw ach">🏆 ${ACH[r.id].name}</div>`);
    if (r.t === 'quest') rows.push(`<div class="rw">✔ Задание: ${esc(r.text)}</div>`);
    if (r.t === 'rating') rows.push(`<div class="rw ${r.delta >= 0 ? 'up' : 'down'}">Рейтинг ${r.rating} (${r.delta >= 0 ? '+' : ''}${r.delta}) · ${LEAGUE_RU[r.league]}</div>`);
  }
  return `<div class="rewards">${rows.join('')}</div>`;
}
function syncMeta() { if (net && net.me) net.send({ t: 'saveMeta', meta }); renderMenu(); }
function track(name, data) {
  if (net && net.me) return net.send({ t: 'event', name, data });
  api('/api/event', { token: deviceToken(), name, data }).catch(() => {});
}
function xpBar() {
  const L = levelOf(meta.xp), a = xpFor(L), b = xpFor(L + 1);
  return { L, pct: Math.round(100 * (meta.xp - a) / (b - a)), left: b - meta.xp };
}

// ---------- Башня Хаоса ----------
async function towerMenu() {
  const pick = await modal(`<h2>Башня Хаоса</h2><p class="muted">15 этажей, на каждом — соперник со своим правилом. Пройдено: ${meta.tower}/15</p>`, [['Назад', null, 'ghost']], { dismiss: true, cls: 'wide', onOpen: (box, done) => {
    const list = el('div', 'tower-list');
    FLOORS.forEach((F, i) => {
      const open = i <= meta.tower, cleared = i < meta.tower;
      const rw = [...(F.reward.cards || []).map(id => CARDS[id].name), F.reward.skin && 'скин ' + SKINS[F.reward.skin], F.reward.board && 'доска ' + BOARDS[F.reward.board]].filter(Boolean).join(', ');
      const row = el('button', `floor${cleared ? ' done' : ''}${open ? '' : ' locked'}${F.boss ? ' boss' : ''}`,
        `<span class="fn">${i + 1}</span><span class="ft"><b>${F.name}${F.boss ? ' · босс' : ''}</b><small>${LEVEL_RU[floorGame(i, settings.towerDiff || 'normal').level]}${F.rule ? ' · ' + F.rule : ''}${F.boss ? ' · ' + BOSSES[F.boss].text : ''}</small><small class="rwd">Награда: ${rw || 'опыт'}</small></span><span class="fs">${cleared ? '✔' : open ? '▶' : '🔒'}</span>`);
      row.onclick = () => { if (open) done(i); else { sfx('error'); toast('Сначала пройди предыдущий этаж'); } };
      list.append(row);
    });
    box.insertBefore(list, box.querySelector('.btns'));
    setTimeout(() => list.children[Math.min(meta.tower, 14)]?.scrollIntoView({ block: 'center' }), 50);
  } });
  if (pick !== null && pick !== undefined) towerFloor(pick);
}
async function towerFloor(i) {
  closeModals();
  const F = FLOORS[i], g = floorGame(i, settings.towerDiff || 'normal');
  const go = await modal(`<h2>Этаж ${i + 1}. ${F.name}</h2><p class="story">${F.story}</p>${F.boss ? `<p class="boss-rule"><b>${BOSSES[F.boss].name}:</b> ${BOSSES[F.boss].text}</p>` : ''}
    ${F.rule ? `<p class="muted">${F.rule}</p>` : ''}<p class="muted">Сложность: ${TDIFF_RU[settings.towerDiff || 'normal']} (меняется в настройках) · соперник: ${LEVEL_RU[g.level]} · колода «${PRESETS[F.deck].name}» · твоя колода «${esc(currentDeck().name)}»</p>`,
  [['В бой!', true, 'hot'], ['Назад', false, 'ghost']]);
  if (!go) return towerMenu();
  track('tower_start', { floor: i });
  newGame({ mode: 'tower', floor: i, diff: settings.towerDiff || 'normal', level: g.level, human: Math.random() < 0.5 ? 'w' : 'b', botDeck: g.botDeck, chaos: g.chaos, boss: g.boss, botMana: g.botMana });
}

// ---------- Драфт ----------
async function draftMenu() {
  closeModals();
  const D = meta.draft;
  if (!D) {
    const go = await modal(`<h2>Драфт</h2><p>Собери колоду на ходу: 20 раз выбери 1 карту из 3 — доступны все 22 карты. Потом играй с ботами, пока не проиграешь 3 раза. Максимум — 7 побед.</p><p class="muted">Лучший забег: ${meta.draftBest} побед</p>`,
      [['Начать забег', true, 'hot'], ['Назад', false, 'ghost']], { dismiss: true });
    if (!go) return;
    meta.draft = { seed: (Math.random() * 1e9) | 0, picks: [], wins: 0, losses: 0 }; saveMeta(); track('draft_start');
    return draftMenu();
  }
  if (D.picks.length < 20) {
    const opts = draftOptions(D.picks, D.seed);
    const cnt = {}; for (const id of D.picks) cnt[id] = (cnt[id] || 0) + 1;
    const id = await modal(`<h2>Выбор ${D.picks.length + 1} из 20</h2><p class="muted">Нажми на карту. Долгое нажатие — описание.</p>`, [['Позже', null, 'ghost']], { onOpen: (box, done) => {
      const row = el('div', 'mull pick');
      for (const c of opts) {
        const d = el('div', 'mull-card', cardHTML(c) + `<small>${CARDS[c].cost} маны · ${CARDS[c].type === 'quick' ? '⚡' : '★'}</small>`);
        let t = null, long = false;
        d.onpointerdown = () => { long = false; t = setTimeout(() => { long = true; toast(`${CARDS[c].name}: ${CARDS[c].text}`); }, 450); };
        d.onpointerup = d.onpointerleave = () => clearTimeout(t);
        d.onclick = () => { if (!long) done(c); };
        row.append(d);
      }
      box.insertBefore(row, box.querySelector('.btns'));
      box.insertBefore(el('div', 'draft-deck', Object.entries(cnt).map(([k, n]) => `<span>${CARDS[k].name}${n > 1 ? ' ×' + n : ''}</span>`).join('') || '<span class="muted">колода пуста</span>'), box.querySelector('.btns'));
    } });
    if (!id) return;
    sfx('draw'); D.picks.push(id); saveMeta();
    return draftMenu();
  }
  const lvl = DRAFT_BOTS[Math.min(DRAFT_BOTS.length - 1, D.wins + D.losses)];
  const r = await modal(`<h2>Драфт</h2><p class="draft-score">Победы: <b>${D.wins}</b>/7 · поражения: <b>${D.losses}</b>/3</p><p class="muted">Следующий соперник: ${LEVEL_RU[lvl]}</p>
    <div class="draft-deck">${[...new Set(D.picks)].map(k => `<span>${CARDS[k].name}${D.picks.filter(x => x === k).length > 1 ? ' ×' + D.picks.filter(x => x === k).length : ''}</span>`).join('')}</div>`,
  [['Играть', 'play', 'hot'], ['Завершить забег', 'end'], ['Назад', null, 'ghost']], { dismiss: true });
  if (r === 'play') return newGame({ mode: 'draft', level: lvl, human: Math.random() < 0.5 ? 'w' : 'b', deck: D.picks.slice(), botDeck: botDeckFor(Math.random()), chaos: false });
  if (r === 'end' && await modal('<h2>Завершить забег?</h2>', [['Да', true], ['Нет', false, 'ghost']])) {
    const out = finishDraft(); await modal(`<h2>Забег окончен</h2><p>Побед: ${D.wins}</p>${rewardsHTML(out)}`, [['Ок', true, 'hot']]);
  }
}
function finishDraft() {
  const D = meta.draft, out = onDraftRun(D.wins);
  const xp = D.wins * 30; meta.xp += xp; out.unshift({ t: 'xp', n: xp, why: 'драфт' });
  meta.draft = null; saveMeta(); syncMeta(); return out;
}
function draftAfterGame(won) {
  const D = meta.draft; if (!D) return [];
  if (won) D.wins++; else D.losses++;
  saveMeta();
  if (D.wins >= 7 || D.losses >= 3) return [{ t: 'quest', text: `Забег драфта окончен: ${D.wins} побед` }, ...finishDraft()];
  return [];
}

// ---------- Задания и достижения ----------
async function questsMenu() {
  const q = questsToday(), ach = Object.entries(ACH);
  const { L, pct, left } = xpBar();
  await modal(`<h2>Задания</h2><div class="lvl-box"><b>Уровень ${L}</b><div class="xpbar"><i style="width:${pct}%"></i></div><small>до следующего: ${left} опыта</small></div>
    <h3>Сегодня</h3><div class="quests">${q.map(x => `<div class="quest ${x.done ? 'done' : ''}"><span>${esc(x.text)}</span><b>${x.done ? '✔' : `${x.p}/${x.n}`}</b><small>+${x.xp}</small></div>`).join('')}</div>
    <p class="muted">Новые задания — каждый день в 03:00 по Москве.</p>
    <h3>Достижения · ${Object.keys(meta.ach).length}/${ach.length}</h3><div class="achs">${ach.map(([id, a]) => `<div class="ach ${meta.ach[id] ? 'got' : ''}"><b>${meta.ach[id] ? '🏆' : '·'} ${a.name}</b><small>${a.text}${a.reward ? ` · награда: ${a.reward.skin ? 'скин ' + SKINS[a.reward.skin] : 'доска ' + BOARDS[a.reward.board]}` : ''}</small></div>`).join('')}</div>`,
  [['Пропуск сезона', 'season'], ['Закрыть', null]], { dismiss: true, cls: 'wide' }).then(r => { if (r === 'season') seasonMenu(); });
}

// ---------- Коллекция ----------
async function collectionMenu() {
  const r = await modal(`<h2>Коллекция</h2><p class="muted">Карты открываются уровнями и этажами Башни. Скины и доски — за игру; несколько — в Магазине. Карты и сила за деньги не продаются.</p>`, [['Описание всех карт', 'gallery'], ['Магазин', 'shop'], ['Закрыть', null, 'ghost']], { dismiss: true, cls: 'wide', onOpen: (box, done) => {
    const wrap = el('div', 'coll');
    wrap.append(el('h3', '', `Карты · ${meta.unlocked.length}/${CARD_IDS.length}`));
    const grid = el('div', 'deck-grid');
    for (const id of CARD_IDS) {
      const open = isUnlocked(id), floor = FLOORS.findIndex(F => (F.reward.cards || []).includes(id));
      const c = el('div', 'deck-cell' + (open ? ' has' : ' lock'), cardHTML(id) + (open ? '' : `<span class="why">ур. ${CARD_LEVEL[id]}${floor >= 0 ? ` или этаж ${floor + 1}` : ''}</span>`));
      c.onclick = () => modal(cardInfoHTML(id) + (open ? '' : `<p class="muted">Откроется на ${CARD_LEVEL[id]}-м уровне${floor >= 0 ? ` или за ${floor + 1}-й этаж Башни` : ''}.</p>`), [['Ок', null]], { dismiss: true });
      grid.append(c);
    }
    wrap.append(grid);
    const pickRow = (title, cat, have, key, imgFn) => {
      wrap.append(el('h3', '', title));
      const row = el('div', 'cosm');
      for (const [id, name] of Object.entries(cat)) {
        const own = have.includes(id), cur = settings[key] === id;
        const b = el('button', 'cosm-item' + (cur ? ' cur' : '') + (own ? '' : ' lock'), `${imgFn(id)}<small>${name}${own ? '' : ' 🔒'}</small>`);
        b.onclick = () => { if (!own) return toast(unlockHint(key, id)); settings[key] = id; saveSettings(); applySettings(); done('again'); };
        row.append(b);
      }
      wrap.append(row);
    };
    pickRow('Фигуры', SKINS, allSkins(), 'skin', id => `<img src="assets/${id === 'classic' ? 'pieces' : 'skins/' + id}/white_king.png"><img src="assets/${id === 'classic' ? 'pieces' : 'skins/' + id}/black_queen.png">`);
    pickRow('Доски', BOARDS, allBoards(), 'board', id => boardPrev(id));
    box.insertBefore(wrap, box.querySelector('.btns'));
  } });
  if (r === 'again') return collectionMenu();
  if (r === 'gallery') return gallery();
  if (r === 'shop') return shopMenu();
}
function unlockHint(key, id) {
  if (SHOP_ITEMS.has(id)) return 'Есть в Магазине';
  if (ITEM_SOURCE[id]) return ITEM_SOURCE[id];
  const fl = FLOORS.findIndex(F => F.reward[key === 'skin' ? 'skin' : 'board'] === id);
  if (fl >= 0) return `Награда за ${fl + 1}-й этаж Башни Хаоса`;
  const a = Object.values(ACH).find(x => x.reward && x.reward[key === 'skin' ? 'skin' : 'board'] === id);
  return a ? `Достижение «${a.name}»: ${a.text}` : 'Скоро';
}

// ---------- Рейтинг ----------
async function ratingMenu() {
  let d;
  try { d = await api('/api/leaderboard', { token: deviceToken() }); } catch { return modal('<h2>Рейтинг</h2><p>Сервер недоступен.</p>', [['Ок', null]]); }
  const me = d.me, days = me ? Math.max(0, Math.ceil((me.ends - Date.now()) / 86400000)) : null;
  if (me) { const out = onLeague(me.league); if (out.length) syncMeta(); }
  await modal(`<h2>Рейтинг</h2>${me ? `<div class="league-card"><img src="assets/pieces/white_${LEAGUE_PIECE[me.league]}.png"><div><b>${LEAGUE_RU[me.league]} · ${me.rating}</b><small>${me.games ? `место ${me.rank} · ${me.wins} побед из ${me.games}` : 'сыграй быструю онлайн-игру, чтобы попасть в таблицу'}</small><small>Сезон ${me.season}, до конца ${days} дн. · лучший ${me.peak}</small></div></div>` : '<p class="muted">Сыграй быструю онлайн-игру — она идёт в рейтинг.</p>'}
    <p class="muted">Лиги: ${d.leagues.map((L, i) => `${LEAGUE_RU[i]} ${L.min ? L.min + '+' : ''}`).join(' · ')}. Рейтинговые — только «Быстрая игра». В конце сезона рейтинг наполовину сжимается к 1000, награды — косметика.</p>
    <div class="lb">${d.top.length ? d.top.map((p, i) => `<div class="lb-row"><span>${i + 1}</span><img src="${avatarURL(p.avatar)}"><b>${esc(p.name)}</b><small>${LEAGUE_RU[p.league]}</small><i>${p.rating}</i></div>`).join('') : '<p class="muted">В этом сезоне ещё никто не играл.</p>'}</div>`,
  [['Быстрая игра', 'quick', 'hot'], ['Закрыть', null, 'ghost']], { dismiss: true, cls: 'wide' }).then(async r => { if (r === 'quick') { await ensureNet(); quickGame(); } });
}

// ---------- часы ----------
setInterval(() => {
  if (!G || !G.clock) return;
  if (G.mode === 'online') { renderClock(); return; }
  if (G.over || !G.st.started) { G.clock.tick = performance.now(); return; }
  const now = performance.now(), dt = now - G.clock.tick;
  G.clock.tick = now;
  const animating = G.busy && !G.botThinking;
  if (animating || document.hidden) return;
  G.clock[G.st.turn] -= dt;
  renderClock();
  if (G.clock[G.st.turn] <= 0) { G.busy = true; endGame({ winner: opp(G.st.turn), reason: 'time' }); }
}, 200);

// ---------- запуск ----------
async function boot() {
  initTelegram(); applySettings();
  try { A = await loadAssets(); } catch (e) { $('#loading').textContent = 'Не удалось загрузить графику: ' + e.message; return; }
  view = new BoardView($('#board'), A); applySettings();
  view.onChaos = id => chaosBanner(id);
  const fit = () => {
    const app = $('#app'), w = Math.min(app.clientWidth, 520);
    // высота руки считается по ширине экрана, а не по текущему числу карт — доска не прыгает
    const slotW = Math.min(84, (w - 12 - 24) / 5), handH = $('#replaybar').classList.contains('on') ? 52 : Math.round(slotW * 50 / 36) + 14;
    const free = window.innerHeight - $('#hud-top').offsetHeight - $('#hud-bot').offsetHeight - 22 - 22 - handH - 30;
    const size = Math.max(240, Math.min(w - 4, free));
    $('#board').style.width = $('#board').style.height = size + 'px';
    view.resize();
  };
  window.addEventListener('resize', fit); fit();
  const click = (sel, fn) => { $(sel).onclick = () => { unlockAudio(); playMusic(G && G.mode !== 'replay' ? 'game' : 'menu'); sfx('select'); fn(); }; };
  $('#board').addEventListener('pointerdown', e => onSquare(view.sqAt(e.clientX, e.clientY)));
  click('#btn-bot', botSetup);
  click('#btn-online', onlineMenu);
  click('#btn-tower', towerMenu);
  click('#btn-draft', draftMenu);
  click('#btn-quests', questsMenu);
  click('#btn-coll', collectionMenu);
  click('#btn-rating', ratingMenu);
  click('#menu-lvl', questsMenu);
  click('#btn-puzzle', puzzleMenu);
  click('#btn-local', () => newGame({ mode: 'local', chaos: settings.chaos }));
  click('#btn-tutorial', tutorialMenu);
  click('#btn-shop', shopMenu);
  click('#btn-decks', decksScreen);
  click('#btn-profile', profileMenu);
  click('#menu-ava', profileMenu);
  click('#btn-settings', settingsMenu);
  click('#btn-invite', inviteMenu);
  click('#decks-back', () => { if (deckEdit) { deckEdit = null; renderDecks(); } else show('menu'); });
  $('#btn-pause').onclick = () => { sfx('select'); leaveGame(); };
  $('#btn-log').onclick = () => { sfx('select'); if (G) showLog(); };
  $('#btn-last').onclick = () => { sfx('select'); replayLastTurn(); };
  $('#btn-emote').onclick = () => { sfx('select'); emotePicker(); };
  $('#btn-hint').onclick = () => { unlockAudio(); sfx('select'); puzzleHint(); };
  $('#rp-first').onclick = () => { stopReplay(); replayGo(0); };
  $('#rp-prev').onclick = () => { stopReplay(); replayGo(G.i - 1); };
  $('#rp-next').onclick = () => { stopReplay(); replayGo(G.i + 1, true); };
  $('#rp-last').onclick = () => { stopReplay(); replayGo(G.states.length - 1); };
  $('#rp-play').onclick = () => {
    unlockAudio();
    if (replayTimer) return stopReplay();
    replayTimer = setInterval(() => { if (!G || G.mode !== 'replay' || G.i >= G.states.length - 1) return stopReplay(); if (!G.busy) replayGo(G.i + 1, true); }, 400);
  };
  $('#rp-close').onclick = () => { stopReplay(); G = null; show('menu'); };
  document.body.classList.toggle('tg', inTelegram);
  $('#loading').remove();
  show('menu');
  fit();
  let lastW = 0, lastH = 0;
  new ResizeObserver(() => { const a = $('#app'); if (a.clientWidth !== lastW || window.innerHeight !== lastH) { lastW = a.clientWidth; lastH = window.innerHeight; fit(); } }).observe($('#app'));
  serverBase().then(b => b && api('/api/config')).then(c => { if (c) { cfg = c; loadAds(); } }).catch(() => {});
  api('/api/ping', { token: deviceToken(), name: profile.name || userName() || 'Игрок', avatar: profile.avatar }).catch(() => {});
  track('open', { tg: inTelegram, level: levelOf(meta.xp) });
  // параметры запуска: Telegram start_param или адрес сайта (запасная ссылка)
  const L = { ...parseQuery(location.search), ...parseStart(startParam()) };
  const room = L.room || '', watch = L.watch || '', active = localStorage.getItem('cc_online');
  if (L.ref) try { if (L.ref !== localStorage.getItem('cc_pid') && !localStorage.getItem('cc_ref')) localStorage.setItem('cc_ref', L.ref); } catch { /* */ }
  if (L.ref || L.src || L.pz !== undefined) track('launch', { ref: !!L.ref, src: L.src || null, pz: L.pz ?? null });
  // пришёл по приглашению из Telegram — сразу регистрируемся на сервере, чтобы приглашение засчиталось после первой партии
  if (L.ref && inTelegram && !room) ensureNet().catch(() => {});
  if (L.pz !== undefined) { startPuzzle(L.pz === 'today' ? undefined : L.pz); }
  else if (watch) { try { const n = await ensureNet(); n.send({ t: 'watch', gid: Number(watch) }); } catch (e) { toast('Онлайн недоступен', 'warn'); } }
  else if (room || active) {
    try {
      const n = await ensureNet();
      if (n.lastWelcome?.active) n.send({ t: 'resume' });
      else if (room && /^[A-Z0-9]{5}$/.test(room)) { toast(`Входим в комнату ${room}…`); joinRoom(room); }
    } catch (e) { toast('Онлайн недоступен: ' + e.message, 'warn'); }
  }
  window.__cc = { get G() { return G; }, view, doAction, onSquare, newGame, LESSONS, openReplay, startPuzzle, endGameForTest: r => endGame(r) }; // для автотестов
}
boot();
