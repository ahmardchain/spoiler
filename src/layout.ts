// Responsive layout: the level fills the whole screen. Everything is computed in CSS pixels from the viewport.
import { W, H } from './sim';
export interface Rect { x: number; y: number; w: number; h: number }
export interface Layout {
  cw: number; ch: number; dpr: number; U: number; m: number; touch: boolean; heroY: number; padB: number;
  s: number;                 // CSS pixels per world pixel (device-pixel aligned)
  view: Rect;                // where the level is drawn on screen (CSS px)
  follow: boolean;           // true when the view is zoomed in and a camera follows the hero (tall phones, 4:3 ...)
  visW: number; visH: number; // world pixels visible horizontally / vertically
  bFs: Rect; bMenu: Rect; bL: Rect | null; bR: Rect | null; bJ: Rect | null;
  fsz: { hud: number; title: number; play: number; num: number };
}
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const R = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

// The camera shows about VIS_H world pixels vertically (the hero ends up ~9% of the screen height at 1080p) and never fewer than MIN_VIS_W across.
const VIS_H = 150, MIN_VIS_W = 135;

export function computeLayout(cw: number, ch: number, dpr: number, touch: boolean): Layout {
  const portrait = cw / ch < 1;
  const U = clamp(Math.min(cw, ch * 1.6) / 1280, 0.5, 2.6);
  const m = Math.round(clamp(ch * 0.016, 8, 26));
  // zoom: wanted CSS px per world px, then snapped to a whole number of device pixels (pixel-crisp), and always large enough to cover the screen
  let want = Math.min(ch / VIS_H, cw / MIN_VIS_W);
  want = Math.max(want, cw / W, ch / H);
  let k = Math.round(want * dpr); if (k < 1) k = want * dpr;
  while (k * W < cw * dpr - 0.01 || k * H < ch * dpr - 0.01) k = k >= 1 ? k + 1 : k * 1.1;
  const s = k / dpr;
  const view = R(0, 0, cw, ch);
  const bs = Math.round(clamp(ch * 0.065, 44, 78));
  const hud = Math.round(clamp(Math.min(ch * 0.036, (cw - 2 * bs - 4 * m) / 9.5), 14, 46));
  const bFs = R(cw - bs - m, m, bs, bs), bMenu = R(cw - 2 * bs - 2 * m, m, bs, bs);
  const btn = touch ? Math.round(portrait ? clamp(cw * 0.235, 70, 130) : clamp(ch * 0.27, 66, 150)) : 0;
  const by = ch - btn - m * 1.5;
  const heroY = touch ? Math.min(0.76, by / ch - 0.1) : 0.76; // keep the hero above the on-screen buttons
  const bJ = touch ? R(cw - m * 1.5 - btn * 1.5, by, Math.round(btn * 1.5), btn) : null;
  return {
    cw, ch, dpr, U, m, touch, heroY, padB: touch ? (ch / s) * (1 - heroY) : 0, s, view, follow: true, visW: cw / s, visH: ch / s, bFs, bMenu,
    bL: touch ? R(m * 1.5, by, btn, btn) : null, bR: touch ? R(m * 2.5 + btn, by, btn, btn) : null, bJ,
    fsz: { hud, title: 0, play: 0, num: 0 },
  };
}

/** Level-select cells: numbers only. */
export function selectCells(l: Layout, n: number): Rect[] {
  const portrait = l.cw < l.ch, cols = portrait ? 3 : 7, rows = Math.ceil(n / cols), g = Math.round(l.m * 1.2);
  const top = l.bFs.y + l.bFs.h + g, bottom = l.ch - g;
  const side = Math.min((l.cw - 2 * g - (cols - 1) * g) / cols, (bottom - top - (rows - 1) * g) / rows, (portrait ? 260 : 400) * l.U);
  const totW = cols * side + (cols - 1) * g, totH = rows * side + (rows - 1) * g, ox = (l.cw - totW) / 2, oy = top + Math.max(0, (bottom - top - totH) / 2);
  const cells: Rect[] = []; for (let i = 0; i < n; i++) cells.push(R(ox + (i % cols) * (side + g), oy + Math.floor(i / cols) * (side + g), side, side));
  return cells;
}
