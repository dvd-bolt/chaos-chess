"""Картинка головоломки для канала: python3 -I render_puzzle.py <выход.png>  (JSON головоломки — в stdin).
Доска 8×8 из тех же пиксельных спрайтов, что в игре, справа — карты в руке и мана."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pix import Canvas, hexc, C
from icons import icon

# стиль v0.4: фигуры и клетки 24×24 берём из style24_sprites.json (его пишет style24.py)
S = 24
SPR = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'style24_sprites.json')))

def from_grid(g):
    cv = Canvas(len(g[0]), len(g))
    for y, row in enumerate(g):
        for x, col in enumerate(row):
            if col: cv.p[y][x] = hexc(col)
    return cv

def piece(name, side):
    return from_grid(SPR['pieces'][f'{side}_{name}'])

NAMES = {'K': 'king', 'Q': 'queen', 'R': 'rook', 'B': 'bishop', 'N': 'knight', 'P': 'pawn'}

def board_from_fen(fen):
    rows, out = fen.split(' ')[0].split('/'), []
    for r in rows:
        line = []
        for ch in r:
            if ch.isdigit(): line += [None] * int(ch)
            else: line.append(('white' if ch.isupper() else 'black', NAMES[ch.upper()]))
        out.append(line)
    return out

def render(P, path):
    flip = P.get('turn') == 'b'
    W, H = 8 * S + 8 + 44, 8 * S + 8
    c = Canvas(W, H, hexc('#1a1922'))
    c.rect(1, 1, 8 * S + 6, 8 * S + 6, hexc('#4a5468'))
    light, dark = from_grid(SPR['light']), from_grid(SPR['dark'])
    b = board_from_fen(P['fen'])
    walls = {int(k) for k in (P.get('walls') or {})}
    for r in range(8):
        for f in range(8):
            rr, ff = (7 - r, 7 - f) if flip else (r, f)
            x, y = 4 + f * S, 4 + r * S
            c.blit(dark if (rr + ff) % 2 else light, x, y)
            if rr * 8 + ff in walls: c.blit(icon('wall'), x + 4, y + 4)
            p = b[rr][ff]
            if p: c.blit(piece(p[1], p[0]), x, y)
    # рука: иконки карт в рамках, сверху мана
    x0 = 8 * S + 10
    for i in range(min(P.get('mana', 0), 10)):
        c.rect(x0 + (i % 5) * 7, 4 + (i // 5) * 7, 5, 5, hexc('#f0b429'))
    for i, cid in enumerate(P['hand'][:5]):
        y = 20 + i * 34
        c.rect(x0, y, 20, 20, C['out']); c.rect(x0 + 1, y + 1, 18, 18, hexc('#3c4458'))
        c.blit(icon(cid), x0 + 2, y + 2)
    c.scaled(4).save(path)

if __name__ == '__main__':
    render(json.load(sys.stdin), sys.argv[1])
