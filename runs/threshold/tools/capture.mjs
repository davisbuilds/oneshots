import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browserSession, ready, until, output } from './browser.mjs';

const file = output + 'threshold-crossing.webm';
async function verify() {
  const meta = JSON.parse(
    execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file])
  );
  const stream = meta.streams.find((s) => s.codec_type === 'video'),
    seconds = Number(meta.format.duration);
  assert.equal(stream.codec_name, 'vp9');
  assert.equal(stream.width, 1280);
  assert.equal(stream.height, 720);
  assert.ok(seconds >= 8 && seconds <= 38, 'film duration ' + seconds);
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-i',
    file,
    '-fps_mode',
    'passthrough',
    '-enc_time_base',
    'demux',
    '-f',
    'null',
    '-',
  ]);
  assert.ok((await stat(file)).size > 100000);
  console.log('Gameplay film · ' + seconds.toFixed(1) + ' s · 1280 × 720 VP9');
}
if (process.argv.includes('--verify')) await verify();
else
  await browserSession(async (browser, url) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(url);
    await ready(page);
    // Keep the capture dimensions fixed when an expensive frame would normally
    // ask the adaptive renderer to resize the drawing buffer.
    await page.keyboard.press('i');
    await page.locator('#adaptive').uncheck();
    await page.locator('#hide-metrics').click();
    await page.getByRole('button', { name: 'Enter the atlas' }).click();
    await page.evaluate(() => {
      const stream = document.querySelector('canvas').captureStream(30);
      const recorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: 4200000,
      });
      const chunks = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      window.stopFilm = () =>
        new Promise((resolve) => {
          recorder.onstop = () => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.readAsDataURL(new Blob(chunks, { type: 'video/webm' }));
            stream.getTracks().forEach((t) => t.stop());
          };
          recorder.stop();
        });
      recorder.start();
    });
    await page.waitForTimeout(750);
    await page.keyboard.down('Shift');
    await until(page, 'w', () => threshold.inspect().id === '2');
    await until(page, 'w', () => threshold.inspect().pos[2] < 7);
    await page.waitForTimeout(650);
    await until(page, 'ArrowRight', () => {
      const [x, y] = threshold.inspect().quaternion;
      return 2 * (x * x + y * y) - 1 > 0.994;
    });
    await page.waitForTimeout(850);
    await until(page, 'w', () => threshold.inspect().id === '1');
    await until(page, 'w', () => threshold.inspect().pos[2] > 4.3);
    await until(page, 'ArrowRight', () => {
      const [x, y] = threshold.inspect().quaternion;
      return 2 * (x * x + y * y) - 1 < -0.994;
    });
    await page.keyboard.up('Shift');
    await page.waitForTimeout(1000);
    const video = await page.evaluate(() => window.stopFilm());
    const tmp = await mkdtemp(join(tmpdir(), 'threshold-film-'));
    try {
      const original = join(tmp, 'capture.webm');
      await writeFile(original, Buffer.from(video, 'base64'));
      // MediaRecorder emits a stream without a seek index. Remux its actual frames.
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', original, '-map', '0:v:0', '-c', 'copy', file]);
      await verify();
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
