// Бот на всех колодах и довыборах; головоломки дня решаемы и требуют карту.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGame, start, apply, legalActions, settle, sameAction } from '../web/src/engine/game.js';
import { chooseAction } from '../web/src/bot/bot.js';
import { PRESETS } from '../web/src/engine/cards.js';
import { unpack, solutions, pack } from '../web/src/engine/puzzle.js';
import { sqIdx as q } from '../web/src/engine/rules.js';

test('бот играет любой колодой и в «Хаосе»: всегда легальное действие', () => {
  const keys = Object.keys(PRESETS);
  for (let g = 0; g < 4; g++) {
    let st = start(createGame({ seed: 70 + g, chaos: true, fog: true, decks: { w: PRESETS[keys[g]].deck, b: PRESETS[keys[(g + 1) % 4]].deck } })).state;
    for (let i = 0; i < 60; i++) {
      st = settle(st);
      if (st.result) break;
      const a = chooseAction(st, 'novice');
      assert.ok(legalActions(st).some(x => sameAction(x, a)), `нелегальное действие ${JSON.stringify(a)}`);
      st = apply(st, a).state;
    }
  }
});

test('бот решает довыборы: сброс Озарения, Марш', () => {
  let st = start(createGame({ seed: 2, fen: '4k3/8/8/8/8/8/3P4/R3K3', decks: { w: ['hook', 'meteor'], b: [] }, hands: { w: ['insight', 'march'], b: [] }, mana: { w: 9, b: 0 } })).state;
  st = apply(st, legalActions(st).find(a => a.id === 'insight')).state;
  const d = chooseAction(st, 'fighter');
  assert.equal(d.k, 'd');
});

test('Мастер и Боец видят мат в 2 хода с жертвой', () => {
  const st = start(createGame({ seed: 1, fen: '5r1k/6pp/8/8/8/8/R4PPP/R5K1', decks: { w: [], b: [] }, hands: { w: [], b: [] }, mana: { w: 0, b: 0 } })).state;
  for (const lv of ['fighter', 'master']) {
    const a = chooseAction(st, lv, () => 0.5);
    assert.deepEqual([a.from, a.to], [q('a2'), q('a8')], lv);
  }
});

test('головоломки: ≥250 штук с номерами и сложностью; у каждой есть решение и оно требует карту', () => {
  const { puzzles } = JSON.parse(fs.readFileSync(new URL('../web/puzzles.json', import.meta.url)));
  assert.ok(puzzles.length >= 250, `головоломок ${puzzles.length}`);
  assert.equal(new Set(puzzles.map(p => p.id)).size, puzzles.length, 'номера уникальны');
  assert.ok(puzzles.every(p => [1, 2, 3].includes(p.diff)), 'у всех есть сложность');
  for (const P of puzzles) {
    const st = unpack(P), sol = solutions(st, 20);
    assert.ok(sol.length >= 1, P.fen);
    assert.ok(!sol.some(l => l.every(a => a.k === 'm')), `обычный ход матует: ${P.fen}`);
    assert.deepEqual(pack(st).fen, P.fen);
  }
});
