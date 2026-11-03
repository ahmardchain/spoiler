import { LEVELS } from './levels';
import { compile, initState, step, clone, HW, HH, W, H, T, type Compiled, type State } from './sim';
import { drawWorld, drawBackground, text, worldOf, FONT, drawTile } from './render';
import { held } from './input';
import { computeLayout, selectCells, type Layout, type Rect } from './layout';
import * as audio from './audio';

type Mode = 'title' | 'select' | 'play' | 'end';
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; c: string; s: number }
interface Save { cleared: Record<number, number>; deaths: number; last: number }

const load = (): Save => { try { return { cleared: {}, deaths: 0, last: 0, ...JSON.parse(localStorage.getItem('spoiler.save') || '{}') }; } catch { return { cleared: {}, deaths: 0, last: 0 }; } };
const inR = (r: Rect, x: number, y: number) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
const fit = (str: string, maxW: number, size: number) => Math.max(7, Math.min(size, Math.floor(maxW / Math.max(1, str.length))));

export function toggleFullscreen() {
  const d = document as any, el = document.documentElement as any;
  try {
    if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    else { const p = (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el, { navigationUI: 'hide' }); p?.catch?.(() => {}); }
  } catch { /* not allowed (e.g. iPhone Safari) */ }
}

export class Game {
  g: CanvasRenderingContext2D; mode: Mode = 'title'; save = load();
  li = 0; L!: Compiled; s!: State; levelDeaths = 0; levelTicks = 0;
  camX = 0; camY = 0; look = 1; camSet = false;
  shake = 0; flash = 0; flashColor = '#fff'; parts: Particle[] = []; squash = 0;
  deadTimer = 0; winTimer = 0; time = 0; acc = 0; last = 0; selIdx = 0; titleT = 0;
  script: number[] | null = null; scriptPos = 0; scriptDone: (() => void) | null = null;
  lay!: Layout; private bgCache: { key: string; c: HTMLCanvasElement } | null = null; private didFs = false; placedMode = '';

