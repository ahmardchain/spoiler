import { LEVELS } from './levels';
import { compile, initState, step, predict, clone, HORIZON, HW, HH, W, H, T, type Compiled, type State, type Pred } from './sim';
import { drawWorld, drawBackground, drawHero, text, worldOf, FONT, drawTile } from './render';
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
  pred: Pred | null = null; predKey = ''; lastPredRes = 0; warnCool = 0;
  shake = 0; flash = 0; flashColor = '#fff'; parts: Particle[] = []; squash = 0;
  deadTimer = 0; winTimer = 0; time = 0; acc = 0; last = 0; selIdx = 0; titleT = 0; toast = ''; toastT = 0;
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
    this.mode = 'play'; this.levelDeaths = 0; this.levelTicks = 0; this.parts = []; this.deadTimer = 0; this.winTimer = 0; this.pred = null; this.lastPredRes = 0;
    this.save.last = this.li; this.persist(); audio.playMusic('game');
  }
  respawn() { this.s = initState(this.L); this.deadTimer = 0; this.pred = null; this.lastPredRes = 0; this.levelTicks = 0; }
  persist() { try { localStorage.setItem('spoiler.save', JSON.stringify(this.save)); } catch { /* private mode */ } }
  say(t: string) { this.toast = t; this.toastT = 120; }

  onKey(code: string) {
    audio.unlock();
    if (code === 'KeyF') { toggleFullscreen(); return; }
    if (code === 'KeyM') { audio.toggleMute(); this.say(audio.isMuted() ? 'SOUND OFF' : 'SOUND ON'); return; }
    if (this.mode === 'title') { if (code !== 'touch') { this.toSelect(); } return; }
    if (this.mode === 'select') {
      const n = LEVELS.length, cols = this.lay.portrait ? 3 : 7;
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
    const x = e.clientX, y = e.clientY;
    if (this.mode === 'title') { this.toSelect(); return; }
    if (this.mode === 'end') { this.toSelect(); return; }
    if (this.mode === 'select') {
      const { cells } = selectCells(this.lay, LEVELS.length);
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
  // ----- drawing (everything is laid out in CSS pixels by layout.ts; the canvas is exactly viewport * dpr)
  draw() {
    const g = this.g, l = this.lay; g.setTransform(l.dpr, 0, 0, l.dpr, 0, 0); g.imageSmoothingEnabled = false;
    if (this.placedMode !== this.mode) { this.placedMode = this.mode; this.placeButtons(); }
    g.fillStyle = '#120d24'; g.fillRect(0, 0, l.cw, l.ch);
    if (this.mode === 'title') this.drawTitle(); else if (this.mode === 'select') this.drawSelect(); else if (this.mode === 'end') this.drawEnd(); else this.drawPlay();
    if (this.toastT > 0 && this.mode !== 'play') {
      const sz = fit(this.toast, l.cw * 0.9, Math.round(18 * l.U));
      g.save(); g.globalAlpha = Math.min(1, this.toastT / 20); text(g, this.toast, l.cw / 2, l.ch - sz * 3, sz, '#ffd24a', 'center'); g.restore();
    }
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
    const g = this.g, l = this.lay, { cw, ch, U } = l, t = this.titleT / 60, cx = cw / 2;
    this.backdrop(1, 0.5);
    // ground strip + walking hero with its ghost 1.5s ahead
    const gk = Math.max(1, Math.round(U * 2 * l.dpr) / l.dpr), gy = ch - 4 * T * gk;
    g.save(); g.translate(0, gy); g.scale(gk, gk);
    for (let c = 0; c < cw / (T * gk) + 1; c++) { drawTile(g, 1 + (c & 1), c * T, 0); drawTile(g, 24 + (c & 1), c * T, 18); drawTile(g, 24 + ((c + 1) & 1), c * T, 36); drawTile(g, 24 + (c & 1), c * T, 54); }
    const span = Math.max(60, cw / gk - 200), hx = 20 + ((t * 40) % span), gx2 = hx + 80, hy = -HH - 2;
    drawHero(g, { x: hx, y: hy, vx: 1.7, vy: 0, ground: true, face: 1, dead: false } as State, t, 0);
    drawHero(g, { x: gx2, y: hy, vx: 1.7, vy: 0, ground: true, face: 1, dead: false } as State, t, 0, 0.45, 'rgba(120,200,255,.6)');
    for (let i = 0; i < 5; i++) { g.fillStyle = 'rgba(160,220,255,.8)'; g.fillRect(hx + 16 + i * 12, -8, 4, 2); }
    g.restore();
    const lab = Math.round(15 * U) + 2;
    text(g, 'YOU', (hx + 5) * gk, gy - 18 * gk - lab * 1.9, lab, '#fff', 'center'); text(g, '+1.5s', (gx2 + 5) * gk, gy - 18 * gk - lab * 1.9, lab, '#9fe3ff', 'center');
    // title
    const ts = Math.min(cw * 0.84 / 7, ch * 0.2), ty = Math.max(ch * 0.1, 36 * U) + Math.sin(t * 2) * ts * 0.04;
    g.save(); g.globalAlpha = 0.4; text(g, 'SPOILER', cx + ts * 0.14 + Math.sin(t * 3) * ts * 0.04, ty, ts, '#7a5cff', 'center', ''); g.restore();
    text(g, 'SPOILER', cx, ty, ts, '#ffffff', 'center', '#ff3d6a');
    const sub = 'SEE YOUR DEATH BEFORE IT HAPPENS', ss = fit(sub, cw * 0.92, Math.round(28 * U));
    text(g, sub, cx, ty + ts * 1.3, ss, '#ffd24a', 'center');
    const py = Math.max(ty + ts * 1.3 + ss * 2.6, ch * 0.5);
    const pm = l.touch ? 'TAP TO START' : 'PRESS ANY KEY  /  CLICK TO START', ps = fit(pm, cw * 0.92, Math.round(30 * U));
    if ((this.titleT >> 5) & 1) text(g, pm, cx, py, ps, '#fff', 'center');
    const c1 = l.touch ? 'USE THE ON-SCREEN BUTTONS' : 'ARROWS / WASD + SPACE    R RESTART', c2 = l.touch ? 'FULLSCREEN BUTTON: TOP RIGHT' : 'F FULLSCREEN    M SOUND    ESC LEVELS';
    const cs = fit(c1.length > c2.length ? c1 : c2, cw * 0.92, Math.round(20 * U));
    text(g, c1, cx, py + ps * 2.2, cs, '#d8d1ff', 'center'); text(g, c2, cx, py + ps * 2.2 + cs * 1.9, cs, '#d8d1ff', 'center');
    const cp = 'LOADOUT AI GAME COMPETITION 2026'; text(g, cp, cx, l.m, fit(cp, cw * 0.7, Math.round(12 * U)), '#b4a9f0', 'center');
  }

  drawSelect() {
    const g = this.g, l = this.lay, { cw, ch, U } = l, cx = cw / 2; this.backdrop(0, 0.78);
    const hs = fit('SELECT LEVEL', cw - 2 * (l.bFs.w + 2 * l.m), Math.round(40 * U));
    text(g, 'SELECT LEVEL', cx, Math.round(18 * U), hs, '#fff', 'center', '#ff3d6a');
    const done = Object.keys(this.save.cleared).length, info = `CLEARED ${done}/${LEVELS.length}   TOTAL DEATHS ${this.save.deaths}`;
    const is = fit(info, cw * 0.92, Math.round(19 * U)); text(g, info, cx, Math.round(18 * U) + hs * 1.6, is, '#ffd24a', 'center');
    const hp = l.touch ? 'TAP A LEVEL' : 'ARROWS + ENTER, OR CLICK A LEVEL', hps = fit(hp, cw * 0.92, Math.max(11, Math.round(14 * U))); text(g, hp, cx, Math.round(18 * U) + hs * 1.6 + is * 1.7, hps, '#b4a9f0', 'center');
    const { cells } = selectCells(l, LEVELS.length);
    LEVELS.forEach((lv, i) => {
      const b = cells[i], sel = i === this.selIdx, cl = this.save.cleared[i];
      g.fillStyle = sel ? '#3b2d7a' : '#221a45'; g.fillRect(b.x, b.y, b.w, b.h);
      const lw = Math.max(2, Math.round(3 * U)); g.strokeStyle = sel ? '#ffd24a' : cl !== undefined ? '#3ddc84' : '#4a3f85'; g.lineWidth = sel ? lw * 1.6 : lw; g.strokeRect(b.x + lw / 2, b.y + lw / 2, b.w - lw, b.h - lw);
      text(g, String(i + 1), b.x + b.w / 2, b.y + b.h * 0.1, Math.min(b.w * 0.26, b.h * 0.3), '#fff', 'center');
      const nm = lv.name.length > 14 ? lv.name.slice(0, 13) + '.' : lv.name; text(g, nm, b.x + b.w / 2, b.y + b.h * 0.5, fit(nm, b.w * 0.92, Math.floor(b.w * 0.13)), '#d8d1ff', 'center');
      const st = cl !== undefined ? `CLEAR  X${cl}` : 'NEW'; text(g, st, b.x + b.w / 2, b.y + b.h * 0.74, fit(st, b.w * 0.92, Math.floor(b.w * 0.11)), cl !== undefined ? '#3ddc84' : '#ff7a90', 'center');
      if (cl !== undefined) { const k = b.w * 0.2 / T; g.save(); g.translate(b.x + b.w - T * k - b.w * 0.04, b.y + b.w * 0.04); g.scale(k, k); drawTile(g, 151, 0, 0); g.restore(); }
    });
    const ft = l.touch ? 'FULLSCREEN: TOP RIGHT' : 'F FULLSCREEN   M SOUND   ESC TITLE'; text(g, ft, cx, ch - Math.round(30 * U) - l.m, fit(ft, cw * 0.92, Math.round(15 * U)), '#b4a9f0', 'center');
  }

  drawEnd() {
    const g = this.g, l = this.lay, { cw, ch, U } = l, t = this.titleT / 60, cx = cw / 2; this.backdrop(2, 0.55);
    const h1 = 'YOU CHANGED THE FUTURE', s1 = fit(h1, cw * 0.92, Math.round(Math.min(56 * U, ch * 0.1)));
    text(g, h1, cx, ch * 0.2 + Math.sin(t * 2) * s1 * 0.1, s1, '#fff', 'center', '#ff3d6a');
    const s2 = fit('ALL 14 LEVELS CLEARED', cw * 0.9, Math.round(30 * U)); text(g, `ALL ${LEVELS.length} LEVELS CLEARED`, cx, ch * 0.2 + s1 * 2, s2, '#ffd24a', 'center');
    const s3 = fit('TOTAL DEATHS: 000', cw * 0.9, Math.round(24 * U)); text(g, `TOTAL DEATHS: ${this.save.deaths}`, cx, ch * 0.2 + s1 * 2 + s2 * 2, s3, '#fff', 'center');
    const s4 = Math.round(18 * U); text(g, 'THANKS FOR PLAYING', cx, ch * 0.2 + s1 * 2 + s2 * 2 + s3 * 2.5, fit('THANKS FOR PLAYING', cw * 0.9, s4), '#d8d1ff', 'center');
    if ((this.titleT >> 5) & 1) text(g, 'PRESS ANY KEY', cx, ch * 0.82, fit('PRESS ANY KEY', cw * 0.9, Math.round(22 * U)), '#fff', 'center');
    const pk = Math.max(2, Math.round(3 * U)); for (const p of this.parts) { g.fillStyle = p.c; g.fillRect(p.x * cw / W, p.y * ch / H, pk * 2, pk * 2); }
    if (this.titleT % 6 === 0) this.parts.push({ x: Math.random() * W, y: -4, vx: (Math.random() - .5), vy: 1 + Math.random() * 2, life: 200, max: 200, c: ['#ffd24a', '#ff7ac8', '#7ad7ff', '#fff'][(Math.random() * 4) | 0], s: 3 });
  }

  predict(): Pred | null {
    const s = this.s; if (s.dead || s.won) return this.pred;
    const inp = held(), key = s.tick + ':' + inp + ':' + (this.script ? this.scriptPos : 0);
    if (key !== this.predKey) { this.predKey = key; this.pred = predict(this.L, s, this.script ? this.script[this.scriptPos] ?? 0 : inp, true, true); }
    return this.pred;
  }

  drawPlay() {
    const g = this.g, s = this.s, L = this.L, l = this.lay, world = worldOf(this.li), { U, m, fsz } = l, lv = l.level;
    const pr = this.predict();
    const res = pr?.res ?? 0; if (res === 1 && this.lastPredRes !== 1 && this.warnCool <= 0 && !s.dead) { audio.play('warn'); this.warnCool = 30; } this.lastPredRes = res;
    this.backdrop(world, 0.84);
    // ----- HUD
    g.fillStyle = '#1b1438'; g.fillRect(0, 0, l.hud.w, l.hud.h); g.fillStyle = '#2d2260'; g.fillRect(0, l.hud.h - Math.max(2, 3 * U), l.hud.w, Math.max(2, 3 * U));
    const dStr = `DEATHS ${this.levelDeaths}`, tStr = `TOTAL ${this.save.deaths}`, tip = L.def.tip, nm = `${this.li + 1}. ${L.def.name}`;
    if (l.portrait) {
      const rl = l.bMenu.x - m, ys = m + (l.bFs.h - fsz.title) / 2, y2 = m + l.bFs.h + m * 0.4, y3 = y2 + fsz.tip + m * 0.6;
      text(g, nm, m * 1.3, ys, fit(nm, rl - 2 * m, fsz.title), '#fff'); text(g, tip, m * 1.3, y2, fit(tip, l.cw - 2.6 * m, fsz.tip), '#b4a9f0');
      text(g, dStr, m * 1.3, y3, fsz.hud, '#ff8fa3'); text(g, tStr, l.cw - m * 1.3, y3, fsz.hud, '#d8d1ff', 'right');
    } else {
      const rl = l.hud.w - m, y1 = m * 0.8, y2 = y1 + fsz.title + m * 0.9;
      text(g, dStr, rl, y1, fsz.hud, '#ff8fa3', 'right'); text(g, tStr, rl, y2, fsz.tip, '#d8d1ff', 'right');
      text(g, nm, m * 1.3, y1, fit(nm, rl - dStr.length * fsz.hud - 4 * m, fsz.title), '#fff');
      text(g, tip, m * 1.3, y2, fit(tip, rl - tStr.length * fsz.tip - 4 * m, fsz.tip), '#b4a9f0');
    }
    // ----- level view
    const bw = Math.max(2, Math.round(3 * U)); g.fillStyle = '#3a2d7a'; g.fillRect(lv.x - bw, lv.y - bw, lv.w + 2 * bw, lv.h + 2 * bw);
    g.save(); g.beginPath(); g.rect(lv.x, lv.y, lv.w, lv.h); g.clip();
    const sh = this.shake * l.s; g.translate(lv.x + (Math.random() - 0.5) * sh * 2, lv.y + (Math.random() - 0.5) * sh * 2); g.scale(l.s, l.s); g.imageSmoothingEnabled = false;
    drawWorld(g, L, s, { world, time: this.time, hero: !s.dead, squash: this.squash });
    if (pr && pr.path && !s.dead && !s.won) this.drawFuturePath(g, pr);
    for (const p of this.parts) { g.globalAlpha = Math.min(1, p.life / 15); g.fillStyle = p.c; g.fillRect(p.x, p.y, p.s, p.s); } g.globalAlpha = 1;
    g.restore();
    if (this.flash > 0) { g.save(); g.globalAlpha = this.flash * 0.5; g.fillStyle = this.flashColor; g.fillRect(lv.x, lv.y, lv.w, lv.h); g.restore(); }
    if (s.won && this.winTimer > 0) { const cs = fit('CLEARED!', lv.w * 0.8, Math.round(72 * U)); text(g, 'CLEARED!', lv.x + lv.w / 2, lv.y + lv.h * 0.38, cs, '#ffd24a', 'center'); }
    if (this.toastT > 0) { const sz = fit(this.toast, lv.w * 0.94, Math.round(22 * U)); g.save(); g.globalAlpha = Math.min(1, this.toastT / 20); text(g, this.toast, lv.x + lv.w / 2, lv.y + lv.h - sz * 2.4, sz, '#ffd24a', 'center'); g.restore(); }
    if (l.hint) {
      const h1 = '< > MOVE   SPACE JUMP   R RESTART   ESC LEVELS   F FULLSCREEN', h2 = 'THE SPOILER WINDOW ASSUMES YOU KEEP HOLDING THE SAME KEYS';
      const a = fit(h1, l.hint.w, fsz.hint), b = fit(h2, l.hint.w, Math.round(fsz.hint * 0.85));
      text(g, h1, l.hint.x + l.hint.w / 2, l.hint.y, a, '#d8d1ff', 'center'); text(g, h2, l.hint.x + l.hint.w / 2, l.hint.y + a * 1.9, b, '#9a8fd8', 'center');
    }
    this.drawMonitor(g, pr);
  }

  drawFuturePath(g: CanvasRenderingContext2D, pr: Pred) {
    const p = pr.path!, col = pr.res === 1 ? '255,70,100' : pr.res === 2 ? '255,210,74' : '120,210,255', d = 2.4;
    g.save(); g.fillStyle = `rgba(${col},.85)`;
    for (let i = 2; i < p.length; i += 2) g.fillRect(p[i] - d / 2, p[i + 1] - d / 2, d, d);
    g.restore();
    const e = pr.s; g.save();
    if (Math.hypot(e.x - this.s.x, e.y - this.s.y) > 5) drawHero(g, { ...e, dead: false } as State, this.time, 0, 0.45, `rgba(${col},.7)`); g.restore();
    if (pr.res === 1) { const x = e.x + HW / 2, y = e.y + HH / 2; g.strokeStyle = '#ff2a4a'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x - 6, y - 6); g.lineTo(x + 6, y + 6); g.moveTo(x + 6, y - 6); g.lineTo(x - 6, y + 6); g.stroke(); }
  }

  drawMonitor(g: CanvasRenderingContext2D, pr: Pred | null) {
    const l = this.lay, { U, m, fsz } = l, { win, head, status, tl, map } = l;
    if (!l.portrait) { g.fillStyle = '#120d24'; g.fillRect(l.panel.x, 0, l.panel.w, l.ch); g.fillStyle = '#2d2260'; g.fillRect(l.panel.x, 0, Math.max(2, 3 * U), l.ch); }
    else { g.fillStyle = 'rgba(18,13,36,.82)'; g.fillRect(0, l.panel.y - m * 0.5, l.cw, l.panel.h + m); }
    const res = pr?.res ?? 0, col = res === 1 ? '#ff2a4a' : res === 2 ? '#ffd24a' : '#3ddc84';
    const blink = (this.titleT >> 4) & 1, r = fsz.head * 0.28;
    g.fillStyle = blink ? '#ff2a4a' : '#6b1a2a'; g.beginPath(); g.arc(head.x + r + 2, head.y + fsz.head / 2, r, 0, 6.3); g.fill();
    text(g, 'SPOILER', head.x + r * 2 + m * 1.2, head.y, fsz.head, '#fff', 'left', '#7a5cff');
    // zoomed window on the future
    g.save(); g.beginPath(); g.rect(win.x, win.y, win.w, win.h); g.clip(); g.fillStyle = '#000'; g.fillRect(win.x, win.y, win.w, win.h);
    if (pr) {
      const e = pr.s, zoom = Math.max(l.s * 1.5, win.w / 190), hw = win.w / zoom / 2, hh = win.h / zoom / 2;
      const fx = hw * 2 >= W ? W / 2 : Math.max(hw, Math.min(W - hw, e.x + HW / 2)), fy = hh * 2 >= H ? H / 2 : Math.max(hh, Math.min(H - hh, e.y + HH / 2));
      g.save(); g.translate(win.x + win.w / 2, win.y + win.h / 2); g.scale(zoom, zoom); g.translate(-fx, -fy); g.imageSmoothingEnabled = false;
      drawWorld(g, this.L, e, { world: worldOf(this.li), time: this.time, hero: true, showAlts: true }); g.restore();
      g.fillStyle = 'rgba(90,50,255,.16)'; g.fillRect(win.x, win.y, win.w, win.h);
      g.fillStyle = 'rgba(0,0,0,.10)'; for (let y = win.y; y < win.y + win.h; y += 4) g.fillRect(win.x, y, win.w, 1.5);
      if (res === 1) { g.fillStyle = `rgba(255,30,60,${0.12 + 0.1 * Math.sin(this.time * 14)})`; g.fillRect(win.x, win.y, win.w, win.h); }
    }
    const tag = '+1.5s FUTURE', tsz = fsz.cause, tw = tag.length * tsz + tsz;
    g.fillStyle = 'rgba(18,13,36,.85)'; g.fillRect(win.x, win.y, tw, tsz * 2); text(g, tag, win.x + tsz / 2, win.y + tsz * 0.5, tsz, '#9fe3ff');
    g.restore();
    const bw = Math.max(3, Math.round(4 * U)); g.strokeStyle = col; g.lineWidth = bw; g.strokeRect(win.x - bw / 2, win.y - bw / 2, win.w + bw, win.h + bw);
    // status
    const secs = pr ? (pr.t / 60).toFixed(1) : '0.0';
    const label = !pr ? '' : res === 1 ? `YOU DIE IN ${secs}s` : res === 2 ? `EXIT IN ${secs}s` : `ALL CLEAR +${secs}s`;
    const lsz = fit('YOU DIE IN 0.0s', status.w, fsz.status), cx = status.x + status.w / 2;
    text(g, label, cx, status.y, lsz, col, 'center');
    if (pr && res === 1) { const c = (pr.s.cause || '').toUpperCase(); text(g, c, cx, status.y + lsz * 1.5, fit(c, status.w, fsz.cause), '#ffc2cd', 'center'); }
    // timeline
    const bh = Math.max(8, Math.round(12 * U)); g.fillStyle = '#221a45'; g.fillRect(win.x, tl.y, win.w, bh);
    if (pr) { const f = Math.min(1, pr.t / HORIZON); g.fillStyle = col; g.fillRect(win.x, tl.y, win.w * f, bh); g.fillStyle = '#fff'; g.fillRect(win.x + win.w * f - 1.5, tl.y - 2, 3, bh + 4); }
    text(g, 'NOW', win.x, tl.y + bh + 3, fsz.small, '#9a8fd8'); text(g, '+1.5s', win.x + win.w, tl.y + bh + 3, fsz.small, '#9a8fd8', 'right');
    // whole-level future map
    if (map) {
      g.save(); g.beginPath(); g.rect(map.x, map.y, map.w, map.h); g.clip(); g.translate(map.x, map.y); g.scale(map.w / W, map.h / H); g.imageSmoothingEnabled = false;
      if (pr) drawWorld(g, this.L, pr.s, { world: worldOf(this.li), time: this.time, hero: true, showAlts: false });
      g.restore(); g.strokeStyle = '#4a3f85'; g.lineWidth = 3; g.strokeRect(map.x - 1.5, map.y - 1.5, map.w + 3, map.h + 3);
      text(g, 'FUTURE MAP', map.x + map.w / 2, map.y - fsz.small - m * 0.4, fsz.small, '#b4a9f0', 'center');
    }
  }
}
export { clone, T, FONT };
