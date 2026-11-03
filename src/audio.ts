// All SFX are synthesised in code (WebAudio) — no third-party sound files. Music: CC0 Juhani Junkala tracks (see CREDITS.md).
let ctx: AudioContext | null = null, master: GainNode | null = null;
let muted = localStorage.getItem('spoiler.mute') === '1';
let music: HTMLAudioElement | null = null, musicName = '';
const base = import.meta.env.BASE_URL;

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext; if (!AC) return;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  if (music && !muted && music.paused) music.play().catch(() => {});
}
export const isMuted = () => muted;
export function toggleMute() {
  muted = !muted; localStorage.setItem('spoiler.mute', muted ? '1' : '0');
  if (master) master.gain.value = muted ? 0 : 0.5;
  if (music) { if (muted) music.pause(); else music.play().catch(() => {}); }
}
export function playMusic(name: 'title' | 'game') {
  if (musicName === name) return; musicName = name;
  if (music) music.pause();
  music = new Audio(`${base}assets/music-${name}.mp3`); music.loop = true; music.volume = name === 'game' ? 0.28 : 0.35;
  if (!muted) music.play().catch(() => {});
}

function tone(type: OscillatorType, f0: number, f1: number, dur: number, vol = 0.3, delay = 0) {
  if (!ctx || !master) return; const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur: number, vol = 0.3, lp = 4000, delay = 0, lp1 = lp) {
  if (!ctx || !master) return; const t = ctx.currentTime + delay;
  const n = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const s = ctx.createBufferSource(); s.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(lp, t); f.frequency.exponentialRampToValueAtTime(Math.max(60, lp1), t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t);
}
export const sfx: Record<string, () => void> = {
  jump: () => tone('square', 260, 620, 0.14, 0.14),
  land: () => noise(0.06, 0.1, 900),
  die: () => { noise(0.35, 0.35, 5000, 0, 200); tone('sawtooth', 420, 50, 0.4, 0.22); },
  win: () => { [523, 659, 784, 1047].forEach((f, i) => tone('square', f, f, 0.14, 0.16, i * 0.08)); },
  spring: () => tone('sine', 200, 900, 0.25, 0.3),
  thud: () => { noise(0.25, 0.5, 700, 0, 90); tone('sine', 90, 35, 0.25, 0.5); },
  dropStart: () => tone('square', 700, 700, 0.05, 0.08),
  stalkSlam: () => { tone('sawtooth', 300, 80, 0.2, 0.2); },
  crumble: () => noise(0.3, 0.25, 1500, 0, 200),
  shake: () => noise(0.1, 0.1, 1200),
  hop: () => { tone('triangle', 300, 1200, 0.18, 0.25); tone('triangle', 1200, 300, 0.18, 0.2, 0.1); },
  warn: () => { tone('square', 880, 880, 0.06, 0.12); tone('square', 660, 660, 0.09, 0.12, 0.07); },
  click: () => tone('square', 520, 520, 0.05, 0.1),
  select: () => { tone('square', 440, 440, 0.06, 0.12); tone('square', 880, 880, 0.1, 0.12, 0.06); },
};
export function play(name: string) { if (!muted) sfx[name]?.(); }