  constructor(public canvas: HTMLCanvasElement) {
    this.g = canvas.getContext('2d')!;
    this.resize();
    const rs = () => this.resize();
    addEventListener('resize', rs); addEventListener('orientationchange', () => { rs(); setTimeout(rs, 250); });
    document.addEventListener('fullscreenchange', () => { rs(); setTimeout(rs, 100); }); window.visualViewport?.addEventListener('resize', rs);
    canvas.addEventListener('pointerdown', e => this.onPointer(e));
    const bind = (id: string, fn: () => void) => document.getElementById(id)?.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); audio.unlock(); fn(); });
    bind('fs', toggleFullscreen); bind('menu', () => { if (this.mode === 'play') this.toSelect(); else if (this.mode === 'select') { this.mode = 'title'; audio.playMusic('title'); } });
    // on phones, the very first tap / press asks for real fullscreen (where the browser allows it)
    const first = (e: Event) => {
      if (this.didFs) return; this.didFs = true;
      const touchy = (e as PointerEvent).pointerType === 'touch' || document.body.classList.contains('touch');
      if (touchy && (e.target as HTMLElement)?.id !== 'fs') toggleFullscreen();
    };
    addEventListener('pointerdown', first, { capture: true });
  }
  /** Fill the whole viewport; the backing store is exactly viewport x devicePixelRatio so nothing is ever blurred. */
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 4), cw = Math.max(200, window.innerWidth), ch = Math.max(200, window.innerHeight);
    this.canvas.width = Math.round(cw * dpr); this.canvas.height = Math.round(ch * dpr);
    this.lay = computeLayout(cw, ch, dpr, document.body.classList.contains('touch'));
    this.placeButtons();
  }
  placeButtons() {
    const l = this.lay, put = (id: string, r: Rect | null, show = true) => {
      const el = document.getElementById(id); if (!el) return;
      if (!r || !show) { el.style.display = 'none'; return; }
      el.style.display = 'flex'; el.style.left = r.x + 'px'; el.style.top = r.y + 'px'; el.style.width = r.w + 'px'; el.style.height = r.h + 'px';
      el.style.fontSize = Math.round(Math.min(r.w, r.h) * 0.34) + 'px';
    };
    const playing = this.mode === 'play';
    put('b-left', l.bL, playing); put('b-right', l.bR, playing); put('b-jump', l.bJ, playing);
    put('fs', l.bFs); put('menu', l.bMenu, this.mode === 'play');
  }
  start() { this.last = performance.now(); requestAnimationFrame(t => this.frame(t)); }

  // ----- flow
  startLevel(i: number) {
    this.li = ((i % LEVELS.length) + LEVELS.length) % LEVELS.length; this.L = compile(LEVELS[this.li]); this.s = initState(this.L);
    this.mode = 'play'; this.levelDeaths = 0; this.levelTicks = 0; this.parts = []; this.deadTimer = 0; this.winTimer = 0; this.camSet = false;
    this.save.last = this.li; this.persist(); audio.playMusic('game');
  }
  respawn() { this.camSet = false; this.s = initState(this.L); this.deadTimer = 0; this.levelTicks = 0; }
  persist() { try { localStorage.setItem('spoiler.save', JSON.stringify(this.save)); } catch { /* private mode */ } }

  onKey(code: string) {
    audio.unlock();
    if (code === 'KeyF') { toggleFullscreen(); return; }
    if (code === 'KeyM') { audio.toggleMute(); return; }
    if (this.mode === 'title') { if (code !== 'touch') this.play(); return; }
    if (this.mode === 'select') {
      const n = LEVELS.length, cols = this.lay.cw < this.lay.ch ? 3 : 7;
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
  /** title -> play: resume at the last level you reached */
  play() { audio.play('select'); this.startLevel(Math.min(this.save.last, LEVELS.length - 1)); }
  toSelect() { this.mode = 'select'; this.selIdx = Math.min(this.save.last, LEVELS.length - 1); audio.playMusic('title'); audio.play('select'); }

  onPointer(e: PointerEvent) {
    audio.unlock();
    const x = e.clientX, y = e.clientY;
    if (this.mode === 'title') { this.play(); return; }
    if (this.mode === 'end') { this.toSelect(); return; }
    if (this.mode === 'select') {
      const cells = selectCells(this.lay, LEVELS.length);
      for (let i = 0; i < LEVELS.length; i++) if (inR(cells[i], x, y)) { audio.play('select'); this.startLevel(i); return; }
    }
  }

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
    this.titleT++;
    this.shake *= 0.86; if (this.shake < 0.05) this.shake = 0; if (this.flash > 0) this.flash -= 0.06; this.squash *= 0.8;
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
    else if (e === 'hop') { this.flash = 0.5; this.flashColor = '#ffd24a'; }
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
  // ----- drawing (everything is laid out in CSS pixels by layout.ts; the canvas is exactly viewport * dpr)
  draw() {
    const g = this.g, l = this.lay; g.setTransform(l.dpr, 0, 0, l.dpr, 0, 0); g.imageSmoothingEnabled = false;
    if (this.placedMode !== this.mode) { this.placedMode = this.mode; this.placeButtons(); }
    g.fillStyle = '#120d24'; g.fillRect(0, 0, l.cw, l.ch);
    if (this.mode === 'title') this.drawTitle(); else if (this.mode === 'select') this.drawSelect(); else if (this.mode === 'end') this.drawEnd(); else this.drawPlay();
  }
  /** themed pixel-art backdrop for the whole screen, cached per size */
  backdrop(world: number, dim: number) {
    const l = this.lay, g = this.g, key = `${world}:${l.cw}x${l.ch}:${l.dpr}:${l.s}`;
    if (!this.bgCache || this.bgCache.key !== key) {
      const c = document.createElement('canvas'); c.width = Math.round(l.cw * l.dpr); c.height = Math.round(l.ch * l.dpr);
      const b = c.getContext('2d')!, k = Math.max(1, Math.round(Math.max(l.s, 1.5) * l.dpr)); b.imageSmoothingEnabled = false;
      b.setTransform(k, 0, 0, k, 0, 0); drawBackground(b, world, 0, 0, c.width / k + 24, c.height / k + 24);
      this.bgCache = { key, c };
    }
    g.drawImage(this.bgCache.c, 0, 0, l.cw, l.ch); g.fillStyle = `rgba(18,13,36,${dim})`; g.fillRect(0, 0, l.cw, l.ch);
  }

  drawTitle() {
    const g = this.g, l = this.lay, { cw, ch } = l, t = this.titleT / 60, cx = cw / 2;
    this.backdrop(1, 0.5);
    const ts = Math.min(cw * 0.94 / 7, ch * 0.3), ty = ch * 0.2 + Math.sin(t * 2) * ts * 0.04;
    g.save(); g.globalAlpha = 0.4; text(g, 'SPOILER', cx + ts * 0.14 + Math.sin(t * 3) * ts * 0.04, ty, ts, '#7a5cff', 'center', ''); g.restore();
    text(g, 'SPOILER', cx, ty, ts, '#ffffff', 'center', '#ff3d6a');
    // play button (the whole screen is a button too)
    const ps = Math.round(Math.min(cw * 0.76, ch * 0.62) / 5.6), bw = ps * 4 + ps * 1.6, bh = ps * 2.4, bx = cx - bw / 2, by = ch * 0.56;
    const pulse = 1 + Math.sin(t * 5) * 0.025; g.save(); g.translate(cx, by + bh / 2); g.scale(pulse, pulse); g.translate(-cx, -(by + bh / 2));
    g.fillStyle = '#5b2d9e'; g.fillRect(bx, by, bw, bh); const bd = Math.max(3, ps * 0.14); g.strokeStyle = '#ffd24a'; g.lineWidth = bd; g.strokeRect(bx + bd / 2, by + bd / 2, bw - bd, bh - bd);
    text(g, 'PLAY', cx, by + (bh - ps) / 2, ps, '#fff', 'center'); g.restore();
  }

  drawSelect() {
    const g = this.g, l = this.lay; this.backdrop(0, 0.8);
    const cells = selectCells(l, LEVELS.length);
    LEVELS.forEach((_lv, i) => {
      const b = cells[i], sel = i === this.selIdx, cl = this.save.cleared[i];
      g.fillStyle = sel ? '#3b2d7a' : '#221a45'; g.fillRect(b.x, b.y, b.w, b.h);
      const lw = Math.max(3, Math.round(b.w * 0.045)); g.strokeStyle = sel ? '#ffd24a' : cl !== undefined ? '#3ddc84' : '#4a3f85'; g.lineWidth = sel ? lw * 1.5 : lw; g.strokeRect(b.x + lw / 2, b.y + lw / 2, b.w - lw, b.h - lw);
      const sz = Math.floor(b.w * (i >= 9 ? 0.36 : 0.46)); text(g, String(i + 1), b.x + b.w / 2, b.y + (b.h - sz) / 2, sz, cl !== undefined ? '#8dffb4' : '#fff', 'center');
    });
  }

  drawEnd() {
    const g = this.g, l = this.lay, { cw, ch } = l, t = this.titleT / 60, cx = cw / 2; this.backdrop(2, 0.55);
    const s1 = Math.min(cw * 0.86 / 7, ch * 0.2);
    text(g, 'THE END', cx, ch * 0.3 + Math.sin(t * 2) * s1 * 0.06, s1, '#fff', 'center', '#ff3d6a');
    const s2 = Math.min(cw * 0.86 / 12, ch * 0.08); text(g, `DEATHS ${this.save.deaths}`, cx, ch * 0.3 + s1 * 1.6, s2, '#ffd24a', 'center');
    const pk = Math.max(2, Math.round(3 * l.U)); for (const p of this.parts) { g.fillStyle = p.c; g.fillRect(p.x * cw / W, p.y * ch / H, pk * 2, pk * 2); }
    if (this.titleT % 6 === 0) this.parts.push({ x: Math.random() * W, y: -4, vx: (Math.random() - .5), vy: 1 + Math.random() * 2, life: 200, max: 200, c: ['#ffd24a', '#ff7ac8', '#7ad7ff', '#fff'][(Math.random() * 4) | 0], s: 3 });
  }

  /** Camera: always zoomed in on the hero. Looks ahead in the direction of travel, hero sits low on screen so the trap overhead stays visible, clamped to the level. */
  updateCamera() {
    const l = this.lay, s = this.s, hx = s.x + HW / 2, hy = s.y + HH / 2;
    const dirT = s.face >= 0 ? 1 : -1; this.look += (dirT - this.look) * 0.05;
    const ahead = l.visW * 0.2 * this.look + s.vx * 6;
    let wx = hx + ahead - l.visW / 2, wy = hy - l.visH * l.heroY + Math.max(0, s.vy) * 7;
    wx = Math.max(0, Math.min(W - l.visW, wx)); wy = Math.max(0, Math.min(H - l.visH + l.padB, wy));
    if (!this.camSet) { this.camX = wx; this.camY = wy; this.camSet = true; this.look = dirT; }
    else { this.camX += (wx - this.camX) * 0.1; this.camY += (wy - this.camY) * 0.12; }
  }

  drawPlay() {
    const g = this.g, s = this.s, L = this.L, l = this.lay, world = worldOf(this.li), sc = l.s;
    this.updateCamera();
    const sh = this.shake * sc;
    const tx = Math.round(-this.camX * sc * l.dpr) / l.dpr, ty = Math.round(-this.camY * sc * l.dpr) / l.dpr;
    g.save(); g.beginPath(); g.rect(0, 0, l.cw, l.ch); g.clip();
    g.translate(tx + (Math.random() - 0.5) * sh * 2, ty + (Math.random() - 0.5) * sh * 2); g.scale(sc, sc); g.imageSmoothingEnabled = false;
    if (l.padB > 0) { g.fillStyle = '#2b2440'; g.fillRect(-4, H - 1, W + 8, l.padB + 8); }
    drawWorld(g, L, s, { world, time: this.time, hero: !s.dead, squash: this.squash });
    for (const p of this.parts) { g.globalAlpha = Math.min(1, p.life / 15); g.fillStyle = p.c; g.fillRect(p.x, p.y, p.s, p.s); } g.globalAlpha = 1;
    g.restore();
    if (this.flash > 0) { g.save(); g.globalAlpha = this.flash * 0.5; g.fillStyle = this.flashColor; g.fillRect(0, 0, l.cw, l.ch); g.restore(); }
    // minimal HUD: level number + deaths, top-left
    const hs = l.fsz.hud, m = l.m;
    text(g, `LV ${this.li + 1}`, m, m, hs, '#fff'); text(g, `DEATHS ${this.save.deaths}`, m, m + hs * 1.6, hs, '#ff9db0');
  }
}
export { clone, T, FONT, drawTile, HH };
