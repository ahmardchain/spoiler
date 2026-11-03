// Records the 1920x1080 / 60 fps demo clip WITH audio. Deterministic: Playwright's fake clock steps the real game one 60 Hz frame at a time and each frame is screenshotted.
// Inputs are scripted (solver-bot output + deliberate mistakes) - it is a bot demo, not a human playthrough. The game, sim and renderer are the real thing.
// Audio: every SFX the game triggers is logged with its (fake-clock) time, re-rendered offline with the game's own synth (src/audio.ts renderSfx), then mixed with the CC0 in-game music and normalised to -14 LUFS.
import { chromium } from 'playwright'; import fs from 'node:fs'; import { spawn, execFileSync, spawnSync } from 'node:child_process';
const sols = JSON.parse(fs.readFileSync('src/solutions.json', 'utf8'));
const url = process.argv[2] || 'http://localhost:4173/';
const FPS = 60, FRAME = 1000 / FPS;
fs.mkdirSync('clip/raw', { recursive: true });
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await (await b.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
await p.clock.install({ time: 1000 });
await p.goto(url + '?level=1'); await p.waitForTimeout(1500);
await p.clock.pauseAt(10000);
const base = await p.evaluate(() => Date.now());
await p.evaluate(() => { window.__spoiler.audio.sfxLog.length = 0; });

const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', 'clip/raw/video.mp4'], { stdio: ['pipe', 'inherit', 'inherit'] });
let frames = 0, tick0 = 0;
const frame = async (capture = true) => {
  await p.clock.runFor(FRAME);
  if (!capture) return;
  const buf = await p.screenshot({ type: 'jpeg', quality: 93 });
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  frames++;
};
const hold = async n => { for (let i = 0; i < n; i++) await frame(); };
const shotNames = {};
const segment = async (n, rle, shots = {}) => {
  await p.evaluate(([n, rle]) => { const S = window.__spoiler; S.start(n - 1); S.run(rle); }, [n, rle]);
  for (let i = 0; i < 60 * 14; i++) {
    await frame();
    if (shots[i]) { fs.writeFileSync(`clip/${shots[i]}.png`, await p.screenshot({ type: 'png' })); }
    if (await p.evaluate(() => window.__spoiler.game.s.won)) break;
  }
  await hold(24);
};
const t0 = await p.evaluate(() => window.__spoiler.game.titleT);
// A: level 1 - run straight at the spikes (die), respawn, then do it properly
await segment(1, [[2, 101], ...sols[1]]);
// B: level 6 - the stalker follows you; hesitate under it and it drops. Then run for real.
await segment(6, [[2, 60], [0, 50], ...sols[6]], { 100: 'rec-stalker' });
// C: level 7 - the door hops away when you get close
await segment(7, sols[7], { 120: 'rec-shy-door' });
// D: level 14 finale
await segment(14, sols[14]);
await hold(20);
const ticks = (await p.evaluate(() => window.__spoiler.game.titleT)) - t0;
const events = await p.evaluate(() => window.__spoiler.audio.sfxLog);
ff.stdin.end(); await new Promise(r => ff.on('close', r));
await b.close();
const secs = frames / FPS;
console.log(`frames ${frames} (${secs.toFixed(2)} s), sim ticks ${ticks} (expected ~${frames})`);
const ev = events.map(([t, name]) => [(t - base) / 1000, name]).filter(([t]) => t >= 0 && t < secs);
fs.writeFileSync('clip/raw/events.json', JSON.stringify(ev));
console.log('sfx events', ev.length, [...new Set(ev.map(e => e[1]))].join(','));

// ---- audio: offline-render the SFX with the game's own synth in a normal (un-faked) page
const b2 = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p2 = await b2.newPage(); await p2.goto(url); await p2.waitForTimeout(1200);
const b64 = await p2.evaluate(async ([ev, secs]) => {
  const f = await window.__spoiler.audio.renderSfx(ev, secs), i16 = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) i16[i] = Math.max(-1, Math.min(1, f[i])) * 32767;
  let s = ''; const u = new Uint8Array(i16.buffer); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s);
}, [ev, secs]);
await b2.close();
fs.writeFileSync('clip/raw/sfx.pcm', Buffer.from(b64, 'base64'));
const sh = (...a) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...a]);
sh('-f', 's16le', '-ar', '44100', '-ac', '1', '-i', 'clip/raw/sfx.pcm', 'clip/raw/sfx.wav');
// music (CC0 in-game loop at the game's own 0.28 volume) + SFX -> loudnorm to -14 LUFS (two pass)
const mix = `[0:a]volume=0.28,afade=t=in:d=0.4,afade=t=out:st=${(secs - 1.2).toFixed(2)}:d=1.2[m];[1:a]volume=1.0[s];[m][s]amix=inputs=2:normalize=0:duration=longest,atrim=0:${secs.toFixed(3)}`;
const LN = 'loudnorm=I=-14:TP=-1.5:LRA=9';
const r1 = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-stream_loop', '-1', '-i', 'public/assets/music-game.mp3', '-i', 'clip/raw/sfx.wav', '-filter_complex', `${mix},${LN}:print_format=json[o]`, '-map', '[o]', '-f', 'null', '-'], { encoding: 'utf8' });
const m = JSON.parse(r1.stderr.slice(r1.stderr.lastIndexOf('{'), r1.stderr.lastIndexOf('}') + 1));
console.log('measured', m.input_i, 'LUFS, TP', m.input_tp);
const ln2 = `${LN}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
sh('-stream_loop', '-1', '-i', 'public/assets/music-game.mp3', '-i', 'clip/raw/sfx.wav', '-filter_complex', `${mix},${ln2},alimiter=limit=0.84[o]`, '-map', '[o]', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', 'clip/raw/audio.m4a');
sh('-i', 'clip/raw/video.mp4', '-i', 'clip/raw/audio.m4a', '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'copy', '-t', secs.toFixed(3), '-movflags', '+faststart', 'clip/spoiler-clip.mp4');
// final trim: the AAC encode + limiter lands ~1.5 dB hot after loudnorm, so lower the gain to measure -14 LUFS on the muxed file
sh('-i', 'clip/raw/video.mp4', '-i', 'clip/raw/audio.m4a', '-map', '0:v', '-map', '1:a', '-af', 'volume=-1.5dB,alimiter=limit=0.84:level=false', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', secs.toFixed(3), '-movflags', '+faststart', 'clip/spoiler-clip.mp4');
console.log('wrote clip/spoiler-clip.mp4');
