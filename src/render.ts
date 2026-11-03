import { T, COLS, ROWS, W, H, HW, HH, sawPos, popUp, popWarn, crumbleRect, type Compiled, type State } from './sim';

const base = import.meta.env.BASE_URL;
export const FONT = '"Press Start 2P", monospace';
let tiles!: HTMLImageElement, chars!: HTMLImageElement, bgs!: HTMLImageElement;
const heroImg: HTMLCanvasElement[] = [];
const sprites: Record<string, HTMLCanvasElement> = {};

const loadImg = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = base + src; });
function scaled(img: HTMLImageElement, sx: number, sy: number, sw: number, sh: number, dw: number, dh: number, flipY = false, flipX = false): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = dw; c.height = dh; const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = dw !== sw; g.imageSmoothingQuality = 'high';
  if (flipY || flipX) { g.translate(flipX ? dw : 0, flipY ? dh : 0); g.scale(flipX ? -1 : 1, flipY ? -1 : 1); }
  g.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh); return c;
}
export async function loadAssets() {
  [tiles, chars, bgs] = await Promise.all([loadImg('assets/kenney/tiles.png'), loadImg('assets/kenney/characters.png'), loadImg('assets/kenney/backgrounds.png')]);
  const ch = (i: number) => [(i % 9) * 24, ((i / 9) | 0) * 24] as const;
  for (const i of [0, 1]) { const [x, y] = ch(i); heroImg.push(scaled(chars, x, y, 24, 24, 18, 18), scaled(chars, x, y, 24, 24, 18, 18, false, true)); }
  const mk = (name: string, i: number, d: number, fy = false) => { const [x, y] = ch(i); sprites[name] = scaled(chars, x, y, 24, 24, d, d, fy); };
  mk('saw', 8, 16); mk('thwomp', 11, 18); mk('thwompAngry', 12, 18); mk('stalker', 15, 22, true); mk('stalker2', 16, 22, true);
  try { await (document as any).fonts.load('8px "Press Start 2P"'); } catch { /* ignore */ }
}
const tile = (g: CanvasRenderingContext2D, i: number, x: number, y: number, flipY = false) => {
  const sx = (i % 20) * T, sy = ((i / 20) | 0) * T;
  if (flipY) { g.save(); g.translate(x, y + T); g.scale(1, -1); g.drawImage(tiles, sx, sy, T, T, 0, 0, T, T); g.restore(); }
  else g.drawImage(tiles, sx, sy, T, T, x, y, T, T);
};

export function worldOf(levelIdx: number) { return levelIdx < 5 ? 0 : levelIdx < 10 ? 1 : 2; }
const BG = [{ sky: 0, band: [8, 9, 10, 11], fill: [16, 17, 18, 19] }, { sky: 4, band: [12, 13], fill: [20, 21] }, { sky: 6, band: [14, 15], fill: [22, 23] }];
export function drawBackground(g: CanvasRenderingContext2D, world: number, ox = 0, oy = 0, w = W, h = H) {
  const b = BG[world];
  for (let r = 0; r * 24 < h; r++) for (let c = 0; c * 24 < w; c++) {
    const idx = r < 5 ? b.sky + ((c + r) & 1) * (world === 0 ? 1 : 0) : r === 5 ? b.band[(c * 3 + 1) % b.band.length] : b.fill[(c + r) % b.fill.length];
    g.drawImage(bgs, (idx % 8) * 24, ((idx / 8) | 0) * 24, 24, 24, ox + c * 24, oy + r * 24, 24, 24);
  }
}

const layerCache = new WeakMap<Compiled, HTMLCanvasElement>();
function staticLayer(L: Compiled, world: number): HTMLCanvasElement {
  let c = layerCache.get(L); if (c) return c;
  c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
  drawBackground(g, world);
  const sol = (cc: number, rr: number) => rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && L.solid[rr * COLS + cc] === 1;
  for (let r = 0; r < ROWS; r++) for (let cc = 0; cc < COLS; cc++) {
    if (!sol(cc, r)) continue;
    const top = !sol(cc, r - 1);
    let i = top ? 1 + (cc & 1) : 24 + ((cc + r) & 1);
    if (top && !sol(cc - 1, r)) i = 0; if (top && !sol(cc + 1, r)) i = 3;
    tile(g, i, cc * T, r * T);
  }
  // depth fade: the further below the surface, the darker
  const fade = g.createLinearGradient(0, 0, 0, H); fade.addColorStop(0, 'rgba(18,13,36,0)'); fade.addColorStop(1, 'rgba(18,13,36,.0)');
  for (let r = 0; r < ROWS; r++) for (let cc = 0; cc < COLS; cc++) {
    if (!sol(cc, r)) continue; let depth = 0; while (sol(cc, r - 1 - depth) && depth < 8) depth++;
    if (depth > 1) { g.fillStyle = `rgba(18,13,36,${Math.min(0.62, (depth - 1) * 0.17)})`; g.fillRect(cc * T, r * T, T, T); }
  }
  for (const k of L.spikes) { const c0 = Math.floor(k.x / T), r0 = Math.floor(k.y / T); tile(g, 68, c0 * T, r0 * T, k.y < r0 * T + 4 && k.y === r0 * T); }
  layerCache.set(L, c); return c;
}

export interface DrawOpts { world: number; time: number; hero?: boolean; heroAlpha?: number; squash?: number; showAlts?: boolean }

