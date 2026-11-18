"""Генерация всех ассетов Chaos Chess: python3 -I assets.py <папка_ассетов> <папка_превью>."""
import math, os, random, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pix import Canvas, C, hexc, digit
from pieces import piece, NAMES
from icons import icon, ICONS
from cards import CARDS

TYPE_COL = {'quick': ('#124e89', '#0099db', '#2ce8f5'), 'spell': ('#3e2d6e', '#7a3fc0', '#b25cff')}
RARITY = {'common': '#8b8ba0', 'rare': '#0099db', 'epic': '#b25cff', 'legendary': '#f0b429'}

# ---------- клетки и оверлеи ----------
def tile(light, seed):
    rnd = random.Random(seed)
    base, speck, hi = (('#d8cfb8', '#c9bfa6', '#e6dfcc') if light else ('#6f7d92', '#637087', '#7d8ba0'))
    t = Canvas(16, 16, hexc(base))
    for _ in range(7):
        x, y = rnd.randrange(16), rnd.randrange(16)
        t.set(x, y, hexc(speck)); t.set(x + 1, y, hexc(speck))
    for _ in range(3):
        t.set(rnd.randrange(16), rnd.randrange(16), hexc(hi))
    return t

def overlay(kind):
    o = Canvas(16, 16)
    if kind == 'select':
        for x, y, dx, dy in [(0, 0, 1, 1), (15, 0, -1, 1), (0, 15, 1, -1), (15, 15, -1, -1)]:
            for i in range(4):
                o.set(x + dx * i, y, C['lyellow']); o.set(x, y + dy * i, C['lyellow'])
            o.set(x + dx, y + dy, C['gold'])
    elif kind == 'move':
        o.disc(7.5, 7.5, 2, hexc('#1a1626', 120))
    elif kind == 'capture':
        for x, y, dx, dy in [(0, 0, 1, 1), (15, 0, -1, 1), (0, 15, 1, -1), (15, 15, -1, -1)]:
            for i in range(3):
                o.set(x + dx * i, y, C['red']); o.set(x, y + dy * i, C['red'])
    elif kind == 'danger':
        for y in range(16):
            for x in range(16):
                o.set(x, y, hexc('#e83b3b', 150 if (x + y) % 6 < 2 else 70))
    elif kind == 'frozen':
        o.rect(0, 0, 16, 16, hexc('#c0f0ff', 110))
        for a, b in [((2, 3), (6, 7)), ((6, 7), (5, 12)), ((6, 7), (11, 5)), ((11, 5), (14, 9))]:
            o.line(*a, *b, hexc('#ffffff', 200))
        o.frame(0, 0, 16, 16, hexc('#2ce8f5', 160))
    elif kind == 'lava':
        rnd = random.Random(7)
        for y in range(16):
            for x in range(16):
                v = math.sin(x * .7 + y * .3) + math.sin(y * .9 - x * .2) + rnd.random() * .6
                o.set(x, y, C['lyellow'] if v > 1.6 else C['orange'] if v > .4 else C['red'] if v > -.8 else C['dred'])
    elif kind == 'trap':
        ic = icon('trap')
        for y in range(16):
            for x in range(16):
                if ic.p[y][x]:
                    o.set(x, y, ic.p[y][x][:3] + (130,))
    elif kind == 'shadow':
        for y in range(13, 16):
            for x in range(16):
                if ((x - 7.5) / 6) ** 2 + ((y - 14) / 1.6) ** 2 <= 1:
                    o.set(x, y, hexc('#000000', 70))
    return o

