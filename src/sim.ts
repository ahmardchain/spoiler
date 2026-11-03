// Deterministic fixed-step simulation (no DOM, shared by the game, the solver bot and the tests).
export const T = 18, COLS = 32, ROWS = 18, W = COLS * T, H = ROWS * T;
export const LEFT = 1, RIGHT = 2, JUMP = 4;
export const HW = 10, HH = 14;           // hero hitbox
export const STALK_SPEED = 1.9, STALK_NEAR = 40, STALK_TICKS = 12, STALK_LEAD = 14;
const RUN = 1.75, ACC_G = 0.24, ACC_A = 0.16, FRIC_G = 0.32, FRIC_A = 0.07, GRAV = 0.23, JUMP_V = 4.4, MAXFALL = 6.2, COYOTE = 5;

export type TrapDef =
  | { k: 'pop'; c: number; r: number; period: number; phase: number; up: number }
  | { k: 'drop'; c: number; r: number; trig: number }
  | { k: 'crumble'; c: number; r: number; n: number }
  | { k: 'saw'; x0: number; y0: number; x1: number; y1: number; speed: number; phase: number }
  | { k: 'spring'; c: number; r: number; power?: number }
  | { k: 'stalker'; c: number; r: number; c0: number; c1: number }
  | { k: 'shy'; alts: [number, number][] };

export interface LevelDef { name: string; map: string[]; traps: TrapDef[]; }

export interface Compiled {
  def: LevelDef; solid: Uint8Array;
  spikes: { x: number; y: number; w: number; h: number }[];
  sx: number; sy: number; door: [number, number][];
}

export interface TS { x: number; y: number; vy: number; m: number; t: number; n: number }
export interface State {
  tick: number; x: number; y: number; vx: number; vy: number; ground: boolean; coy: number; face: number; lastJump: number;
  dead: boolean; cause: string; won: boolean; endTick: number;
  ts: TS[]; dIdx: number; dLock: number; dCool: number;
}

export function compile(def: LevelDef): Compiled {
  const solid = new Uint8Array(COLS * ROWS), spikes: Compiled['spikes'] = [];
  let sx = 20, sy = 20, door: [number, number][] = [[0, 0]];
  if (def.map.length !== ROWS) throw new Error(`${def.name}: map must have ${ROWS} rows, has ${def.map.length}`);
  def.map.forEach((row, r) => {
    if (row.length !== COLS) throw new Error(`${def.name}: row ${r} must have ${COLS} cols, has ${row.length}`);
    for (let c = 0; c < COLS; c++) {
      const ch = row[c];
      if (ch === '#') solid[r * COLS + c] = 1;
      else if (ch === '^') spikes.push({ x: c * T + 3, y: r * T + 10, w: 12, h: 8 });
      else if (ch === 'v') spikes.push({ x: c * T + 3, y: r * T, w: 12, h: 8 });
      else if (ch === 'S') { sx = c * T + (T - HW) / 2; sy = (r + 1) * T - HH; }
      else if (ch === 'E') door = [[c, r]];
    }
  });
  const shy = def.traps.find(t => t.k === 'shy') as Extract<TrapDef, { k: 'shy' }> | undefined;
  if (shy) door = [door[0], ...shy.alts];
  return { def, solid, spikes, sx, sy, door };
}

export function initState(L: Compiled): State {
  const ts: TS[] = L.def.traps.map(d => {
    if (d.k === 'drop') return { x: d.c * T + 1, y: d.r * T + 1, vy: 0, m: 0, t: 0, n: d.r * T + 1 };
    if (d.k === 'stalker') return { x: d.c * T + 9, y: d.r * T + 8, vy: 0, m: 0, t: 0, n: 0 };
    return { x: 0, y: 0, vy: 0, m: 0, t: 0, n: 0 };
  });
  return { tick: 0, x: L.sx, y: L.sy, vx: 0, vy: 0, ground: true, coy: COYOTE, face: 1, lastJump: -99, dead: false, cause: '', won: false, endTick: 0, ts, dIdx: 0, dLock: 0, dCool: 0 };
}

export function clone(s: State): State {
  const ts = new Array<TS>(s.ts.length);
  for (let i = 0; i < ts.length; i++) { const a = s.ts[i]; ts[i] = { x: a.x, y: a.y, vy: a.vy, m: a.m, t: a.t, n: a.n }; }
  return { ...s, ts };
}

const tileSolid = (L: Compiled, c: number, r: number) => c < 0 || c >= COLS || r < 0 ? true : r >= ROWS ? false : L.solid[r * COLS + c] === 1;

export function crumbleRect(d: Extract<TrapDef, { k: 'crumble' }>) { return { x: d.c * T, y: d.r * T, w: d.n * T, h: T }; }

