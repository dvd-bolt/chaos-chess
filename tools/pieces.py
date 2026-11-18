"""Фигуры 16x16: половинки зеркалятся, объём (блик/тень) расставляется автоматически."""
from pix import Canvas, hexc

HALF = {
 'pawn':   ["........","........","......oo",".....obb","....obbb","....obbb",".....obb","....oaaa",
            ".....obb",".....obb","....obbb","...obbbb","...oaaaa","..obbbbb","..oooooo","........"],
 'rook':   ["........","..ooo.oo","..obooob","..obbbbb","...obbbb","....obbb","....obbe","....obbb",
            "....obbb","....obbb","...oaaaa","...obbbb","..obbbbb","..oooooo","........","........"],
 'bishop': [".......o","......ob",".....obb",".....obo","....obbb","....obbb",".....obb","......ob",
            ".....oaa","......ob",".....obb","....obbb","...oaaaa","..obbbbb","..oooooo","........"],
 'queen':  ["..o..o.o","..oo.ooo","..oaoaaa","...oaaaa","...oaaae","....obbb",".....obb","....obbb",
            ".....obb",".....obb","....oaaa","....obbb","...obbbb","..obbbbb","..oooooo","........"],
 'king':   [".......o","......oa",".....oaa","......oa",".....ooo","....oaaa","....oaae",".....obb",
            ".....obb","....oaaa",".....obb","....obbb","...obbbb","..obbbbb","..oooooo","........"],
}
KNIGHT = ["................",".......oo.......","......obbo......",".....obbbbo.....","....obebbbbo....",
 "...obbbbbbaao...","..obbbbbbbbaao..","..oobbooobbbao..","...oo..obbbbo...","......obbbbo....",
 ".....obbbbbo....",".....oaaaaao....","....obbbbbbbo...","...obbbbbbbbbo..","...ooooooooooo..","................"]

PAL = {
 'white': {'o': '#2b1d14', 'b': '#efe6d2', 's': '#b9ab8c', 'h': '#ffffff', 'a': '#f0b429', 'e': '#2ce8f5'},
 'black': {'o': '#0b0810', 'b': '#463c63', 's': '#2a2340', 'h': '#7a68a8', 'a': '#b25cff', 'e': '#ff3344'},
}
NAMES = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn']

def grid(name):
    g = [h + h[::-1] for h in HALF[name]] if name in HALF else KNIGHT
    g = [list(r) for r in g]
    for r in g:
        for x in range(16):
            if r[x] == 'b' and r[x + 1] in 'o.':
                r[x] = 's'
            elif r[x] == 'b' and r[x - 1] == 'o':
                r[x] = 'h'
    return g

def piece(name, side):
    cv = Canvas(16, 16)
    for y, row in enumerate(grid(name)):
        for x, ch in enumerate(row):
            if ch != '.':
                cv.p[y][x] = hexc(PAL[side][ch])
    return cv