# ---------- карты 36x50 ----------
def card(cid):
    cd = CARDS[cid]
    dark, mid, light = TYPE_COL[cd['type']]
    k = Canvas(36, 50)
    k.rect(1, 1, 34, 48, hexc(mid))
    k.line(1, 1, 34, 1, hexc(light)); k.line(1, 1, 1, 48, hexc(light))
    k.line(34, 2, 34, 48, hexc(dark)); k.line(2, 48, 34, 48, hexc(dark))
    k.frame(0, 0, 36, 50, C['out'])
    # окно арта
    k.rect(4, 9, 28, 24, C['out'])
    for y in range(10, 32):
        t = (y - 10) / 22
        col = tuple(round(a * (1 - t) + b * t) for a, b in zip(hexc('#1a1626')[:3], hexc(dark)[:3])) + (255,)
        k.line(5, y, 30, y, col)
    rnd = random.Random(cid)
    for _ in range(6):
        k.set(rnd.randrange(6, 30), rnd.randrange(11, 31), hexc(light, 160))
    k.blit(icon(cid).scaled(1), 10, 13)
    # плашка имени (текст рисует игра)
    k.rect(4, 35, 28, 8, C['out']); k.rect(5, 36, 26, 6, C['bone']); k.line(5, 41, 30, 41, C['sand'])
    # стоимость
    k.disc(6, 6, 5, C['out']); k.disc(6, 6, 4, C['dblue']); k.disc(6, 5.5, 3.2, C['blue'])
    digit(k, 5, 4, str(cd['cost']), C['white'])
    # тип: молния = быстрая, звезда = основная
    if cd['type'] == 'quick':
        k.poly([(31, 2), (27, 6.5), (30, 6.5), (28, 10), (33, 5), (30, 5), (32, 2)], C['lyellow'])
    else:
        k.poly([(30, 2), (31.3, 5), (34, 5.5), (32, 7.5), (32.7, 10.5), (30, 9), (27.3, 10.5), (28, 7.5),
                (26, 5.5), (28.7, 5)], C['lyellow'])
    # редкость
    k.poly([(18, 43.5), (21, 46.5), (18, 49.5), (15, 46.5)], C['out'])
    k.poly([(18, 44.5), (20, 46.5), (18, 48.5), (16, 46.5)], hexc(RARITY[cd['rarity']]))
    return k

def card_back():
    k = Canvas(36, 50, C['dviolet'])
    for y in range(50):
        for x in range(36):
            if (x + y) % 8 == 0 or (x - y) % 8 == 0:
                k.set(x, y, hexc('#4b3785'))
    k.frame(2, 2, 32, 46, C['violet'])
    for a in range(0, 360, 45):
        r = 9 if a % 90 == 0 else 6
        k.line(18, 25, round(18 + math.cos(math.radians(a)) * r), round(25 + math.sin(math.radians(a)) * r), C['lyellow'])
    k.disc(18, 25, 3, C['gold']); k.disc(18, 25, 1.5, C['red'])
    k.frame(0, 0, 36, 50, C['out']); k.frame(1, 1, 34, 48, C['night'])
    return k

# ---------- эффекты (полосы кадров) ----------
def strip(frames):
    w, h = frames[0].w, frames[0].h
    s = Canvas(w * len(frames), h)
    for i, f in enumerate(frames):
        s.blit(f, i * w, 0)
    return s

def explosion():
    out = []
    for t in range(8):
        rnd = random.Random(100 + t)
        f = Canvas(32, 32)
        r = [3, 6, 9, 11, 12, 13, 13, 13][t]
        for y in range(32):
            for x in range(32):
                d = math.hypot(x - 15.5, y - 15.5) + rnd.uniform(-1.5, 1.5)
                if d > r:
                    continue
                if t >= 5:
                    if rnd.random() < (t - 4) * 0.28 or d < r * (t - 4) * 0.25:
                        continue
                    f.set(x, y, C['dgray'] if d > r * .6 else C['stone'])
                elif d < r * (0.5 - t * 0.1):
                    f.set(x, y, C['white'])
                elif d < r * 0.6:
                    f.set(x, y, C['lyellow'])
                elif d < r * 0.8:
                    f.set(x, y, C['orange'])
                else:
                    f.set(x, y, C['red'] if t < 3 else C['dred'])
        if 2 <= t <= 6:
            for i in range(10):
                a = random.Random(i).uniform(0, 6.28)
                rr = r + 1 + t
                f.rect(round(15.5 + math.cos(a) * rr), round(15.5 + math.sin(a) * rr), 1 if t > 4 else 2, 1,
                       C['orange'] if t < 5 else C['dgray'])
        out.append(f)
    return strip(out)

