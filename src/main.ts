import { Game } from './game';
import { loadAssets } from './render';
import { initInput } from './input';
import * as audio from './audio';
import { LEVELS } from './levels';
import { setOverride } from './input';
import { compile, initState, step } from './sim';

async function boot() {
  await loadAssets();
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  if (matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('touch')) document.body.classList.add('touch');
  const game = new Game(canvas);
  initInput(code => game.onKey(code));
  document.getElementById('loading')?.remove();
  const q = new URLSearchParams(location.search);
  audio.playMusic('title');
  if (q.has('level')) game.startLevel(+q.get('level')! - 1);
  if (q.has('select')) game.toSelect();
  game.start();
  // Hooks for the Playwright demo recorder and for debugging.
  (window as any).__spoiler = {
    game, LEVELS, audio, compile, initState, step, setInput: setOverride,
    run(seq: [number, number][], done?: () => void) { const a: number[] = []; for (const [i, n] of seq) for (let k = 0; k < n; k++) a.push(i); game.script = a; game.scriptPos = 0; game.scriptDone = done ?? null; },
    start: (i: number) => game.startLevel(i),
  };
}
boot();
