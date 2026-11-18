// Процедурные 8-bit звуки на WebAudio: без файлов и лицензий.
let ctx = null, on = true;
export const setSound = v => { on = v; };
export function unlockAudio() {
  if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; } }
  if (ctx.state === 'suspended') ctx.resume();
}
function tone(type, f0, f1, dur, vol = 0.15, delay = 0) {
  const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol, f0, f1, delay = 0) {
  const t = ctx.currentTime + delay, n = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = buf; flt.type = 'lowpass';
  flt.frequency.setValueAtTime(f0, t); flt.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(flt).connect(g).connect(ctx.destination); src.start(t);
}
const S = {
  select: () => tone('square', 660, 700, 0.05, 0.05),
  move: () => tone('square', 240, 170, 0.08, 0.1),
  capture: () => { noise(0.2, 0.35, 3500, 200); tone('square', 320, 70, 0.16, 0.1); },
  card: () => { tone('triangle', 300, 900, 0.16, 0.14); tone('square', 900, 1200, 0.08, 0.05, 0.12); },
  shield: () => { tone('sine', 880, 880, 0.18, 0.14); tone('sine', 1320, 1320, 0.3, 0.1, 0.09); },
  wall: () => { noise(0.3, 0.45, 900, 80); tone('square', 90, 45, 0.22, 0.2); },
  hook: () => [0, 0.06, 0.12, 0.18].forEach((d, i) => tone('square', 1300 - i * 150, 800 - i * 100, 0.04, 0.08, d)),
  pull: () => { tone('sawtooth', 200, 600, 0.25, 0.08); noise(0.2, 0.15, 2000, 400, 0.05); },
  freeze: () => [0, 1, 2, 3, 4].forEach(i => tone('triangle', 1800 + i * 350, 2600 + i * 200, 0.09, 0.05, i * 0.045)),
  mark: () => { tone('sawtooth', 400, 1400, 0.18, 0.06); tone('square', 1400, 1400, 0.05, 0.05, 0.2); },
  meteorCast: () => { noise(0.8, 0.18, 200, 900); tone('sine', 60, 90, 0.8, 0.12); },
  meteorFall: () => { tone('sawtooth', 1600, 200, 0.45, 0.07); noise(0.45, 0.15, 4000, 800); },
  boom: () => { noise(1.2, 0.7, 1500, 50); tone('sine', 90, 25, 0.9, 0.5); tone('square', 120, 30, 0.4, 0.15); },
  lightning: () => { noise(0.45, 0.55, 8000, 400); tone('sawtooth', 1800, 80, 0.35, 0.14); },
  blink: () => { tone('sine', 400, 1800, 0.18, 0.12); tone('sine', 1800, 600, 0.15, 0.08, 0.18); },
  ritual: () => { tone('sawtooth', 220, 90, 0.35, 0.1); tone('sine', 600, 1300, 0.3, 0.1, 0.2); },
  mana: () => tone('sine', 1250, 1700, 0.08, 0.05),
  rage: () => { tone('square', 300, 700, 0.12, 0.09); tone('square', 700, 900, 0.1, 0.07, 0.1); },
  draw: () => tone('triangle', 500, 800, 0.07, 0.07),
  error: () => tone('square', 160, 110, 0.13, 0.09),
  check: () => { tone('square', 880, 880, 0.08, 0.1); tone('square', 660, 660, 0.12, 0.1, 0.1); },
  win: () => [523, 659, 784, 1046, 1318].forEach((f, i) => tone('square', f, f, 0.16, 0.1, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone('triangle', f, f * 0.98, 0.22, 0.14, i * 0.2)),
  turn: () => tone('sine', 520, 560, 0.07, 0.05),
  tip: () => { tone('square', 300, 90, 0.5, 0.08); },
  chains: () => [0, 0.05, 0.1].forEach(d => { tone('square', 1500, 1100, 0.04, 0.06, d); noise(0.05, 0.1, 6000, 2000, d); }),
  insight: () => [660, 880, 1100, 1320].forEach((f, i) => tone('sine', f, f * 1.02, 0.1, 0.07, i * 0.05)),
  swap: () => { tone('triangle', 500, 900, 0.15, 0.1); tone('triangle', 900, 500, 0.15, 0.1, 0.08); },
  ghost: () => { tone('sine', 300, 600, 0.5, 0.06); tone('sine', 303, 606, 0.5, 0.06); },
  trap: () => { noise(0.08, 0.5, 6000, 1000); tone('square', 900, 200, 0.12, 0.15); },
  trapSet: () => tone('square', 400, 250, 0.08, 0.05),
  wave: () => { noise(0.5, 0.35, 300, 3000); tone('sine', 120, 40, 0.5, 0.25); },
  portal: () => { tone('sine', 200, 1200, 0.3, 0.1); tone('triangle', 1200, 300, 0.3, 0.06, 0.15); },
  morph: () => { tone('sawtooth', 600, 150, 0.4, 0.08); noise(0.3, 0.1, 1000, 300); },
  quake: () => { noise(1.0, 0.6, 400, 40); tone('sine', 50, 30, 1.0, 0.4); },
  rebirth: () => [392, 523, 659, 784].forEach((f, i) => tone('triangle', f, f, 0.18, 0.1, i * 0.08)),
  mirror: () => { tone('sine', 1000, 1500, 0.25, 0.08); tone('sine', 1500, 1000, 0.25, 0.08, 0.12); },
  lava: () => { noise(0.6, 0.3, 800, 150); tone('sawtooth', 90, 60, 0.6, 0.1); },
  chaos: () => { [220, 277, 330, 440, 554].forEach((f, i) => tone('square', f, f * 1.5, 0.14, 0.07, i * 0.07)); noise(0.6, 0.15, 3000, 300, 0.3); },
  emote: () => { tone('square', 880, 1320, 0.07, 0.06); tone('square', 1320, 1760, 0.07, 0.05, 0.07); },
};
export const audioCtx = () => ctx;
export function sfx(name) { if (on && ctx) try { S[name]?.(); } catch { /* звук не критичен */ } }