function overlapSolid(L: Compiled, s: State, x: number, y: number): boolean {
  const c0 = Math.floor(x / T), c1 = Math.floor((x + HW - 1e-6) / T), r0 = Math.floor(y / T), r1 = Math.floor((y + HH - 1e-6) / T);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (tileSolid(L, c, r)) return true;
  const tr = L.def.traps;
  for (let i = 0; i < tr.length; i++) {
    const d = tr[i]; if (d.k !== 'crumble' || s.ts[i].m >= 2) continue;
    const q = crumbleRect(d);
    if (x < q.x + q.w && x + HW > q.x && y < q.y + q.h && y + HH > q.y) return true;
  }
  return false;
}

const hits = (ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) => ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;

export function sawPos(d: Extract<TrapDef, { k: 'saw' }>, tick: number): [number, number] {
  const x0 = d.x0 * T, y0 = d.y0 * T, x1 = d.x1 * T, y1 = d.y1 * T, len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const m = (tick * d.speed + d.phase) % (2 * len), p = (m < len ? m : 2 * len - m) / len;
  return [x0 + (x1 - x0) * p, y0 + (y1 - y0) * p];
}
export const popUp = (d: Extract<TrapDef, { k: 'pop' }>, tick: number) => ((tick + d.phase) % d.period) < d.up;
export const popWarn = (d: Extract<TrapDef, { k: 'pop' }>, tick: number) => !popUp(d, tick) && ((tick + d.phase + 14) % d.period) < d.up;
export function doorRect(L: Compiled, s: State) { const [c, r] = L.door[s.dIdx]; return { x: c * T + 3, y: (r - 1) * T + 2, w: 12, h: 2 * T - 2 }; }

export function stalkerTop(d: Extract<TrapDef, { k: 'stalker' }>) { return d.r * T; }

function groundBelow(L: Compiled, x: number, from: number): number {
  const c = Math.floor(x / T); let r = Math.floor(from / T);
  while (r < ROWS && !tileSolid(L, c, r)) r++;
  return r * T;
}

export type Ev = string[] | undefined;

/** The shy door watches the REAL hero: get close and it hops to its next spot (then it ignores you for a moment). */
export const SHY_RADIUS = 48, SHY_TICKS = 2, SHY_COOLDOWN = 70;
function shyDoor(L: Compiled, s: State, ev: Ev) {
  if (s.dIdx >= L.door.length - 1) return; // the last spot is the real one: it stays put
  const [c, r] = L.door[s.dIdx];
  const d = Math.hypot(s.x + HW / 2 - (c * T + 9), s.y + HH / 2 - r * T);
  s.dLock = d < SHY_RADIUS ? s.dLock + 1 : 0;
  if (s.dLock >= SHY_TICKS && s.dCool <= 0) { s.dIdx++; s.dLock = 0; s.dCool = SHY_COOLDOWN; ev?.push('hop'); }
}

