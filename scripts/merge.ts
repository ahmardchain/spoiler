import fs from 'node:fs';
const out: Record<string, unknown> = {};
for (const f of fs.readdirSync('solutions')) if (f.endsWith('.json')) out[f.replace('.json', '')] = JSON.parse(fs.readFileSync('solutions/' + f, 'utf8'));
fs.writeFileSync('src/solutions.json', JSON.stringify(out)); console.log('merged', Object.keys(out).length, 'levels');
