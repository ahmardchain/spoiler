// Responsive layout: everything is computed in CSS pixels from the viewport, so the game always fills the whole screen.
import { W, H } from './sim';
export interface Rect { x: number; y: number; w: number; h: number }
export interface Layout {
  cw: number; ch: number; dpr: number; U: number; m: number; portrait: boolean; touch: boolean;
  hud: Rect; level: Rect; s: number;          // s = CSS pixels per world pixel (device-pixel aligned)
  hint: Rect | null;
  panel: Rect; head: Rect; win: Rect; status: Rect; map: Rect | null; tl: Rect;
  bFs: Rect; bMenu: Rect; bL: Rect | null; bR: Rect | null; bJ: Rect | null;
  fsz: { title: number; tip: number; hud: number; head: number; status: number; cause: number; hint: number; small: number };
}
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const R = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

/** Pick the world scale: an exact integer number of device pixels when that wastes <7% of the space, otherwise the exact fit. */
function snapScale(fit: number, dpr: number): number {
  const dev = fit * dpr, k = Math.floor(dev);
  return (k >= 1 && k / dev >= 0.93 ? k : Math.floor(dev * 4) / 4) / dpr;
}

export function computeLayout(cw: number, ch: number, dpr: number, touch: boolean): Layout {
  const portrait = cw / ch < 1.12;
  const U = portrait ? clamp(cw / 520, 0.62, 2.2) : clamp(Math.min(cw / 1280, ch / 720), 0.6, 2.6);
  const m = Math.round(10 * U);
  const fsz = {
    title: Math.max(12, Math.round(20 * U)), tip: Math.max(9, Math.round(13 * U)), hud: Math.max(11, Math.round(16 * U)),
    head: Math.max(12, Math.round(22 * U)), status: Math.max(11, Math.round(18 * U)), cause: Math.max(9, Math.round(13 * U)),
    hint: Math.max(9, Math.round(13 * U)), small: Math.max(9, Math.round(11 * U)),
  };
  const bs = Math.round(clamp(34 * U, 34, 64));            // fullscreen / menu button size
  const hudH = portrait ? Math.round(m + bs + 0.4 * m + fsz.tip + 0.6 * m + fsz.hud + m) : fsz.title + fsz.tip + Math.round(3.2 * m);
  const bFs = R(cw - bs - m, m, bs, bs), bMenu = R(cw - 2 * bs - 2 * m, m, bs, bs);
  let L: Layout;

  if (!portrait) {
    const btn = touch ? Math.round(clamp(ch * 0.17, 58, 100)) : 0;
    const ctrlW = touch ? 2 * btn + 3 * m : 0;
    const pipW = Math.round(cw * (touch ? 0.28 : 0.31));
    const hintH = touch ? 0 : fsz.hint * 2 + 3 * m;
    const ax = ctrlW + m, aw = cw - pipW - ax - m, ay = hudH + m, ah = ch - ay - hintH - m;
    const s = snapScale(Math.min(aw / W, ah / H), dpr);
    const lw = Math.round(W * s * dpr) / dpr, lh = Math.round(H * s * dpr) / dpr;
    const lx = Math.round((ax + (aw - lw) / 2) * dpr) / dpr, ly = Math.round((ay + (ah - lh) / 2) * dpr) / dpr;
    const level = R(lx, ly, lw, lh);
    const px = cw - pipW, pw = pipW - m, headH = Math.max(bs, fsz.head) + m;
    const head = R(px, m, pw, headH - m);
    const statusH = fsz.status + fsz.cause + Math.round(1.6 * m), tlH = fsz.small + 18 * U + m;
    const jumpH = touch ? Math.round(btn * 1.15) + m : 0;
    let rest = ch - headH - statusH - tlH - jumpH - 2 * m;
    const ww = pw - m;
    let wh = Math.min(ww * 0.75, rest), mapH = 0;
    if (!touch) { wh = Math.min(ww * 0.75, rest * 0.58); mapH = Math.min(ww * 9 / 16, rest - wh - fsz.small - m * 2); if (mapH < 50 * U) { mapH = 0; wh = Math.min(ww * 0.75, rest); } }
    const win = R(px + m, headH + m / 2, ww, wh), status = R(px + m, win.y + wh + m * 0.6, ww, statusH);
    const tl = R(px + m, status.y + statusH, ww, tlH);
    const map = mapH ? R(px + m, tl.y + tlH + fsz.small + m * 0.4, Math.round(mapH * 16 / 9), mapH) : null;
    if (map && map.w > ww) { map.w = ww; map.h = Math.round(ww * 9 / 16); }
    if (map) map.x = px + m + (ww - map.w) / 2;
    L = {
      cw, ch, dpr, U, m, portrait, touch, hud: R(0, 0, cw - pipW, hudH), level, s,
      hint: touch ? null : R(ax, level.y + lh + m, aw, hintH),
      panel: R(px, 0, pipW, ch), head, win, status, map, tl, bFs, bMenu,
      bL: touch ? R(m, ch - btn - 2 * m, btn, btn) : null, bR: touch ? R(m + btn + m, ch - btn - 2 * m, btn, btn) : null,
      bJ: touch ? R(px + m, ch - Math.round(btn * 1.15) - m, ww, Math.round(btn * 1.15)) : null, fsz,
    };
  } else {
    const btn = touch ? Math.round(clamp(cw * 0.21, 70, 120)) : 0;
    const ctrlH = touch ? btn + 2 * m : 0;
    const aw = cw - 2 * m;
    const s = snapScale(aw / W, dpr);
    const lw = Math.round(W * s * dpr) / dpr, lh = Math.round(H * s * dpr) / dpr;
    const level = R(Math.round((cw - lw) / 2 * dpr) / dpr, hudH + m, lw, lh);
    const top = level.y + lh + m, bottom = ch - ctrlH - m;
    const headH = fsz.head + m, statusH = fsz.status + fsz.cause + Math.round(1.6 * m), tlH = fsz.small + 14 * U + m;
    const rest = bottom - top - headH - statusH - tlH;
    const ww = Math.min(aw, Math.max(60, rest / 0.95)), wh = Math.min(ww * 0.95, rest);
    const wx = (cw - ww) / 2;
    const head = R(wx, top, ww, headH), win = R(wx, top + headH, ww, wh), status = R(wx, win.y + wh + m * 0.5, ww, statusH), tl = R(wx, status.y + statusH, ww, tlH);
    const jw = cw - 2 * m - 2 * btn - 2 * m;
    L = {
      cw, ch, dpr, U, m, portrait, touch, hud: R(0, 0, cw, hudH), level, s, hint: null, panel: R(0, top, cw, bottom - top), head, win, status, map: null, tl, bFs, bMenu,
      bL: touch ? R(m, ch - btn - m, btn, btn) : null, bR: touch ? R(2 * m + btn, ch - btn - m, btn, btn) : null, bJ: touch ? R(cw - m - jw, ch - btn - m, jw, btn) : null, fsz,
    };
  }
  return L;
}

/** Level-select cells (14 levels). */
export function selectCells(l: Layout, n: number): { cells: Rect[]; top: number } {
  const cols = l.portrait ? 3 : 7, rows = Math.ceil(n / cols), g = l.m;
  const top = Math.round((l.portrait ? 120 : 130) * l.U) + (l.portrait ? l.m : 0), bottom = l.ch - Math.round(40 * l.U) - l.m;
  const cw = Math.min((l.cw - 2 * l.m - (cols - 1) * g) / cols, 200 * l.U), chh = Math.min((bottom - top - (rows - 1) * g) / rows, cw * 1.05);
  const totW = cols * cw + (cols - 1) * g, ox = (l.cw - totW) / 2, totH = rows * chh + (rows - 1) * g, oy = top + Math.max(0, (bottom - top - totH) / 2);
  const cells: Rect[] = []; for (let i = 0; i < n; i++) cells.push(R(ox + (i % cols) * (cw + g), oy + Math.floor(i / cols) * (chh + g), cw, chh));
  return { cells, top };
}
