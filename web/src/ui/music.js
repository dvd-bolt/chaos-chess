// Две чиптюн-темы собственного сочинения, синтез на WebAudio (без файлов и лицензий).
// Ноты: 'C4', 'D#3', '-' пауза. Каждая дорожка — массив шестнадцатых.
const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const freq = n => { const m = n.match(/^([A-G]#?)(\d)$/); return 440 * 2 ** ((NOTE[m[1]] + (Number(m[2]) + 1) * 12 - 69) / 12); };
const seq = s => s.trim().split(/\s+/);

const TRACKS = {
  // «Башня в тумане» — меню: спокойные арпеджио ля-минор → фа → до → соль
  menu: { bpm: 84, parts: [
    { wave: 'triangle', vol: 0.05, len: 0.9, notes: seq(`
      A3 C4 E4 A4 E4 C4 A3 C4  F3 A3 C4 F4 C4 A3 F3 A3  C4 E4 G4 C5 G4 E4 C4 E4  G3 B3 D4 G4 D4 B3 G3 B3
      A3 C4 E4 A4 E4 C4 A3 C4  F3 A3 C4 F4 C4 A3 F3 A3  D4 F4 A4 D5 A4 F4 D4 F4  E4 G#4 B4 E5 B4 G#4 E4 B3`) },
    { wave: 'square', vol: 0.022, len: 3.6, notes: seq(`
      E5 - - - - - - - C5 - - - - - - -  G5 - - - - - - - D5 - - - B4 - - -
      E5 - - - - - - - A5 - - - G5 - F5 -  F5 - - - E5 - D5 - E5 - - - - - - -`) },
    { wave: 'triangle', vol: 0.06, len: 3.8, notes: seq(`
      A2 - - - - - - - F2 - - - - - - -  C3 - - - - - - - G2 - - - - - - -
      A2 - - - - - - - F2 - - - - - - -  D3 - - - - - - - E2 - - - - - - -`) },
  ] },
  // «Гамбит хаоса» — партия: напряжённый бас ре-минор и короткие фразы
  game: { bpm: 112, parts: [
    { wave: 'square', vol: 0.028, len: 0.45, notes: seq(`
      D2 D3 D2 D3 D2 D3 F2 F3  D2 D3 D2 D3 C2 C3 C2 C3  A#1 A#2 A#1 A#2 A#1 A#2 C2 C3  A1 A2 A1 A2 A1 A2 C#2 C#3
      D2 D3 D2 D3 D2 D3 F2 F3  D2 D3 D2 D3 C2 C3 C2 C3  A#1 A#2 A#1 A#2 G1 G2 G1 G2  A1 A2 A1 A2 E2 E3 C#2 C#3`) },
    { wave: 'square', vol: 0.018, len: 0.8, notes: seq(`
      - - - - A4 - F4 - D4 - - - E4 F4 G4 -  - - - - A4 - C5 - A#4 - A4 - G4 - - -
      - - - - F4 - D4 - A#3 - - - C4 D4 E4 -  - - - - E4 - G4 - A4 - - - C#5 - - -
      - - - - A4 - F4 - D4 - - - E4 F4 G4 -  - - - - A4 - C5 - D5 - C5 - A#4 - A4 -
      - - - - G4 - A#4 - D5 - - - A#4 - G4 -  - - - - A4 - - - E4 - C#4 - A3 - - -`) },
    { wave: 'noise', vol: 0.03, len: 0.08, notes: seq(`
      x - x - X - x - x - x - X - x x  x - x - X - x - x - x - X - x -`) },
  ] },
};

let ctx = null, master = null, timer = null, cur = null, step = 0, nextT = 0, enabled = true, noiseBuf = null;
export function setMusic(on, name) { enabled = on; if (!on) stop(); else if (name) play(name); }

function voice(part, note, t, dur) {
  if (part.wave === 'noise') {
    const src = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    src.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = note === 'X' ? 1500 : 5000;
    g.gain.setValueAtTime(part.vol * (note === 'X' ? 1.6 : 1), t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master); src.start(t); src.stop(t + dur + 0.02);
    return;
  }
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = part.wave; o.frequency.value = freq(note);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(part.vol, t + 0.012);
  g.gain.setValueAtTime(part.vol, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
}

function schedule() {
  const tr = TRACKS[cur], s16 = 60 / tr.bpm / 4;
  while (nextT < ctx.currentTime + 0.25) {
    for (const p of tr.parts) {
      const n = p.notes[step % p.notes.length];
      if (n && n !== '-') voice(p, n, nextT, s16 * p.len * (p.len > 1 ? 1 : 1.6));
    }
    step++; nextT += s16;
  }
}

export function play(name, audioCtx) {
  if (audioCtx && !ctx) ctx = audioCtx;
  if (!enabled || !ctx || cur === name) return;
  stop();
  if (!master) { master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination); }
  if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  cur = name; step = 0; nextT = ctx.currentTime + 0.1;
  master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setValueAtTime(0.0001, ctx.currentTime); master.gain.exponentialRampToValueAtTime(0.9, ctx.currentTime + 1.5);
  timer = setInterval(schedule, 90);
}
export function stop() { if (timer) clearInterval(timer); timer = null; cur = null; }
export const nowPlaying = () => cur;
