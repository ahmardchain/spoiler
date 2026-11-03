// Solver bot: layered beam search over 6-tick macro inputs. Used offline to prove every level is beatable.
import { compile, initState, clone, step, COLS, ROWS, T, HW, HH, LEFT, RIGHT, JUMP, type Compiled, type State, type LevelDef } from './sim';

export type RLE = [number, number][];
const ACTIONS = [0, LEFT, RIGHT, JUMP, LEFT | JUMP, RIGHT | JUMP];
const MACRO = 6;

function distMaps(L: Compiled): Float32Array[] {
  return L.door.map(([dc, dr]) => {
    const d = new Float32Array(COLS * ROWS).fill(1e9), q: number[] = [];
    for (const r of [dr, dr - 1]) { d[r * COLS + dc] = 0; q.push(r * COLS + dc); }
    for (let i = 0; i < q.length; i++) {
      const v = q[i], c = v % COLS, r = (v / COLS) | 0;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + a, nr = r + b; if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
        const k = nr * COLS + nc; if (L.solid[k] || d[k] < 1e8) continue; d[k] = d[v] + 1; q.push(k);
      }
    }
    return d;
  });
}

function key(s: State): string {
  let k = ((s.x * 0.5) | 0) + ',' + ((s.y * 0.5) | 0) + ',' + Math.round(s.vx * 2) + ',' + Math.round(s.vy) + ',' + (s.ground ? 1 : 0) + ',' + (s.tick >> 2) + ',' + s.dIdx;
  for (const t of s.ts) if (t.m) k += ',' + t.m + ':' + (t.t >> 2) + ':' + (t.y | 0); else if (t.x) k += ',' + (t.x >> 3) + ':' + (t.t >> 3);
  return k;
}

export function solve(def: LevelDef, opt: { beam?: number; maxTicks?: number } = {}): { rle: RLE; ticks: number } | null {
  const L = compile(def), maps = distMaps(L), beam = opt.beam ?? 600, maxLayers = Math.floor((opt.maxTicks ?? 1500) / MACRO);
  type Node = { s: State; h: number; parent: Node | null; a: number };
  const heur = (s: State) => {
    const c = Math.max(0, Math.min(COLS - 1, ((s.x + HW / 2) / T) | 0)), r = Math.max(0, Math.min(ROWS - 1, ((s.y + HH / 2) / T) | 0));
    return maps[s.dIdx][r * COLS + c] * 10 + 0;
  };
  let layer: Node[] = [{ s: initState(L), h: 0, parent: null, a: 0 }];
  for (let li = 0; li < maxLayers; li++) {
    const next: Node[] = [], seen = new Set<string>();
    for (const n of layer) for (const a of ACTIONS) {
      const s = clone(n.s);
      for (let i = 0; i < MACRO && !s.dead && !s.won; i++) step(L, s, a);
      if (s.dead) continue;
      if (s.won) {
        const seq: number[] = []; for (let x: Node | null = { s, h: 0, parent: n, a }; x && x.parent; x = x.parent) seq.push(x.a);
        seq.reverse();
        const rle: RLE = []; let ticks = 0;
        for (const q of seq) { const cnt = MACRO; ticks += cnt; if (rle.length && rle[rle.length - 1][0] === q) rle[rle.length - 1][1] += cnt; else rle.push([q, cnt]); }
        return { rle, ticks: s.tick };
      }
      const k = key(s); if (seen.has(k)) continue; seen.add(k);
      next.push({ s, h: heur(s) + Math.random() * 0.0, parent: n, a });
    }
    if (!next.length) return null;
    next.sort((x, y) => x.h - y.h);
    layer = next.slice(0, beam);
  }
  return null;
}

export function replay(def: LevelDef, rle: RLE): { won: boolean; dead: boolean; ticks: number; state: State } {
  const L = compile(def), s = initState(L);
  for (const [a, n] of rle) for (let i = 0; i < n && !s.dead && !s.won; i++) step(L, s, a);
  return { won: s.won, dead: s.dead, ticks: s.tick, state: s };
}
