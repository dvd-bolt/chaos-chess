"""Иконки карт 16x16 из примитивов; обводка добавляется автоматически."""
import math
from pix import Canvas, C

def _new():
    return Canvas(16, 16)

def blink():
    c = _new()
    c.ring(4, 11, 2, 2, C['cyan'])
    for x, y in [(4, 7), (5, 5), (7, 4), (9, 4)]:
        c.set(x, y, C['ice'])
    c.disc(11, 9, 3, C['blue']); c.disc(11, 9, 2, C['cyan']); c.set(10, 8, C['white'])
    for x, y in [(14, 4), (13, 13), (7, 13)]:
        c.set(x, y, C['white'])
    return c

def swap():
    c = _new()
    c.line(2, 5, 12, 5, C['yellow']); c.line(2, 6, 12, 6, C['yellow'])
    c.poly([(11, 2), (15, 5.5), (11, 9)], C['lyellow'])
    c.line(4, 10, 14, 10, C['orange']); c.line(4, 11, 14, 11, C['orange'])
    c.poly([(5, 7), (1, 10.5), (5, 14)], C['orange'])
    return c

def ghost():
    c = _new()
    c.disc(8, 7, 5, C['ice'])
    c.rect(3, 7, 11, 5, C['ice'])
    for x in (3, 7, 11):
        c.rect(x, 12, 2, 2, C['ice'])
    c.rect(5, 6, 2, 3, C['dviolet']); c.rect(9, 6, 2, 3, C['dviolet'])
    c.set(5, 6, C['white']); c.set(9, 6, C['white'])
    c.line(12, 4, 12, 9, C['cyan'])
    return c

def march():
    c = _new()
    c.disc(6, 5, 2, C['bone']); c.rect(5, 7, 3, 4, C['bone']); c.rect(3, 11, 7, 3, C['bone'])
    for oy in (4, 9):
        c.line(10, oy + 3, 12, oy, C['green']); c.line(12, oy, 14, oy + 3, C['green'])
        c.line(10, oy + 4, 12, oy + 1, C['green']); c.line(12, oy + 1, 14, oy + 4, C['green'])
    return c

def hook():
    c = _new()
    for i in range(0, 7, 2):
        c.ring(2 + i, 2 + i, 1, 1, C['gray'])
    c.rect(8, 7, 2, 4, C['lstone'])
    c.ring(8, 11, 3, 4, C['lstone'], 0, 180)
    c.poly([(3, 11), (6, 11), (4, 8)], C['white'])
    c.set(9, 8, C['white'])
    return c

def stasis():
    c = _new()
    for a in (90, 30, 150):
        dx, dy = math.cos(math.radians(a)) * 6, math.sin(math.radians(a)) * 6
        c.line(8 - dx, 8 - dy, 8 + dx, 8 + dy, C['ice'])
    for a in range(30, 360, 60):
        x, y = 8 + math.cos(math.radians(a)) * 4, 8 + math.sin(math.radians(a)) * 4
        c.disc(x, y, 1, C['cyan'])
    c.disc(8, 8, 1.5, C['white'])
    return c

def shackles():
    c = _new()
    c.ring(5, 9, 2, 3, C['lstone']); c.ring(11, 9, 2, 3, C['gray'])
    c.line(8, 9, 8, 9, C['lstone'])
    c.rect(6, 1, 4, 4, C['gold']); c.ring(8, 2, 1, 1, C['dbrown'], 180, 360)
    c.set(8, 3, C['out'])
    return c

def shockwave():
    c = _new()
    c.ring(8, 8, 6, 6, C['orange'], 300, 60); c.ring(8, 8, 6, 6, C['orange'], 120, 240)
    c.ring(8, 8, 4, 4, C['yellow'], 300, 60); c.ring(8, 8, 4, 4, C['yellow'], 120, 240)
    c.disc(8, 8, 2, C['lyellow']); c.set(8, 8, C['white'])
    return c

