import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, start, apply, legalActions, settle, mulligan, sameAction } from '../web/src/engine/game.js';
import { sqIdx as q, inCheck } from '../web/src/engine/rules.js';

const game = (fen, hands = { w: [], b: [] }, mana = { w: 9, b: 9 }, extra = {}) =>
  start(createGame({ fen, seed: 7, hands, mana, decks: { w: [], b: [] }, ...extra })).state;
const card = (st, id, ...sq) => {
  const a = legalActions(st).find(a => a.k === 'c' && a.id === id && a.tg.join() === sq.map(q).join());
  assert.ok(a, `карта ${id} ${sq} должна быть легальной`);
  return apply(st, a);
};
const move = (st, f, t) => {
  const a = legalActions(st).find(a => a.k === 'm' && a.from === q(f) && a.to === q(t));
  assert.ok(a, `ход ${f}-${t} должен быть легальным`);
  return apply(st, a);
};
const has = (st, id, ...sq) => legalActions(st).some(a => a.k === 'c' && a.id === id && a.tg.join() === sq.map(q).join());
const at = (st, s) => st.board[q(s)];

test('старт: мана 1/2, по 3 карты, добор на чётных ходах, лимит руки 5', () => {
  let st = start(createGame({ seed: 1 })).state;
  assert.equal(st.mana.w, 1); assert.equal(st.mana.b, 1);
  assert.equal(st.hand.w.length, 3); assert.equal(st.hand.b.length, 3);
  st = move(st, 'e2', 'e4').state;
  assert.equal(st.mana.b, 2);
  assert.equal(st.hand.b.length, 3);
  st = move(st, 'e7', 'e5').state;
  assert.equal(st.hand.w.length, 4, 'второй ход белых — добор');
  const full = game('4k3/p7/8/8/8/8/P7/4K3', { w: ['shield', 'shield', 'shield', 'shield', 'shield'], b: [] }, { w: 0, b: 0 },
    { decks: { w: ['wall', 'wall'], b: [] } });
  let s2 = move(full, 'e1', 'd1').state; s2 = move(s2, 'e8', 'd8').state;
  assert.equal(s2.hand.w.length, 5); assert.equal(s2.discard.w.length, 1, 'лишняя карта сгорает');
});

test('мана не растёт выше 7, Ритуал даёт сверх лимита', () => {
  let st = game('4k3/8/8/8/8/8/4P3/4K3', { w: ['ritual'], b: [] }, { w: 7, b: 0 });
  assert.equal(st.mana.w, 7);
  st = card(st, 'ritual', 'e2').state;
  assert.equal(st.mana.w, 9); assert.equal(at(st, 'e2'), null);
  assert.equal(st.turn, 'w', 'быстрая карта не завершает ход');
});

test('за ход только одна быстрая карта, основная карта завершает ход', () => {
  let st = game('4k3/8/8/8/8/8/3PP3/4K3', { w: ['shield', 'wall', 'blink'], b: [] });
  st = card(st, 'shield', 'd2').state;
  assert.ok(!legalActions(st).some(a => a.k === 'c' && a.id === 'wall'), 'вторая быстрая карта запрещена');
  st = card(st, 'blink', 'e2', 'e4').state;
  assert.equal(st.turn, 'b');
});

test('Щит: фигуру нельзя взять, Молния по ней невозможна', () => {
  let st = game('4k3/8/8/3p4/4N3/8/8/4K3', { w: ['shield'], b: ['lightning'] });
  st = card(st, 'shield', 'e4').state;
  st = move(st, 'e1', 'd1').state;
  assert.ok(!legalActions(st).some(a => a.k === 'm' && a.from === q('d5') && a.to === q('e4')));
  assert.ok(!has(st, 'lightning', 'e4'));
});

test('Стена перекрывает линию и снимает шах', () => {
  let st = game('4r1k1/8/8/8/8/8/8/4K3', { w: ['wall'], b: [] });
  assert.ok(inCheck(st, 'w'));
  assert.ok(has(st, 'wall', 'e4'));
  st = card(st, 'wall', 'e4').state;
  assert.ok(!inCheck(st, 'w'));
  st = move(st, 'e1', 'd1').state;
  assert.ok(!legalActions(st).some(a => a.k === 'm' && a.from === q('e8') && a.to === q('e3')), 'ладья не проходит сквозь стену');
});

