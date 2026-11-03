import { describe, it, expect } from 'vitest';
import { LEVELS } from '../src/levels';
import { compile, initState, step, predict, clone, COLS, ROWS, HORIZON, RIGHT, JUMP } from '../src/sim';
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

describe('the SPOILER preview', () => {
  // On levels without reactive traps the preview must be exactly what happens when you keep holding the same keys.
  it.each([0, 1, 2, 3, 4, 7, 8, 11].filter(i => !compile(LEVELS[i]).reactive))('level %i: preview matches reality while inputs are held', (i) => {
    const L = compile(LEVELS[i]);
    for (const inp of [0, RIGHT, RIGHT | JUMP]) {
      const s = initState(L);
      for (let k = 0; k < 40; k++) step(L, s, RIGHT);          // get somewhere interesting first
      if (s.dead || s.won) continue;
      const p = predict(L, s, inp, false, false);
      const real = clone(s); let t = 0;
      for (; t < HORIZON && !real.dead && !real.won; t++) step(L, real, inp);
      expect(p.res).toBe(real.dead ? 1 : real.won ? 2 : 0);
      expect(p.s.x).toBeCloseTo(real.x, 6); expect(p.s.y).toBeCloseTo(real.y, 6);
    }
  });
  it('predicts a death on level 1 before it happens when running at the spikes', () => {
    const L = compile(LEVELS[0]), s = initState(L);
    for (let k = 0; k < 20; k++) step(L, s, RIGHT);
    const p = predict(L, s, RIGHT, true, true);
    expect(p.res).toBe(1);
    expect(p.path && p.path.length).toBeGreaterThan(4);
    expect(run(0, RIGHT, 1200).dead).toBe(true);
  });
  it('does not mutate the real state', () => {
    const L = compile(LEVELS[5]), s = initState(L), before = JSON.stringify(s);
    predict(L, s, RIGHT, true, true);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('reactive traps', () => {
  it('the shy door hops away while you approach it (replaying the solution)', () => {
    for (const lv of [7, 10]) {
      const L = compile(LEVELS[lv - 1]), s = initState(L); let hops = 0;
      for (const [inp, n] of sols[String(lv)]) for (let k = 0; k < n && !s.dead && !s.won; k++) { const ev: string[] = []; step(L, s, inp, ev); hops += ev.filter(e => e === 'hop').length; }
      expect(s.won).toBe(true);
      expect(hops, 'level ' + lv).toBeGreaterThan(0);
    }
  });
  it('a stalker stays idle when you are predicted to stand still far away', () => {
    const s = run(5, 0, 300); expect(s.dead).toBe(false);
  });
});
