// Пиксельная карточка результата партии (PNG) и текст для пересылки.
import { CARDS } from '../engine/cards.js';

const CAUSE = { storm: 'Гроза', meteor: 'Метеор', lightning: 'Молния', mark: 'Метка охотника', trap: 'Капкан', ritual: 'Ритуал' };
const fig = n => (n % 10 === 1 && n % 100 !== 11 ? 'фигуру' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'фигуры' : 'фигур');
const moves = n => (n % 10 === 1 && n % 100 !== 11 ? 'ход' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'хода' : 'ходов');

// Самый яркий момент партии со стороны side.
export function highlight(stats) {
  const k = Object.entries(stats.kills || {}).filter(([c]) => CAUSE[c]).sort((a, b) => b[1] - a[1])[0];
  if (k) return `${CAUSE[k[0]]} забрал${['lightning', 'mark', 'storm'].includes(k[0]) ? 'а' : ''} ${k[1]} ${fig(k[1])}`;
  const p = Object.entries(stats.played || {}).sort((a, b) => b[1] - a[1])[0];
  if (p) return `Любимая карта: ${CARDS[p[0]].name} ×${p[1]}`;
  return `Сыграно карт: ${stats.cards}`;
}

export function shareText({ title, turns, line, link }) {
  return `Chaos Chess — ${title.toLowerCase()} за ${turns} ${moves(turns)}. ${line}.${link ? ' Сыграем? ' + link : ''}`;
}

export async function resultCard({ title, turns, line, sub, win, A, avatar }) {
  const W = 240, H = 126, k = 3, c = document.createElement('canvas');
  c.width = W * k; c.height = H * k;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.scale(k, k);
  g.fillStyle = '#1a1922'; g.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 4) { g.fillStyle = '#1e1d27'; g.fillRect(0, y, W, 2); }
  g.fillStyle = win ? '#265c42' : '#3e2d6e'; g.fillRect(4, 4, W - 8, H - 8);
  g.fillStyle = '#0b0810'; g.fillRect(6, 6, W - 12, H - 12);
  g.fillStyle = '#3c4458'; g.fillRect(8, 8, W - 16, H - 16);
  if (A.logo) g.drawImage(A.logo, 14, 11, 68, 68 * A.logo.height / A.logo.width);
  if (avatar) g.drawImage(avatar, W - 52, 12, 40, 40);
  const text = (t, x, y, size, col, font = 'Golos Text', weight = 700) => {
    g.font = `${font === 'Golos Text' ? weight : 400} ${size}px "${font}", system-ui, sans-serif`; g.fillStyle = '#0b0810'; g.fillText(t, x + 1, y + 1); g.fillStyle = col; g.fillText(t, x, y);
  };
  text(title.toUpperCase(), 14, 69, 15, win ? '#63c74d' : '#fee761');
  text(`за ${turns} ${moves(turns)}`, 14, 83, 10, '#efe6d2', 'Golos Text', 600);
  text(line, 14, 99, 12, '#2ce8f5');
  if (sub) text(sub, 14, 114, 9, '#c4c8d2', 'Golos Text', 500);
  for (let i = 0; i < 6; i++) { g.fillStyle = ['#fee761', '#f77622', '#b25cff', '#2ce8f5', '#63c74d', '#e83b3b'][i]; g.fillRect(W - 50 + i * 7, 58, 4, 4); }
  return new Promise(res => c.toBlob(b => res(b), 'image/png'));
}