def meteor_fall():
    out = []
    for t in range(6):
        f = Canvas(32, 32)
        cx, cy = 28 - t * 2.4, 2 + t * 2.8
        for i, col in enumerate(['dred', 'red', 'orange', 'yellow', 'lyellow']):
            L = 10 - i * 1.5
            f.line(cx + L, cy - L, cx, cy, C[col])
            f.line(cx + L + 1, cy - L, cx + 1, cy, C[col])
        f.disc(cx, cy, 3, C['dbrown']); f.disc(cx - .5, cy + .5, 2, C['brown']); f.set(round(cx) - 1, round(cy), C['yellow'])
        out.append(f.outline())
    return strip(out)

def freeze():
    out = []
    for t in range(6):
        f = Canvas(16, 16)
        f.disc(7.5, 7.5, min(8, 1 + t * 1.6), hexc('#c0f0ff', 90 + t * 10))
        L = min(7, 1 + t * 1.4)
        for a in (90, 30, 150):
            dx, dy = math.cos(math.radians(a)) * L, math.sin(math.radians(a)) * L
            f.line(7.5 - dx, 7.5 - dy, 7.5 + dx, 7.5 + dy, C['white'])
        if t >= 3:
            for x, y in [(2, 2), (13, 3), (3, 12), (12, 13)][:t - 2]:
                f.set(x, y, C['white'])
        out.append(f)
    return strip(out)