test('Стена держится 3 круга', () => {
  let st = game('7k/p7/8/8/8/8/P7/K7', { w: ['wall'], b: [] });
  st = card(st, 'wall', 'd4').state;
  const seq = [['a1', 'b1'], ['h8', 'g8'], ['b1', 'a1'], ['g8', 'h8'], ['a1', 'b1']];
  for (const [f, t] of seq) st = move(st, f, t).state;
  assert.ok(st.walls[q('d4')] !== undefined, 'ещё стоит перед 4-м ходом владельца');
  st = move(st, 'h8', 'g8').state;
  assert.equal(st.walls[q('d4')], undefined, 'исчезла в начале 4-го хода владельца');
});

test('Рывок: перенос на 2 клетки, нельзя бить и нельзя пешкой на крайнюю', () => {
  let st = game('4k3/1P6/8/8/8/8/8/R3K3', { w: ['blink'], b: [] });
  assert.ok(has(st, 'blink', 'a1', 'c3'));
  assert.ok(!has(st, 'blink', 'a1', 'd4'));
  assert.ok(!has(st, 'blink', 'b7', 'b8'));
  st = card(st, 'blink', 'a1', 'c3').state;
  assert.equal(at(st, 'c3').t, 'R'); assert.equal(st.turn, 'b');
  assert.ok(!legalActions(st).some(a => a.k === 'c'));
});

test('Крюк: притягивает врага вплотную к якорю', () => {
  let st = game('4k3/8/8/8/1n6/8/8/R3K3', { w: ['hook'], b: [] });
  assert.ok(!has(st, 'hook', 'a1', 'b4'), 'не на одной линии');
  st = game('4k3/8/8/n7/8/8/8/R3K3', { w: ['hook'], b: [] });
  st = card(st, 'hook', 'a1', 'a5').state;
  assert.equal(at(st, 'a2').t, 'N'); assert.equal(at(st, 'a5'), null);
});

test('Крюк не тянет через преграду и дальше 4 клеток', () => {
  const st = game('n3k3/8/8/8/8/8/P7/R3K3', { w: ['hook'], b: [] });
  assert.ok(!has(st, 'hook', 'a1', 'a8'));
  const st2 = game('n3k3/8/8/8/8/8/8/R3K3', { w: ['hook'], b: [] });
  assert.ok(!has(st2, 'hook', 'a1', 'a8'), '7 клеток — слишком далеко');
});

test('Стазис: замороженный атакующий не даёт шах, фигуры не ходят, эффект кончается через круг', () => {
  let st = game('4k3/8/8/8/8/8/3q4/4K3', { w: ['stasis'], b: [] });
  assert.ok(inCheck(st, 'w'));
  st = card(st, 'stasis', 'c2').state;
  assert.ok(!inCheck(st, 'w'));
  st = move(st, 'e1', 'f1').state;
  assert.ok(!legalActions(st).some(a => a.k === 'm' && a.from === q('d2')), 'ферзь заморожен');
  st = move(st, 'e8', 'f8').state;
  assert.equal(Object.keys(st.frozen).length, 0);
});

test('Метка: фигура погибает, если ею не сходили; спасается ходом', () => {
  let st = game('4k3/8/2n5/8/8/8/8/4K3', { w: ['mark', 'mark'], b: [] });
  st = card(st, 'mark', 'c6').state;
  st = move(st, 'e1', 'd1').state;
  st = move(st, 'e8', 'd8').state;
  assert.equal(at(st, 'c6'), null, 'конь погиб');
  assert.equal(st.mana.b, 9 >= 7 ? 9 : 0);
  let s2 = game('4k3/8/2n5/8/8/8/8/4K3', { w: ['mark'], b: [] });
  s2 = card(s2, 'mark', 'c6').state; s2 = move(s2, 'e1', 'd1').state;
  s2 = move(s2, 'c6', 'd4').state;
  assert.equal(at(s2, 'd4').t, 'N');
  assert.ok(!has(game('4k3/8/2q5/8/8/8/8/4K3', { w: ['mark'], b: [] }), 'mark', 'c6'), 'ферзя метить нельзя');
});

test('Метеор: через ход бьёт 3×3, свои тоже; король и щит выживают', () => {
  let st = game('4k3/8/8/2npb3/8/3N4/8/4K3', { w: ['meteor'], b: ['shield'] });
  st = card(st, 'meteor', 'd5').state;
  assert.equal(at(st, 'c5').t, 'N', 'пока цел');
  st = card(st, 'shield', 'e5').state;
  st = move(st, 'e8', 'd8').state;
  assert.equal(at(st, 'c5'), null); assert.equal(at(st, 'd5'), null);
  assert.equal(at(st, 'e5').t, 'B', 'под щитом выжил');
  assert.equal(at(st, 'd3').t, 'N', 'вне зоны');
  st = game('8/p7/8/3k4/8/8/P7/4K3', { w: ['meteor'], b: [] });
  st = card(st, 'meteor', 'd5').state; st = move(st, 'd5', 'd6').state;
  assert.equal(at(st, 'd6').t, 'K', 'король неуязвим');
});

