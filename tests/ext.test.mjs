// Карты Расширения, колоды и хаос-события.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, start, apply, legalActions, settle, CHAOS_EVERY } from '../web/src/engine/game.js';
import { PRESETS, deckErrors, CARDS } from '../web/src/engine/cards.js';
import { sqIdx as q, inCheck, legalMoves } from '../web/src/engine/rules.js';

const game = (fen, hands = { w: [], b: [] }, mana = { w: 9, b: 9 }, extra = {}) =>
  start(createGame({ fen, seed: 7, hands, mana, decks: { w: [], b: [] }, ...extra })).state;
const tgEq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const T = sq => sq.map(x => (typeof x === 'string' && x.length === 2 ? q(x) : x));
const find = (st, id, ...sq) => legalActions(st).find(a => a.k === 'c' && a.id === id && tgEq(a.tg, T(sq)));
const card = (st, id, ...sq) => { const a = find(st, id, ...sq); assert.ok(a, `карта ${id} ${sq} должна быть легальной`); return apply(st, a).state; };
const has = (st, id, ...sq) => !!find(st, id, ...sq);
const any = (st, id) => legalActions(st).some(a => a.k === 'c' && a.id === id);
const move = (st, f, t) => {
  const a = legalActions(st).find(a => a.k === 'm' && a.from === q(f) && a.to === q(t));
  assert.ok(a, `ход ${f}-${t} должен быть легальным`);
  return apply(st, a).state;
};
const canMove = (st, f, t) => legalActions(st).some(a => a.k === 'm' && a.from === q(f) && (!t || a.to === q(t)));
const at = (st, s) => st.board[q(s)];
const pass = (st, f, t) => move(st, f, t);

test('колоды: пресеты валидны, лимиты копий и легендарной', () => {
  for (const k in PRESETS) assert.deepEqual(deckErrors(PRESETS[k].deck), [], k);
  assert.ok(deckErrors(Array(20).fill('hook')).length, '20 крюков нельзя');
  assert.ok(deckErrors(['mirror', 'mirror', ...PRESETS.core.deck.slice(2)]).some(e => e.includes('Легендарная') || e.includes('не больше 1')));
  assert.ok(deckErrors(PRESETS.core.deck.slice(1)).length, '19 карт нельзя');
  assert.equal(Object.keys(CARDS).length, 34);
});

test('Оковы: фигура не ходит ход соперника, но даёт шах; потом свободна', () => {
  let st = game('4k3/8/8/8/8/8/3r4/R3K3', { w: ['shackles'], b: [] });
  st = card(st, 'shackles', 'd2');
  st = move(st, 'a1', 'a2');
  assert.ok(!canMove(st, 'd2'), 'скованная ладья не ходит');
  assert.ok(!any(st, 'x'));
  let s2 = game('4k3/8/8/8/8/8/8/3rK3', { w: ['shackles'], b: [] });
  assert.ok(inCheck(s2, 'w'));
  assert.ok(!has(s2, 'shackles', 'd1') || inCheck(apply(s2, find(s2, 'shackles', 'd1')).state, 'w'), 'оковы не снимают шах');
  st = move(st, 'e8', 'f8'); st = move(st, 'a2', 'a3');
  assert.ok(canMove(st, 'd2'), 'через круг свободна');
  assert.ok(!has(game('4k3/8/8/8/8/8/8/R3K3', { w: ['shackles'], b: [] }), 'shackles', 'e8'), 'короля нельзя');
});

test('Озарение: +2 карты, затем обязательный сброс одной', () => {
  let st = game('4k3/8/8/8/8/8/8/4K3', { w: ['insight', 'wall'], b: [] }, { w: 9, b: 9 }, { decks: { w: ['hook', 'meteor', 'blink'], b: [] } });
  st = card(st, 'insight');
  assert.equal(st.hand.w.length, 3, 'стена + 2 новые');
  assert.equal(st.pending.k, 'discard');
  const acts = legalActions(st);
  assert.ok(acts.every(a => a.k === 'd'), 'пока не сброшена карта — только сброс');
  st = apply(st, acts[0]).state;
  assert.equal(st.hand.w.length, 2); assert.equal(st.pending, null);
  assert.equal(st.turn, 'w', 'ход не закончен');
  assert.ok(legalActions(st).some(a => a.k === 'm'));
  assert.ok(!any(game('4k3/8/8/8/8/8/8/4K3', { w: ['insight'], b: [] }), 'insight'), 'пустая колода — карта бесполезна');
});

