// Набор 2 «Буря»: механика заряда и 12 карт.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, start, apply, legalActions } from '../web/src/engine/game.js';
import { PRESETS, deckErrors, CARDS, CARD_IDS, zoneOf } from '../web/src/engine/cards.js';
import { sqIdx as q } from '../web/src/engine/rules.js';

const T = sq => sq.map(x => (typeof x === 'string' && x.length === 2 ? q(x) : x));
const eq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
// hands: [[id, заряд], ...] для белых
function game(fen, hand, mana = 9, extra = {}) {
  const st = start(createGame({ fen, seed: 3, decks: { w: Array(10).fill('wall'), b: Array(10).fill('wall') }, hands: { w: hand.map(h => h[0]), b: [] }, mana: { w: mana, b: 0 }, ...extra })).state;
  st.hand.w = st.hand.w.map((c, i) => ({ ...c, ch: hand[i][1] }));
  return st;
}
const find = (st, id, ...sq) => legalActions(st).find(a => a.k === 'c' && a.id === id && eq(a.tg, T(sq)));
const play = (st, id, ...sq) => { const a = find(st, id, ...sq); assert.ok(a, `${id} ${sq}`); return apply(st, a).state; };
const at = (st, s) => st.board[q(s)];
const pass = (st, f, t) => apply(st, legalActions(st).find(a => a.k === 'm' && a.from === q(f) && a.to === q(t))).state;

test('34 карты, у Набора 2 есть заряд, колода «Буря» валидна', () => {
  assert.equal(CARD_IDS.length, 34);
  assert.equal(CARD_IDS.filter(id => CARDS[id].charge).length, 12);
  assert.deepEqual(deckErrors(PRESETS.storm.deck), []);
});

test('заряд растёт на 1 в начале своего хода до 3, новая карта приходит пустой, в сброс — без заряда', () => {
  let st = start(createGame({ fen: '4k3/p7/8/8/8/8/7P/4K3', seed: 1, decks: { w: Array(10).fill('ward'), b: [] }, hands: { w: ['ward'], b: [] } })).state;
  assert.equal(st.hand.w[0].ch || 0, 1, 'первый ход уже даёт заряд');
  for (let i = 0; i < 4; i++) { st = pass(st, i % 2 ? 'd1' : 'e1', i % 2 ? 'e1' : 'd1'); st = pass(st, i % 2 ? 'd8' : 'e8', i % 2 ? 'e8' : 'd8'); }
  assert.equal(st.hand.w[0].ch, 3, 'не больше 3');
  assert.ok(st.hand.w.some(c => (c.ch || 0) < 3), 'добранные позже — слабее');
  st = play(st, 'ward', 'h2');
  assert.equal(st.discard.w.at(-1).ch, undefined);
});

test('Оберег: щит держится 1 + заряд кругов', () => {
  let st = game('4k3/p7/8/8/8/8/7P/4K3', [['ward', 2]]);
  st = play(st, 'ward', 'h2');
  assert.equal(st.shield[at(st, 'h2').id], st.ply + 6);
});

test('Бастион: стена на 3 + заряд кругов', () => {
  let st = game('4k3/p7/8/8/8/8/7P/4K3', [['bastion', 3]]);
  st = play(st, 'bastion', 'd4');
  assert.equal(st.walls[q('d4')], st.ply + 12);
});

test('Прилив: +1 + заряд маны, не больше 10', () => {
  let st = game('4k3/p7/8/8/8/8/7P/4K3', [['tide', 3]], 4);
  st = play(st, 'tide');
  assert.equal(st.mana.w, 8, '4 + 1 за ход − 1 цена + 1 + 3 заряда');
  let s2 = game('4k3/p7/8/8/8/8/7P/4K3', [['tide', 3]], 9);
  s2 = play(s2, 'tide'); assert.equal(s2.mana.w, 10);
});

test('Скачок: радиус 1 + заряд', () => {
  const st0 = game('4k3/p7/8/8/8/8/7P/R3K3', [['leap', 0]]);
  assert.ok(find(st0, 'leap', 'a1', 'b2') && !find(st0, 'leap', 'a1', 'c3'));
  const st3 = game('4k3/p7/8/8/8/8/7P/R3K3', [['leap', 3]]);
  assert.ok(find(st3, 'leap', 'a1', 'd4'));
  assert.equal(at(play(st3, 'leap', 'a1', 'd4'), 'd4').t, 'R');
});

test('Наставник: пешка идёт на 1 + заряд по свободной вертикали, не на последнюю', () => {
  const st = game('4k3/8/8/8/8/8/3P4/4K3', [['mentor', 3]]);
  assert.ok(find(st, 'mentor', 'd2', 'd6') && !find(st, 'mentor', 'd2', 'd7'));
  assert.equal(at(play(st, 'mentor', 'd2', 'd6'), 'd6').t, 'P');
  const bl = game('4k3/8/8/8/3p4/8/3P4/4K3', [['mentor', 3]]);
  assert.ok(find(bl, 'mentor', 'd2', 'd3') && !find(bl, 'mentor', 'd2', 'd5'), 'не через фигуры');
});

