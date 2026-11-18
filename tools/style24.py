"""Стиль v0.4 «Камень» (утверждён 17.11.2026): фигуры 24×24, доска, подсветка, карты, аватары, мана, логотип.
Запускается ПОСЛЕ assets.py и extras.py и перезаписывает их ассеты новыми. Нужен Pillow:
  ../../runtime/pyvenv/bin/python -I style24.py ../web/assets ../preview
Эффекты (fx/*), эмоции и иконки карт остаются из assets.py/extras.py."""
import json, math, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw, ImageFont
import extras
from icons import icon as icon16
from cards import CARDS

HERE = os.path.dirname(os.path.abspath(__file__))
N = 24
SHAPES = json.load(open(os.path.join(HERE, 'style24_shapes.json')))
NAMES = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn']


def hx(s, a=255):
    return (int(s[1:3], 16), int(s[3:5], 16), int(s[5:7], 16), a)


def from_canvas(cv):
    im = Image.new('RGBA', (cv.w, cv.h))
    im.putdata([c or (0, 0, 0, 0) for row in cv.p for c in row])
    return im


# ---------- фигуры ----------
# b — тело, s — полосы, l — левый блик, r — правая тень, out — контур (и прорези/глаз)
MAIN = {'white': dict(b='#f4ecd8', s='#c9b48e', l='#ffffff', r='#e0d2b4', out='#2b1d14'),
        'black': dict(b='#463c63', s='#2a2340', l='#6c5c98', r='#3a3155', out='#0b0810')}
NIGHT = {'white': dict(b='#e8ecf4', s='#a8b0c8', l='#ffffff', r='#c8d0e0', out='#10121c'),
         'black': dict(b='#1c1e2a', s='#2e3244', l='#2a2e40', r='#141620', out='#9aa4c8')}


def from_old(pal):
    """Палитра старого скина (o, b, s, h, a, e) → новые ключи; полосы берут акцентный цвет."""
    return {side: dict(b=p['b'], s=p['a'], l=p['h'], r=p['s'], out=p['o']) for side, p in pal.items()}


SKINS = {k: from_old(v) for k, v in extras.SKINS.items()}
SKINS['night'] = NIGHT


