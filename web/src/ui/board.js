// Отрисовка доски на canvas: пиксельное масштабирование, анимации событий движка, частицы и эффекты.
import { zone3, zoneOf, stasisSquares } from '../engine/cards.js';
import { inCheck, kingSq, attacked, LAVA, KG, idx, inb, opp } from '../engine/rules.js';
import { sfx } from './sfx.js';
import { haptic } from './tg.js';

const FX = { explosion: [8, 32, 32], meteor_fall: [6, 32, 32], freeze: [6, 16, 16], teleport: [6, 16, 32],
  lightning: [4, 16, 48], shield: [4, 16, 16], mark: [4, 16, 16], portal: [4, 16, 16] };
const NAMES = { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn' };
const ease = t => 1 - (1 - t) * (1 - t);

export class BoardView {
  constructor(canvas, A) {
    this.cv = canvas; this.ctx = canvas.getContext('2d'); this.A = A;
    this.disp = null; this.flip = false; this.speed = 1; this.skin = 'classic'; this.theme = 'classic'; this.cb = false;
    this.viewer = null; this.showTraps = 'own'; // чьи капканы видны: 'own' | 'all'
    this.hints = { moves: [], caps: [], targets: [], zone: [], picked: [] };
    this.sel = -1; this.last = null; this.checkSq = -1;
    this.anims = []; this.parts = []; this.texts = []; this.fx = []; this.floaters = [];
    this.hidden = new Set(); this.shakeAmp = 0; this.flash = 0; this.chain = null; this.dropWall = null;
    this.pixels = {}; this.rings = []; this.banner = null; this.idle = true;
    this.resize();
    const loop = now => { this.tick(now); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  resize() {
    const css = this.cv.clientWidth || 320, dpr = Math.min(3, window.devicePixelRatio || 1);
    this.cv.width = this.cv.height = Math.round(css * dpr);
    // на плотных экранах допускаем дробный масштаб — доска занимает всю ширину
    this.k = this.cv.width / 134;
    this.tile = Math.floor(16 * this.k);
    this.o = Math.floor((this.cv.width - 8 * this.tile) / 2);
    this.ctx.imageSmoothingEnabled = false;
    const b = document.createElement('canvas');
    b.width = b.height = this.cv.width;
    const g = b.getContext('2d'); g.imageSmoothingEnabled = false;
    const k = this.k, o = this.o, T = this.tile;
    // каменная рамка доски (стиль v0.4): камень, светлая фаска сверху-слева, тёмная снизу-справа
    g.fillStyle = '#4a5468'; g.fillRect(o - 3 * k, o - 3 * k, 8 * T + 6 * k, 8 * T + 6 * k);
    g.fillStyle = '#6f7d92'; g.fillRect(o - 3 * k, o - 3 * k, 8 * T + 6 * k, k); g.fillRect(o - 3 * k, o - 3 * k, k, 8 * T + 6 * k);
    g.fillStyle = '#2a3040'; g.fillRect(o - 3 * k, o + 8 * T + 2 * k, 8 * T + 6 * k, k); g.fillRect(o + 8 * T + 2 * k, o - 3 * k, k, 8 * T + 6 * k);
    g.fillStyle = '#141822'; g.fillRect(o - k, o - k, 8 * T + 2 * k, 8 * T + 2 * k);
    const th = (this.theme !== 'classic' && this.A.boards?.[this.theme]) || this.A.tiles;
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) g.drawImage((r + f) % 2 ? th.dark : th.light, o + f * T, o + r * T, T, T);
    this.bg = b;
  }

  xy(i) {
    let r = i >> 3, f = i & 7;
    if (this.flip) { r = 7 - r; f = 7 - f; }
    return [this.o + f * this.tile, this.o + r * this.tile];
  }
  center(i) { const [x, y] = this.xy(i); return [x + this.tile / 2, y + this.tile / 2]; }
  sqAt(cx, cy) {
    const rect = this.cv.getBoundingClientRect(), s = this.cv.width / rect.width;
    let f = Math.floor(((cx - rect.left) * s - this.o) / this.tile), r = Math.floor(((cy - rect.top) * s - this.o) / this.tile);
    if (r < 0 || r > 7 || f < 0 || f > 7) return -1;
    if (this.flip) { r = 7 - r; f = 7 - f; }
    return r * 8 + f;
  }
  pieceImg(p) {
    const key = (p.s === 'w' ? 'white_' : 'black_') + NAMES[p.t];
    const sk = (this.sideSkin && this.sideSkin[p.s]) || this.skin; // в онлайне фигуры соперника — в его скине
    return (sk !== 'classic' && this.A.skins?.[sk]?.[key]) || this.A.pieces[key];
  }
  slide(moves, ms) { // одновременный сдвиг нескольких фигур (волна, землетрясение)
    const D = this.disp, fls = [];
    for (const m of moves) {
      const p = D.board[m.from]; if (!p) continue;
      D.board[m.from] = null;
      const [x0, y0] = this.xy(m.from), [x1, y1] = this.xy(m.to);
      const fl = { p, x: x0, y: y0, x0, y0, x1, y1, to: m.to }; fls.push(fl); this.floaters.push(fl);
    }
    return this.tween(ms, t => { const e = ease(t); for (const f of fls) { f.x = f.x0 + (f.x1 - f.x0) * e; f.y = f.y0 + (f.y1 - f.y0) * e; } })
      .then(() => { for (const f of fls) { this.floaters.splice(this.floaters.indexOf(f), 1); D.board[f.to] = f.p; this.dust(f.to); } });
  }
  ring(i, col, ms = 450, r0 = 0.3, r1 = 2) {
    const [x, y] = this.center(i);
    const r = { x, y, col, rad: 0, a: 1 }; this.rings.push(r);
    return this.tween(ms, t => { r.rad = (r0 + (r1 - r0) * ease(t)) * this.tile; r.a = 1 - t; }).then(() => this.rings.splice(this.rings.indexOf(r), 1));
  }

  // ---------- примитивы анимации ----------
  tween(ms, fn) {
    return new Promise(res => this.anims.push({ t0: performance.now(), dur: Math.max(1, ms / this.speed), fn, res }));
  }
  wait(ms) { return this.tween(ms, () => {}); }
  playFx(name, x, y, w, h, ms, loop = false) {
    return new Promise(res => this.fx.push({ name, x, y, w, h, t0: performance.now(), dur: ms / this.speed, res }));
  }
  shake(a) { this.shakeAmp = Math.max(this.shakeAmp, a * this.k); }
  text(txt, i, color = '#fee761', big = false) {
    let [x, y] = this.center(i);
    const half = txt.length * (big ? 9 : 6) * this.k * 0.32; // не даём надписи уйти за край доски
    x = Math.max(this.o + half, Math.min(this.cv.width - this.o - half, x));
    this.texts.push({ txt, x, y, color, t0: performance.now(), dur: 1100, big });
  }
  spritePixels(img) {
    if (this.pixels[img.src]) return this.pixels[img.src];
    // точки в координатах 16×16, чтобы разлёт не зависел от размера спрайта (16 или 24)
    const n = img.naturalWidth || 16, st = n / 8;
    const c = document.createElement('canvas'); c.width = c.height = n;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, n, n).data, out = [];
    for (let y = 0; y < n; y += st) for (let x = 0; x < n; x += st) {
      const a = (Math.floor(y) * n + Math.floor(x)) * 4;
      if (d[a + 3] > 100) out.push([x * 16 / n, y * 16 / n, `rgb(${d[a]},${d[a + 1]},${d[a + 2]})`]);
    }
    return (this.pixels[img.src] = out);
  }
  // Гибель фигуры: у каждого типа свой характер разлёта.
  burst(p, i, power = 1) {
    const [x, y] = this.xy(i), k = this.k, now = performance.now();
    const style = { P: [0.6, 0.15, 1], N: [1.2, 0.35, 1], B: [0.5, 0.5, 1.3], R: [0.35, 0.05, 1.5], Q: [1.3, 0.6, 1.2], K: [0.8, 0.4, 1] }[p.t] || [1, 0.35, 1];
    const [spread, lift, life] = style;
    for (const [px, py, col] of this.spritePixels(this.pieceImg(p))) {
      const dx = px - 8, dy = py - 8;
      let vx = (dx * 0.04 * spread + (Math.random() - 0.5) * 0.25) * k * power, vy = (dy * 0.03 - lift - Math.random() * 0.3) * k * power;
      if (p.t === 'B') { const a = Math.atan2(dy, dx) + 1.2; const r = Math.hypot(dx, dy) * 0.04; vx = Math.cos(a) * r * k * power; vy = Math.sin(a) * r * k * power - 0.2 * k; }
      if (p.t === 'R') { vy = Math.random() * 0.05 * k; vx *= 0.5; } // ладья осыпается вниз
      this.parts.push({ x: x + px * k, y: y + py * k, vx, vy, col, size: 2 * k, life: (700 + Math.random() * 400) * life, t0: now });
    }
    if (p.t === 'Q' || p.t === 'N') this.dust(i, p.s === 'w' ? '#fee761' : '#b25cff', 10);
  }
  dust(i, col = '#9a94a2', n = 14) {
    const [x, y] = this.center(i), k = this.k;
    for (let j = 0; j < n; j++) {
      const a = Math.random() * Math.PI * 2;
      this.parts.push({ x, y: y + 4 * k, vx: Math.cos(a) * 0.15 * k, vy: -Math.random() * 0.25 * k, col, size: k * (1 + (j % 2)), life: 500, t0: performance.now() });
    }
  }

  // ---------- события движка ----------
  async handle(ev) {
    const D = this.disp, T = this.tile, k = this.k;
    switch (ev.t) {
      case 'move': {
        const p = D.board[ev.from]; if (!p) return;
        D.board[ev.from] = null;
        const [x0, y0] = this.xy(ev.from), [x1, y1] = this.xy(ev.to);
        const fl = { p, x: x0, y: y0 }; this.floaters.push(fl);
        sfx('move'); haptic('light');
        await this.tween(170, t => { const e = ease(t); fl.x = x0 + (x1 - x0) * e; fl.y = y0 + (y1 - y0) * e - Math.sin(t * Math.PI) * 4 * k; });
        this.floaters.splice(this.floaters.indexOf(fl), 1);
        const victim = D.board[ev.to];
        if (victim) { this.burst(victim, ev.to); this.shake(2); sfx('capture'); haptic('medium'); }
        D.board[ev.to] = p;
        this.last = [ev.from, ev.to];
        return;
      }
      case 'promote': {
        const p = D.board[ev.sq]; if (p) D.board[ev.sq] = { ...p, t: ev.to };
        this.dust(ev.sq, '#fee761', 20); sfx(ev.why === 'card' ? 'rebirth' : 'shield'); this.text(ev.why === 'card' ? 'Повышение!' : 'Превращение!', ev.sq);
        return this.wait(200);
      }
      case 'destroy': {
        const p = D.board[ev.sq];
        if (p && p.id === ev.piece.id) {
          D.board[ev.sq] = null;
          this.burst(p, ev.sq, ev.cause === 'meteor' ? 1.8 : 1.2);
          if (ev.cause === 'ritual') { this.dust(ev.sq, '#e83b3b', 18); sfx('ritual'); }
          else if (ev.cause === 'capture') { sfx('capture'); this.shake(2); haptic('medium'); }
          else haptic('heavy');
        }
        delete D.shield[ev.piece.id]; delete D.frozen[ev.piece.id];
        D.marks = D.marks.filter(m => m.id !== ev.piece.id);
        return this.wait(ev.cause === 'meteor' ? 30 : 120);
      }
      case 'shield': {
        D.shield[ev.id] = 1; sfx('shield'); haptic('soft');
        this.dust(ev.sq, '#2ce8f5', 16);
        return this.wait(350);
      }
      case 'wall': {
        const [x, y] = this.xy(ev.sq);
        this.dropWall = { x, y: y - 3 * T };
        await this.tween(230, t => { this.dropWall.y = y - 3 * T * (1 - t * t); });
        this.dropWall = null; D.walls[ev.sq] = this.disp.ply + 6;
        this.dust(ev.sq, '#9a94a2', 18); this.shake(3); sfx('wall'); haptic('rigid');
        return this.wait(150);
      }
      case 'blink': {
        const p = D.board[ev.from]; D.board[ev.from] = null;
        const [x0, y0] = this.xy(ev.from), [x1, y1] = this.xy(ev.to);
        sfx('blink'); haptic('light');
        await this.playFx('teleport', x0, y0 - T, T, 2 * T, 300);
        D.board[ev.to] = p; this.last = [ev.from, ev.to];
        return this.playFx('teleport', x1, y1 - T, T, 2 * T, 300);
      }
      case 'hook': {
        const [ax, ay] = this.center(ev.anchor), [ex, ey] = this.center(ev.from), [dx, dy] = this.center(ev.to);
        sfx('hook');
        this.chain = { ax, ay, x: ax, y: ay };
        await this.tween(220, t => { this.chain.x = ax + (ex - ax) * t; this.chain.y = ay + (ey - ay) * t; });
        const p = D.board[ev.from]; D.board[ev.from] = null;
        const fl = { p, x: ex - T / 2, y: ey - T / 2 }; this.floaters.push(fl);
        sfx('pull'); haptic('medium');
        await this.tween(300, t => { const e = ease(t); this.chain.x = ex + (dx - ex) * e; this.chain.y = ey + (dy - ey) * e; fl.x = this.chain.x - T / 2; fl.y = this.chain.y - T / 2; });
        this.floaters.splice(this.floaters.indexOf(fl), 1); this.chain = null;
        D.board[ev.to] = p; this.shake(2); this.dust(ev.to);
        return this.wait(120);
      }
      case 'stasis': {
        sfx('freeze'); haptic('rigid');
        await Promise.all(ev.sqs.map(i => { const [x, y] = this.xy(i); return this.playFx('freeze', x, y, T, T, 420); }));
        for (const id of ev.ids) D.frozen[id] = 1;
        return;
      }
      case 'mark': {
        sfx('mark');
        const [x, y] = this.xy(ev.sq);
        const m = { owner: D.turn, id: ev.id, placed: D.ply, at: D.ply + 2, zoom: 1 };
        D.marks = [...D.marks, m];
        return this.tween(320, t => { m.zoom = 1 + 2 * (1 - t); });
      }
      case 'meteorCast': {
        sfx('meteorCast'); haptic('warning');
        const m = { owner: D.turn, c: ev.sq, at: D.ply + 2, fade: 0, shape: ev.shape };
        D.meteors = [...D.meteors, m];
        return this.tween(500, t => { m.fade = t; });
      }
      case 'meteor': {
        const [cx, cy] = this.center(ev.sq);
        sfx('meteorFall');
        await this.playFx('meteor_fall', cx - 1.5 * T + T, cy - 1.5 * T - T, 3 * T, 3 * T, 420);
        sfx('boom'); haptic('heavy'); this.shake(9); this.flash = 0.7;
        D.meteors = D.meteors.filter(m => !(m.c === ev.sq && m.owner === D.turn));
        this.playFx('explosion', cx - 2 * T, cy - 2 * T, 4 * T, 4 * T, 650);
        return this.wait(120);
      }
      case 'lightning': {
        const [x, y] = this.xy(ev.sq);
        sfx('lightning'); haptic('heavy');
        await this.playFx('lightning', x - T / 2, this.o - T, 2 * T, y - this.o + 2 * T, 300);
        this.flash = 0.8; this.shake(6);
        return;
      }
      case 'shackles': {
        sfx('chains'); haptic('rigid');
        D.shackled = { ...(D.shackled || {}), [ev.id]: 1 };
        this.dust(ev.sq, '#8b8ba0', 12);
        return this.wait(300);
      }
      case 'insight': sfx('insight'); return this.wait(150);
      case 'marchOn': sfx('rage'); return this.wait(100);
      case 'swap': {
        sfx('swap'); haptic('light');
        await this.slide([{ from: ev.a, to: ev.b }, { from: ev.b, to: ev.a }], 320);
        return;
      }
      case 'ghost': {
        sfx('ghost'); D.ghost = ev.id;
        this.dust(ev.sq, '#c0f0ff', 16);
        return this.wait(250);
      }
      case 'trapSet': {
        sfx('trapSet');
        if (this.trapVisible(ev.side)) D.traps = [...(D.traps || []), { owner: ev.side, sq: ev.sq }];
        return this.wait(150);
      }
      case 'trap': {
        sfx('trap'); haptic('heavy'); this.shake(4); this.flash = 0.3;
        const [x, y] = this.xy(ev.sq);
        this.trapSnap = { x, y, t0: performance.now() };
        this.text('Капкан!', ev.sq, '#e83b3b');
        D.traps = (D.traps || []).filter(t => t.sq !== ev.sq);
        return this.wait(200);
      }
      case 'trapFail': D.traps = (D.traps || []).filter(t => t.sq !== ev.sq); this.text('Капкан!', ev.sq, '#c0f0ff'); sfx('trap'); return this.wait(200);
      case 'trapGone': D.traps = (D.traps || []).filter(t => t.sq !== ev.sq); return;
      case 'wave': {
        sfx('wave'); haptic('heavy'); this.shake(5);
        this.ring(ev.sq, '#fee761', 420);
        await this.slide(ev.moves, 260);
        return;
      }
      case 'promote_card':
      case 'polymorph': {
        sfx('morph'); haptic('medium');
        const p = D.board[ev.sq];
        this.dust(ev.sq, '#b25cff', 24); this.ring(ev.sq, '#b25cff', 350, 0.2, 0.9);
        if (p) D.board[ev.sq] = { ...p, t: 'P' };
        this.text('Порча!', ev.sq, '#b25cff');
        return this.wait(300);
      }
      case 'portalOpen': {
        sfx('portal');
        const pt = { owner: D.turn, a: ev.a, b: ev.b, until: D.ply + 6, grow: 0 };
        D.portals = [...(D.portals || []), pt];
        this.ring(ev.a, '#b25cff', 400, 0.1, 0.8); this.ring(ev.b, '#b25cff', 400, 0.1, 0.8);
        return this.tween(400, t => { pt.grow = t; });
      }
      case 'portalClose': D.portals = (D.portals || []).filter(p => !(p.a === ev.a && p.b === ev.b)); this.dust(ev.a, '#b25cff'); this.dust(ev.b, '#b25cff'); return;
      case 'portal': {
        sfx('portal');
        const p = D.board[ev.from]; if (!p) return;
        const [x0, y0] = this.xy(ev.from), [x1, y1] = this.xy(ev.to);
        D.board[ev.from] = null;
        await this.playFx('teleport', x0, y0 - this.tile, this.tile, 2 * this.tile, 220);
        D.board[ev.to] = p; this.last = [ev.from, ev.to];
        return this.playFx('teleport', x1, y1 - this.tile, this.tile, 2 * this.tile, 220);
      }
      case 'rebirth':
      case 'mirror': {
        sfx(ev.t); haptic('medium');
        const [x, y] = this.xy(ev.sq ?? ev.to);
        await this.playFx('teleport', x, y - this.tile, this.tile, 2 * this.tile, 320);
        D.board[ev.sq ?? ev.to] = ev.piece;
        this.dust(ev.sq ?? ev.to, ev.t === 'mirror' ? '#c0f0ff' : '#fee761', 18);
        this.text(ev.t === 'mirror' ? 'Зеркало!' : 'Возрождение!', ev.sq ?? ev.to, '#fee761');
        return this.wait(200);
      }
      case 'quake': {
        sfx('quake'); haptic('heavy'); this.shake(10);
        await this.slide(ev.moves, 380);
        this.shake(6);
        return;
      }
      case 'lavaBurn': sfx('lava'); this.dust(ev.sq, '#f77622', 20); return this.wait(120);
      case 'discard': return;
      case 'chaosAnn':
        D.chaos = { ...(D.chaos || {}), ann: { id: ev.id } };
        return;
      case 'chaos': {
        sfx('chaos'); haptic('warning'); this.flash = 0.35; this.shake(4);
        D.chaos = { ...(D.chaos || {}), ann: null };
        if (ev.id === 'lava') { D.chaos.lava = D.ply + 4; this.shake(6); }
        if (ev.id === 'cavalry') D.chaos.cavalry = D.ply + 2;
        if (ev.id === 'silence') D.chaos.silence = D.ply + 2;
        if (ev.id === 'fog') D.chaos.fog = D.ply + 2;
        if (this.onChaos) await this.onChaos(ev.id);
        return this.wait(200);
      }
      case 'markHit': sfx('mark'); this.flash = 0.25; this.text('Метка!', ev.sq, '#e83b3b'); return this.wait(250);
      case 'markFail': D.marks = D.marks.filter(m => !(D.board[ev.sq] && m.id === D.board[ev.sq].id)); this.text('Ушёл', ev.sq, '#c0f0ff'); return this.wait(150);
      case 'turn': D.turn = ev.side; D.ply++; D.ghost = null; return;
      case 'shieldEnd': delete D.shield[ev.id]; return;
      case 'frozenEnd': delete D.frozen[ev.id]; return;
      case 'shackledEnd': if (D.shackled) delete D.shackled[ev.id]; return;
      case 'wallGone': delete D.walls[ev.sq]; this.dust(ev.sq); return;
    }
  }

  // ---------- кадр ----------
  tick(now) {
    for (const a of this.anims.slice()) {
      const t = Math.min(1, (now - a.t0) / a.dur);
      a.fn(t);
      if (t >= 1) { this.anims.splice(this.anims.indexOf(a), 1); a.res(); }
    }
    for (const f of this.fx.slice()) if (now - f.t0 >= f.dur) { this.fx.splice(this.fx.indexOf(f), 1); f.res(); }
    this.draw(now);
  }

  draw(now) {
    const g = this.ctx, T = this.tile, k = this.k, D = this.disp, A = this.A;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.cv.width, this.cv.height);
    g.drawImage(this.bg, 0, 0);
    if (!D) return;
    if (this.shakeAmp > 0.3) {
      g.translate((Math.random() - 0.5) * this.shakeAmp, (Math.random() - 0.5) * this.shakeAmp);
      this.shakeAmp *= 0.86;
    } else this.shakeAmp = 0;
    const pulse = 0.5 + 0.5 * Math.sin(now / 180);
    const frame = n => Math.floor(now / 140) % n;

    if (this.last) for (const i of this.last) { const [x, y] = this.xy(i); g.fillStyle = 'rgba(254,231,97,0.28)'; g.fillRect(x, y, T, T); }
    for (const m of D.meteors) {
      g.globalAlpha = (m.fade ?? 1) * (0.75 + 0.25 * pulse);
      for (const i of zoneOf(m)) { const [x, y] = this.xy(i); if (this.cb) this.hatch(x, y, '#2ca8ff'); else g.drawImage(A.tiles.ov_danger, x, y, T, T); }
      g.globalAlpha = 1;
      const [x, y] = this.xy(m.c);
      g.drawImage(A.icons.meteor, x + T / 4, y + T / 4, T / 2, T / 2);
    }
    if (D.chaos && D.chaos.lava > D.ply) for (const i of LAVA) {
      const [x, y] = this.xy(i); g.globalAlpha = 0.75 + 0.25 * pulse; g.drawImage(A.tiles.ov_lava, x, y, T, T); g.globalAlpha = 1;
    }
    for (const pt of D.portals || []) for (const i of [pt.a, pt.b]) {
      const [x, y] = this.xy(i), z = pt.grow ?? 1;
      g.globalAlpha = z; g.drawImage(A.fx.portal, frame(4) * 16, 0, 16, 16, x + T * (1 - z) / 2, y + T * (1 - z) / 2, T * z, T * z); g.globalAlpha = 1;
      const left = Math.ceil((pt.until - D.ply) / 2);
      if (left > 0 && left < 9) this.label(String(left), x + T - 4 * k, y + T - 4 * k, '#c0f0ff', 4 * k);
    }
    for (const t of D.traps || []) {
      if (!this.trapVisible(t.owner)) continue;
      const [x, y] = this.xy(t.sq); g.globalAlpha = 0.55 + 0.25 * pulse; g.drawImage(A.tiles.ov_trap, x, y, T, T); g.globalAlpha = 1;
    }
    for (const i of this.hints.zone) { const [x, y] = this.xy(i); g.fillStyle = this.cb ? `rgba(44,168,255,${0.25 + 0.2 * pulse})` : `rgba(232,59,59,${0.25 + 0.2 * pulse})`; g.fillRect(x, y, T, T); }
    if (this.checkSq >= 0) {
      const [x, y] = this.center(this.checkSq);
      const gr = g.createRadialGradient(x, y, 0, x, y, T * 0.7);
      const cc = this.cb ? '44,168,255' : '255,51,68'; gr.addColorStop(0, `rgba(${cc},${0.6 + 0.3 * pulse})`); gr.addColorStop(1, `rgba(${cc},0)`);
      g.fillStyle = gr; g.fillRect(x - T, y - T, 2 * T, 2 * T);
    }
    if (this.sel >= 0) { const [x, y] = this.xy(this.sel); g.drawImage(A.tiles.ov_select, x, y, T, T); }

    const pos = {};
    for (let i = 0; i < 64; i++) {
      const p = D.board[i];
      if (p) pos[p.id] = i;
      if (D.walls[i] !== undefined) {
        const [x, y] = this.xy(i);
        g.drawImage(A.icons.wall, x, y, T, T);
        const left = Math.ceil((D.walls[i] - D.ply) / 2);
        if (left > 0) this.label(String(left), x + T - 4 * k, y + T - 4 * k, '#fee761', 4 * k);
      }
    }
    const fogged = this.fogSet(D);
    for (let i = 0; i < 64; i++) {
      const p = D.board[i];
      if (!p || this.hidden.has(p.id)) continue;
      if (fogged && fogged.has(i) && p.s !== this.viewer) continue;
      const [x, y] = this.xy(i);
      // покачивание в покое: изредка фигура «вдыхает» на пиксель
      const bob = this.idle && !this.anims.length && p.s === D.turn && (p.t === 'K' || p.t === 'Q') && D.frozen[p.id] === undefined && Math.sin(now / 900 + p.id * 1.7) > 0.8 ? Math.round(k) : 0; // покачиваются только король и ферзь ходящего
      g.drawImage(A.tiles.ov_shadow, x, y, T, T);
      if (D.ghost === p.id) g.globalAlpha = 0.45 + 0.3 * pulse;
      g.drawImage(this.pieceImg(p), x, y - bob, T, T);
      g.globalAlpha = 1;
      if (D.frozen[p.id] !== undefined) g.drawImage(A.tiles.ov_frozen, x, y, T, T);
      if (D.shackled && D.shackled[p.id] !== undefined) g.drawImage(A.icons.shackles, x + T * 0.45, y + T * 0.45, T * 0.55, T * 0.55);
    }
    if (fogged) for (const i of fogged) { const [x, y] = this.xy(i); g.fillStyle = 'rgba(20,18,28,0.82)'; g.fillRect(x, y, T, T); }
    for (const f of this.floaters) {
      g.save();
      if (f.rot) { g.translate(f.x + T / 2, f.y + T); g.rotate(f.rot); g.drawImage(this.pieceImg(f.p), -T / 2, -T, T, T); }
      else g.drawImage(this.pieceImg(f.p), f.x, f.y, T, T);
      g.restore();
    }
    for (const id in D.shield) {
      if (pos[id] === undefined) continue;
      const [x, y] = this.xy(pos[id]);
      g.drawImage(A.fx.shield, frame(4) * 16, 0, 16, 16, x, y, T, T);
    }
    for (const m of D.marks) {
      if (pos[m.id] === undefined) continue;
      const [x, y] = this.xy(pos[m.id]), z = m.zoom || 1, s = T * z;
      g.drawImage(A.fx.mark, frame(4) * 16, 0, 16, 16, x + T / 2 - s / 2, y + T / 2 - s / 2, s, s);
    }
    for (const i of this.hints.moves) { const [x, y] = this.xy(i); g.drawImage(A.tiles.ov_move, x, y, T, T); }
    for (const i of this.hints.caps) { const [x, y] = this.xy(i); g.drawImage(A.tiles.ov_capture, x, y, T, T); }
    for (const i of this.hints.targets) {
      const [x, y] = this.xy(i);
      g.strokeStyle = `rgba(44,232,245,${0.5 + 0.5 * pulse})`; g.lineWidth = k;
      g.strokeRect(x + k * 1.5, y + k * 1.5, T - 3 * k, T - 3 * k);
    }
    for (const i of this.glow || []) { // подсказка: пульсирующая золотая рамка
      const [x, y] = this.xy(i); g.strokeStyle = `rgba(254,231,97,${0.45 + 0.55 * pulse})`; g.lineWidth = 2 * k;
      g.strokeRect(x + k, y + k, T - 2 * k, T - 2 * k);
    }
    for (const i of this.hints.picked) { const [x, y] = this.xy(i); g.drawImage(A.tiles.ov_select, x, y, T, T); }
    if (this.chain) {
      const { ax, ay, x, y } = this.chain, n = Math.hypot(x - ax, y - ay) / (3 * k);
      for (let j = 0; j <= n; j++) {
        const cx = ax + (x - ax) * j / n, cy = ay + (y - ay) * j / n;
        g.fillStyle = j % 2 ? '#8b8ba0' : '#c4b89c'; g.fillRect(cx - k, cy - k, 2 * k, 2 * k);
      }
      g.drawImage(A.icons.hook, x - T / 3, y - T / 3, T * 2 / 3, T * 2 / 3);
    }
    if (this.dropWall) g.drawImage(A.icons.wall, this.dropWall.x, this.dropWall.y, T, T);
    for (const r of this.rings) { g.strokeStyle = r.col; g.globalAlpha = r.a; g.lineWidth = 2 * k; g.beginPath(); g.arc(r.x, r.y, r.rad, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1; }
    if (this.trapSnap) {
      const t = (now - this.trapSnap.t0) / 400;
      if (t > 1) this.trapSnap = null;
      else { g.globalAlpha = 1 - t; g.drawImage(A.icons.trap, this.trapSnap.x - T * t * 0.3, this.trapSnap.y - T * t * 0.3, T * (1 + 0.6 * t), T * (1 + 0.6 * t)); g.globalAlpha = 1; }
    }
    for (const f of this.fx) {
      const [n, w, h] = FX[f.name], fr = Math.min(n - 1, Math.floor((now - f.t0) / f.dur * n));
      g.drawImage(A.fx[f.name], fr * w, 0, w, h, f.x, f.y, f.w, f.h);
    }
    for (const p of this.parts.slice()) {
      const t = now - p.t0;
      if (t > p.life) { this.parts.splice(this.parts.indexOf(p), 1); continue; }
      p.x += p.vx * 2; p.y += p.vy * 2; p.vy += 0.02 * k;
      g.globalAlpha = Math.max(0, 1 - t / p.life); g.fillStyle = p.col;
      g.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    if (this.coords) { // координаты в углах крайних клеток (с учётом разворота доски)
      const light = i => ((i >> 3) + (i & 7)) % 2 === 0;
      for (let c = 0; c < 8; c++) {
        const b = this.flip ? 7 - c : 56 + c, [bx, by] = this.xy(b);
        this.small("abcdefgh"[b & 7], bx + T - 3 * k, by + T - 3.2 * k, light(b));
        const l = this.flip ? (7 - c) * 8 + 7 : c * 8, [lx, ly] = this.xy(l);
        this.small(String(8 - (l >> 3)), lx + 2.8 * k, ly + 3.8 * k, light(l));
      }
    }
    g.globalAlpha = 1;
    for (const tx of this.texts.slice()) {
      const t = (now - tx.t0) / tx.dur;
      if (t > 1) { this.texts.splice(this.texts.indexOf(tx), 1); continue; }
      g.globalAlpha = t < 0.7 ? 1 : (1 - t) / 0.3;
      this.label(tx.txt, tx.x, tx.y - t * 10 * k, tx.color, (tx.big ? 9 : 6) * k, true);
    }
    g.globalAlpha = 1;
    if (this.flash > 0.02) { g.fillStyle = `rgba(255,255,255,${this.flash})`; g.fillRect(-50, -50, this.cv.width + 100, this.cv.height + 100); this.flash *= 0.85; }
  }

  // Штриховка для режима дальтоников: опасность видна узором, а не только цветом.
  hatch(x, y, col) {
    const g = this.ctx, T = this.tile, k = this.k;
    g.fillStyle = col; g.globalAlpha *= 0.35; g.fillRect(x, y, T, T); g.globalAlpha /= 0.35;
    g.save(); g.beginPath(); g.rect(x, y, T, T); g.clip(); g.strokeStyle = col; g.lineWidth = 1.5 * k;
    for (let d = -T; d < T; d += 4 * k) { g.beginPath(); g.moveTo(x + d, y + T); g.lineTo(x + d + T, y); g.stroke(); }
    g.restore();
  }
  small(txt, x, y, light) {
    const g = this.ctx; g.font = `800 ${Math.round(5 * this.k)}px "Golos Text", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = light ? 'rgba(239,230,210,.9)' : 'rgba(20,18,28,.75)'; g.fillText(txt, x + this.k * 0.6, y + this.k * 0.6);
    g.fillStyle = light ? '#3a3150' : '#efe6d2'; g.fillText(txt, x, y);
  }
  trapVisible(owner) { return this.showTraps === 'all' || owner === this.viewer; }
  // Туман войны: видно только свои фигуры, клетки рядом с ними и под их ударом.
  fogSet(D) {
    if (!D.chaos || !(D.chaos.fog > D.ply) || !this.viewer) return null;
    const me = this.viewer, vis = new Set();
    for (let i = 0; i < 64; i++) {
      const p = D.board[i];
      if (p && p.s === me) { vis.add(i); for (const [dr, df] of KG) { const r = (i >> 3) + dr, f = (i & 7) + df; if (inb(r, f)) vis.add(idx(r, f)); } }
    }
    for (let i = 0; i < 64; i++) if (!vis.has(i) && attacked(D, i, me)) vis.add(i);
    const out = new Set();
    for (let i = 0; i < 64; i++) if (!vis.has(i)) out.add(i);
    return out;
  }

  label(txt, x, y, color, size, centered = false) {
    const g = this.ctx;
    g.font = `800 ${Math.round(size)}px "Golos Text", system-ui, sans-serif`;
    g.textAlign = centered ? 'center' : 'left'; g.textBaseline = 'middle';
    g.fillStyle = '#0b0810';
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) g.fillText(txt, x + dx * this.k, y + dy * this.k);
    g.fillStyle = color; g.fillText(txt, x, y);
  }

  setState(st) {
    this.disp = { ...st, board: st.board.slice(), walls: { ...st.walls }, shield: { ...st.shield }, frozen: { ...st.frozen },
      shackled: { ...(st.shackled || {}) }, marks: st.marks.map(m => ({ ...m })), meteors: st.meteors.map(m => ({ ...m })),
      traps: (st.traps || []).slice(), portals: (st.portals || []).map(p => ({ ...p })), chaos: st.chaos && { ...st.chaos } };
    this.checkSq = st.started && inCheck(st, st.turn) ? kingSq(st, st.turn) : -1;
  }

  async tipKing(sq) {
    const p = this.disp.board[sq]; if (!p) return;
    const [x, y] = this.xy(sq);
    this.hidden.add(p.id);
    const fl = { p, x, y, rot: 0 }; this.floaters.push(fl);
    sfx('tip');
    await this.tween(900, t => { fl.rot = (Math.PI / 2) * ease(t) * (p.s === 'w' ? 1 : -1); });
  }

  confetti() {
    const cols = ['#fee761', '#f77622', '#b25cff', '#2ce8f5', '#63c74d', '#e83b3b'];
    for (let j = 0; j < 140; j++) {
      this.parts.push({ x: Math.random() * this.cv.width, y: -10 - Math.random() * 100, vx: (Math.random() - 0.5) * this.k * 0.4,
        vy: Math.random() * this.k * 0.6, col: cols[j % cols.length], size: this.k * 2, life: 2500, t0: performance.now() });
    }
  }
}
