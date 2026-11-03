import { describe, it, expect } from 'vitest';
import { LEVELS } from '../src/levels';
import { compile, initState, step, clone, COLS, ROWS, T, HW, HH, RIGHT, JUMP } from '../src/sim';
import { replay, type RLE } from '../src/bot';
import solutions from '../src/solutions.json';

const sols = solutions as unknown as Record<string, RLE>;
const run = (i: number, inp: number, ticks: number) => {
  const L = compile(LEVELS[i]), s = initState(L);
  for (let t = 0; t < ticks && !s.dead && !s.won; t++) step(L, s, inp);
  return s;
};

describe('levels', () => {
  it('ships 12-16 levels', () => { expect(LEVELS.length).toBeGreaterThanOrEqual(12); expect(LEVELS.length).toBeLessThanOrEqual(16); });
  it.each(LEVELS.map((l, i) => [i + 1, l] as const))('level %i has a valid map', (_n, l) => {
    expect(l.map.length).toBe(ROWS);
    for (const row of l.map) expect(row.length).toBe(COLS);
    expect(() => compile(l)).not.toThrow();
  });
  it.each(LEVELS.map((l, i) => [i + 1, l.name] as const))('level %i (%s) is beatable by the solver bot', (n) => {
    const rle = sols[String(n)];
    expect(rle, 'missing solution - run npm run solve').toBeTruthy();
    const r = replay(LEVELS[n - 1], rle);
    expect(r.won).toBe(true);
    expect(r.dead).toBe(false);
    expect(r.ticks / 60).toBeLessThan(16);
  });
  it.each(LEVELS.map((l, i) => [i + 1, l.name] as const))('level %i (%s) is not beaten by just holding right', (n) => {
    expect(run(n - 1, RIGHT, 1200).won).toBe(false);
    expect(run(n - 1, RIGHT | JUMP, 1200).won).toBe(false);
  });
});

describe('determinism', () => {
  it.each(LEVELS.map((_l, i) => i))('level %i: same inputs give identical state', (i) => {
    const a = replay(LEVELS[i], sols[String(i + 1)]), b = replay(LEVELS[i], sols[String(i + 1)]);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });
  it('clone is deep: stepping a clone leaves the original untouched', () => {
    const L = compile(LEVELS[3]), s = initState(L), before = JSON.stringify(s);
    const c = clone(s); for (let i = 0; i < 100; i++) step(L, c, RIGHT);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('the game has no preview or guide', () => {
  it('levels carry no tutorial text', () => { for (const l of LEVELS) expect(Object.keys(l).sort()).toEqual(['map', 'name', 'traps']); });
  it('the sim does not read the future: stepping never touches a ghost position', () => {
    const L = compile(LEVELS[5]), s = initState(L); expect('gx' in s).toBe(false); expect('frozen' in s).toBe(false); expect('reactive' in L).toBe(false);
  });
});

describe('reactive traps follow the real hero', () => {
  // level 6: a stalker patrols above a ground strip; level 7: a door that hops
  const groundY = (L: ReturnType<typeof compile>, c: number) => { let r = 0; while (!L.solid[r * COLS + c]) r++; return r * T - HH; };
  it('the stalker slams down on a hero who stands under it', () => {
    const L = compile(LEVELS[5]), s = initState(L); s.x = 15 * T + 9 - HW / 2; s.y = groundY(L, 15);
    for (let t = 0; t < 200 && !s.dead; t++) step(L, s, 0);
    expect(s.dead).toBe(true); expect(s.cause).toBe('stalker');
  });
  it('the stalker slides along its rail toward the real hero', () => {
    const L = compile(LEVELS[5]), s = initState(L); s.x = 24 * T; s.y = groundY(L, 24);
    const ts = L.def.traps.findIndex(t => t.k === 'stalker'), x0 = s.ts[ts].x;
    for (let t = 0; t < 40; t++) step(L, s, 0);
    expect(s.ts[ts].x).toBeGreaterThan(x0 + 30);
  });
  it('the stalker ignores a hero who is far away', () => {
    const L = compile(LEVELS[5]), s = initState(L);
    for (let t = 0; t < 600 && !s.dead; t++) step(L, s, 0);
    expect(s.dead).toBe(false);
  });
  it('the shy door hops when the hero gets close, but not before', () => {
    const L = compile(LEVELS[6]), s = initState(L);
    for (let t = 0; t < 200; t++) step(L, s, 0);
    expect(s.dIdx).toBe(0);
    const [c, r] = L.door[0]; s.x = c * T - 18; s.y = r * T - HH + T; s.vx = 0; const ev: string[] = [];
    for (let t = 0; t < 10; t++) step(L, s, 0, ev);
    expect(ev).toContain('hop'); expect(s.dIdx).toBe(1);
  });
  it('the shy door hops while you approach it (replaying the solutions)', () => {
    for (const lv of [7, 10, 14]) {
      const L = compile(LEVELS[lv - 1]), s = initState(L); let hops = 0;
      for (const [inp, n] of sols[String(lv)]) for (let k = 0; k < n && !s.dead && !s.won; k++) { const ev: string[] = []; step(L, s, inp, ev); hops += ev.filter(e => e === 'hop').length; }
      expect(s.won).toBe(true);
      expect(hops, 'level ' + lv).toBeGreaterThan(0);
    }
  });
});

import { computeLayout } from '../src/layout';
import { HH as HERO_H, W as LW, H as LH } from '../src/sim';
describe('big, crisp, camera-following view', () => {
  it('hero is 8-10% of the screen height at 1920x1080 and the view is pixel-crisp', () => {
    const l = computeLayout(1920, 1080, 1, false);
    const frac = HERO_H * l.s / 1080; expect(frac).toBeGreaterThanOrEqual(0.08); expect(frac).toBeLessThanOrEqual(0.1);
    expect(Number.isInteger(l.s * l.dpr)).toBe(true);
  });
  it('always covers the whole screen (camera never shows outside the level) and zooms in on every size', () => {
    for (const [w, h, d] of [[1920, 1080, 1], [1366, 768, 1], [2560, 1440, 1], [390, 844, 3], [844, 390, 3], [360, 800, 3], [768, 1024, 2], [3440, 1440, 1]] as const) {
      const l = computeLayout(w, h, d, true);
      expect(l.s * LW).toBeGreaterThanOrEqual(w - 0.01); expect(l.s * LH).toBeGreaterThanOrEqual(h - 0.01);
      expect(l.visW).toBeGreaterThanOrEqual(130); expect(l.s).toBeGreaterThanOrEqual(w / LW);
      expect(Number.isInteger(Math.round(l.s * l.dpr * 1000) / 1000)).toBe(true);
    }
  });
});
