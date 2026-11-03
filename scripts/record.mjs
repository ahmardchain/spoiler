// Records a 1920x1080 gameplay clip. Inputs are scripted (solver-bot output + deliberate mistakes); the game, sim and renderer are the real thing.
import { chromium } from 'playwright'; import fs from 'node:fs';
const sols = JSON.parse(fs.readFileSync('src/solutions.json', 'utf8'));
const url = process.argv[2] || 'http://127.0.0.1:4173/';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const T0 = Date.now();
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: 'clip/raw', size: { width: 1920, height: 1080 } } });
const p = await ctx.newPage();
await p.goto(url + '?level=1'); await p.waitForTimeout(1000);
const play = (n, rle) => p.evaluate(async ([n, rle]) => {
  const S = window.__spoiler; S.start(n - 1); S.run(rle);
  const t0 = performance.now();
  while (performance.now() - t0 < 16000) { await new Promise(r => setTimeout(r, 40)); if (S.game.s.won) return performance.now() - t0; }
  return -1;
}, [n, rle]);
const shot = async (name, ms) => { await p.waitForTimeout(ms); await p.screenshot({ path: `shots/${name}.png` }); };
const start = (Date.now() - T0) / 1000; console.log('trim start', start.toFixed(2));
// A: level 1 - run straight at the spikes (the corner window predicts the death), die, respawn, then dodge them
const a = play(1, [[2, 101], ...sols[1]]); await shot('01-predicted-death', 1100); await a; await p.waitForTimeout(600);
// B: level 6 - the stalker slams down where the window says you will be: panic, then beat it
const b6 = play(6, [[2, 77], ...sols[6]]); await shot('02-stalker-predicted', 1200); await b6; await p.waitForTimeout(600);
// C: level 7 - the door runs away from the future where you reach it
const c = play(7, sols[7]); await shot('03-shy-door', 2600); await c; await p.waitForTimeout(500);
// D: finale-ish level 14 for the screenshot set
const d = play(14, sols[14]); await shot('04-spoiler-alert', 2500); await d; await p.waitForTimeout(700);
console.log('total', ((Date.now() - T0) / 1000).toFixed(2));
await ctx.close(); await b.close();