test('Марш: после хода фигурой — шаг пешкой, можно пропустить', () => {
  let st = game('4k3/8/8/8/8/8/3P4/R3K3', { w: ['march'], b: [] });
  st = card(st, 'march');
  st = move(st, 'a1', 'a5');
  assert.equal(st.pending.k, 'march'); assert.equal(st.turn, 'w');
  const step = legalActions(st).find(a => a.k === 'p' && a.from === q('d2'));
  assert.equal(step.to, q('d3'), 'на 1 клетку, не на 2');
  st = apply(st, step).state;
  assert.equal(at(st, 'd3').t, 'P'); assert.equal(st.turn, 'b');
  let s2 = card(game('4k3/8/8/8/8/8/3P4/R3K3', { w: ['march'], b: [] }), 'march');
  s2 = move(s2, 'a1', 'a5');
  s2 = apply(s2, { k: 'skip' }).state;
  assert.equal(at(s2, 'd2').t, 'P'); assert.equal(s2.turn, 'b');
  assert.ok(!any(game('4k3/8/8/8/8/8/8/R3K3', { w: ['march'], b: [] }), 'march'), 'без пешек нельзя');
});

test('Подмена: две свои фигуры меняются местами, король и пешка на край — нельзя', () => {
  let st = game('4k3/8/8/8/8/8/3P4/R2NK3', { w: ['swap'], b: [] });
  assert.ok(!has(st, 'swap', 'd1', 'e1'), 'не с королём');
  assert.ok(!has(st, 'swap', 'd2', 'd1'), 'пешка не встаёт на первую горизонталь');
  st = card(st, 'swap', 'a1', 'd1');
  assert.equal(at(st, 'a1').t, 'N'); assert.equal(at(st, 'd1').t, 'R'); assert.equal(st.turn, 'b');
});

test('Призрачный шаг: ладья проходит сквозь фигуры, бьёт конечную цель, стены держат', () => {
  let st = game('4k3/r7/8/8/P7/8/8/R3K3', { w: ['ghost', 'wall'], b: [] });
  assert.ok(!canMove(st, 'a1', 'a7'));
  st = card(st, 'ghost', 'a1');
  assert.ok(canMove(st, 'a1', 'a7'), 'бьёт сквозь свою пешку');
  assert.ok(!canMove(st, 'a1', 'a4'), 'свою не бьёт');
  st = move(st, 'a1', 'a7');
  assert.equal(at(st, 'a7').t, 'R'); assert.equal(st.ghost, null, 'призрак — только на этот ход');
  let s3 = game('4k3/8/8/8/8/8/8/R3K3', { w: ['ghost'], b: [] }); s3.walls[q('a4')] = 99;
  s3 = card(s3, 'ghost', 'a1');
  assert.ok(!canMove(s3, 'a1', 'a5'), 'стена держит призрака');
  assert.ok(!has(game('4k3/8/8/8/8/8/8/N3K3', { w: ['ghost'], b: [] }), 'ghost', 'a1'), 'конь не призрак');
});

test('Капкан: только своя половина, один; враг погибает, король выживает', () => {
  let st = game('4k3/8/8/8/8/8/8/4K3', { w: ['trap', 'trap'], b: [] });
  assert.ok(!has(st, 'trap', 'd5')); assert.ok(has(st, 'trap', 'd4'));
  st = card(st, 'trap', 'd4');
  st = move(st, 'e1', 'f1');
  st = game('4k3/8/8/3n4/8/8/8/4K3', { w: ['trap', 'trap'], b: [] });
  st = card(st, 'trap', 'c3');
  st = move(st, 'e1', 'd1');
  assert.ok(!legalActions(st).some(a => a.k === 'c'), 'у чёрных нет карт');
  st = move(st, 'd5', 'c3');
  assert.equal(at(st, 'c3'), null, 'конь попал в капкан'); assert.equal(st.traps.length, 0);
  assert.equal(st.stats.w.kills.trap, 1);
  assert.ok(any(st, 'trap') || st.turn === 'w');
  let k = game('8/p7/8/8/3k4/8/7P/4K3', { w: ['trap'], b: [] });
  k = card(k, 'trap', 'd3'); k = move(k, 'e1', 'f1');
  k = move(k, 'd4', 'd3');
  assert.equal(at(k, 'd3').t, 'K', 'король неуязвим');
});

