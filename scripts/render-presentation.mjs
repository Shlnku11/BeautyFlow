import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const presentationUrl = pathToFileURL(resolve(root, 'docs/presentation/index.html')).href + '?print-pdf';
  await page.goto(presentationUrl, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForFunction('window.BeautyFlowDeckReady === true', undefined, { timeout: 15_000 });
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: resolve(root, 'docs/presentation.pdf'), format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true });
} finally {
  await browser.close();
}
