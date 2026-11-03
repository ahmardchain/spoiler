import type { LevelDef, TrapDef } from './sim';
import { COLS, ROWS } from './sim';

class G {
  a: string[][] = Array.from({ length: ROWS }, () => Array(COLS).fill('.'));
  f(c0: number, c1: number, r0 = 16, r1 = 17, ch = '#') { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.a[r][c] = ch; return this; }
  p(c: number, r: number, ch: string) { this.a[r][c] = ch; return this; }
  row(r: number, c0: number, c1: number, ch: string) { return this.f(c0, c1, r, r, ch); }
  get map() { return this.a.map(r => r.join('')); }
}
const base = () => new G().f(0, 31).p(2, 15, 'S').p(29, 15, 'E');
// `up` shifts the whole layout up by that many tile rows (the bottom is re-filled with ground) so flat levels sit mid-screen.
const lvl = (name: string, g: G, traps: TrapDef[] = [], up = 3): LevelDef => {
  const m = g.map; for (let i = 0; i < up; i++) { if (!/^\.*$/.test(m[0])) throw new Error(name + ': cannot shift, row ' + i + ' not empty'); m.shift(); m.push(m[m.length - 1]); }
  const sh = (t: TrapDef): TrapDef => {
    switch (t.k) {
      case 'pop': case 'drop': case 'crumble': case 'spring': case 'stalker': return { ...t, r: t.r - up };
      case 'saw': return { ...t, y0: t.y0 - up, y1: t.y1 - up };
      case 'shy': return { ...t, alts: t.alts.map(([c, r]) => [c, r - up] as [number, number]) };
    }
  };
  return { name, map: m, traps: traps.map(sh) };
};