test('Ударная волна: соседи отлетают на клетку, король стоит, упор — стоит', () => {
  let st = game('4k3/8/8/2pn4/2NB4/8/8/4K3', { w: ['shockwave'], b: [] });
  st = card(st, 'shockwave', 'd4');
  assert.equal(at(st, 'b6').t, 'P', 'пешка c5 → b6');
  assert.equal(at(st, 'd6').t, 'N', 'конь d5 → d6');
  assert.equal(at(st, 'b4').t, 'N', 'свой конь c4 → b4');
  assert.equal(at(st, 'd4').t, 'B', 'центр стоит');
  let k = game('8/8/8/8/3k4/3B4/8/4K3', { w: ['shockwave'], b: [] });
  assert.ok(!any(k, 'shockwave') || at(card(k, 'shockwave', 'd3'), 'd4').t === 'K', 'король не двигается');
});

test('Повышение: пешка становится конём или слоном', () => {
  let st = game('4k3/8/8/8/8/8/3P4/4K3', { w: ['promote'], b: [] });
  assert.ok(has(st, 'promote', 'd2', 'N') && has(st, 'promote', 'd2', 'B'));
  assert.ok(!has(st, 'promote', 'd2', 'Q'), 'не ферзь');
  st = card(st, 'promote', 'd2', 'B');
  assert.equal(at(st, 'd2').t, 'B'); assert.equal(st.turn, 'b');
});

test('Портал: фигура входит в один и выходит из другого; король не ходит порталами', () => {
  let st = game('4k3/8/8/8/8/8/8/R3K3', { w: ['portal'], b: [] });
  st = card(st, 'portal', 'a4', 'h4');
  st = move(st, 'e8', 'd8');
  st = move(st, 'a1', 'a4');
  assert.equal(at(st, 'a4'), null); assert.equal(at(st, 'h4').t, 'R', 'ладья вышла из второго портала');
  let k = game('4k3/8/8/8/8/8/8/R3K3', { w: ['portal'], b: [] });
  k = card(k, 'portal', 'h7', 'e2'); k = move(k, 'e8', 'd8');
  k = move(k, 'e1', 'e2');
  assert.equal(at(k, 'e2').t, 'K', 'король остался');
  let w = game('4k3/8/8/8/8/8/8/R3K3', { w: ['portal'], b: [] });
  w = card(w, 'portal', 'a4', 'h4');
  for (let i = 0; i < 3; i++) { w = move(w, i % 2 ? 'd8' : 'e8', i % 2 ? 'e8' : 'd8'); w = move(w, i % 2 ? 'b1' : 'a1', i % 2 ? 'a1' : 'b1'); }
  assert.equal(w.portals.length, 0, 'закрылся через 3 круга');
});

test('Портал учитывается в проверке шаха', () => {
  // слон e2 закрывает короля e1 от ладьи e8; войдя в портал e3→a6, он вскрыл бы линию
  let st = game('4r1k1/8/8/8/8/8/4B3/4K3', { w: ['portal'], b: [] });
  st = card(st, 'portal', 'a6', 'd3');
  st = move(st, 'g8', 'h8');
  assert.ok(!canMove(st, 'e2', 'd3'), 'нельзя: телепорт вскроет короля');
});

