// audio.mjs: render the soundtrack in headless Chromium, mix it down to a
// WAV in output/, and print loudness per section (for checking the mix).
//   node tools/audio.mjs
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const out = fileURLToPath(new URL('../output/', import.meta.url));
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
await page.goto(new URL('../index.html?test', import.meta.url).href);
await page.waitForFunction(() => window.LUMINAL && LUMINAL.game && LUMINAL.game.audioDone, null, { timeout: 300000 });
const info = await page.evaluate(async () => {
  const g = LUMINAL.game;
  const b = await LUMINAL.mixdown(g.chunks);
  const L0 = b.getChannelData(0), R0 = b.getChannelData(1);
  const sr = b.sampleRate, beat = LUMINAL.BEAT;
  const rows = [];
  for (let bar = 0; bar < 64; bar += 4) {
    const a = Math.floor(bar * 4 * beat * sr), z = Math.floor((bar + 4) * 4 * beat * sr);
    let sum = 0, pk = 0;
    for (let i = a; i < z; i++) { const v = (L0[i] + R0[i]) / 2; sum += v * v; pk = Math.max(pk, Math.abs(L0[i]), Math.abs(R0[i])); }
    rows.push({ bar, rms: Math.sqrt(sum / (z - a)), peak: pk });
  }
  const n = L0.length;
  const buf = new ArrayBuffer(44 + n * 4);
  const dv = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true); dv.setUint32(24, sr, true);
  dv.setUint32(28, sr * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) {
    dv.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L0[i])) * 32767, true);
    dv.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R0[i])) * 32767, true);
  }
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
  return { rows, first: g.renderMs, all: g.renderAllMs, wav: btoa(s), seconds: n / sr };
});
await writeFile(out + 'heliotrope.wav', Buffer.from(info.wav, 'base64'));
console.log(`first chunk ready in ${(info.first / 1000).toFixed(2)} s; whole song (${info.seconds.toFixed(1)} s) in ${(info.all / 1000).toFixed(2)} s`);
for (const r of info.rows) console.log(`bars ${String(r.bar).padStart(2)}-${String(r.bar + 3).padStart(2)}  rms ${(20 * Math.log10(r.rms + 1e-9)).toFixed(1)} dBFS  peak ${r.peak.toFixed(3)}`);
await browser.close();
