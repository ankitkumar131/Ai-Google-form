import { expect, test } from '@playwright/test';
test('dashboard provides honest empty states and install instructions', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'A little less filling. A lot more living.' }),
  ).toBeVisible();
  await expect(page.getByText('Web preview', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Answer all', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('The web preview cannot access your tabs');
  await page.getByRole('button', { name: 'Sounds good' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(errors).toEqual([]);
});
test('create, persist, edit and delete a profile and confirmed answer', async ({ page }) => {
  await page.goto('/#profiles');
  await page.getByRole('button', { name: 'Create your first profile' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Profile name', { exact: true }).fill('Job search');
  await dialog.getByLabel('First name', { exact: true }).fill('Alex');
  await dialog.getByLabel('Last name', { exact: true }).fill('Lee');
  await dialog.getByLabel('Email address', { exact: true }).fill('alex@example.com');
  await dialog.getByLabel('City', { exact: true }).fill('Pune');
  await dialog.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Job search', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('alex@example.com', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Question bank', exact: true }).click();
  await page.getByRole('button', { name: 'Save an answer' }).click();
  await page.getByLabel('Question', { exact: true }).fill('Why would you like to join our team?');
  await page.getByLabel('Your confirmed answer').fill('I want to build thoughtful software.');
  await page.getByRole('button', { name: 'Confirm & save', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Why would you like to join our team?' }),
  ).toBeVisible();
  await page.getByLabel('Search saved answers').fill('different');
  await expect(page.getByRole('heading', { name: 'No matching answers' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Why would you like to join our team?' }).click();
  await page.getByLabel('Your confirmed answer').fill('I enjoy creating useful tools.');
  await page.getByRole('button', { name: 'Confirm & save', exact: true }).click();
  await expect(page.getByText('I enjoy creating useful tools.')).toBeVisible();
  page.on('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Delete Why would you like to join our team?' }).click();
  await expect(page.getByText('Your words, ready for next time', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'My profiles', exact: true }).click();
  await page.getByRole('button', { name: 'Delete Job search' }).click();
  await expect(
    page.getByRole('heading', { name: 'Every good copilot gets to know you' }),
  ).toBeVisible();
});
test('settings persist and provider order can be changed', async ({ page }) => {
  await page.goto('/#settings');
  const toggle = page.getByRole('switch', { name: 'Keep existing answers' });
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await page.getByLabel('Minimum AI confidence').selectOption('0.95');
  await page.reload();
  await expect(page.getByLabel('Minimum AI confidence')).toHaveValue('0.95');
  await page.getByRole('link', { name: 'AI providers' }).click();
  await page.getByRole('button', { name: 'Move OpenAI up', exact: true }).click();
  await expect(page.locator('.provider-card').first()).toContainText('OpenAI');
  await page.reload();
  await expect(page.locator('.provider-card').first()).toContainText('OpenAI');
  await page.locator('.provider-card').first().getByRole('button', { name: 'Configure' }).click();
  await expect(page.getByRole('dialog')).toContainText('Configure OpenAI');
  await expect(page.getByLabel('API key', { exact: true })).toBeDisabled();
});
test('mobile navigation works without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'A little less filling. A lot more living.' }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'AI providers' }).click();
  await expect(page.getByRole('heading', { name: 'AI providers', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.provider-card').first().getByRole('button', { name: 'Configure' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
});
