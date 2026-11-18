"""Мини-растр для пиксель-арта: холст RGBA, примитивы, автообводка, запись PNG без зависимостей."""
import math, struct, zlib

def hexc(s, a=255):
    return (int(s[1:3], 16), int(s[3:5], 16), int(s[5:7], 16), a)

C = {k: hexc(v) for k, v in dict(
    out='#0b0810', white='#ffffff', bone='#efe6d2', sand='#c4b89c', gray='#8b8ba0', dgray='#45455a',
    red='#e83b3b', dred='#8c1c2c', orange='#f77622', yellow='#feae34', lyellow='#fee761',
    green='#63c74d', dgreen='#265c42', cyan='#2ce8f5', blue='#0099db', dblue='#124e89', ice='#c0f0ff',
    pink='#f6757a', magenta='#b55088', violet='#9b45e0', dviolet='#3e2d6e', night='#1a1626',
    brown='#b86f50', dbrown='#733e39', gold='#f0b429', stone='#6d6875', lstone='#9a94a2').items()}

class Canvas:
    def __init__(self, w, h, fill=None):
        self.w, self.h = w, h
        self.p = [[fill] * w for _ in range(h)]

    def get(self, x, y):
        return self.p[y][x] if 0 <= x < self.w and 0 <= y < self.h else None

    def set(self, x, y, c):
        if c is None or not (0 <= x < self.w and 0 <= y < self.h):
            return
        x, y = int(x), int(y)
        a = c[3]
        if a >= 255 or self.p[y][x] is None:
            self.p[y][x] = c if a > 0 else self.p[y][x]
            return
        d = self.p[y][x]
        k = a / 255
        self.p[y][x] = tuple(round(c[i] * k + d[i] * (1 - k)) for i in range(3)) + (max(a, d[3]),)

    def rect(self, x, y, w, h, c):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                self.set(xx, yy, c)

    def frame(self, x, y, w, h, c):
        for xx in range(x, x + w):
            self.set(xx, y, c); self.set(xx, y + h - 1, c)
        for yy in range(y, y + h):
            self.set(x, yy, c); self.set(x + w - 1, yy, c)

    def disc(self, cx, cy, r, c):
        for y in range(int(cy - r - 1), int(cy + r + 2)):
            for x in range(int(cx - r - 1), int(cx + r + 2)):
                if (x - cx) ** 2 + (y - cy) ** 2 <= r * r + 0.5:
                    self.set(x, y, c)

    def ring(self, cx, cy, r0, r1, c, a0=0, a1=360):
        for y in range(int(cy - r1 - 1), int(cy + r1 + 2)):
            for x in range(int(cx - r1 - 1), int(cx + r1 + 2)):
                d = math.hypot(x - cx, y - cy)
                ang = math.degrees(math.atan2(y - cy, x - cx)) % 360
                inside = a0 <= ang <= a1 if a0 <= a1 else (ang >= a0 or ang <= a1)
                if r0 - 0.5 <= d <= r1 + 0.5 and inside:
                    self.set(x, y, c)

    def line(self, x0, y0, x1, y1, c, dotted=0):
        n = max(abs(x1 - x0), abs(y1 - y0), 1)
        for i in range(int(n) + 1):
            if dotted and (i // dotted) % 2:
                continue
            self.set(round(x0 + (x1 - x0) * i / n), round(y0 + (y1 - y0) * i / n), c)

    def poly(self, pts, c):
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        for y in range(int(min(ys)), int(max(ys)) + 1):
            for x in range(int(min(xs)), int(max(xs)) + 1):
                px, py, ins, j = x + .5, y + .5, False, len(pts) - 1
                for i in range(len(pts)):
                    xi, yi = pts[i]; xj, yj = pts[j]
                    if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi) + xi:
                        ins = not ins
                    j = i
                if ins:
                    self.set(x, y, c)

    def outline(self, c=None, diag=False):
        c = c or C['out']
        add = []
        nb = [(1, 0), (-1, 0), (0, 1), (0, -1)] + ([(1, 1), (1, -1), (-1, 1), (-1, -1)] if diag else [])
        for y in range(self.h):
            for x in range(self.w):
                if self.p[y][x] is None and any((self.get(x + dx, y + dy) or (0, 0, 0, 0))[3] > 128 for dx, dy in nb):
                    add.append((x, y))
        for x, y in add:
            self.p[y][x] = c
        return self

    def blit(self, src, ox, oy, k=1):
        for y in range(src.h):
            for x in range(src.w):
                c = src.p[y][x]
                if c is not None:
                    for dy in range(k):
                        for dx in range(k):
                            self.set(ox + x * k + dx, oy + y * k + dy, c)

    def scaled(self, k):
        out = Canvas(self.w * k, self.h * k)
        out.blit(self, 0, 0, k)
        return out

    def save(self, path):
        z = (0, 0, 0, 0)
        raw = b''.join(b'\x00' + b''.join(bytes(c or z) for c in row) for row in self.p)
        ch = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
        with open(path, 'wb') as f:
            f.write(b'\x89PNG\r\n\x1a\n' + ch(b'IHDR', struct.pack('>IIBBBBB', self.w, self.h, 8, 6, 0, 0, 0))
                    + ch(b'IDAT', zlib.compress(raw, 9)) + ch(b'IEND', b''))

DIGITS = {'0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111',
          '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001010010010',
          '8': '111101111101111', '9': '111101111001111'}

def digit(cv, x, y, ch, c):
    for i, b in enumerate(DIGITS[ch]):
        if b == '1':
            cv.set(x + i % 3, y + i // 3, c)
