// Responsive layout: the level fills the whole screen. Everything is computed in CSS pixels from the viewport.
import { W, H } from './sim';
export interface Rect { x: number; y: number; w: number; h: number }
export interface Layout {
  cw: number; ch: number; dpr: number; U: number; m: number; touch: boolean;
  s: number;                 // CSS pixels per world pixel (device-pixel aligned)
  view: Rect;                // where the level is drawn on screen (CSS px)
  follow: boolean;           // true when the view is zoomed in and a camera follows the hero (tall phones, 4:3 ...)
  visW: number;              // world pixels visible horizontally
  bFs: Rect; bMenu: Rect; bL: Rect | null; bR: Rect | null; bJ: Rect | null;
  fsz: { hud: number; title: number; play: number; num: number };
}
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const R = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

/** An exact integer number of device pixels per world pixel when that wastes <7% of the space, otherwise 1/18 steps (whole tiles). */
function snapScale(fit: number, dpr: number): number {
  const dev = fit * dpr, k = Math.floor(dev);
  return (k >= 1 && k / dev >= 0.93 ? k : Math.max(0.25, Math.floor(dev * 18) / 18)) / dpr;
}
const MIN_VIS_W = 190; // never show less than this many world pixels across (so traps stay visible on tall phones)

export function computeLayout(cw: number, ch: number, dpr: number, touch: boolean): Layout {
  const portrait = cw / ch < 1;
  const U = clamp(Math.min(cw, ch * 1.6) / 1280, 0.5, 2.6);
  const m = Math.round(clamp(12 * U, 8, 24));
  const sFit = Math.min(cw / W, ch / H);
  // zoom in past "fit" (cropping the sides, camera follows the hero) only if that fills the screen noticeably better
  const sFill = Math.min(ch / H, cw / MIN_VIS_W);
  const s = snapScale(sFill / sFit >= 1.15 ? sFill : sFit, dpr);
  const lw = Math.min(cw, Math.round(W * s * dpr) / dpr), lh = Math.round(H * s * dpr) / dpr;
  const follow = lw >= cw - 0.5 && W * s > cw + 0.5;
  const vw = follow ? cw : lw;
  const vy = (ch - lh) * (portrait ? 0.38 : 0.5);
  const view = R(Math.round((cw - vw) / 2 * dpr) / dpr, Math.round(vy * dpr) / dpr, vw, lh);
  const bs = Math.round(clamp(30 * U + 6, 32, 48));
  const bFs = R(cw - bs - m, m, bs, bs), bMenu = R(cw - 2 * bs - 2 * m, m, bs, bs);
  const btn = touch ? Math.round(portrait ? clamp(cw * 0.22, 66, 112) : clamp(ch * 0.2, 60, 110)) : 0;
  const by = ch - btn - m * 1.5;
  const bJ = touch ? R(cw - m * 1.5 - btn * 1.5, by, Math.round(btn * 1.5), btn) : null;
  return {
    cw, ch, dpr, U, m, touch, s, view, follow, visW: follow ? cw / s : W, bFs, bMenu,
    bL: touch ? R(m * 1.5, by, btn, btn) : null, bR: touch ? R(m * 2.5 + btn, by, btn, btn) : null, bJ,
    fsz: { hud: Math.max(11, Math.round(15 * U)), title: 0, play: 0, num: 0 },
  };
}

/** Level-select cells: numbers only. */
export function selectCells(l: Layout, n: number): Rect[] {
  const portrait = l.cw < l.ch, cols = portrait ? 3 : 7, rows = Math.ceil(n / cols), g = Math.round(l.m * 1.2);
  const top = l.bFs.y + l.bFs.h + g, bottom = l.ch - g;
  const side = Math.min((l.cw - 2 * g - (cols - 1) * g) / cols, (bottom - top - (rows - 1) * g) / rows, (portrait ? 210 : 120) * l.U);
  const totW = cols * side + (cols - 1) * g, totH = rows * side + (rows - 1) * g, ox = (l.cw - totW) / 2, oy = top + Math.max(0, (bottom - top - totH) / 2);
  const cells: Rect[] = []; for (let i = 0; i < n; i++) cells.push(R(ox + (i % cols) * (side + g), oy + Math.floor(i / cols) * (side + g), side, side));
  return cells;
}
