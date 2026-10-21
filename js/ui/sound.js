// Efeitos sonoros curtos gerados na hora (sem arquivos de áudio).

let ctx = null;
let enabled = true;

export function setSoundEnabled(on) {
  enabled = on;
}

function audio() {
  if (!enabled) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

// Barulho de carta: um "tsk" de ruído filtrado.
function cardNoise(vol = 0.25, dur = 0.07, freq = 2400) {
  const a = audio();
  if (!a) return;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  const g = a.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(a.destination);
  src.start();
}

function tone(freq, start, dur, vol = 0.12, type = 'sine') {
  const a = audio();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t = a.currentTime + start;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export const sfx = {
  card: () => cardNoise(0.3, 0.06, 2600),
  draw: () => cardNoise(0.22, 0.09, 1800),
  pile: () => {
    for (let i = 0; i < 4; i++) setTimeout(() => cardNoise(0.2, 0.05, 2000 + i * 200), i * 45);
  },
  meld: () => {
    cardNoise(0.28, 0.06, 2200);
    setTimeout(() => cardNoise(0.24, 0.06, 2500), 60);
  },
  turn: () => tone(660, 0, 0.15, 0.08),
  chat: () => {
    tone(880, 0, 0.08, 0.05);
    tone(1175, 0.07, 0.1, 0.05);
  },
  error: () => tone(220, 0, 0.18, 0.08, 'triangle'),
  canastra: () => [523, 659, 784].forEach((f, i) => tone(f, i * 0.09, 0.3, 0.1)),
  morto: () => [392, 523].forEach((f, i) => tone(f, i * 0.1, 0.3, 0.1)),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.45, 0.11)),
};