def meteor():
    c = _new()
    for i, col in enumerate(['red', 'orange', 'yellow', 'lyellow']):
        c.line(1 + i, 2 + i * 0, 8 + i, 9, C[col]); c.line(2 + i, 1, 9 + i, 8, C[col])
    c.disc(11, 11, 3.5, C['dbrown']); c.disc(11, 11, 2.5, C['brown'])
    c.set(10, 10, C['yellow']); c.set(12, 12, C['dbrown']); c.set(11, 9, C['orange'])
    return c

def mark():
    c = _new()
    c.ring(8, 8, 5, 5, C['red'])
    for a, b in [((8, 1), (8, 5)), ((8, 11), (8, 15)), ((1, 8), (5, 8)), ((11, 8), (15, 8))]:
        c.line(*a, *b, C['red'])
    c.disc(8, 8, 1, C['pink']); c.set(8, 8, C['white'])
    return c

def lightning():
    c = _new()
    c.poly([(9, 0), (3, 9), (7, 9), (5, 16), (13, 6), (9, 6), (12, 0)], C['lyellow'])
    c.line(9, 1, 5, 8, C['white'])
    return c

def trap():
    c = _new()
    c.rect(2, 3, 12, 3, C['stone']); c.rect(2, 11, 12, 3, C['stone'])
    c.line(2, 3, 13, 3, C['lstone']); c.line(2, 11, 13, 11, C['lstone'])
    for x in range(2, 14, 3):
        c.poly([(x, 6), (x + 3, 6), (x + 1.5, 8.5)], C['white'])
        c.poly([(x, 11), (x + 3, 11), (x + 1.5, 8.5)], C['white'])
    c.rect(7, 13, 2, 2, C['red']); c.rect(0, 12, 2, 1, C['dgray']); c.rect(14, 12, 2, 1, C['dgray'])
    return c

def shield():
    c = _new()
    c.poly([(2, 2), (14, 2), (14, 8), (8, 15), (2, 8)], C['gold'])
    c.poly([(4, 4), (12, 4), (12, 8), (8, 13), (4, 8)], C['blue'])
    c.poly([(4, 4), (8, 4), (8, 13), (4, 8)], C['cyan'])
    c.line(8, 5, 8, 11, C['white']); c.line(6, 7, 10, 7, C['white'])
    return c

def rebirth():
    c = _new()
    c.ring(8, 4, 2, 3, C['gold'])
    c.rect(7, 7, 3, 8, C['gold']); c.rect(3, 8, 11, 2, C['gold'])
    c.line(7, 8, 7, 14, C['lyellow'])
    c.set(1, 3, C['green']); c.set(14, 4, C['green']); c.set(13, 12, C['lyellow'])
    return c

def promote():
    c = _new()
    c.poly([(8, 1), (14, 8), (10, 8), (10, 14), (6, 14), (6, 8), (2, 8)], C['gold'])
    c.line(8, 2, 4, 7, C['lyellow']); c.rect(7, 8, 1, 6, C['lyellow'])
    return c

def polymorph():
    c = _new()
    pts = []
    for i in range(70):
        t = i / 70 * 4 * math.pi
        r = 0.3 + t * 0.48
        c.set(round(8 + math.cos(t) * r), round(8 + math.sin(t) * r), C['magenta'] if i % 14 < 7 else C['pink'])
    c.set(8, 8, C['white'])
    return c

def mirror():
    c = _new()
    c.disc(8, 7, 5.5, C['gold']); c.disc(8, 7, 4, C['ice'])
    c.line(6, 5, 8, 3, C['white']); c.line(7, 7, 10, 4, C['white'])
    c.rect(7, 12, 3, 3, C['gold']); c.rect(5, 14, 7, 1, C['gold'])
    return c

def ritual():
    c = _new()
    c.disc(8, 10, 4, C['dred']); c.poly([(4, 10), (12, 10), (8, 2)], C['dred'])
    c.disc(8, 10, 3, C['red']); c.poly([(5, 10), (11, 10), (8, 4)], C['red'])
    c.set(6, 9, C['pink']); c.set(6, 10, C['pink']); c.set(7, 7, C['pink'])
    return c