test('Возрождение: погибшая ладья, слон или конь на первую горизонталь', () => {
  let st = game('4k3/8/8/8/8/8/8/4K3', { w: ['rebirth'], b: [] }, { w: 9, b: 9 }, { grave: { w: ['N', 'Q', 'P'] } });
  assert.ok(has(st, 'rebirth', 'b1', 'N'));
  assert.ok(!has(st, 'rebirth', 'b1', 'Q'), 'ферзя нельзя');
  assert.ok(!has(st, 'rebirth', 'b2', 'N'), 'только первая горизонталь');
  st = card(st, 'rebirth', 'b1', 'N');
  assert.equal(at(st, 'b1').t, 'N'); assert.equal(st.grave.w.filter(t => t === 'N').length, 0);
  assert.ok(!any(game('4k3/8/8/8/8/8/8/4K3', { w: ['rebirth'], b: [] }), 'rebirth'), 'никто не погиб — нельзя');
});

test('Порча: вражеская фигура становится пешкой', () => {
  let st = game('4k3/8/8/3r4/8/8/8/4K3', { w: ['polymorph'], b: [] });
  st = card(st, 'polymorph', 'd5');
  assert.equal(at(st, 'd5').t, 'P'); assert.equal(at(st, 'd5').s, 'b');
  assert.ok(!has(game('4k3/8/8/3q4/8/8/8/4K3', { w: ['polymorph'], b: [] }), 'polymorph', 'd5'), 'ферзя нельзя');
  assert.ok(!has(game('3rk3/8/8/8/8/8/8/4K3', { w: ['polymorph'], b: [] }), 'polymorph', 'd8'), 'не на крайней горизонтали');
});

test('Землетрясение: все пешки на шаг вперёд, на край — ферзь, в одну клетку — обе стоят', () => {
  let st = game('4k3/1P6/8/3p4/8/8/3P4/4K3', { w: ['quake'], b: [] });
  st = card(st, 'quake');
  assert.equal(at(st, 'b8').t, 'Q', 'белая пешка b7 стала ферзём');
  assert.equal(at(st, 'd4').s, 'b'); assert.equal(at(st, 'd3').s, 'w');
  st = game('4k3/8/8/3p4/8/3P4/7P/4K3', { w: ['quake'], b: [] });
  st = card(st, 'quake');
  assert.equal(at(st, 'd5').s, 'b'); assert.equal(at(st, 'd3').s, 'w', 'обе хотели на d4 — стоят');
});

test('Зеркало: копия рядом, один раз за партию', () => {
  let st = game('4k3/8/8/8/3N4/8/8/4K3', { w: ['mirror', 'mirror'], b: [] });
  st = card(st, 'mirror', 'd4', 'e5');
  assert.equal(at(st, 'e5').t, 'N'); assert.notEqual(at(st, 'e5').id, at(st, 'd4').id);
  st = move(st, 'e8', 'd8');
  assert.ok(!any(st, 'mirror'), 'второй раз нельзя');
});

test('Капкан и порталы скрытно: стена на капкане ломает его', () => {
  let st = game('4k3/p7/8/8/8/8/7P/4K3', { w: ['trap'], b: ['wall'] });
  st = card(st, 'trap', 'd3'); st = move(st, 'e1', 'f1');
  st = card(st, 'wall', 'd3');
  assert.equal(st.traps.length, 0);
});

// ---------- хаос ----------
const chaosGame = (seed, extra = {}) => start(createGame({ seed, chaos: true, fen: '4k3/pppppppp/8/8/8/8/PPPPPPPP/4K3', decks: { w: [], b: [] }, hands: { w: [], b: [] }, ...extra })).state;
function shuffleKings(st, n) {
  for (let i = 0; i < n; i++) {
    if (st.pending) st = apply(st, legalActions(st)[0]).state;
    const ms = legalActions(st).filter(x => x.k === 'm' && !x.cap && !x.dbl);
    const a = ms.filter(x => st.board[x.from].t === 'P' && !x.promo).sort((x, y) => (x.from & 7) - (y.from & 7))[0] || ms[0];
    st = apply(st, a).state;
  }
  return st;
}

test('Хаос: объявление за круг, срабатывание каждые 8 кругов', () => {
  let st = chaosGame(3);
  st = shuffleKings(st, CHAOS_EVERY - 2);
  assert.ok(st.chaos.ann, 'объявлено за круг');
  const id = st.chaos.ann.id;
  st = shuffleKings(st, 2);
  assert.equal(st.chaos.ann, null); assert.equal(st.chaos.next, 2 * CHAOS_EVERY);
  assert.ok(id);
});

