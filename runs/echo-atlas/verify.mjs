import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');
const browser = await chromium.launch();

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', error => errors.push(error.message));

  await page.addInitScript(() => {
    const NativeContext = window.AudioContext || window.webkitAudioContext;
    window.__echoAudioProbe = { context: null, analyser: null, master: null };

    class ProbedContext extends NativeContext {
      constructor(...args) {
        super(...args);
        const analyser = super.createAnalyser();
        analyser.fftSize = 512;
        window.__echoAudioProbe.context = this;
        window.__echoAudioProbe.analyser = analyser;
      }

      createGain() {
        const gain = super.createGain();
        if (!window.__echoAudioProbe.master) {
          const connect = gain.connect.bind(gain);
          const analyser = window.__echoAudioProbe.analyser;
          gain.connect = (destination, ...args) => {
            if (destination === this.destination) {
              connect(analyser);
              analyser.connect(destination);
              return destination;
            }
            return connect(destination, ...args);
          };
          window.__echoAudioProbe.master = gain;
        }
        return gain;
      }
    }

    window.AudioContext = ProbedContext;
    window.webkitAudioContext = ProbedContext;
  });

  await page.goto(new URL('./index.html', import.meta.url).href);
  await page.getByRole('button', { name: 'Sound off' }).click();

  const result = await page.evaluate(async () => {
    const { analyser, context } = window.__echoAudioProbe;
    const samples = new Float32Array(analyser.fftSize);
    let peak = 0;
    const started = performance.now();
    await new Promise(resolve => {
      function measure() {
        analyser.getFloatTimeDomainData(samples);
        for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
        if (performance.now() - started < 900) requestAnimationFrame(measure);
        else resolve();
      }
      measure();
    });
    return {
      peak,
      contextState: context.state,
      soundPressed: document.getElementById('sound').getAttribute('aria-pressed')
    };
  });

  assert.equal(result.contextState, 'running', 'sound activation resumes Web Audio');
  assert.equal(result.soundPressed, 'true', 'sound control reports its active state');
  assert.ok(result.peak >= 0.01, `sound activation emits an audible confirmation (peak ${result.peak.toFixed(5)})`);

  await page.waitForTimeout(1200);
  await page.mouse.click(640, 360);
  const strikePeak = await page.evaluate(async () => {
    const analyser = window.__echoAudioProbe.analyser;
    const samples = new Float32Array(analyser.fftSize);
    let peak = 0;
    const started = performance.now();
    await new Promise(resolve => {
      function measure() {
        analyser.getFloatTimeDomainData(samples);
        for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
        if (performance.now() - started < 900) requestAnimationFrame(measure);
        else resolve();
      }
      measure();
    });
    return peak;
  });
  assert.ok(strikePeak >= 0.01, `ringing the chamber emits sound (peak ${strikePeak.toFixed(5)})`);
  assert.deepEqual(errors, [], `browser errors: ${errors.join('\n')}`);
  console.log(`PASS sound activation peak ${result.peak.toFixed(3)}; chamber strike peak ${strikePeak.toFixed(3)}`);
} finally {
  await browser.close();
}
