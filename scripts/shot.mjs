// usage: [VP=1920x1080] [DPR=1] [MOBILE=1] node scripts/shot.mjs url out wait [eval:.. | wait:ms | key:..]...
import { chromium } from 'playwright';
const [,, url, out, wait = '800', ...acts] = process.argv;
const [w, h] = (process.env.VP || '1280x720').split('x').map(Number);
const mobile = !!process.env.MOBILE;
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const p = await (await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: +(process.env.DPR || 1), isMobile: mobile, hasTouch: mobile })).newPage();
p.on('console', m => { if (m.type() === 'error') console.log('console:', m.text()); }); p.on('pageerror', e => console.log('pageerror', e.message));
await p.goto(url); await p.waitForTimeout(+wait);
for (const a of acts) { if (a.startsWith('eval:')) await p.evaluate(a.slice(5)); else if (a.startsWith('wait:')) await p.waitForTimeout(+a.slice(5)); else if (a.startsWith('key:')) await p.keyboard.press(a.slice(4)); }
await p.screenshot({ path: out }); await b.close();
