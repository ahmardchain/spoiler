import { LEVELS } from './levels';
import { compile, initState, step, predict, clone, HORIZON, HW, HH, W, H, T, type Compiled, type State, type Pred } from './sim';
import { drawWorld, drawBackground, drawHero, text, worldOf, FONT, drawTile } from './render';
import { held } from './input';
import * as audio from './audio';

export const VW = 768, VH = 432, LX = 0, LY = 54;       // logical canvas; level view sits at (LX, LY)
const PX = 584, PY = 34, PS = 176;                       // SPOILER monitor (zoomed window)
type Mode = 'title' | 'select' | 'play' | 'end';
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; c: string; s: number }
interface Save { cleared: Record<number, number>; deaths: number; last: number }

const load = (): Save => { try { return { cleared: {}, deaths: 0, last: 0, ...JSON.parse(localStorage.getItem('spoiler.save') || '{}') }; } catch { return { cleared: {}, deaths: 0, last: 0 }; } };

export class Game {
  g: CanvasRenderingContext2D; mode: Mode = 'title'; save = load();
  li = 0; L!: Compiled; s!: State; levelDeaths = 0; levelTicks = 0;
  pred: Pred | null = null; predKey = ''; lastPredRes = 0; warnCool = 0;
  shake = 0; flash = 0; flashColor = '#fff'; parts: Particle[] = []; squash = 0;
  deadTimer = 0; winTimer = 0; time = 0; acc = 0; last = 0; selIdx = 0; titleT = 0; toast = ''; toastT = 0;
  script: number[] | null = null; scriptPos = 0; scriptDone: (() => void) | null = null;
  scale = 1;