test('Иней: заморозка на 1 + заряд кругов', () => {
  let st = game('4k3/8/2n5/8/8/8/7P/4K3', [['frost', 2]]);
  st = play(st, 'frost', 'c6');
  assert.equal(st.frozen[at(st, 'c6').id], st.ply + 6);
  st = pass(st, 'e1', 'd1');
  assert.ok(!legalActions(st).some(a => a.k === 'm' && a.from === q('c6')));
});

test('Комета: крест без заряда, квадрат с зарядом 2+', () => {
  let st = game('4k3/8/8/2nnn3/8/8/7P/4K3', [['comet', 0]]);
  st = play(st, 'comet', 'd6');
  assert.equal(zoneOf(st.meteors[0]).length, 5);
  st = pass(st, 'e8', 'f8'); st = pass(st, 'e1', 'd1'); // ход белых не нужен: падает в начале хода белых
  let s2 = game('4k3/8/8/2nnn3/8/8/7P/4K3', [['comet', 0]]);
  s2 = play(s2, 'comet', 'd6'); s2 = pass(s2, 'e8', 'f8');
  assert.ok(at(s2, 'c5') && at(s2, 'e5'), 'угловые клетки креста целы');
  assert.equal(at(s2, 'd5'), null, 'центр креста выбит');
  let s3 = game('4k3/8/8/2nnn3/8/8/7P/4K3', [['comet', 2]]);
  s3 = play(s3, 'comet', 'd6'); s3 = pass(s3, 'e8', 'f8');
  assert.ok(!at(s3, 'c5') && !at(s3, 'e5'), 'квадрат 3×3 выбил всех');
});

test('Гарпун: дальность 3 + заряд', () => {
  const s0 = game('4k3/n7/8/8/8/8/8/R3K3', [['harpoon', 0]]);
  assert.ok(!find(s0, 'harpoon', 'a1', 'a7'), 'Крюк-дальность 3 не достаёт 6');
  const s3 = game('4k3/n7/8/8/8/8/8/R3K3', [['harpoon', 3]]);
  assert.equal(at(play(s3, 'harpoon', 'a1', 'a7'), 'a2').t, 'N');
});

test('Предвидение: столько карт, сколько заряда (минимум 1), лишние сгорают', () => {
  let st = game('4k3/p7/8/8/8/8/7P/4K3', [['foresight', 3]]);
  st = play(st, 'foresight');
  assert.equal(st.hand.w.length, 3);
  let s0 = game('4k3/p7/8/8/8/8/7P/4K3', [['foresight', 0]]);
  s0 = play(s0, 'foresight'); assert.equal(s0.hand.w.length, 1);
  let full = game('4k3/p7/8/8/8/8/7P/4K3', [['foresight', 3], ['wall', 0], ['wall', 0], ['wall', 0], ['wall', 0]]);
  full = play(full, 'foresight'); assert.equal(full.hand.w.length, 5);
});

test('Гроза: ладья с зарядом 2, ферзь с зарядом 3, король никогда', () => {
  assert.ok(!find(game('4k3/8/8/3r4/8/8/7P/4K3', [['storm', 1]]), 'storm', 'd5'));
  assert.ok(find(game('4k3/8/8/3r4/8/8/7P/4K3', [['storm', 2]]), 'storm', 'd5'));
  assert.ok(!find(game('4k3/8/8/3q4/8/8/7P/4K3', [['storm', 2]]), 'storm', 'd5'));
  const st = play(game('4k3/8/8/3q4/8/8/7P/4K3', [['storm', 3]]), 'storm', 'd5');
  assert.equal(at(st, 'd5'), null);
  assert.ok(!find(game('4k3/8/8/8/8/8/7P/4K3', [['storm', 3]]), 'storm', 'e8'));
});

test('Кузница: ладья с зарядом 2, ферзь с зарядом 3', () => {
  assert.ok(!find(game('4k3/8/8/8/8/8/3P4/4K3', [['forge', 1]]), 'forge', 'd2', 'R'));
  assert.ok(find(game('4k3/8/8/8/8/8/3P4/4K3', [['forge', 2]]), 'forge', 'd2', 'R'));
  assert.equal(at(play(game('4k3/8/8/8/8/8/3P4/4K3', [['forge', 3]]), 'forge', 'd2', 'Q'), 'd2').t, 'Q');
});

test('Феникс: пешка на вторую, фигура на первую, ферзь — только с зарядом 3', () => {
  const g = { grave: { w: ['P', 'Q', 'R'] } };
  const s1 = game('4k3/p7/8/8/8/8/8/4K3', [['phoenix', 1]], 9, g);
  assert.ok(find(s1, 'phoenix', 'd2', 'P') && find(s1, 'phoenix', 'a1', 'R') && !find(s1, 'phoenix', 'd1', 'Q'));
  const s3 = game('4k3/p7/8/8/8/8/8/4K3', [['phoenix', 3]], 9, g);
  assert.equal(at(play(s3, 'phoenix', 'd1', 'Q'), 'd1').t, 'Q');
});
