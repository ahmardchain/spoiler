import { LEFT, RIGHT, JUMP } from './sim';
const down = new Set<string>();
let touch = 0;
const MAP: Record<string, number> = { ArrowLeft: LEFT, KeyA: LEFT, ArrowRight: RIGHT, KeyD: RIGHT, ArrowUp: JUMP, KeyW: JUMP, Space: JUMP, KeyZ: JUMP, KeyX: JUMP };
export let override: number | null = null; // used by the scripted demo / tests
export function setOverride(v: number | null) { override = v; }
export function held(): number {
  if (override !== null) return override;
  let m = touch; for (const k of down) m |= MAP[k] ?? 0; return m;
}
export function initInput(onKey: (code: string) => void) {
  addEventListener('keydown', e => { if (MAP[e.code] !== undefined || e.code === 'Space') e.preventDefault(); if (!e.repeat) onKey(e.code); down.add(e.code); });
  addEventListener('keyup', e => down.delete(e.code));
  addEventListener('blur', () => { down.clear(); touch = 0; });
  const bind = (id: string, bit: number) => {
    const el = document.getElementById(id); if (!el) return; const set = new Set<number>();
    const upd = () => { touch = (touch & ~bit) | (set.size ? bit : 0); el.classList.toggle('on', set.size > 0); };
    el.addEventListener('pointerdown', e => { e.preventDefault(); el.setPointerCapture(e.pointerId); set.add(e.pointerId); upd(); onKey('touch'); });
    const end = (e: PointerEvent) => { set.delete(e.pointerId); upd(); };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('lostpointercapture', end);
  };
  bind('b-left', LEFT); bind('b-right', RIGHT); bind('b-jump', JUMP);
}