test('Молния: только пешка, конь, слон; ярость даёт ману потерпевшему', () => {
  let st = game('4k3/8/8/3n4/3r4/8/8/4K3', { w: ['lightning'], b: [] }, { w: 9, b: 3 });
  assert.ok(!has(st, 'lightning', 'd4'));
  st = card(st, 'lightning', 'd5').state;
  assert.equal(at(st, 'd5'), null);
  assert.equal(st.mana.b, 3 + 1 + 1, '+1 ярость, +1 за ход');
});

test('Король неуязвим к картам', () => {
  const st = game('4k3/8/8/8/8/8/8/R3K3', { w: ['hook', 'mark', 'lightning', 'shield', 'blink'], b: [] });
  for (const a of legalActions(st).filter(a => a.k === 'c')) {
    for (const t of a.tg.slice(0, a.id === 'blink' ? 1 : 2)) assert.notEqual(st.board[t]?.t, 'K', `${a.id} не может трогать короля`);
  }
});

test('Нельзя сыграть основную карту под шахом, если она не спасает', () => {
  const st = game('4k3/8/8/8/8/2B5/8/r3K3', { w: ['meteor', 'blink'], b: [] });
  assert.ok(inCheck(st, 'w'));
  assert.ok(!legalActions(st).some(a => a.id === 'meteor'));
  assert.ok(legalActions(st).some(a => a.id === 'blink' && a.tg[0] === q('c3') && a.tg[1] === q('c1')), 'Рывок слоном на c1 закрывает шах');
});

test('Мат и пат', () => {
  let st = game('6k1/5ppp/8/8/8/8/8/R5K1', { w: [], b: [] });
  st = move(st, 'a1', 'a8').state;
  assert.deepEqual(settle(st).result, { winner: 'w', reason: 'mate' });
  st = game('7k/5Q2/6K1/8/8/8/8/8', { w: [], b: [] });
  st = move(st, 'f7', 'f8').state;
  assert.ok(!settle(st).result || settle(st).result.reason !== 'stalemate');
  st = game('7k/8/5QK1/8/8/8/8/8', { w: [], b: [] });
  st = move(st, 'f6', 'f7').state;
  assert.deepEqual(settle(st).result, { winner: null, reason: 'stalemate' });
});

test('Карта спасает от мата: Стазис на атакующего', () => {
  let st = game('6k1/5ppp/8/8/8/8/8/R5K1', { w: [], b: ['stasis'] }, { w: 0, b: 9 });
  st = move(st, 'a1', 'a8').state;
  assert.equal(settle(st).result, null, 'не мат: есть Стазис');
  st = card(st, 'stasis', 'a8').state;
  assert.ok(!inCheck(st, 'b'));
});

test('Мульлиган и детерминизм', () => {
  const a = createGame({ seed: 42 }), b = createGame({ seed: 42 });
  assert.deepEqual(a.hand.w, b.hand.w);
  const m = mulligan(a, 'w', a.hand.w.slice(0, 2).map(c => c.uid));
  assert.equal(m.hand.w.length, 3);
  assert.equal(m.deck.w.length + m.hand.w.length, 20);
  assert.ok(sameAction({ k: 'm', from: 1, to: 2 }, { k: 'm', from: 1, to: 2, cap: false }));
});

test('Метеор вскрыл короля: взять короля нельзя, сопернику шах', () => {
  // конь c7 прикрывает короля c8 от ладьи c1; белый метеор сожжёт коня
  let st = game('2k5/2n4p/8/8/8/8/P7/2R1K3', { w: ['meteor'], b: [] });
  st = card(st, 'meteor', 'b6').state;
  st = move(st, 'h7', 'h6').state;
  assert.equal(st.board[q('c7')], null, 'конь сгорел');
  assert.ok(!legalActions(st).some(a => a.k === 'm' && a.to === q('c8')), 'короля не бьют');
  st = move(st, 'a2', 'a3').state;
  assert.ok(inCheck(st, 'b'), 'чёрные под шахом и обязаны защищаться');
});