function fire(id, extra = {}) {
  let st = chaosGame(5, extra);
  st = shuffleKings(st, CHAOS_EVERY - 2);
  st.chaos.ann = { id, at: CHAOS_EVERY };
  return shuffleKings(st, 2);
}

test('Хаос: Звездопад, Тихий час, Кавалерия, Ускорение', () => {
  let st = fire('starfall');
  assert.ok(st.mana.w >= 9 || st.mana.w > 7, 'мана сверх лимита');
  st = fire('silence', { hands: { w: ['wall'], b: ['wall'] } });
  assert.ok(!any(st, 'wall'), 'карты молчат');
  st = fire('cavalry');
  assert.ok(legalActions(st).some(a => a.k === 'm' && st.board[a.from].t === 'P' && Math.abs((a.from & 7) - (a.to & 7)) === 1 && Math.abs((a.from >> 3) - (a.to >> 3)) === 2), 'пешка ходит конём');
  st = fire('haste', { hands: { w: ['wall', 'wall', 'wall'], b: [] } });
  const wall = () => legalActions(st).find(a => a.id === 'wall');
  st = apply(st, wall()).state;
  assert.ok(wall(), 'вторая быстрая карта разрешена');
  st = apply(st, wall()).state;
  assert.ok(!wall(), 'третья — нет');
});

test('Хаос: Лава сжигает фигуры на центре, король туда не ходит', () => {
  let st = fire('lava');
  st.board = st.board.map((p, i) => (i === q('d4') || i === q('e4') ? null : p));
  st.board[q('d4')] = { id: 90, s: 'w', t: 'N', moved: true, lm: 0 };
  st.board[q('e4')] = null;
  const kSq = st.board.findIndex(p => p && p.t === 'K' && p.s === 'w');
  st.board[kSq] = null; st.board[q('e3')] = { id: 91, s: 'w', t: 'K', moved: true, lm: 0 };
  assert.ok(!legalActions(st).some(a => a.k === 'm' && st.board[a.from].t === 'K' && [q('d4'), q('e4'), q('d5'), q('e5')].includes(a.to)));
  const stay = legalActions(st).find(a => a.k === 'm' && st.board[a.from].t === 'K');
  st = apply(st, stay).state;
  assert.equal(st.board.filter(p => p && p.t === 'N').length, 0, 'конь, оставшийся на лаве, сгорел');
});

test('Хаос: Дар — выбор 1 из 3 в начале своего хода', () => {
  let st = fire('gift');
  assert.equal(st.pending.k, 'gift');
  const n = st.hand.w.length, a = legalActions(st)[0];
  st = apply(st, a).state;
  assert.equal(st.hand.w.length, n + 1); assert.equal(st.pending, null);
  st = apply(st, legalActions(st).find(a => a.k === 'm' && !a.dbl)).state;
  assert.equal(st.turn, 'b');
  assert.equal(st.pending?.k, 'gift', 'чёрные выбирают в начале своего хода');
});

test('Хаос: Буря меняет карту в руке', () => {
  const st = fire('storm', { hands: { w: ['wall'], b: ['wall'] }, decks: { w: Array(10).fill('hook'), b: Array(10).fill('hook') } });
  assert.equal(st.discard.w.length, 1, 'одна карта сброшена');
  assert.equal(st.discard.b.length, 1);
  assert.equal(st.hand.w.length + st.deck.w.length, 10, 'и одна взята');
});

test('Детерминизм с хаосом и новыми картами', () => {
  const run = () => {
    let st = start(createGame({ seed: 99, chaos: true, decks: { w: PRESETS.chaos.deck, b: PRESETS.control.deck } })).state;
    for (let i = 0; i < 120 && !st.result; i++) { st = settle(st); if (st.result) break; const a = legalActions(st); st = apply(st, a[(i * 7) % a.length]).state; }
    return JSON.stringify(st.board);
  };
  assert.equal(run(), run());
});