def teleport():
    out = []
    for t in range(6):
        f = Canvas(16, 32)
        w = [2, 6, 8, 6, 3, 1][t]
        f.rect(8 - w // 2, 0, w, 32, hexc('#2ce8f5', 150))
        f.rect(8 - max(w // 4, 1) // 2, 0, max(w // 4, 1), 32, hexc('#ffffff', 220))
        rnd = random.Random(t)
        for _ in range(8):
            f.set(rnd.randrange(2, 14), (rnd.randrange(32) - t * 5) % 32, C['ice'])
        out.append(f)
    return strip(out)

def lightning_fx():
    out = []
    for t in range(4):
        f = Canvas(16, 48)
        rnd = random.Random(33 + (t // 2))
        x, pts = 8, []
        for y in range(0, 48, 6):
            pts.append((x, y)); x = max(3, min(12, x + rnd.randint(-3, 3)))
        pts.append((8, 47))
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            for o in (-2, -1, 1):
                f.line(x0 + o, y0, x1 + o, y1, hexc('#fee761', 150 if t < 3 else 50))
            f.line(x0, y0, x1, y1, C['white'] if t < 3 else hexc('#ffffff', 90))
        if t == 1:
            f.disc(8, 44, 4, hexc('#fee761', 200))
        out.append(f)
    return strip(out)

def shield_loop():
    out = []
    for t in range(4):
        f = Canvas(16, 16)
        f.ring(7.5, 7.5, 7, 7, hexc('#2ce8f5', 170))
        f.disc(7.5, 7.5, 6.4, hexc('#2ce8f5', 35))
        a = t * 90
        f.ring(7.5, 7.5, 6, 7, hexc('#ffffff', 230), a, (a + 40) % 360)
        out.append(f)
    return strip(out)

def mark_loop():
    out = []
    for t in range(4):
        f = Canvas(16, 16)
        r = [6, 5.5, 5, 5.5][t]
        f.ring(7.5, 7.5, r, r, C['red'])
        g = round(r) - 2
        for a, b in [((7.5, 0), (7.5, 7.5 - g)), ((7.5, 15), (7.5, 7.5 + g)),
                     ((0, 7.5), (7.5 - g, 7.5)), ((15, 7.5), (7.5 + g, 7.5))]:
            f.line(*a, *b, C['red'])
        out.append(f)
    return strip(out)

def portal_loop():
    out = []
    for t in range(4):
        f = Canvas(16, 16)
        for y in range(16):
            for x in range(16):
                d = ((x - 7.5) / 6) ** 2 + ((y - 7.5) / 7.5) ** 2
                if d <= 1:
                    ang = math.atan2(y - 7.5, x - 7.5) + t * math.pi / 2 + d * 5
                    f.set(x, y, C['violet'] if d > .7 else (C['magenta'] if math.sin(ang * 2) > 0 else C['night']))
        out.append(f)
    return strip(out)

def mana_small(full):
    m = Canvas(7, 7)
    m.poly([(3.5, 0), (7, 3.5), (3.5, 7), (0, 3.5)], C['out'])
    m.poly([(3.5, 1), (6, 3.5), (3.5, 6), (1, 3.5)], C['cyan'] if full else C['dgray'])
    if full:
        m.set(3, 2, C['white'])
    return m

def wall_piece():
    return icon('wall')

# ---------- макет экрана ----------
def mockup():
    W, H = 160, 286
    m = Canvas(W, H, hexc('#14121c'))
    for y in range(H):
        if y % 4 == 0:
            m.line(0, y, W - 1, y, hexc('#17141f'))
    # соперник
    m.rect(6, 6, 24, 24, C['out']); m.rect(7, 7, 22, 22, C['dviolet']); m.blit(piece('king', 'black'), 10, 9)
    for i in range(7):
        m.blit(mana_small(i < 4), 36 + i * 8, 8)
    back = card_back()
    for i in range(4):
        m.blit(_shrink(back), 36 + i * 9, 18)
    m.rect(104, 10, 50, 6, C['out']); m.rect(105, 11, 32, 4, C['green'])
    # доска
    bx, by = 16, 44
    m.rect(bx - 5, by - 5, 138, 138, C['out']); m.rect(bx - 4, by - 4, 136, 136, hexc('#3a3150'))
    m.frame(bx - 4, by - 4, 136, 136, hexc('#5e5080')); m.rect(bx - 1, by - 1, 130, 130, C['out'])
    sq = lambda s: ('abcdefgh'.index(s[0]), 8 - int(s[1]))
    for r in range(8):
        for f in range(8):
            m.blit(tile((r + f) % 2 == 0, r * 8 + f), bx + f * 16, by + r * 16)
    put = lambda s, img: m.blit(img, bx + sq(s)[0] * 16, by + sq(s)[1] * 16)
    for s in ['b5', 'c5', 'd5', 'b6', 'c6', 'd6', 'b7', 'c7', 'd7']:
        put(s, overlay('danger'))
    for s in ['d3', 'e3', 'd4', 'e4']:
        put(s, overlay('frozen'))
    for s in ['d5', 'e5']:
        pass
    pos = {'g8': ('king', 'black'), 'f8': ('rook', 'black'), 'd8': ('queen', 'black'), 'c6': ('knight', 'black'),
           'e7': ('bishop', 'black'), 'a7': ('pawn', 'black'), 'b7': ('pawn', 'black'), 'f7': ('pawn', 'black'),
           'g7': ('pawn', 'black'), 'h7': ('pawn', 'black'), 'e5': ('pawn', 'black'),
           'g1': ('king', 'white'), 'f1': ('rook', 'white'), 'd1': ('queen', 'white'), 'c4': ('bishop', 'white'),
           'f3': ('knight', 'white'), 'a2': ('pawn', 'white'), 'b2': ('pawn', 'white'), 'e4': ('pawn', 'white'),
           'd4': ('pawn', 'white'), 'f2': ('pawn', 'white'), 'g2': ('pawn', 'white'), 'h2': ('pawn', 'white')}
    put('f3', overlay('select'))
    for s, img in pos.items():
        put(s, overlay('shadow')); put(s, piece(*img))
    put('h5', icon('wall'))
    pl = portal_loop()
    for s in ['a3', 'h6']:
        m.blit(_crop(pl, 0, 16), bx + sq(s)[0] * 16, by + sq(s)[1] * 16)
    m.blit(_crop(shield_loop(), 16, 16), bx + sq('c4')[0] * 16, by + sq('c4')[1] * 16)
    m.blit(_crop(mark_loop(), 0, 16), bx + sq('e7')[0] * 16, by + sq('e7')[1] * 16)
    for s in ['g5', 'd2', 'e1', 'h4']:
        put(s, overlay('move'))
    put('e5', overlay('capture'))
    # таймер метеора
    cx, cy = bx + sq('c6')[0] * 16, by + sq('c6')[1] * 16
    m.disc(cx + 14, cy + 1, 4, C['out']); m.disc(cx + 14, cy + 1, 3, C['red']); digit(m, cx + 13, cy - 1, '1', C['white'])
    # рука
    hand = ['shield', 'blink', 'hook', 'lightning']
    for i, cid in enumerate(hand):
        x, y = 4 + i * 38, 192 - (8 if cid == 'hook' else 0)
        k = card(cid)
        if CARDS[cid]['cost'] > 3:
            k = _dim(k)
        if cid == 'hook':
            m.frame(x - 1, y - 1, 38, 52, C['lyellow'])
        m.blit(k, x, y)
    for i in range(7):
        m.blit(mana_small(i < 3), 6 + i * 8, 250)
    m.rect(6, 262, 24, 18, C['out']); m.rect(7, 263, 22, 16, hexc('#3a3150'))
    m.blit(piece('king', 'white'), 10, 263)
    m.rect(104, 268, 50, 6, C['out']); m.rect(105, 269, 44, 4, C['green'])
    return m

def _crop(s, x0, w):
    c = Canvas(w, s.h)
    for y in range(s.h):
        c.p[y] = s.p[y][x0:x0 + w]
    return c

def _shrink(k):
    s = Canvas(8, 11)
    for y in range(11):
        for x in range(8):
            s.p[y][x] = k.p[min(49, round(y * 4.6))][min(35, round(x * 4.6))]
    s.frame(0, 0, 8, 11, C['out'])
    return s

def _dim(k):
    d = Canvas(k.w, k.h)
    for y in range(k.h):
        for x in range(k.w):
            c = k.p[y][x]
            if c:
                g = (c[0] + c[1] + c[2]) // 3
                d.p[y][x] = (g // 2 + 20, g // 2 + 16, g // 2 + 30, 255)
    return d

if __name__ == '__main__':
    A, P = sys.argv[1], sys.argv[2]
    for d in ['pieces', 'icons', 'cards', 'tiles', 'fx', 'ui']:
        os.makedirs(os.path.join(A, d), exist_ok=True)
    os.makedirs(P, exist_ok=True)
    for side in ['white', 'black']:
        for n in NAMES:
            piece(n, side).save(f'{A}/pieces/{side}_{n}.png')
    from icons import STORM_BASE
    for n in list(ICONS) + list(STORM_BASE):
        icon(n).save(f'{A}/icons/{n}.png')
    for cid in CARDS:
        card(cid).save(f'{A}/cards/{cid}.png')
    card_back().save(f'{A}/cards/_back.png')
    tile(True, 1).save(f'{A}/tiles/light.png'); tile(False, 2).save(f'{A}/tiles/dark.png')
    for k in ['select', 'move', 'capture', 'danger', 'frozen', 'lava', 'trap', 'shadow']:
        overlay(k).save(f'{A}/tiles/ov_{k}.png')
    fx = dict(explosion=explosion(), meteor_fall=meteor_fall(), freeze=freeze(), teleport=teleport(),
              lightning=lightning_fx(), shield=shield_loop(), mark=mark_loop(), portal=portal_loop())
    for k, v in fx.items():
        v.save(f'{A}/fx/{k}.png')
    mana_small(True).save(f'{A}/ui/mana_full.png'); mana_small(False).save(f'{A}/ui/mana_empty.png')
    json.dump({k: {'frames': v.w // (v.h if k not in ('teleport', 'lightning') else 16),
                   'w': v.h if k not in ('teleport', 'lightning') else 16, 'h': v.h} for k, v in fx.items()},
              open(f'{A}/fx/fx.json', 'w'), indent=1)

    # превью 1: фигуры на доске + лист фигур
    bg = hexc('#14121c')
    sheet = Canvas(6 * 20 + 4, 2 * 22 + 4, bg)
    for j, side in enumerate(['white', 'black']):
        for i, n in enumerate(NAMES):
            sheet.blit(overlay('shadow'), 4 + i * 20, 4 + j * 22); sheet.blit(piece(n, side), 4 + i * 20, 4 + j * 22)
    sheet.scaled(6).save(f'{P}/1_фигуры.png')
    # превью 2: все карты
    ids = list(CARDS)
    cols = 6
    sh = Canvas(cols * 40 + 4, ((len(ids) + 1 + cols - 1) // cols) * 54 + 4, bg)
    for i, cid in enumerate(ids + ['_back']):
        sh.blit(card(cid) if cid != '_back' else card_back(), 4 + (i % cols) * 40, 4 + (i // cols) * 54)
    sh.scaled(4).save(f'{P}/2_карты.png')
    # превью 3: эффекты и оверлеи
    rows = [fx['explosion'], fx['meteor_fall'], fx['freeze'], fx['shield'], fx['mark'], fx['portal'],
            fx['teleport'], fx['lightning']]
    W = max(r.w for r in rows) + 8
    Hh = sum(r.h + 4 for r in rows) + 28
    ev = Canvas(W, Hh, hexc('#2a2638'))
    y = 4
    for r in rows:
        ev.blit(r, 4, y); y += r.h + 4
    for i, k in enumerate(['select', 'move', 'capture', 'danger', 'frozen', 'lava', 'trap']):
        ev.blit(tile(i % 2 == 0, i), 4 + i * 18, y); ev.blit(overlay(k), 4 + i * 18, y)
    ev.scaled(4).save(f'{P}/3_эффекты.png')
    mockup().scaled(3).save(f'{P}/4_макет_экрана.png')
    print('ok')

# ---------- логотип ----------
LETTERS = {
 'C': ['01111', '11000', '11000', '11000', '11000', '11000', '01111'],
 'H': ['11011', '11011', '11011', '11111', '11011', '11011', '11011'],
 'A': ['01110', '11011', '11011', '11111', '11011', '11011', '11011'],
 'O': ['01110', '11011', '11011', '11011', '11011', '11011', '01110'],
 'S': ['01111', '11000', '11000', '01110', '00011', '00011', '11110'],
 'E': ['11111', '11000', '11000', '11110', '11000', '11000', '11111'],
}

def word(text, grad, k=2):
    w = len(text) * 6 * k - k
    c = Canvas(w, 7 * k)
    for n, ch in enumerate(text):
        for y, row in enumerate(LETTERS[ch]):
            for x, b in enumerate(row):
                if b == '1':
                    col = grad[min(len(grad) - 1, y * len(grad) // 7)]
                    c.rect(n * 6 * k + x * k, y * k, k, k, hexc(col))
    return c

def logo():
    a = word('CHAOS', ['#fee761', '#feae34', '#f77622', '#e83b3b'])
    b = word('CHESS', ['#e9d5ff', '#b25cff', '#9b45e0', '#5a2d9e'])
    W = max(a.w, b.w) + 8
    c = Canvas(W, a.h + b.h + 10)
    c.blit(a, (W - a.w) // 2, 3); c.blit(b, (W - b.w) // 2, a.h + 7)
    c.outline(C['out'], diag=True)
    sh = Canvas(c.w + 2, c.h + 2)
    for y in range(c.h):
        for x in range(c.w):
            if c.p[y][x]:
                sh.set(x + 2, y + 2, hexc('#000000', 120))
    sh.blit(c, 0, 0)
    for x, y in [(1, 2), (W - 3, 4), (W - 6, a.h + b.h + 7), (3, a.h + 8)]:
        sh.set(x, y, C['white'])
    return sh

if __name__ == '__main__':
    logo().save(os.path.join(sys.argv[1], 'ui', 'logo.png'))
    logo().scaled(4).save(os.path.join(sys.argv[2], '5_логотип.png'))