export function step(L: Compiled, s: State, inp: number, ev?: Ev) {
  if (s.dead || s.won) return;
  shyDoor(L, s, ev);
  if (s.dCool > 0) s.dCool--;
  const tr = L.def.traps, hcx = s.x + HW / 2;

  // ---- traps
  for (let i = 0; i < tr.length; i++) {
    const d = tr[i], q = s.ts[i];
    if (d.k === 'drop') {
      if (q.m === 0) {
        if (q.t > 0) q.t--;
        else if (Math.abs(hcx - (q.x + 8)) < d.trig && s.y > q.y + 8) { q.m = 1; q.vy = 0; ev?.push('dropStart'); }
      } else if (q.m === 1) {
        q.vy = Math.min(q.vy + 0.6, 8.5); q.y += q.vy;
        const bottom = q.y + 16, gy = groundBelow(L, q.x + 8, q.y + 8);
        if (bottom >= gy) { q.y = gy - 16; q.m = 2; q.t = 34; ev?.push('thud'); }
      } else if (q.m === 2) { if (--q.t <= 0) q.m = 3; }
      else { q.y -= 1.1; if (q.y <= q.n) { q.y = q.n; q.m = 0; q.t = 40; } }
    } else if (d.k === 'crumble') {
      if (q.m === 1) { if (--q.t <= 0) { q.m = 2; q.t = 170; ev?.push('crumble'); } }
      else if (q.m === 2) {
        if (--q.t <= 0) { const r = crumbleRect(d); if (!hits(s.x, s.y, HW, HH, r.x, r.y - 2, r.w, r.h + 4)) q.m = 0; else q.t = 6; }
      }
    } else if (d.k === 'spring') { if (q.t > 0) q.t--; }
    else if (d.k === 'stalker') {
      const lo = d.c0 * T + 9, hi = d.c1 * T + 9;
      if (q.m === 0) {
        // chases where the hero actually is (a little ahead if running); slams down once it is lined up above you
        const tx = Math.max(lo, Math.min(hi, hcx + s.vx * STALK_LEAD)), dx = tx - q.x;
        if (Math.abs(dx) > STALK_SPEED) q.x += Math.sign(dx) * STALK_SPEED; else q.x = tx;
        if (Math.abs(tx - q.x) < 3 && Math.abs(hcx - q.x) < STALK_NEAR) q.t++; else q.t = Math.max(0, q.t - 2);
        if (q.t >= STALK_TICKS) { q.m = 1; q.vy = 0; ev?.push('stalkSlam'); }
      } else if (q.m === 1) {
        q.vy = Math.min(q.vy + 0.7, 9); q.y += q.vy;
        const gy = groundBelow(L, q.x, d.r * T + 12);
        if (q.y >= gy) { q.y = gy; q.m = 2; q.t = 30; ev?.push('thud'); }
      } else if (q.m === 2) { if (--q.t <= 0) q.m = 3; }
      else { q.y -= 2.2; if (q.y <= d.r * T + 8) { q.y = d.r * T + 8; q.m = 0; q.t = 0; } }
    }
  }

  // ---- hero
  const dir = (inp & RIGHT ? 1 : 0) - (inp & LEFT ? 1 : 0);
  if (dir) s.face = dir;
  const acc = s.ground ? ACC_G : ACC_A;
  if (dir) {
    if (Math.sign(s.vx) === -dir) s.vx += dir * (acc + 0.2); else s.vx += dir * acc;
    if (s.vx > RUN) s.vx = RUN; if (s.vx < -RUN) s.vx = -RUN;
  } else {
    const f = s.ground ? FRIC_G : FRIC_A;
    if (Math.abs(s.vx) <= f) s.vx = 0; else s.vx -= Math.sign(s.vx) * f;
  }
  if (s.ground) s.coy = COYOTE; else if (s.coy > 0) s.coy--;
  if ((inp & JUMP) && s.coy > 0) { s.vy = -JUMP_V; s.coy = 0; s.ground = false; s.lastJump = s.tick; ev?.push('jump'); }
  else if (!(inp & JUMP) && s.vy < -1.7) s.vy = -1.7;
  s.vy = Math.min(s.vy + GRAV, MAXFALL);

  // move x
  { const n = Math.max(1, Math.ceil(Math.abs(s.vx))), dx = s.vx / n;
    for (let k = 0; k < n; k++) { if (overlapSolid(L, s, s.x + dx, s.y)) { s.vx = 0; break; } s.x += dx; } }
  // move y
  { const n = Math.max(1, Math.ceil(Math.abs(s.vy))), dy = s.vy / n; let hit = false;
    for (let k = 0; k < n; k++) { if (overlapSolid(L, s, s.x, s.y + dy)) { hit = true; break; } s.y += dy; }
    if (hit) { const wasFall = s.vy > 0; if (wasFall && !s.ground && s.vy > 2.4) ev?.push('land'); s.ground = wasFall; s.vy = 0; }
    else s.ground = false; }

  // springs & crumble triggers
  for (let i = 0; i < tr.length; i++) {
    const d = tr[i], q = s.ts[i];
    if (d.k === 'spring') {
      if (s.vy >= 0 && hits(s.x, s.y, HW, HH, d.c * T + 1, d.r * T + 9, T - 2, 9) && s.y + HH <= d.r * T + 16) {
        s.vy = -(d.power ?? 7.2); s.ground = false; s.coy = 0; q.t = 14; ev?.push('spring');
      }
    } else if (d.k === 'crumble' && q.m === 0 && s.ground) {
      const r = crumbleRect(d);
      if (s.x + HW > r.x && s.x < r.x + r.w && Math.abs(s.y + HH - r.y) < 1.5) { q.m = 1; q.t = 20; ev?.push('shake'); }
    }
  }

  // ---- death / win
  const kill = (cause: string) => { s.dead = true; s.cause = cause; s.endTick = s.tick; ev?.push('die'); };
  const hx = s.x + 1, hy = s.y + 1, hw = HW - 2, hh = HH - 2;
  if (s.y > H + 8) kill('pit');
  else {
    for (const k of L.spikes) if (hits(hx, hy, hw, hh, k.x, k.y, k.w, k.h)) { kill('spikes'); break; }
    if (!s.dead) for (let i = 0; i < tr.length && !s.dead; i++) {
      const d = tr[i], q = s.ts[i];
      if (d.k === 'pop') { if (popUp(d, s.tick) && hits(hx, hy, hw, hh, d.c * T + 3, d.r * T + 8, 12, 10)) kill('spikes'); }
      else if (d.k === 'saw') { const [px, py] = sawPos(d, s.tick); if (hits(hx, hy, hw, hh, px - 6, py - 6, 12, 12)) kill('saw'); }
      else if (d.k === 'drop') { if (hits(hx, hy, hw, hh, q.x, q.y, 16, 16)) kill('thwomp'); }
      else if (d.k === 'stalker') { const top = d.r * T; if (hits(hx, hy, hw, hh, q.x - 8, top, 16, q.y - top)) kill('stalker'); }
    }
  }
  if (!s.dead) { const r = doorRect(L, s); if (hits(s.x, s.y, HW, HH, r.x, r.y, r.w, r.h)) { s.won = true; s.endTick = s.tick; ev?.push('win'); } }
  s.tick++;
}