  constructor(public canvas: HTMLCanvasElement) {
    this.g = canvas.getContext('2d')!;
    this.resize(); addEventListener('resize', () => this.resize());
    canvas.addEventListener('pointerdown', e => this.onPointer(e));
  }
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const k = Math.max(1, Math.ceil(Math.min(innerWidth / VW, innerHeight / VH) * dpr));
    this.scale = Math.min(k, 4); this.canvas.width = VW * this.scale; this.canvas.height = VH * this.scale;
  }
  start() { this.last = performance.now(); requestAnimationFrame(t => this.frame(t)); }

  // ----- flow
  startLevel(i: number) {
    this.li = ((i % LEVELS.length) + LEVELS.length) % LEVELS.length; this.L = compile(LEVELS[this.li]); this.s = initState(this.L);
    this.mode = 'play'; this.levelDeaths = 0; this.levelTicks = 0; this.parts = []; this.deadTimer = 0; this.winTimer = 0; this.pred = null; this.lastPredRes = 0;
    this.save.last = this.li; this.persist(); audio.playMusic('game');
  }
  respawn() { this.s = initState(this.L); this.deadTimer = 0; this.pred = null; this.lastPredRes = 0; this.levelTicks = 0; }
  persist() { try { localStorage.setItem('spoiler.save', JSON.stringify(this.save)); } catch { /* private mode */ } }
  say(t: string) { this.toast = t; this.toastT = 120; }

  onKey(code: string) {
    audio.unlock();
    if (code === 'KeyM') { audio.toggleMute(); this.say(audio.isMuted() ? 'SOUND OFF' : 'SOUND ON'); return; }
    if (this.mode === 'title') { if (code !== 'touch') { this.toSelect(); } return; }
    if (this.mode === 'select') {
      const n = LEVELS.length, cols = 7;
      if (code === 'ArrowRight' || code === 'KeyD') this.selIdx = (this.selIdx + 1) % n;
      else if (code === 'ArrowLeft' || code === 'KeyA') this.selIdx = (this.selIdx + n - 1) % n;
      else if (code === 'ArrowDown' || code === 'KeyS') this.selIdx = Math.min(n - 1, this.selIdx + cols);
      else if (code === 'ArrowUp' || code === 'KeyW') this.selIdx = Math.max(0, this.selIdx - cols);
      else if (code === 'Enter' || code === 'Space' || code === 'KeyZ') { audio.play('select'); this.startLevel(this.selIdx); }
      else if (code === 'Escape') { this.mode = 'title'; audio.playMusic('title'); }
      if (code.startsWith('Arrow')) audio.play('click');
      return;
    }
    if (this.mode === 'end') { this.toSelect(); return; }
    if (this.mode === 'play') {
      if (code === 'KeyR') { this.respawn(); }
      else if (code === 'Escape') this.toSelect();
      else if (code === 'KeyN') this.startLevel(this.li + 1);
      else if (code === 'KeyP') this.startLevel(this.li - 1);
    }
  }
  toSelect() { this.mode = 'select'; this.selIdx = Math.min(this.save.last, LEVELS.length - 1); audio.playMusic('title'); audio.play('select'); }

  onPointer(e: PointerEvent) {
    audio.unlock();
    const r = this.canvas.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * VW, y = (e.clientY - r.top) / r.height * VH;
    if (this.mode === 'title') { this.toSelect(); return; }
    if (this.mode === 'end') { this.toSelect(); return; }
    if (this.mode === 'select') {
      for (let i = 0; i < LEVELS.length; i++) { const b = this.cell(i); if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) { audio.play('select'); this.startLevel(i); return; } }
    }
    if (this.mode === 'play' && y < 30 && x > VW - 90) this.toSelect();
  }
  cell(i: number) { const cols = 7, w = 96, h = 78, gx = 12, gy = 12, ox = (VW - (cols * w + (cols - 1) * gx)) / 2; return { x: ox + (i % cols) * (w + gx), y: 118 + ((i / cols) | 0) * (h + gy), w, h }; }

  // ----- main loop
  frame(now: number) {
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now; this.acc += dt;
    let n = 0; while (this.acc >= 1 / 60 && n < 6) { this.tick(); this.acc -= 1 / 60; n++; } if (n === 6) this.acc = 0;
    this.time += dt; this.draw(); requestAnimationFrame(t => this.frame(t));
  }
  input(): number {
    if (this.script) { const v = this.script[this.scriptPos++]; if (this.scriptPos >= this.script.length) { this.script = null; this.scriptDone?.(); } return v ?? 0; }
    return held();
  }
  tick() {
    this.titleT++; if (this.toastT > 0) this.toastT--;
    this.shake *= 0.86; if (this.shake < 0.05) this.shake = 0; if (this.flash > 0) this.flash -= 0.06; this.squash *= 0.8; if (this.warnCool > 0) this.warnCool--;
    for (const p of this.parts) { p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life--; } this.parts = this.parts.filter(p => p.life > 0);
    if (this.mode !== 'play') return;
    const s = this.s;
    if (s.dead) { if (--this.deadTimer <= 0) this.respawn(); return; }
    if (s.won) { if (--this.winTimer <= 0) this.nextLevel(); return; }
    const ev: string[] = []; const was = s.vy;
    step(this.L, s, this.input(), ev); this.levelTicks++;
    for (const e of ev) this.onEvent(e, was);
  }
  nextLevel() {
    if (this.li + 1 >= LEVELS.length) { this.mode = 'end'; audio.playMusic('title'); return; }
    this.startLevel(this.li + 1);
  }
  onEvent(e: string, _vy: number) {
    const s = this.s, cx = s.x + HW / 2, cy = s.y + HH / 2;
    audio.play(e === 'die' ? 'die' : e);
    if (e === 'jump') { this.squash = -0.18; this.dust(cx, s.y + HH, 4); }
    else if (e === 'land') { this.squash = 0.22; this.dust(cx, s.y + HH, 5); }
    else if (e === 'thud') { this.shake = Math.max(this.shake, 4); }
    else if (e === 'stalkSlam') { this.shake = Math.max(this.shake, 2); }
    else if (e === 'spring') { this.squash = -0.3; this.dust(cx, s.y + HH, 6); }
    else if (e === 'hop') { this.flash = 0.5; this.flashColor = '#ffd24a'; this.say('THE DOOR SAW YOU COMING'); }
    else if (e === 'die') {
      this.shake = 9; this.flash = 0.7; this.flashColor = '#ff2a4a'; this.deadTimer = 26; this.levelDeaths++; this.save.deaths++; this.persist();
      for (let i = 0; i < 26; i++) { const a = Math.random() * 6.28, v = 0.8 + Math.random() * 2.6; this.parts.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.2, life: 30 + Math.random() * 25, max: 55, c: ['#3ddc84', '#ffffff', '#ff4a5e', '#b6ffd1'][i & 3], s: 2 + (i % 3) }); }
    } else if (e === 'win') {
      this.winTimer = 56; this.flash = 0.6; this.flashColor = '#fff6a0';
      const prev = this.save.cleared[this.li]; if (prev === undefined || this.levelDeaths < prev) this.save.cleared[this.li] = this.levelDeaths; this.save.last = Math.min(this.li + 1, LEVELS.length - 1); this.persist();
      for (let i = 0; i < 40; i++) { const a = Math.random() * 6.28, v = 1 + Math.random() * 3; this.parts.push({ x: cx, y: cy - 8, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2.2, life: 50 + Math.random() * 30, max: 80, c: ['#ffd24a', '#ff7ac8', '#7ad7ff', '#fff'][i & 3], s: 2 + (i % 2) }); }
    }
  }
  dust(x: number, y: number, n: number) { for (let i = 0; i < n; i++) this.parts.push({ x: x + (Math.random() - 0.5) * 8, y, vx: (Math.random() - 0.5) * 1.2, vy: -Math.random() * 0.8, life: 14 + Math.random() * 8, max: 22, c: '#f2efe6', s: 2 }); }

  // ----- drawing
  draw() {
    const g = this.g, k = this.scale; g.setTransform(k, 0, 0, k, 0, 0); g.imageSmoothingEnabled = false;
    g.fillStyle = '#120d24'; g.fillRect(0, 0, VW, VH);
    if (this.mode === 'title') this.drawTitle(); else if (this.mode === 'select') this.drawSelect(); else if (this.mode === 'end') this.drawEnd(); else this.drawPlay();
    if (this.toastT > 0) { const a = Math.min(1, this.toastT / 20); g.save(); g.globalAlpha = a; text(g, this.toast, VW / 2 - 96, VH - 20, 8, '#ffd24a', 'center'); g.restore(); }
  }

  drawTitle() {
    const g = this.g, t = this.titleT / 60;
    drawBackground(g, 1, 0, 0, VW, VH);
    g.fillStyle = 'rgba(18,13,36,.55)'; g.fillRect(0, 0, VW, VH);
    // ground strip
    for (let c = 0; c < VW / T; c++) { drawTile(g, 1 + (c & 1), c * T, 360); drawTile(g, 24 + (c & 1), c * T, 378); drawTile(g, 24 + ((c + 1) & 1), c * T, 396); drawTile(g, 24 + (c & 1), c * T, 414); }
    // title with a "future" echo
    const bob = Math.sin(t * 2) * 3;
    g.save(); g.globalAlpha = 0.35; text(g, 'SPOILER', VW / 2 + 9 + Math.sin(t * 3) * 3, 92 + bob, 64, '#7a5cff', 'center', ''); g.restore();
    text(g, 'SPOILER', VW / 2, 90 + bob, 64, '#ffffff', 'center', '#ff3d6a');
    text(g, 'SEE YOUR DEATH BEFORE IT HAPPENS', VW / 2, 176, 10, '#ffd24a', 'center');
    // mini explainer: a hero + the ghost 1.5s ahead
    const hx = 250 + ((t * 40) % 270), gx2 = hx + 90;
    drawHero(g, { x: hx, y: 346, vx: 1.7, vy: 0, ground: true, face: 1, dead: false } as State, t, 0);
    drawHero(g, { x: gx2, y: 346, vx: 1.7, vy: 0, ground: true, face: 1, dead: false } as State, t, 0, 0.45, 'rgba(120,200,255,.6)');
    for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(160,220,255,.7)'; g.fillRect(hx + 14 + i * 12, 356, 4, 2); }
    text(g, 'YOU', hx + 5, 322, 8, '#fff', 'center'); text(g, '+1.5s', gx2 + 5, 322, 8, '#9fe3ff', 'center');
    if ((this.titleT >> 5) & 1) text(g, 'PRESS ANY KEY  /  TAP TO START', VW / 2, 238, 10, '#fff', 'center');
    text(g, 'ARROWS / WASD + SPACE    R RESTART    M SOUND', VW / 2, 270, 7, '#c9c0ff', 'center');
    text(g, 'LOADOUT AI GAME COMPETITION 2026', VW / 2, 12, 7, '#9a8fd8', 'center');
  }

  drawSelect() {
    const g = this.g; drawBackground(g, 0, 0, 0, VW, VH); g.fillStyle = 'rgba(18,13,36,.78)'; g.fillRect(0, 0, VW, VH);
    text(g, 'SELECT LEVEL', VW / 2, 28, 18, '#fff', 'center', '#ff3d6a');
    const done = Object.keys(this.save.cleared).length;
    text(g, `CLEARED ${done}/${LEVELS.length}     TOTAL DEATHS ${this.save.deaths}`, VW / 2, 70, 8, '#ffd24a', 'center');
    text(g, 'ARROWS + ENTER, OR CLICK / TAP', VW / 2, 90, 7, '#9a8fd8', 'center');
    LEVELS.forEach((lv, i) => {
      const b = this.cell(i), sel = i === this.selIdx, cl = this.save.cleared[i];
      g.fillStyle = sel ? '#3b2d7a' : '#221a45'; g.fillRect(b.x, b.y, b.w, b.h);
      g.strokeStyle = sel ? '#ffd24a' : cl !== undefined ? '#3ddc84' : '#4a3f85'; g.lineWidth = sel ? 3 : 2; g.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
      text(g, String(i + 1), b.x + b.w / 2, b.y + 10, 16, '#fff', 'center');
      const nm = lv.name.length > 11 ? lv.name.slice(0, 10) + '.' : lv.name; text(g, nm, b.x + b.w / 2, b.y + 36, 6, '#c9c0ff', 'center');
      if (cl !== undefined) { text(g, `CLEAR  ☠${cl}`.replace('☠', 'X'), b.x + b.w / 2, b.y + 56, 6, '#3ddc84', 'center'); drawTile(g, 151, b.x + b.w - 20, b.y + 3); }
      else text(g, 'NEW', b.x + b.w / 2, b.y + 56, 6, '#ff7a90', 'center');
    });
    text(g, 'M SOUND   ESC TITLE', VW / 2, VH - 22, 7, '#9a8fd8', 'center');
  }

  drawEnd() {
    const g = this.g, t = this.titleT / 60; drawBackground(g, 2, 0, 0, VW, VH); g.fillStyle = 'rgba(18,13,36,.6)'; g.fillRect(0, 0, VW, VH);
    text(g, 'YOU CHANGED THE FUTURE', VW / 2, 120 + Math.sin(t * 2) * 3, 22, '#fff', 'center', '#ff3d6a');
    text(g, `ALL ${LEVELS.length} LEVELS CLEARED`, VW / 2, 190, 12, '#ffd24a', 'center');
    text(g, `TOTAL DEATHS: ${this.save.deaths}`, VW / 2, 226, 10, '#fff', 'center');
    text(g, 'THANKS FOR PLAYING', VW / 2, 270, 8, '#c9c0ff', 'center'); if ((this.titleT >> 5) & 1) text(g, 'PRESS ANY KEY', VW / 2, 320, 8, '#fff', 'center');
    for (const p of this.parts) { g.fillStyle = p.c; g.fillRect(p.x, p.y, p.s, p.s); }
    if (this.titleT % 6 === 0) this.parts.push({ x: Math.random() * VW, y: -4, vx: (Math.random() - .5), vy: 1 + Math.random() * 2, life: 200, max: 200, c: ['#ffd24a', '#ff7ac8', '#7ad7ff', '#fff'][(Math.random() * 4) | 0], s: 3 });
  }

  predict(): Pred | null {
    const s = this.s; if (s.dead || s.won) return this.pred;
    const inp = held(), key = s.tick + ':' + inp + ':' + (this.script ? this.scriptPos : 0);
    if (key !== this.predKey) { this.predKey = key; this.pred = predict(this.L, s, this.script ? this.script[this.scriptPos] ?? 0 : inp, true, true); }
    return this.pred;
  }

  drawPlay() {
    const g = this.g, s = this.s, L = this.L, world = worldOf(this.li);
    const pr = this.predict();
    // sound cue when a new death appears in the future
    const res = pr?.res ?? 0; if (res === 1 && this.lastPredRes !== 1 && this.warnCool <= 0 && !s.dead) { audio.play('warn'); this.warnCool = 30; } this.lastPredRes = res;
    // ----- HUD top
    g.fillStyle = '#1b1438'; g.fillRect(0, 0, VW, LY); g.fillStyle = '#2d2260'; g.fillRect(0, LY - 3, VW, 3);
    text(g, `${this.li + 1}. ${L.def.name}`, 10, 12, 10, '#fff'); text(g, L.def.tip, 10, 33, 7, '#9a8fd8');
    text(g, `DEATHS ${this.levelDeaths}`, 570, 12, 8, '#ff7a90', 'right'); text(g, `TOTAL ${this.save.deaths}`, 570, 33, 7, '#c9c0ff', 'right');
    // ----- level view
    g.save(); g.beginPath(); g.rect(LX, LY, W, H); g.clip();
    const sh = this.shake; g.translate(LX + (Math.random() - 0.5) * sh * 2, LY + (Math.random() - 0.5) * sh * 2);
    drawWorld(g, L, s, { world, time: this.time, hero: !s.dead, squash: this.squash });
    if (pr && pr.path && !s.dead && !s.won) this.drawFuturePath(g, pr);
    for (const p of this.parts) { g.globalAlpha = Math.min(1, p.life / 15); g.fillStyle = p.c; g.fillRect(p.x, p.y, p.s, p.s); } g.globalAlpha = 1;
    g.restore();
    if (this.flash > 0) { g.save(); g.globalAlpha = this.flash * 0.5; g.fillStyle = this.flashColor; g.fillRect(LX, LY, W, H); g.restore(); }
    // ----- bottom bar
    g.fillStyle = '#1b1438'; g.fillRect(0, LY + H, W, VH - LY - H);
    text(g, '< > MOVE   SPACE JUMP   R RESTART   ESC LEVELS', 10, LY + H + 14, 7, '#9a8fd8');
    text(g, 'THE SPOILER WINDOW ASSUMES YOU KEEP HOLDING THE SAME KEYS', 10, LY + H + 30, 6, '#6c5fb0');
    this.drawMonitor(g, pr);
    if (s.won && this.winTimer > 0) text(g, 'CLEARED!', LX + W / 2, LY + 130, 24, '#ffd24a', 'center', '#14102a');
  }

  drawFuturePath(g: CanvasRenderingContext2D, pr: Pred) {
    const p = pr.path!, col = pr.res === 1 ? '255,70,100' : pr.res === 2 ? '255,210,74' : '120,210,255';
    g.save(); g.fillStyle = `rgba(${col},.8)`;
    for (let i = 2; i < p.length; i += 2) g.fillRect(p[i] - 1, p[i + 1] - 1, 2, 2);
    g.restore();
    // ghost hero at the end of the preview
    const e = pr.s; g.save();
    if (Math.hypot(e.x - this.s.x, e.y - this.s.y) > 5) drawHero(g, { ...e, dead: false } as State, this.time, 0, 0.4, `rgba(${col},.7)`); g.restore();
    if (pr.res === 1) { const x = e.x + HW / 2, y = e.y + HH / 2; g.strokeStyle = '#ff2a4a'; g.lineWidth = 2; g.beginPath(); g.moveTo(x - 6, y - 6); g.lineTo(x + 6, y + 6); g.moveTo(x + 6, y - 6); g.lineTo(x - 6, y + 6); g.stroke(); }
  }

  drawMonitor(g: CanvasRenderingContext2D, pr: Pred | null) {
    const x0 = W, w = VW - W;
    g.fillStyle = '#120d24'; g.fillRect(x0, 0, w, VH); g.fillStyle = '#2d2260'; g.fillRect(x0, 0, 3, VH);
    const res = pr?.res ?? 0, col = res === 1 ? '#ff2a4a' : res === 2 ? '#ffd24a' : '#3ddc84';
    const blink = (this.titleT >> 4) & 1;
    g.fillStyle = blink ? '#ff2a4a' : '#6b1a2a'; g.beginPath(); g.arc(x0 + 16, 17, 4, 0, 6.3); g.fill();
    text(g, 'SPOILER', x0 + 26, 12, 10, '#fff', 'left', '#7a5cff');
    // zoomed window
    g.save(); g.beginPath(); g.rect(PX, PY, PS, PS); g.clip();
    if (pr) {
      const e = pr.s, zoom = 2, fx = Math.max(PS / zoom / 2, Math.min(W - PS / zoom / 2, e.x + HW / 2)), fy = Math.max(PS / zoom / 2, Math.min(H - PS / zoom / 2, e.y + HH / 2));
      g.translate(PX + PS / 2, PY + PS / 2); g.scale(zoom, zoom); g.translate(-fx, -fy);
      drawWorld(g, this.L, e, { world: worldOf(this.li), time: this.time, hero: true, showAlts: true });
      g.setTransform(this.scale, 0, 0, this.scale, 0, 0);
      g.fillStyle = 'rgba(90,50,255,.16)'; g.fillRect(PX, PY, PS, PS);
      g.fillStyle = 'rgba(0,0,0,.10)'; for (let y = PY; y < PY + PS; y += 3) g.fillRect(PX, y, PS, 1);
      if (res === 1) { g.fillStyle = `rgba(255,30,60,${0.12 + 0.1 * Math.sin(this.time * 14)})`; g.fillRect(PX, PY, PS, PS); }
    } else { g.fillStyle = '#000'; g.fillRect(PX, PY, PS, PS); }
    g.restore();
    g.strokeStyle = col; g.lineWidth = 3; g.strokeRect(PX - 1.5, PY - 1.5, PS + 3, PS + 3);
    // status
    const secs = pr ? (pr.t / 60).toFixed(1) : '0.0';
    const label = !pr ? '' : res === 1 ? `YOU DIE IN ${secs}s` : res === 2 ? `EXIT IN ${secs}s` : `ALL CLEAR  +${secs}s`;
    text(g, label, x0 + w / 2 + 1, PY + PS + 8, 8, col, 'center');
    if (pr && res === 1) text(g, (pr.s.cause || '').toUpperCase(), x0 + w / 2 + 1, PY + PS + 22, 7, '#ffb3c0', 'center');
    // whole-level future map
    const mw = 176, mh = 99, my = 262;
    g.save(); g.beginPath(); g.rect(PX, my, mw, mh); g.clip(); g.translate(PX, my); g.scale(mw / W, mh / H);
    if (pr) drawWorld(g, this.L, pr.s, { world: worldOf(this.li), time: this.time, hero: true, showAlts: false });
    g.restore(); g.strokeStyle = '#4a3f85'; g.lineWidth = 2; g.strokeRect(PX - 1, my - 1, mw + 2, mh + 2);
    text(g, 'FUTURE MAP', x0 + w / 2 + 1, my + mh + 6, 6, '#8a7fd0', 'center');
    // timeline
    const ty = my + mh + 22; g.fillStyle = '#221a45'; g.fillRect(PX, ty, mw, 8);
    if (pr) { const f = Math.min(1, pr.t / HORIZON); g.fillStyle = col; g.fillRect(PX, ty, mw * f, 8); g.fillStyle = '#fff'; g.fillRect(PX + mw * f - 1, ty - 2, 2, 12); }
    text(g, 'NOW', PX, ty + 12, 5, '#6c5fb0'); text(g, '+1.5s', PX + mw, ty + 12, 5, '#6c5fb0', 'right');
  }
}
export { clone, T, FONT };
