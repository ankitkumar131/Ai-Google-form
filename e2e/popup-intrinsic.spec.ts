import { expect, test } from '@playwright/test';
import { initialState } from '../src/shared/defaults';
test('extension-mode document has intrinsic size even when the initial viewport is tiny', async ({
  page,
}) => {
  // This emulates the Chrome API boundary and initial sizing, NOT a native action
  // popup. Chrome installation and toolbar positioning still need a manual check.
  await page.setViewportSize({ width: 32, height: 16 });
  await page.addInitScript((state) => {
    Object.defineProperty(screen, 'availWidth', { value: 1366 });
    Object.defineProperty(screen, 'availHeight', { value: 768 });
    Object.defineProperty(window, 'chrome', {
      value: {
        runtime: { id: 'popup-test', sendMessage: async () => ({ ok: true, data: state }) },
        tabs: { query: async () => [{ id: 1, url: 'https://example.org/form' }] },
        storage: {
          session: { get: async () => ({}) },
          onChanged: { addListener: () => {}, removeListener: () => {} },
        },
      },
    });
  }, initialState());
  await page.goto('/popup.html');
  await expect(page.locator('.popup')).toBeAttached();
  const dimensions = await page.evaluate(() =>
    ['html', 'body', '#root', '.popup'].map((selector) => {
      const rect = document.querySelector(selector)!.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }),
  );
  expect(dimensions).toEqual(Array(4).fill({ width: 384, height: 560 }));
  await page.setViewportSize({ width: 384, height: 560 });
  await expect(page.getByRole('button', { name: 'Answer all', exact: true })).toBeInViewport();
  await expect(page.locator('.popup-footer')).toBeInViewport();
  await page.locator('.popup-content').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(page.getByRole('button', { name: 'Open dashboard' })).toBeInViewport();
});
test('before JavaScript, the popup already has a sized nonblank fallback', async ({ browser }) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 384, height: 560 },
  });
  try {
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:5173/popup.html');
    await expect(page.getByText('Opening your form assistant…')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open full dashboard' })).toBeInViewport();
    expect(
      await page.locator('html').evaluate((el) => ({
        width: el.getBoundingClientRect().width,
        height: el.getBoundingClientRect().height,
      })),
    ).toEqual({ width: 384, height: 560 });
  } finally {
    await context.close();
  }
});
