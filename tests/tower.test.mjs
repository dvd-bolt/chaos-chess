// Боссы Башни Хаоса и данные кампании.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, start, apply, legalActions, settle } from '../web/src/engine/game.js';
import { FLOORS, floorGame } from '../web/src/engine/campaign.js';
import { CARD_IDS, CARDS, deckErrors } from '../web/src/engine/cards.js';
import { chooseAction } from '../web/src/bot/bot.js';

const boss = (id, extra = {}) => start(createGame({ seed: 4, boss: id, decks: { w: Array(20).fill('wall'), b: Array(20).fill('wall') }, ...extra })).state;
function run(st, n) { // n полных ходов: только ходы фигурами, первый попавшийся без взятий
  for (let i = 0; i < n && !st.result; i++) {
    st = settle(st); if (st.result) break;
    if (st.pending) { st = apply(st, legalActions(st)[0]).state; continue; }
    const acts = legalActions(st).filter(a => a.k === 'm');
    st = apply(st, acts[(i * 7) % acts.length]).state;
  }
  return st;
}

test('кампания: 15 этажей, все 25 карт Расширения и Набора 2 открываются в башне, колоды валидны', () => {
  assert.equal(FLOORS.length, 15);
  const ext = CARD_IDS.filter(id => CARDS[id].set !== 'core');
  const given = FLOORS.flatMap(F => F.reward.cards || []);
  assert.deepEqual([...given].sort(), [...ext].sort());
  for (let i = 0; i < 15; i++) assert.deepEqual(deckErrors(floorGame(i).botDeck), []);
  assert.deepEqual(FLOORS.map((F, i) => F.boss ? i + 1 : 0).filter(Boolean), [5, 10, 12, 15]);
});

test('Ледяная королева замораживает фигуры игрока на своём 3-м ходу', () => {
  let st = boss('ice'), frozenSeen = false;
  for (let i = 0; i < 12; i++) { st = run(st, 1); if (Object.keys(st.frozen).some(id => st.board.find(p => p && p.id === +id)?.s === 'w')) frozenSeen = true; }
  assert.ok(frozenSeen);
});

test('Некромант поднимает пешку на 5-м ходу', () => {
  let st = boss('necro', { fen: 'rnbqkbnr/8/8/8/8/8/PPPPPPPP/RNBQKBNR' });
  const before = st.board.filter(p => p && p.s === 'b' && p.t === 'P').length;
  st = run(st, 9);
  assert.ok(st.board.filter(p => p && p.s === 'b' && p.t === 'P').length > before);
});

test('Бомбардир вызывает видимый метеор на фигуру игрока', () => {
  let st = boss('bomber'), seen = false;
  for (let i = 0; i < 9 && !seen; i++) { st = run(st, 1); if (st.meteors.some(m => m.owner === 'b')) seen = true; }
  assert.ok(seen);
});

test('Зеркальный рыцарь получает копию сыгранной карты', () => {
  let st = start(createGame({ seed: 2, boss: 'mirror', decks: { w: [], b: [] }, hands: { w: ['wall'], b: [] }, mana: { w: 5, b: 0 } })).state;
  st = apply(st, legalActions(st).find(a => a.id === 'wall')).state;
  assert.deepEqual(st.hand.b.map(c => c.id), ['wall']);
  assert.equal(st.extra.b, 1);
});

test('бот проходит партию на этаже-боссе без нелегальных действий', () => {
  const g = floorGame(14);
  let st = start(createGame({ seed: 9, boss: g.boss, chaos: g.chaos, decks: { w: g.botDeck, b: g.botDeck }, mana: { b: 1 + g.botMana } })).state;
  for (let i = 0; i < 40 && !st.result; i++) { st = settle(st); if (st.result) break; st = apply(st, chooseAction(st, 'novice')).state; }
  assert.ok(st.ply > 10);
});
