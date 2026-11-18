"""Аватары (12), эмоции (8) и скин фигур «Лёд и пламя». python3 -I extras.py <папка_ассетов> <папка_превью>"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pix import Canvas, C, hexc
import pieces

# ---------- аватары: левая половина 8×16, зеркалится ----------
# o контур, a основной, b второй, c лицо, e глаз, w блик, d тень
AV = [
 ('knight', 'Рыцарь', '#3a5a8c', {'a': '#9a94a2', 'b': '#c4b89c', 'c': '#0b0810', 'e': '#2ce8f5', 'w': '#ffffff', 'd': '#6d6875'},
  ["........", "....oooo", "...oaaaa", "..oawaaa", "..oaaaaa", ".oaaaaaa", ".oaoooooo"[:8], ".oaocccc",
   ".oaoceec", ".oaocccc", ".oaaoooo", ".oaaaaaa", "..oddddd", "..obbbbb", ".obbbbbb", "oooooooo"]),
 ('mage', 'Маг', '#4b2a7a', {'a': '#7a3fc0', 'b': '#fee761', 'c': '#efc29a', 'e': '#1a1626', 'w': '#ffffff', 'd': '#3e2d6e'},
  [".......o", "......oa", ".....oab", "....oaaa", "...oaaaa", "..oaaaaa", ".oaaaaaa", "oddddddd",
   "..occccc", "..ocecce"[:8], "..occccc", "..owwwcc", "...owwww", "..oaawww", ".oaaaaaw", "oooooooo"]),
 ('queen', 'Королева', '#7a2a4a', {'a': '#f0b429', 'b': '#e83b3b', 'c': '#f2d3b3', 'e': '#1a1626', 'w': '#fee761', 'd': '#8c1c2c'},
  ["........", "..o..o.o", "..oaoaoa", "..oaaaaa", "..oabaaa", "..oooooo", ".odocccc", ".odoceec",
   ".odocccc", ".odoccbc", ".oddoccc", ".odddooo", "..obbbbb", ".obbbbbb", "obbbbbbb", "oooooooo"]),
 ('skull', 'Скелет', '#2b2b3a', {'a': '#efe6d2', 'b': '#c4b89c', 'c': '#efe6d2', 'e': '#e83b3b', 'w': '#ffffff', 'd': '#8b8ba0'},
  ["........", "....oooo", "...oaaaa", "..oawaaa", ".oaaaaaa", ".oaaaaaa", ".oaoooaa", ".oaoeooa",
   ".oaoooaa", ".oaaaaao", "..oaaaoo", "...ododa", "...oaoao", "....oooo", "...odddd", "..oddddd"]),
 ('cat', 'Кот', '#c46a2a', {'a': '#f77622', 'b': '#efe6d2', 'c': '#f77622', 'e': '#63c74d', 'w': '#ffffff', 'd': '#b25c1c'},
  ["........", ".o......", ".oo.....", ".oao....", ".oaaoooo", ".oaaaaaa", ".oaaaaaa", ".oaoeoaa",
   ".oaoeoaa", ".oaaaaaa", ".oabbbob", "..obbbbo", "..obbbbb", "...oaaaa", "..oaaaaa", "oooooooo"]),
 ('owl', 'Сова', '#3e5a3a', {'a': '#8a5a3a', 'b': '#efe6d2', 'c': '#c4b89c', 'e': '#1a1626', 'w': '#fee761', 'd': '#5a3a2a'},
  ["........", "..o.....", "..oo....", "..oaoooo", "..oaaaaa", ".oaowwwa", ".oawweew", ".oawweew",
   ".oaowwwa", ".oaaaaoo", ".oadaaod"[:8], ".oaddaaa", ".oabbdaa", "..oabbda", "...oaaaa", "oooooooo"]),
 ('dragon', 'Дракончик', '#2a6a4a', {'a': '#63c74d', 'b': '#fee761', 'c': '#63c74d', 'e': '#e83b3b', 'w': '#ffffff', 'd': '#265c42'},
  ["........", ".o......", ".oao....", "..oao...", "..oaaooo", "..oaaaaa", ".oaaaaaa", ".oaoeoaa",
   ".oaoeoaa", ".oaaaaaa", ".odaaaaa", "..odoooo", "..obbbbb", "..obbbbb", "...ooooo", "........"]),
 ('robot', 'Робот', '#3a4a5a', {'a': '#8b8ba0', 'b': '#2ce8f5', 'c': '#45455a', 'e': '#2ce8f5', 'w': '#ffffff', 'd': '#45455a'},
  ["......oo", "......ob", ".......o", "...ooooo", "..oaaaaa", "..oawaaa", "..oacccc", "..oaceec",
   "..oacccc", "..oaaaaa", "..oadada", "..oaaaaa", "...ooooo", "..oddddd", ".odaaaaa", "oooooooo"]),
 ('ghost', 'Призрак', '#2a2a5a', {'a': '#c0f0ff', 'b': '#2ce8f5', 'c': '#c0f0ff', 'e': '#1a1626', 'w': '#ffffff', 'd': '#7fb8d0'},
  ["........", "....oooo", "...oaaaa", "..oawaaa", "..oaaaaa", ".oaaoeaa", ".oaaoeaa", ".oaaaaaa",
   ".oaaaaoo", ".oaaaaoo", ".oaaaaaa", ".oaaaaaa", ".oaaaaaa", ".oadaaad", ".oo.oao.", "o...o.o."]),
 ('fox', 'Лис', '#5a2a1a', {'a': '#f77622', 'b': '#efe6d2', 'c': '#f77622', 'e': '#1a1626', 'w': '#ffffff', 'd': '#b25c1c'},
  ["........", "o.......", "oo......", "oao.....", "oaao....", "oaaaoooo", ".oaaaaaa", ".oaoeoaa",
   ".oaaaaaa", ".obbaaaa", "..obbbaa", "...obbbb", "....obbo", ".....ooe"[:8], "....oaaa", "oooooooo"]),
 ('goblin', 'Гоблин', '#4a3a1a', {'a': '#63c74d', 'b': '#733e39', 'c': '#63c74d', 'e': '#fee761', 'w': '#ffffff', 'd': '#265c42'},
  ["........", "........", "....oooo", "o..oaaaa", "oaoaaaaa", ".oaaaaaa", "..oaoeoa", "..oaoeoa",
   "..oaaaaa", "..oaaadd", "..oaowow", "...oaooo", "...oaaaa", "..obbbbb", ".obbbbbb", "oooooooo"]),
 ('star', 'Звездочёт', '#1a1a4a', {'a': '#124e89', 'b': '#fee761', 'c': '#efc29a', 'e': '#1a1626', 'w': '#fee761', 'd': '#0b2a5a'},
  ["....oooo", "...oaaaa", "..oaabaa", "..oabbba", ".oaaabaa", ".oaaoooo", ".oaoccce", ".oaocccc",
   ".oaoccco", ".oaaoccc", ".oaaaooo", ".oaaaaaa", ".oabaaaa", ".oaaaaba", "oaaaaaaa", "oooooooo"]),
]

def avatar(spec):
    _, _, bg, pal, half = spec
    k = Canvas(16, 16)
    rows = [(h + '.' * 8)[:8] for h in half]
    for y, h in enumerate(rows):
        full = h + h[::-1]
        for x, ch in enumerate(full):
            if ch == '.':
                continue
            col = C['out'] if ch == 'o' else hexc(pal[ch])
            k.set(x, y, col)
    out = Canvas(20, 20, hexc(bg))
    for y in range(20):
        for x in range(20):
            if (x + y) % 5 == 0:
                out.set(x, y, hexc('#ffffff', 22))
    out.blit(k, 2, 3)
    out.frame(0, 0, 20, 20, C['out'])
    return out

# ---------- эмоции 16×16 ----------
def face(fill, mouth, eyes='dot', extra=None):
    e = Canvas(16, 16)
    e.disc(7.5, 7.5, 7.2, C['out']); e.disc(7.5, 7.5, 6.2, hexc(fill))
    e.set(4, 3, C['white']); e.set(5, 3, C['white']); e.set(4, 4, C['white'])
    if eyes == 'dot':
        for x in (5, 10): e.rect(x, 6, 1, 2, C['out'])
    elif eyes == 'happy':
        for x in (4, 9): e.set(x, 7, C['out']); e.set(x + 1, 6, C['out']); e.set(x + 2, 7, C['out'])
    elif eyes == 'wide':
        for x in (4, 9): e.rect(x, 5, 3, 3, C['white']); e.set(x + 1, 6, C['out'])
    elif eyes == 'angry':
        for x in (4, 9): e.rect(x + 1, 7, 1, 2, C['out'])
        e.line(4, 5, 6, 6, C['out']); e.line(11, 5, 9, 6, C['out'])
    elif eyes == 'side':
        for x in (5, 10): e.rect(x + 1, 6, 1, 2, C['out'])
        e.line(4, 4, 6, 4, C['out']); e.line(9, 5, 11, 4, C['out'])
    if mouth == 'smile': e.line(5, 10, 6, 11, C['out']); e.line(7, 11, 8, 11, C['out']); e.line(9, 11, 10, 10, C['out'])
    elif mouth == 'laugh': e.rect(5, 10, 6, 3, C['out']); e.rect(6, 11, 4, 1, C['red'])
    elif mouth == 'o': e.rect(7, 10, 2, 3, C['out'])
    elif mouth == 'flat': e.line(6, 11, 9, 11, C['out'])
    elif mouth == 'frown': e.line(5, 12, 6, 11, C['out']); e.line(7, 11, 8, 11, C['out']); e.line(9, 11, 10, 12, C['out'])
    elif mouth == 'wavy': e.set(5, 11, C['out']); e.set(6, 10, C['out']); e.set(7, 11, C['out']); e.set(8, 10, C['out']); e.set(9, 11, C['out']); e.set(10, 10, C['out'])
    if extra: extra(e)
    return e

def thumb():
    g = ["......oo........", ".....oyyo.......", ".....oyyo.......", "....oyyyo.......", "...oyyyyoooooo..",
         "oooyyyyyyyyyyyo.", "obboyyyyyyyyyyo.", "obboyyyyyoooooo.", "obboyyyyyyyyyyo.", "obboyyyyyoooooo.",
         "obboyyyyyyyyyyo.", "obboyyyyyooooo..", "obboyyyyyyyyyo..", "oooooooooooooo..", "................", "................"]
    e = Canvas(16, 16)
    for y, r in enumerate(g):
        for x, ch in enumerate(r):
            if ch == 'o': e.set(x, y, C['out'])
            elif ch == 'y': e.set(x, y, C['yellow'])
            elif ch == 'b': e.set(x, y, C['blue'])
    return e

def heart():
    g = ["................", "..ooo....ooo....", ".orrro..orrro...", "orwrrrooorrrro..", "orwrrrrrrrrrro..", "orrrrrrrrrrrro..",
         ".orrrrrrrrrro...", "..orrrrrrrro....", "...orrrrrro.....", "....orrrro......", ".....orro.......", "......oo........"]
    e = Canvas(16, 16)
    for y, r in enumerate(g):
        for x, ch in enumerate(r):
            col = {'o': C['out'], 'r': C['red'], 'w': C['white']}.get(ch)
            if col: e.set(x + 1, y + 2, col)
    return e

def gg():
    G = ["oooo", "o...", "o.oo", "o..o", "oooo"]
    e = Canvas(16, 16)
    e.rect(0, 3, 16, 10, C['out']); e.rect(1, 4, 14, 8, C['violet'])
    for ox in (2, 9):
        for y, r in enumerate(G):
            for x, ch in enumerate(r):
                if ch == 'o': e.set(ox + x, 5 + y, C['lyellow']); e.set(ox + x + 1, 6 + y, C['out']) if False else None
    return e

def sweat(e):
    e.set(13, 3, C['cyan']); e.rect(12, 4, 2, 2, C['cyan']); e.set(12, 4, C['white'])

def think(e):
    e.disc(12.5, 12.5, 2.5, C['out']); e.disc(12.5, 12.5, 1.6, C['yellow'])

def steam(e):
    e.set(1, 1, C['white']); e.set(2, 0, C['white']); e.set(14, 1, C['white']); e.set(13, 0, C['white'])

EMOTES = {
    'like': ('👍', thumb),
    'hmm': ('Хм…', lambda: face('#feae34', 'wavy', 'side', think)),
    'haha': ('Ха-ха', lambda: face('#fee761', 'laugh', 'happy')),
    'gg': ('GG', gg),
    'wow': ('Ого!', lambda: face('#fee761', 'o', 'wide')),
    'angry': ('Грр', lambda: face('#e83b3b', 'frown', 'angry', steam)),
    'heart': ('♥', heart),
    'oops': ('Упс', lambda: face('#fee761', 'flat', 'dot', sweat)),
}

# ---------- скин «Лёд и пламя» ----------
SKINS = {
    # премиум (магазин) и сезонный
    'amethyst': {
        'white': {'o': '#2a1040', 'b': '#e8d8ff', 's': '#b89ae8', 'h': '#ffffff', 'a': '#b25cff', 'e': '#2ce8f5'},
        'black': {'o': '#0b0810', 'b': '#5a2a8a', 's': '#3a1660', 'h': '#9a5ad8', 'a': '#fee761', 'e': '#ff6ad5'},
    },
    'retro': {
        'white': {'o': '#0f380f', 'b': '#9bbc0f', 's': '#8bac0f', 'h': '#c4e04f', 'a': '#306230', 'e': '#0f380f'},
        'black': {'o': '#0f380f', 'b': '#306230', 's': '#1f4a1f', 'h': '#5a8a3a', 'a': '#9bbc0f', 'e': '#c4e04f'},
    },
    'jade': {
        'white': {'o': '#0e2a22', 'b': '#d8f5e4', 's': '#8fd1ad', 'h': '#ffffff', 'a': '#2fa36b', 'e': '#fee761'},
        'black': {'o': '#06140f', 'b': '#1f6a4a', 's': '#124a33', 'h': '#3fa070', 'a': '#c8f0a0', 'e': '#ffffff'},
    },
    'crimson': {
        'white': {'o': '#3a0a12', 'b': '#ffe4e0', 's': '#e8a4a0', 'h': '#ffffff', 'a': '#e83b3b', 'e': '#fee761'},
        'black': {'o': '#12040a', 'b': '#7a1424', 's': '#4e0a16', 'h': '#b8343e', 'a': '#feae34', 'e': '#ffe4e0'},
    },
    'herald': {
        'white': {'o': '#2a1a06', 'b': '#fff4d6', 's': '#e8c878', 'h': '#ffffff', 'a': '#2a5ac8', 'e': '#e83b3b'},
        'black': {'o': '#0a0c1e', 'b': '#24306e', 's': '#161e4a', 'h': '#4a5aa8', 'a': '#feae34', 'e': '#fff4d6'},
    },
    'polar': {
        'white': {'o': '#10243a', 'b': '#f4fbff', 's': '#bcd8ec', 'h': '#ffffff', 'a': '#63c7ff', 'e': '#fee761'},
        'black': {'o': '#06101c', 'b': '#1c3a5a', 's': '#10263e', 'h': '#3a6a9a', 'a': '#9affd8', 'e': '#ffffff'},
    },
    'bones': {
        'white': {'o': '#2b2b3a', 'b': '#efe6d2', 's': '#b9ab8c', 'h': '#ffffff', 'a': '#8b8ba0', 'e': '#e83b3b'},
        'black': {'o': '#0b0810', 'b': '#45455a', 's': '#2b2b3a', 'h': '#8b8ba0', 'a': '#9a94a2', 'e': '#63c74d'},
    },
    'neon': {
        'white': {'o': '#0b0810', 'b': '#2ce8f5', 's': '#0099db', 'h': '#c0f0ff', 'a': '#fee761', 'e': '#ffffff'},
        'black': {'o': '#0b0810', 'b': '#f6757a', 's': '#b55088', 'h': '#ffc0d0', 'a': '#b25cff', 'e': '#ffffff'},
    },
    'gold': {
        'white': {'o': '#4a2a0a', 'b': '#fee761', 's': '#f0b429', 'h': '#ffffff', 'a': '#f77622', 'e': '#e83b3b'},
        'black': {'o': '#0b0810', 'b': '#3a2a1a', 's': '#1a120a', 'h': '#733e39', 'a': '#f0b429', 'e': '#fee761'},
    },
    'icefire': {
        'white': {'o': '#0b2a3a', 'b': '#c0f0ff', 's': '#5fb7d9', 'h': '#ffffff', 'a': '#2ce8f5', 'e': '#124e89'},
        'black': {'o': '#2a0808', 'b': '#e8532b', 's': '#9c1f1f', 'h': '#feae34', 'a': '#fee761', 'e': '#ffffff'},
    },
}

def skin_piece(name, side, pal):
    cv = Canvas(16, 16)
    for y, row in enumerate(pieces.grid(name)):
        for x, ch in enumerate(row):
            if ch != '.':
                cv.p[y][x] = hexc(pal[side][ch])
    return cv

BOARDS = {  # (светлая, тёмная, крапинка светлой, крапинка тёмной)
    'starry': ('#c8c0e8', '#2a2454', '#fee761', '#fee761'),
    'ocean':  ('#bfe6ef', '#1f6a8a', '#a8d8e4', '#2a7a9a'),
    'aurora': ('#d0f5e8', '#1a4a5a', '#9affd8', '#b25cff'),
    'marble': ('#ece6f0', '#8a7fa0', '#d8d0e0', '#7a6f90'),
    'forest': ('#c9d8a0', '#4f7a4a', '#b5c88a', '#436a40'),
    'lava':   ('#e8c39a', '#7a3a2a', '#d8ae84', '#6a2e22'),
    'night':  ('#7a86b0', '#2a2f52', '#6c78a2', '#232846'),
    'sunset': ('#f8d0a0', '#a84a5a', '#feae34', '#e86a5a'),
    'dusk':   ('#b8a8c8', '#4a3a6a', '#a898b8', '#3e305c'),
    'banner': ('#f0e2c0', '#7a2a2a', '#e0cfa4', '#feae34'),
}
def board_tile(base, speck, seed, veins=False):
    import random
    rnd = random.Random(seed)
    t = Canvas(16, 16, hexc(base))
    for _ in range(8):
        x, y = rnd.randrange(16), rnd.randrange(16)
        t.set(x, y, hexc(speck)); t.set(x + 1, y, hexc(speck))
    if veins:
        x = rnd.randrange(16)
        for y in range(16):
            x = max(0, min(15, x + rnd.choice((-1, 0, 1)))); t.set(x, y, hexc(speck, 160))
    return t

if __name__ == '__main__':
    A, P = sys.argv[1], sys.argv[2]
    os.makedirs(os.path.join(A, 'boards'), exist_ok=True)
    bs = Canvas(34 * len(BOARDS), 17)
    for i, (k, (l, d, ls, ds)) in enumerate(BOARDS.items()):
        lt, dt = board_tile(l, ls, i * 2 + 1, k == 'marble'), board_tile(d, ds, i * 2 + 2, k == 'marble')
        lt.save(f'{A}/boards/{k}_light.png'); dt.save(f'{A}/boards/{k}_dark.png')
        bs.blit(lt, i * 34, 0); bs.blit(dt, i * 34 + 16, 0)
    bs.scaled(6).save(f'{P}/10_доски.png')
    for d in ['avatars', 'emotes'] + [f'skins/{k}' for k in SKINS]:
        os.makedirs(os.path.join(A, d), exist_ok=True)
    sheet = Canvas(20 * 6 + 5, 20 * 2 + 1)
    for i, spec in enumerate(AV):
        a = avatar(spec)
        a.save(f'{A}/avatars/{i}.png')
        sheet.blit(a, (i % 6) * 21, (i // 6) * 21)
    es = Canvas(17 * 8, 16)
    for i, (k, (_, fn)) in enumerate(EMOTES.items()):
        e = fn()
        e.save(f'{A}/emotes/{k}.png')
        es.blit(e, i * 17, 0)
    sk = Canvas(17 * 6, 34 * len(SKINS))
    for si, (sname, pal) in enumerate(SKINS.items()):
        for side_i, side in enumerate(('white', 'black')):
            for i, n in enumerate(pieces.NAMES):
                p = skin_piece(n, side, pal)
                p.save(f'{A}/skins/{sname}/{side}_{n}.png')
                sk.blit(p, i * 17, si * 34 + side_i * 17)
    sheet.scaled(6).save(f'{P}/6_аватары.png')
    es.scaled(6).save(f'{P}/7_эмоции.png')
    sk.scaled(5).save(f'{P}/8_скины.png')
    print('аватары', len(AV), 'эмоции', len(EMOTES), 'скин icefire')
