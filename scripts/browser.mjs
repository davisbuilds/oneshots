// Shared browser policy for every active verifier and renderer.
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const policy = JSON.parse(readFileSync(new URL('./browser-policy.json', import.meta.url), 'utf8'));
export function assertSafeBrowserVersion(version) {
  const parts = /^\d+\.\d+\.\d+\.\d+$/.test(version) ? version.split('.').map(Number) : null;
  const minimum = policy.minimumVersion.split('.').map(Number);
  const first = parts?.findIndex((part, i) => part !== minimum[i]);
  if (!parts || (first !== -1 && parts[first] < minimum[first])) {
    throw new Error(`Unsafe or unknown Chrome/Chromium version ${version}; require >= ${policy.minimumVersion} (${policy.advisory}). Update Chrome or CHROMIUM_PATH; bundled Chromium is never a fallback.`);
  }
}

export async function launchBrowser(options = {}, browserType = chromium, env = process.env) {
  // Only CHROMIUM_PATH can override the default Chrome channel. Validate the
  // launched process, rather than a plist or an executable's --version output.
  const { channel, executablePath, ...rest } = options;
  const target = env.CHROMIUM_PATH ? { executablePath: env.CHROMIUM_PATH } : { channel: 'chrome' };
  const browser = await browserType.launch({ ...rest, ...target });
  try {
    const version = browser.version();
    assertSafeBrowserVersion(version); // before the caller can create a page
    console.log(`Browser: Chrome/Chromium ${version}`);
    return browser;
  } catch (error) {
    await browser.close();
    throw error;
  }
}
