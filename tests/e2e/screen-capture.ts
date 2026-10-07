import type { Page } from '@playwright/test';

export async function prepareFullPageScreenshot(page: Page): Promise<void> {
  const { pageHeight, viewportHeight } = await page.evaluate(() => ({
    pageHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
  }));
  for (let top = 0; top < pageHeight; top += Math.max(1, viewportHeight * 0.75)) {
    await page.evaluate((scrollTop) => window.scrollTo(0, scrollTop), top);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

export async function captureThemeScreenshots(page: Page, name: string): Promise<void> {
  await prepareFullPageScreenshot(page);
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.screenshot({ path: `docs/screenshots/${name}-${theme}.png`, fullPage: true, animations: 'disabled' });
  }
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
}
