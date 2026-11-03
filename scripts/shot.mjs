import { chromium } from 'playwright';
const [,, url, out, wait = '800', ...acts] = process.argv;
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('console', m => { if (m.type() === 'error') console.log('console:', m.text()); }); p.on('pageerror', e => console.log('pageerror', e.message));
await p.goto(url); await p.waitForTimeout(+wait);
for (const a of acts) { if (a.startsWith('eval:')) await p.evaluate(a.slice(5)); else if (a.startsWith('wait:')) await p.waitForTimeout(+a.slice(5)); else if (a.startsWith('key:')) await p.keyboard.press(a.slice(4)); }
await p.screenshot({ path: out }); await b.close();