def insight():
    c = _new()
    c.poly([(1, 8), (5, 4), (11, 4), (15, 8), (11, 12), (5, 12)], C['bone'])
    c.disc(8, 8, 3, C['violet']); c.disc(8, 8, 1.5, C['out']); c.set(7, 7, C['white'])
    c.line(8, 0, 8, 1, C['lyellow']); c.line(2, 2, 3, 3, C['lyellow']); c.line(14, 2, 13, 3, C['lyellow'])
    return c

def portal():
    c = _new()
    for y in range(16):
        for x in range(16):
            d = ((x - 7.5) / 5) ** 2 + ((y - 7.5) / 7) ** 2
            if d <= 1:
                c.set(x, y, C['violet'] if d > 0.6 else (C['magenta'] if d > 0.3 else C['night']))
    c.ring(8, 8, 2, 2, C['pink'], 200, 340); c.set(6, 3, C['white'])
    return c

def quake():
    c = _new()
    c.rect(0, 9, 16, 7, C['brown']); c.rect(0, 9, 16, 1, C['dgreen'])
    c.line(7, 9, 9, 12, C['out']); c.line(9, 12, 7, 15, C['out']); c.line(9, 12, 12, 14, C['out'])
    for x, y in [(3, 4), (12, 2), (8, 5)]:
        c.rect(x, y, 2, 2, C['dbrown'])
    c.set(5, 7, C['dbrown']); c.set(13, 6, C['dbrown'])
    return c

def wall():
    c = _new()
    c.rect(1, 3, 14, 12, C['lstone'])
    for y in (6, 9, 12):
        c.line(1, y, 14, y, C['stone'])
    for y, xs in [(3, (5, 10)), (6, (3, 8, 13)), (9, (5, 10)), (12, (3, 8, 13))]:
        for x in xs:
            c.line(x, y, x, y + 2, C['stone'])
    c.line(1, 3, 14, 3, C['white'])
    return c

def mana():
    c = _new()
    c.poly([(8, 1), (14, 7), (8, 15), (2, 7)], C['blue'])
    c.poly([(8, 1), (8, 15), (2, 7)], C['cyan'])
    c.line(5, 5, 8, 2, C['white']); c.line(2, 7, 14, 7, C['ice'])
    return c

ICONS = dict(blink=blink, swap=swap, ghost=ghost, march=march, hook=hook, stasis=stasis, shackles=shackles,
             shockwave=shockwave, meteor=meteor, mark=mark, lightning=lightning, trap=trap, shield=shield,
             rebirth=rebirth, promote=promote, polymorph=polymorph, mirror=mirror, ritual=ritual,
             insight=insight, portal=portal, quake=quake, wall=wall, mana=mana)

# Набор 2 «Буря»: иконки — перекрашенные базовые с золотой искрой заряда в углу.
STORM_BASE = dict(ward='shield', bastion='wall', tide='mana', storm='lightning', comet='meteor', frost='stasis', leap='blink',
                  harpoon='hook', mentor='march', forge='promote', foresight='insight', phoenix='rebirth')
SHIFT = dict(ward=(2, 0, 1), bastion=(1, 2, 0), tide=(2, 1, 0), storm=(0, 2, 1), comet=(1, 0, 2), frost=(2, 0, 1), leap=(1, 2, 0),
             harpoon=(2, 1, 0), mentor=(0, 2, 1), forge=(1, 0, 2), foresight=(2, 1, 0), phoenix=(1, 2, 0))

def storm_icon(cid):
    c = ICONS[STORM_BASE[cid]]()
    perm = SHIFT[cid]
    for y in range(c.h):
        for x in range(c.w):
            p = c.p[y][x]
            if p and p[3] and max(p[:3]) - min(p[:3]) > 40:  # серые и чёрные пиксели не трогаем
                c.p[y][x] = (p[perm[0]], p[perm[1]], p[perm[2]], p[3])
    for x, y in [(13, 0), (12, 1), (13, 1), (14, 1), (13, 2), (12, 3)]:
        c.set(x, y, C['lyellow'])
    return c

def icon(name):
    if name in STORM_BASE:
        return storm_icon(name).outline()
    return ICONS[name]().outline()
