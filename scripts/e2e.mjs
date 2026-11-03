// Plays every level in a real browser using the solver's input script and checks the game registers a win.
import { chromium } from 'playwright'; import fs from 'node:fs';
const sols = JSON.parse(fs.readFileSync('src/solutions.json', 'utf8'));
const url = process.argv[2] || 'http://127.0.0.1:4173/';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto(url + '?level=1'); await p.waitForTimeout(800);
let fail = 0;
for (let n = 1; n <= 14; n++) {
  const r = await p.evaluate(async ([n, rle]) => {
    const S = window.__spoiler; S.start(n - 1); S.run(rle);
    const t0 = performance.now();
    while (performance.now() - t0 < 40000) { await new Promise(r => setTimeout(r, 50)); if (S.game.s.won) return { won: true, ms: performance.now() - t0, deaths: S.game.levelDeaths }; if (S.game.s.dead) return { won: false, dead: true }; }
    return { won: false, timeout: true };
  }, [n, sols[n]]);
  console.log('L' + n, JSON.stringify(r)); if (!r.won) fail++;
}
console.log('errors:', errs.length ? errs : 'none'); await b.close(); process.exit(fail ? 1 : 0);
