// Кампания «Башня Хаоса»: 15 этажей, на каждом бот со своим правилом; 5, 10, 12 и 15 — боссы.
// Игрок всегда белыми. Награды: карты Расширения и косметика (без «плати и побеждай»).
import { PRESETS } from './cards.js';

export const FLOORS = [
  { name: 'Привратник', level: 'novice', deck: 'core', reward: { cards: ['shackles', 'insight'] },
    story: 'У подножия башни дремлет привратник. Говорят, он пропускает только тех, кто умеет держать щит.' },
  { name: 'Сторож лестницы', level: 'novice', deck: 'aggro', reward: { cards: ['march', 'swap'] },
    story: 'Ступени скрипят под шагами сторожа. Он любит ломиться вперёд — дай ему ошибиться.' },
  { name: 'Алхимик', level: 'fighter', deck: 'core', mana: 2, reward: { cards: ['ghost', 'trap'] }, rule: 'Алхимик начинает с +2 маны.',
    story: 'В колбах алхимика кипит мана. Он богаче тебя с первого хода — будь экономнее.' },
  { name: 'Страж часов', level: 'fighter', deck: 'control', chaos: true, reward: { cards: ['shockwave'] }, rule: 'Режим «Хаос».',
    story: 'Шестерёнки огромных часов сбивают ход времени. Каждые восемь кругов башня меняет правила.' },
  { name: 'Ледяная королева', level: 'fighter', deck: 'control', boss: 'ice', reward: { cards: ['promote', 'portal'], skin: 'icefire' },
    story: 'Пятый этаж покрыт инеем. Королева не спешит: она ждёт, пока твои фигуры застынут.' },
  { name: 'Огненный зал', level: 'fighter', deck: 'aggro', chaos: true, mana: 1, reward: { cards: ['rebirth'] }, rule: 'Хаос и +1 мана сопернику.',
    story: 'Пол зала дышит жаром. Здесь всё решается быстро.' },
  { name: 'Библиотекарь', level: 'fighter', deck: 'chaos', reward: { cards: ['polymorph'] },
    story: 'Книги библиотекаря переписывают доску: порталы, землетрясения, подмены.' },
  { name: 'Туманная галерея', level: 'fighter', deck: 'control', chaos: true, mana: 2, reward: { cards: ['quake'] }, rule: 'Хаос и +2 маны сопернику.',
    story: 'В галерее не видно дальше вытянутой руки. Считай на ход вперёд.' },
  { name: 'Мастер клинка', level: 'master', deck: 'core', reward: { cards: ['mirror'] },
    story: 'Старый мастер играет чисто и считает на три хода. Карты у него самые простые — и самые опасные.' },
  { name: 'Некромант', level: 'master', deck: 'control', boss: 'necro', reward: { cards: ['ward', 'tide'], skin: 'bones' },
    story: 'Десятый этаж пахнет пылью склепа. Павшие пешки Некроманта встают снова.' },
  { name: 'Двойник', level: 'master', deck: 'aggro', mana: 1, reward: { cards: ['leap', 'mentor'], board: 'marble' }, rule: '+1 мана сопернику.',
    story: 'Он ходит как ты, только быстрее. Не давай ему темпа.' },
  { name: 'Зеркальный рыцарь', level: 'master', deck: 'chaos', boss: 'mirror', reward: { cards: ['bastion', 'frost'], board: 'lava' },
    story: 'Рыцарь в зеркальных латах повторяет каждое твоё заклинание.' },
  { name: 'Лавовые ступени', level: 'master', deck: 'aggro', chaos: true, mana: 1, reward: { cards: ['comet', 'foresight'], board: 'forest' }, rule: 'Хаос и +1 мана сопернику.',
    story: 'Ступени плавятся под ногами. Осталось совсем немного.' },
  { name: 'Хранитель', level: 'master', deck: 'control', mana: 3, reward: { cards: ['harpoon', 'forge'], skin: 'neon' }, rule: '+3 маны сопернику.',
    story: 'Хранитель вершины копил ману веками. Пусть тратит — а ты бей.' },
  { name: 'Бомбардир', level: 'master', deck: 'chaos', boss: 'bomber', chaos: true, reward: { cards: ['storm', 'phoenix'], skin: 'gold', title: 'Покоритель башни' },
    story: 'На вершине башни Бомбардир осыпает доску метеорами. Победи — и башня твоя.' },
];

// Параметры партии для этажа i (0..14).
// diff: 'easy' — бот на уровень слабее и без бонусной маны; 'hard' — на уровень сильнее и +1 мана.
const LEVELS = ['novice', 'fighter', 'master'];
export function floorGame(i, diff = 'normal') {
  const F = FLOORS[i], k = LEVELS.indexOf(F.level);
  const level = diff === 'easy' ? LEVELS[Math.max(0, k - 1)] : diff === 'hard' ? LEVELS[Math.min(2, k + 1)] : F.level;
  const botMana = diff === 'easy' ? 0 : (F.mana || 0) + (diff === 'hard' ? 1 : 0);
  return { botDeck: PRESETS[F.deck].deck, level, chaos: !!F.chaos, boss: F.boss || null, botMana };
}
