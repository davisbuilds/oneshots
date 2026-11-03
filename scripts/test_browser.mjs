import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertSafeBrowserVersion, launchBrowser } from './browser.mjs';

test('reject vulnerable and unknown versions, accept fixed boundary and newer major', () => {
  for (const version of ['155.0.9000.99', '156.0.8078.4', '156.0.8078.78', '', 'Chrome/157.0.8103.39', '157.0.1']) {
    assert.throws(() => assertSafeBrowserVersion(version), /Unsafe or unknown/);
  }
  for (const version of ['156.0.8078.79', '156.0.8078.80', '157.0.8103.39']) {
    assert.doesNotThrow(() => assertSafeBrowserVersion(version));
  }
});

test('reject and close actual launched version before returning a browser', async () => {
  let closed = false;
  let launched;
  const browserType = { launch: async options => {
    launched = options;
    return { version: () => '156.0.8078.4', close: async () => { closed = true; } };
  } };
  await assert.rejects(launchBrowser({}, browserType, { CHROMIUM_PATH: '/explicit/chromium' }), /156.0.8078.4/);
  assert.equal(closed, true);
  assert.deepEqual(launched, { executablePath: '/explicit/chromium' });
});

test('default Chrome channel is retained and launch failure cannot fallback', async () => {
  let calls = 0;
  const browserType = { launch: async options => {
    calls++;
    assert.deepEqual(options, { headless: true, channel: 'chrome' });
    throw new Error('Chrome missing');
  } };
  await assert.rejects(launchBrowser({ headless: true }, browserType, {}), /Chrome missing/);
  assert.equal(calls, 1);
});