export const LEVELS: LevelDef[] = [
  lvl('FIRST LOOK', base().row(15, 12, 13, '^').row(15, 20, 22, '^').row(15, 26, 26, '^'), [
    { k: 'drop', c: 17, r: 8, trig: 22 },
  ]),

  lvl('TICK TOCK', base().row(14, 6, 26, '#'), [
    { k: 'pop', c: 9, r: 15, period: 120, phase: 0, up: 55 }, { k: 'pop', c: 12, r: 15, period: 120, phase: 40, up: 55 },
    { k: 'pop', c: 15, r: 15, period: 120, phase: 80, up: 55 }, { k: 'pop', c: 18, r: 15, period: 120, phase: 20, up: 55 },
    { k: 'pop', c: 21, r: 15, period: 120, phase: 60, up: 55 }, { k: 'pop', c: 24, r: 15, period: 120, phase: 100, up: 55 },
  ]),

  lvl('HEADS UP', new G().f(0, 7).f(11, 15).f(19, 31).p(2, 15, 'S').p(29, 15, 'E'), [
    { k: 'drop', c: 13, r: 8, trig: 30 }, { k: 'drop', c: 24, r: 8, trig: 24 },
  ]),

  lvl('SHAKY GROUND', new G().f(0, 5).f(26, 31).p(2, 15, 'S').p(29, 15, 'E'), [
    { k: 'crumble', c: 7, r: 15, n: 2 }, { k: 'crumble', c: 11, r: 15, n: 2 }, { k: 'crumble', c: 15, r: 15, n: 2 },
    { k: 'crumble', c: 19, r: 15, n: 2 }, { k: 'crumble', c: 23, r: 15, n: 2 },
    { k: 'saw', x0: 10, y0: 5, x1: 10, y1: 16, speed: 2.0, phase: 0 }, { k: 'saw', x0: 18, y0: 5, x1: 18, y1: 16, speed: 2.0, phase: 100 }, { k: 'saw', x0: 14, y0: 5, x1: 14, y1: 16, speed: 2.0, phase: 200 },
  ]),

  lvl('LAUNCH PAD', base().f(22, 31, 11, 15).p(29, 10, 'E').p(29, 15, '#').p(2, 15, 'S').row(8, 15, 19, '#').row(9, 15, 19, 'v'), [
    { k: 'spring', c: 17, r: 15 },
  ]),

  lvl('IT SEES YOU', new G().f(0, 9).f(13, 18).f(22, 31).p(2, 15, 'S').p(29, 15, 'E'), [
    { k: 'stalker', c: 15, r: 8, c0: 5, c1: 26 },
  ]),

  lvl('SHY DOOR', new G().f(0, 31).p(2, 15, 'S').f(18, 20, 14, 15).f(21, 23, 12, 15).f(24, 27, 10, 15).p(26, 9, 'E'), [
    { k: 'shy', alts: [[29, 15]] },
  ]),

  lvl('SAW MILL', base().row(15, 15, 15, '.'), [
    { k: 'saw', x0: 6, y0: 15.5, x1: 11, y1: 15.5, speed: 2.2, phase: 0 },
    { k: 'pop', c: 13, r: 15, period: 110, phase: 0, up: 50 },
    { k: 'saw', x0: 15, y0: 15.5, x1: 20, y1: 15.5, speed: 2.6, phase: 60 },
    { k: 'saw', x0: 22, y0: 15.5, x1: 27, y1: 15.5, speed: 3.0, phase: 20 },
  ]),

  lvl('GOING UP', new G().f(0, 6).f(9, 13, 10, 11).f(16, 19, 8, 9).f(22, 31, 6, 17).p(2, 15, 'S').p(29, 5, 'E'), [
    { k: 'spring', c: 4, r: 15 },
    { k: 'saw', x0: 14.5, y0: 5, x1: 14.5, y1: 12, speed: 1.2, phase: 0 },
    { k: 'drop', c: 24, r: 2, trig: 12 },
  ], 0),

  lvl('DECOY', new G().f(0, 31).p(2, 15, 'S').f(7, 8, 14, 15).f(9, 13, 12, 15).f(16, 20, 10, 15).p(18, 9, 'E'), [
    { k: 'shy', alts: [[11, 11], [29, 15]] },
  ], 2),

  lvl('TWO EYES', new G().f(0, 9).f(13, 14).f(18, 31).p(2, 15, 'S').p(29, 15, 'E'), [
    { k: 'stalker', c: 8, r: 8, c0: 4, c1: 15 }, { k: 'stalker', c: 22, r: 8, c0: 15, c1: 27 },
  ]),

  lvl('PIT STOP', new G().f(0, 4).f(27, 31).p(2, 15, 'S').p(29, 15, 'E'), [
    { k: 'crumble', c: 6, r: 15, n: 2 }, { k: 'crumble', c: 10, r: 14, n: 2 }, { k: 'crumble', c: 14, r: 13, n: 2 },
    { k: 'crumble', c: 18, r: 14, n: 2 }, { k: 'crumble', c: 22, r: 15, n: 2 },
    { k: 'stalker', c: 14, r: 7, c0: 5, c1: 26 },
    { k: 'saw', x0: 12, y0: 8, x1: 12, y1: 15, speed: 1.3, phase: 20 },
  ]),

  lvl('GAUNTLET', base().f(16, 17, 14, 15).row(14, 20, 26, '#'), [
    { k: 'pop', c: 6, r: 15, period: 100, phase: 0, up: 50 }, { k: 'pop', c: 9, r: 15, period: 100, phase: 50, up: 50 },
    { k: 'saw', x0: 11, y0: 15.5, x1: 15, y1: 15.5, speed: 1.6, phase: 0 },
    { k: 'drop', c: 18, r: 8, trig: 14 },
    { k: 'pop', c: 21, r: 15, period: 120, phase: 0, up: 60 }, { k: 'pop', c: 24, r: 15, period: 120, phase: 60, up: 60 },
    { k: 'stalker', c: 14, r: 8, c0: 4, c1: 27 },
  ]),

  lvl('FINALE', new G().f(0, 31).p(2, 15, 'S').f(7, 8, 14, 15).f(9, 11, 12, 15).f(15, 18, 10, 15).p(10, 11, 'E'), [
    { k: 'shy', alts: [[17, 9], [29, 15]] },
    { k: 'stalker', c: 12, r: 6, c0: 4, c1: 27 },
    { k: 'pop', c: 4, r: 15, period: 110, phase: 0, up: 50 },
    { k: 'saw', x0: 13, y0: 9, x1: 13, y1: 15.5, speed: 1.3, phase: 0 },
  ], 2),
];