export function drawHero(g: CanvasRenderingContext2D, s: State, time: number, squash = 0, alpha = 1, tint?: string) {
  const moving = Math.abs(s.vx) > 0.3 && s.ground, f = moving ? ((time * 10) | 0) & 1 : 0;
  const img = heroImg[f * 2 + (s.face < 0 ? 1 : 0)] ?? heroImg[0];
  let sy = 1 + Math.max(-0.2, Math.min(0.25, -s.vy * 0.03)) + squash; sy = Math.max(0.6, sy); const sx = 1 / sy;
  const cx = s.x + HW / 2, bot = s.y + HH + 2;
  g.save(); g.globalAlpha = alpha;
  if (s.dead) { g.translate(cx, bot - 9); g.rotate(Math.PI / 2 * (s.face || 1)); g.translate(-cx, -(bot - 9)); }
  g.drawImage(img, cx - 9 * sx, bot - 18 * sy, 18 * sx, 18 * sy);
  if (tint) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = tint; g.fillRect(cx - 10, bot - 20, 20, 22); }
  g.restore();
}

export function drawWorld(g: CanvasRenderingContext2D, L: Compiled, s: State, o: DrawOpts) {
  g.imageSmoothingEnabled = false;
  g.drawImage(staticLayer(L, o.world), 0, 0);
  const tr = L.def.traps, t = o.time;
  // door(s)
  const [dc, dr] = L.door[s.dIdx];
  if (o.showAlts !== false) for (let i = 0; i < L.door.length; i++) if (i !== s.dIdx) {
    const [c, r] = L.door[i]; g.save(); g.globalAlpha = 0.28 + 0.1 * Math.sin(t * 4); g.setLineDash([3, 3]); g.strokeStyle = '#fff'; g.lineWidth = 1; g.strokeRect(c * T + 3.5, (r - 1) * T + 2.5, 11, 33); g.restore();
  }
  tile(g, 130, dc * T, (dr - 1) * T); tile(g, 150, dc * T, dr * T);
  if (L.door.length > 1) { g.save(); g.globalAlpha = 0.9; g.fillStyle = '#ffd24a'; g.fillRect(dc * T + 6, (dr - 1) * T - 6 + Math.sin(t * 6) * 1.5, 6, 2); g.restore(); }

  for (let i = 0; i < tr.length; i++) {
    const d = tr[i], q = s.ts[i];
    if (d.k === 'spring') tile(g, q.t > 0 ? 108 : 107, d.c * T, d.r * T);
    else if (d.k === 'pop') {
      const x = d.c * T, y = d.r * T;
      tile(g, 3, x, y + T - 1); // seam
      if (popUp(d, s.tick)) tile(g, 68, x, y);
      else if (popWarn(d, s.tick)) { g.save(); g.beginPath(); g.rect(x, y + T - 5, T, 5); g.clip(); tile(g, 68, x + (s.tick & 2 ? 1 : -1), y + 13); g.restore(); }
      else { g.fillStyle = 'rgba(20,16,40,.55)'; g.fillRect(x + 3, y + T - 2, 12, 2); }
    } else if (d.k === 'crumble') {
      const r = crumbleRect(d);
      if (q.m === 2) { g.save(); g.globalAlpha = 0.25; g.setLineDash([2, 3]); g.strokeStyle = '#fff'; g.strokeRect(r.x + .5, r.y + .5, r.w - 1, r.h - 1); g.restore(); }
      else for (let k = 0; k < d.n; k++) tile(g, 48, r.x + k * T + (q.m === 1 ? (s.tick % 4 < 2 ? -1 : 1) : 0), r.y + (q.m === 1 ? ((s.tick >> 1) & 1) : 0));
    } else if (d.k === 'saw') {
      const [x0, y0, x1, y1] = [d.x0 * T, d.y0 * T, d.x1 * T, d.y1 * T];
      g.save(); g.strokeStyle = 'rgba(20,16,40,.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.restore();
      const [px, py] = sawPos(d, s.tick); g.save(); g.translate(px, py); g.rotate(s.tick * 0.35); g.drawImage(sprites.saw, -8, -8); g.restore();
    } else if (d.k === 'drop') {
      g.drawImage(q.m === 1 ? sprites.thwompAngry : sprites.thwomp, q.x - 1, q.y - 1);
    } else if (d.k === 'stalker') {
      const top = d.r * T;
      g.fillStyle = '#2b2447'; g.fillRect(d.c0 * T, top - 3, (d.c1 - d.c0 + 1) * T, 3);
      for (let y = top; y < q.y - 4; y += 6) { g.fillStyle = y % 12 ? '#6e5fa8' : '#51467f'; g.fillRect(q.x - 1, y, 2, 6); }
      g.drawImage(q.m === 3 || q.m === 0 ? sprites.stalker : sprites.stalker2, q.x - 11, q.y - 14);
      if (q.m === 0 && q.t > 4) { g.fillStyle = `rgba(255,60,80,${Math.min(1, q.t / 26)})`; g.fillRect(q.x - 1, q.y + 6, 2, 2 + q.t); }
    }
  }
  if (o.hero !== false) drawHero(g, s, t, o.squash ?? 0, o.heroAlpha ?? 1, s.dead ? 'rgba(255,40,60,.45)' : undefined);
}

export function text(g: CanvasRenderingContext2D, str: string, x: number, y: number, size = 8, color = '#fff', align: CanvasTextAlign = 'left', shadow = '#14102a') {
  g.font = `${size}px ${FONT}`; g.textAlign = align; g.textBaseline = 'top';
  // strong contrast: dark outline on every label, plus an optional coloured drop-shadow
  g.lineJoin = 'round'; g.lineWidth = Math.max(2, size * 0.24); g.strokeStyle = '#0c0820'; g.strokeText(str, x, y);
  if (shadow && shadow !== '#14102a') { const d = Math.max(1, size * 0.09); g.fillStyle = shadow; g.fillText(str, x + d, y + d); }
  g.fillStyle = color; g.fillText(str, x, y);
}
export { tile as drawTile, sprites, heroImg };
export const HEROBOX = { HW, HH };
