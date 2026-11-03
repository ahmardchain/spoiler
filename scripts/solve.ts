import fs from 'node:fs';
import { LEVELS } from '../src/levels';
import { solve, replay } from '../src/bot';
fs.mkdirSync('solutions', { recursive: true });
const n = +process.argv[2], i = n - 1, beams = (process.argv[3] || '300,1000').split(',').map(Number);
const t0 = Date.now(); let r = null as ReturnType<typeof solve>;
for (const beam of beams) { r = solve(LEVELS[i], { beam, maxTicks: 1500 }); console.log(`L${n} beam ${beam}: ${r ? 'found' : 'none'} (${Date.now() - t0}ms)`); if (r) break; }
if (!r) { console.log(`L${n} ${LEVELS[i].name}: NO SOLUTION`); process.exit(1); }
const v = replay(LEVELS[i], r.rle);
console.log(`L${n} ${LEVELS[i].name}: ${v.won ? 'OK' : 'REPLAY FAIL'} ${(v.ticks / 60).toFixed(1)}s (${Date.now() - t0}ms)`);
if (v.won) fs.writeFileSync(`solutions/${n}.json`, JSON.stringify(r.rle));