def sprite(name, P, mirror=False):
    g = [list(r) for r in SHAPES[name]]
    for y in range(N):
        for x in range(N):
            if g[y][x] == 'b':
                if x + 1 < N and g[y][x + 1] == '.': g[y][x] = 'r'
                elif x > 0 and g[y][x - 1] == '.': g[y][x] = 'l'
    im = Image.new('RGBA', (N, N)); px = im.load()
    on = [[c != '.' for c in r] for r in g]
    for y in range(N):
        for x in range(N):
            c = g[y][x]
            if c != '.':
                px[x, y] = hx({'b': P['b'], 's': P['s'], 'l': P['l'], 'r': P['r'], 'd': P['out'], 'e': P['out']}[c])
            elif any(0 <= y + a < N and 0 <= x + b < N and on[y + a][x + b] for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                px[x, y] = hx(P['out'])
    return im.transpose(Image.FLIP_LEFT_RIGHT) if mirror else im


# ---------- доска «Камень» и запасные доски ----------
def stone_tile(c, seed, specks=10, veins=False):
    t = Image.new('RGBA', (N, N), hx(c)); px = t.load()
    rnd = random.Random(seed)
    sh = lambda k: tuple(max(0, min(255, v + k)) for v in hx(c)[:3]) + (255,)
    for _ in range(specks):
        x, y = rnd.randrange(1, N - 2), rnd.randrange(1, N - 2)
        px[x, y] = sh(-12); px[x + 1, y] = sh(-12)
    for _ in range(4):
        px[rnd.randrange(N), rnd.randrange(N)] = sh(10)
    if veins:
        x = rnd.uniform(0, N); y = 0.
        while y < N:
            if 0 <= x < N: px[int(x), int(y)] = sh(-22)
            x += rnd.uniform(-1.2, 1.2); y += .8
    return t


def board_pair(light, dark, seed, veins=False):
    return stone_tile(light, seed, veins=veins), stone_tile(dark, seed + 1, veins=veins)


# ---------- подсветка «Уголки и точки» и эффекты клеток ----------
GOLD, RED = (254, 231, 97, 255), (255, 59, 59, 255)


def corners(d, col, L):
    for x, y, dx, dy in [(0, 0, 1, 1), (N - 1, 0, -1, 1), (0, N - 1, 1, -1), (N - 1, N - 1, -1, -1)]:
        d.line((x, y, x + dx * L, y), fill=col); d.line((x, y, x, y + dy * L), fill=col)


def overlay(kind):
    o = Image.new('RGBA', (N, N)); d = ImageDraw.Draw(o)
    if kind == 'select': corners(d, GOLD, 5)
    elif kind == 'move': d.ellipse((9, 9, 14, 14), fill=(26, 22, 38, 130))
    elif kind == 'capture': corners(d, RED, 4)
    elif kind == 'danger':
        for y in range(N):
            for x in range(N):
                o.putpixel((x, y), (232, 59, 59, 150 if (x + y) % 8 < 3 else 70))
    elif kind == 'frozen':
        d.rectangle((0, 0, N - 1, N - 1), fill=(192, 240, 255, 110))
        for a, b in [((3, 4), (9, 10)), ((9, 10), (8, 18)), ((9, 10), (16, 7)), ((16, 7), (21, 13))]:
            d.line((*a, *b), fill=(255, 255, 255, 200))
        d.rectangle((0, 0, N - 1, N - 1), outline=(44, 232, 245, 160))
    elif kind == 'lava':
        rnd = random.Random(7)
        cols = ['#fee761', '#f77622', '#e83b3b', '#8c1c2c']
        for y in range(N):
            for x in range(N):
                v = math.sin(x * .5 + y * .2) + math.sin(y * .6 - x * .15) + rnd.random() * .6
                o.putpixel((x, y), hx(cols[0 if v > 1.6 else 1 if v > .4 else 2 if v > -.8 else 3]))
    elif kind == 'trap':
        ic = from_canvas(icon16('trap')).resize((20, 20), Image.NEAREST)
        a = ic.getchannel('A').point(lambda v: v * 130 // 255); ic.putalpha(a)
        o.alpha_composite(ic, (2, 2))
    elif kind == 'shadow':
        d.ellipse((4, 18, 19, 23), fill=(0, 0, 0, 70))
    return o


# ---------- карты: «Уголки из металла», рисунок «Свечение» ----------
ST = dict(base='#6f7d92', hi='#9aa6ba', lo='#3c4458', out='#141822', light='#d8cfb8')
METAL = {'common': ('#5a6070', '#9aa0ae'), 'rare': ('#7a8494', '#d6dce6'), 'epic': ('#6a3aa8', '#c08aff'),
         'legendary': ('#a8781a', '#fee761')}
DIG = {'0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111',
       '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001010010010'}
CW, CH = 36, 50


def stone(d, box, seed, base=ST['base']):
    x0, y0, x1, y1 = box
    d.rectangle(box, fill=hx(base))
    rnd = random.Random(seed); b = hx(base)
    for _ in range((x1 - x0) * (y1 - y0) // 18):
        d.point((rnd.randint(x0, x1 - 1), rnd.randint(y0, y1)), fill=tuple(max(0, v - 14) for v in b[:3]))


def bevel(d, box):
    x0, y0, x1, y1 = box
    d.line((x0, y0, x1, y0), fill=hx(ST['hi'])); d.line((x0, y0, x0, y1), fill=hx(ST['hi']))
    d.line((x0, y1, x1, y1), fill=hx(ST['lo'])); d.line((x1, y0, x1, y1), fill=hx(ST['lo']))


def type_mark(d, x, y, t):
    c = hx('#fee761')
    if t == 'quick':
        d.polygon([(x + 3, y), (x, y + 4), (x + 2, y + 4), (x + 1, y + 7), (x + 5, y + 3), (x + 3, y + 3), (x + 4, y)], fill=c)
    else:
        d.polygon([(x + 3, y), (x + 4, y + 2), (x + 6, y + 3), (x + 4, y + 4), (x + 5, y + 7), (x + 3, y + 5), (x + 1, y + 7),
                   (x + 2, y + 4), (x, y + 3), (x + 2, y + 2)], fill=c)


def glow_art(ic):
    """Манера «Свечение»: иконка на тёмном с ореолом её основного цвета. Окно 26×21."""
    a = Image.new('RGBA', (26, 21), hx('#0e1018')); d = ImageDraw.Draw(a)
    cols = [c for c in list(ic.get_flattened_data() if hasattr(ic, "get_flattened_data") else ic.getdata()) if c[3] > 128 and (c[0] * 3 + c[1] * 6 + c[2]) / 10 > 60]
    gc = tuple(sum(c[i] for c in cols) // len(cols) for i in range(3)) if cols else (255, 255, 255)
    for r, al in ((11, 40), (8, 70), (5, 90)):
        d.ellipse((13 - r, 10 - r, 13 + r, 10 + r), fill=gc + (al,))
    a.alpha_composite(ic, (5, 2))
    return a


def card(cid):
    cd = CARDS[cid]; t, r, cost = cd['type'], cd['rarity'], cd['cost']
    metal = METAL[r]
    im = Image.new('RGBA', (CW, CH)); d = ImageDraw.Draw(im)
    stone(d, (0, 0, CW - 1, CH - 1), cid); bevel(d, (1, 1, CW - 2, CH - 2))
    d.rectangle((0, 0, CW - 1, CH - 1), outline=hx(ST['out']))
    d.rectangle((4, 9, 31, 31), outline=hx(ST['out']))
    im.alpha_composite(glow_art(from_canvas(icon16(cid))), (5, 10))
    d.rectangle((4, 34, 31, 41), fill=hx(ST['light']), outline=hx(ST['out']))   # табличка имени — текст рисует игра
    for x, y, sx, sy in ((0, CH - 1, 1, -1), (CW - 1, CH - 1, -1, -1)):
        d.polygon([(x, y), (x + sx * 6, y), (x, y + sy * 6)], fill=hx(metal[0]))
        d.line((x + sx, y + sy * 4, x + sx * 4, y + sy), fill=hx(metal[1]))
    d.rectangle((CW - 9, 0, CW - 1, 8), fill=hx(metal[0])); type_mark(d, CW - 8, 1, t)
    d.polygon([(18, 42), (21, 45), (18, 48), (15, 45)], fill=hx(metal[1]), outline=hx(ST['out']))
    d.point((17, 44), fill=(255, 255, 255))
    d.ellipse((0, 0, 9, 9), fill=hx('#f0b429'), outline=hx(ST['out']))
    for i, b in enumerate(DIG[str(cost)]):
        if b == '1': d.point((3 + i % 3, 2 + i // 3), fill=hx(ST['out']))
    return im


def card_back():
    im = Image.new('RGBA', (CW, CH)); d = ImageDraw.Draw(im)
    stone(d, (0, 0, CW - 1, CH - 1), 'back'); bevel(d, (1, 1, CW - 2, CH - 2))
    d.rectangle((0, 0, CW - 1, CH - 1), outline=hx(ST['out'])); d.rectangle((4, 4, CW - 5, CH - 5), outline=hx(ST['lo']))
    d.ellipse((7, 14, 28, 35), fill=hx('#2a3040'), outline=hx('#f0b429'))
    k = sprite('knight', dict(b='#f0b429', s='#a8781a', l='#fee761', r='#c89020', out='#141822'))
    im.alpha_composite(k.crop((3, 3, 21, 22)), (9, 15))
    return im


# ---------- аватары: 12 персонажей в каменной рамке + 12 портретов фигур ----------
PORTRAIT_BG = ['#5a2a2a', '#2a3a5a', '#2a4a34', '#4a2a5a', '#5a4a24', '#2a4a50']


def framed(inner):
    im = Image.new('RGBA', (N, N)); d = ImageDraw.Draw(im)
    stone(d, (0, 0, N - 1, N - 1), 'av'); bevel(d, (1, 1, N - 2, N - 2))
    d.rectangle((0, 0, N - 1, N - 1), outline=hx(ST['out']))
    im.alpha_composite(inner.crop((0, 0, 20, 20)), (2, 2))
    return im


def portrait(i):
    side, n = ('white' if i < 6 else 'black'), NAMES[i % 6]
    im = Image.new('RGBA', (N, N)); d = ImageDraw.Draw(im)
    d.rectangle((0, 0, N - 1, N - 1), fill=hx(PORTRAIT_BG[i % 6]))
    d.ellipse((4, 17, 19, 22), fill=(0, 0, 0, 70))
    im.alpha_composite(sprite(n, MAIN[side]).crop((0, 1, 24, 23)), (0, 1))
    d.rectangle((0, 0, N - 1, N - 1), outline=hx(ST['out'])); d.rectangle((1, 1, N - 2, N - 2), outline=hx(ST['lo']))
    return im


# ---------- мана и логотип ----------
def mana(on):
    im = Image.new('RGBA', (9, 9)); d = ImageDraw.Draw(im)
    d.polygon([(4, 0), (8, 4), (4, 8), (0, 4)], fill=hx('#f0b429' if on else '#4a5468'), outline=hx('#141822'))
    if on: d.point((3, 2), fill=hx('#fff2a8')); d.point((4, 2), fill=hx('#fee761'))
    return im


FIRE = ['#fff2a8', '#fee761', '#feae34', '#f77622', '#e83b3b']
VIO = ['#f0dcff', '#d8a8ff', '#b25cff', '#8a3ad8', '#5e2aa0']


def logo(fonts):
    f = ImageFont.truetype(os.path.join(fonts, 'press-lat.woff2'), 16)

    def word(s):
        ms = []
        for ch in s:
            m = Image.new('L', (20, 20)); dd = ImageDraw.Draw(m); dd.fontmode = '1'; dd.text((1, 1), ch, font=f, fill=255)
            ms.append(m.crop(m.getbbox()))
        h = max(m.height for m in ms); w = sum(m.width for m in ms) + 2 * (len(ms) - 1)
        o = Image.new('L', (w, h)); x = 0
        for m in ms:
            o.paste(m, (x, h - m.height)); x += m.width + 2
        return o

    def paint(m, ramp):
        w, h = m.size; P = 3
        im = Image.new('RGBA', (w + 2 * P, h + 2 * P)); px = im.load(); mp = m.load()
        on = lambda x, y: 0 <= x < w and 0 <= y < h and mp[x, y] > 128
        for y in range(-P, h + P):
            for x in range(-P, w + P):
                if on(x, y): px[x + P, y + P] = hx(ramp[min(len(ramp) - 1, y * len(ramp) // h)])
                elif any(on(x + a, y + b) for a in (-1, 0, 1) for b in (-1, 0, 1)): px[x + P, y + P] = hx('#1a0f24')
                elif on(x - 1, y - 2) or on(x - 2, y - 1) or on(x - 2, y - 2): px[x + P, y + P] = hx('#3a2448')
        return im

    a, b = paint(word('CHAOS'), FIRE), paint(word('CHESS'), VIO)
    o = Image.new('RGBA', (max(a.width, b.width), a.height + b.height))
    o.alpha_composite(a, ((o.width - a.width) // 2, 0)); o.alpha_composite(b, ((o.width - b.width) // 2, a.height))
    return o


def up(im, k):
    return im.resize((im.width * k, im.height * k), Image.NEAREST)


if __name__ == '__main__':
    A, P = sys.argv[1], sys.argv[2]
    fonts = os.path.join(A, 'fonts')
    for side in ('white', 'black'):
        for n in NAMES:
            sprite(n, MAIN[side], mirror=(side == 'black' and n == 'knight')).save(f'{A}/pieces/{side}_{n}.png')
    for sk, pal in SKINS.items():
        os.makedirs(f'{A}/skins/{sk}', exist_ok=True)
        for side in ('white', 'black'):
            for n in NAMES:
                sprite(n, pal[side], mirror=(side == 'black' and n == 'knight')).save(f'{A}/skins/{sk}/{side}_{n}.png')
    stone_tile('#d8cfb8', 1).save(f'{A}/tiles/light.png'); stone_tile('#7d8aa0', 2).save(f'{A}/tiles/dark.png')
    for k in ['select', 'move', 'capture', 'danger', 'frozen', 'lava', 'trap', 'shadow']:
        overlay(k).save(f'{A}/tiles/ov_{k}.png')
    for i, (k, (l, dk, _, _)) in enumerate(extras.BOARDS.items()):
        lt, dt = board_pair(l, dk, i * 2 + 1, veins=(k == 'marble'))
        lt.save(f'{A}/boards/{k}_light.png'); dt.save(f'{A}/boards/{k}_dark.png')
    for cid in CARDS:
        card(cid).save(f'{A}/cards/{cid}.png')
    card_back().save(f'{A}/cards/_back.png')
    avs = [framed(from_canvas(extras.avatar(spec))) for spec in extras.AV] + [portrait(i) for i in range(12)]
    for i, a in enumerate(avs):
        a.save(f'{A}/avatars/{i}.png')
    mana(True).save(f'{A}/ui/mana_full.png'); mana(False).save(f'{A}/ui/mana_empty.png')
    lg = logo(fonts); lg.save(f'{A}/ui/logo.png')

    # спрайты для серверной картинки головоломки (render_puzzle.py работает без Pillow)
    def grid(im):
        return [[('#%02x%02x%02x' % im.getpixel((x, y))[:3]) if im.getpixel((x, y))[3] > 128 else None for x in range(im.width)]
                for y in range(im.height)]
    json.dump({'pieces': {f'{s_}_{n}': grid(sprite(n, MAIN[s_], mirror=(s_ == 'black' and n == 'knight')))
                          for s_ in ('white', 'black') for n in NAMES},
               'light': grid(stone_tile('#d8cfb8', 1)), 'dark': grid(stone_tile('#7d8aa0', 2))},
              open(os.path.join(HERE, 'style24_sprites.json'), 'w'), separators=(',', ':'))

    # превью
    os.makedirs(P, exist_ok=True)
    sheet = Image.new('RGBA', (6 * N, 2 * N))
    for j, side in enumerate(('white', 'black')):
        for i, n in enumerate(NAMES):
            t = stone_tile('#d8cfb8' if (i + j) % 2 == 0 else '#7d8aa0', i)
            t.alpha_composite(overlay('shadow')); t.alpha_composite(sprite(n, MAIN[side]))
            sheet.alpha_composite(t, (i * N, j * N))
    up(sheet, 5).save(f'{P}/v04_фигуры.png')
    ids = list(CARDS) + ['_back']
    cs = Image.new('RGBA', (7 * (CW + 4), ((len(ids) + 6) // 7) * (CH + 4)), hx('#1c1a24'))
    for i, cid in enumerate(ids):
        cs.alpha_composite(card(cid) if cid != '_back' else card_back(), ((i % 7) * (CW + 4), (i // 7) * (CH + 4)))
    up(cs, 3).save(f'{P}/v04_карты.png')
    av = Image.new('RGBA', (12 * (N + 2), 2 * (N + 2)), hx('#1c1a24'))
    for i, a in enumerate(avs):
        av.alpha_composite(a, ((i % 12) * (N + 2), (i // 12) * (N + 2)))
    up(av, 4).save(f'{P}/v04_аватары.png')
    sk = Image.new('RGBA', (12 * N, len(SKINS) * N), hx('#1c1a24'))
    for r, (k, pal) in enumerate(SKINS.items()):
        for j, side in enumerate(('white', 'black')):
            for i, n in enumerate(NAMES):
                t = stone_tile('#d8cfb8' if (i + j * 6 + r) % 2 == 0 else '#7d8aa0', i)
                t.alpha_composite(sprite(n, pal[side])); sk.alpha_composite(t, ((j * 6 + i) * N, r * N))
    up(sk, 3).save(f'{P}/v04_скины.png')
    up(lg, 4).save(f'{P}/v04_логотип.png')
    print('style24 ok:', len(CARDS), 'карт,', len(avs), 'аватаров,', len(SKINS), 'скинов')
