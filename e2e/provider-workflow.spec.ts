import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
let background: string;
test.beforeAll(async () => {
  const result = await build({
    entryPoints: ['src/extension/background.ts'],
    bundle: true,
    write: false,
    format: 'iife',
    target: 'chrome120',
  });
  background = result.outputFiles[0].text;
});
test.beforeEach(async ({ page }) => {
  // Exercise the real background router, vault and provider code. Only Chrome's
  // browser API boundary is emulated; provider HTTP is intercepted, never billed.
  await page.addInitScript(() => {
    const listeners: ((changes: Record<string, unknown>, area: string) => void)[] = [];
    let handler: (message: unknown, sender: unknown, respond: (value: unknown) => void) => void;
    const area = (name: string) => {
      const backing = name === 'session' ? sessionStorage : localStorage,
        prefix = `fp-test-${name}`;
      const read = () => JSON.parse(backing.getItem(prefix) || '{}');
      return {
        setAccessLevel: async () => {},
        get: async (keys: string | string[] | null) => {
          const data = read();
          return keys === null
            ? data
            : Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map((k) => [k, data[k]]));
        },
        set: async (values: Record<string, unknown>) => {
          const data = read(),
            changes: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(values)) {
            changes[key] = { oldValue: data[key], newValue: value };
            data[key] = value;
          }
          backing.setItem(prefix, JSON.stringify(data));
          for (const listener of listeners) listener(changes, name);
        },
        remove: async (key: string) => {
          const data = read();
          delete data[key];
          backing.setItem(prefix, JSON.stringify(data));
        },
        clear: async () => {
          backing.removeItem(prefix);
        },
      };
    };
    Object.defineProperty(window, 'chrome', {
      configurable: true,
      value: {
        runtime: {
          id: 'fp-test',
          getURL: (path: string) => `chrome-extension://fp-test/${path}`,
          onInstalled: { addListener: () => {} },
          onMessage: {
            addListener: (fn: typeof handler) => {
              handler = fn;
            },
          },
          sendMessage: (message: unknown) =>
            new Promise((resolve) =>
              handler(
                message,
                { id: 'fp-test', url: 'chrome-extension://fp-test/index.html' },
                resolve,
              ),
            ),
        },
        storage: {
          local: area('local'),
          sync: area('sync'),
          session: area('session'),
          onChanged: {
            addListener: (fn: (typeof listeners)[number]) => listeners.push(fn),
            removeListener: (fn: (typeof listeners)[number]) => {
              const i = listeners.indexOf(fn);
              if (i >= 0) listeners.splice(i, 1);
            },
          },
        },
      },
    });
  });
  await page.addInitScript({ content: background });
});
test('provider UI saves encrypted keys, survives reload and genuinely tests current settings', async ({
  page,
}) => {
  const calls: { url: string; model: string; key: string | undefined }[] = [];
  await page.route('https://api.openai.com/**', async (route) => {
    const request = route.request();
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization,content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    const body = request.postDataJSON();
    calls.push({ url: request.url(), model: body.model, key: request.headers().authorization });
    if (body.model === 'missing-model') {
      await route.fulfill({
        status: 404,
        headers,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'model not found' } }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      headers,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                answers: [{ questionId: 'test', questionType: 'text', answer: '4', confidence: 1 }],
              }),
            },
          },
        ],
      }),
    });
  });
  await page.goto('/#providers');
  await page.getByRole('button', { name: 'Set up vault', exact: true }).click();
  await page.getByLabel('Vault passphrase', { exact: true }).fill('test vault passphrase long');
  await page.getByRole('button', { name: 'Create vault', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your API vault is unlocked' })).toBeVisible();
  const openAI = () =>
    page
      .locator('.provider-card')
      .filter({ has: page.getByRole('heading', { name: 'OpenAI', exact: true }) });
  await openAI().getByRole('button', { name: 'Configure' }).click();
  await page.getByLabel('Model ID', { exact: true }).fill('test-model');
  await page
    .getByLabel('API endpoint (base or full operation URL)', { exact: true })
    .fill('https://api.openai.com/v1/chat/completions');
  await page.getByLabel('API key', { exact: true }).fill('sk-fake-e2e-only');
  await page.getByRole('button', { name: 'Save & test connection', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Connected.' })).toBeVisible();
  expect(calls).toHaveLength(1);
  expect(calls[0]).toEqual({
    url: 'https://api.openai.com/v1/chat/completions',
    model: 'test-model',
    key: 'Bearer sk-fake-e2e-only',
  });
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(openAI()).toContainText('Key saved');
  expect(await page.evaluate(() => localStorage.getItem('fp-test-local'))).not.toContain(
    'sk-fake-e2e-only',
  );
  await page.reload();
  await expect(openAI()).toContainText('Key saved');
  await expect(openAI()).toContainText('test-model');
  await openAI().getByRole('button', { name: 'Configure' }).click();
  await expect(page.getByLabel('Replace API key (leave blank to keep)')).toHaveValue('');
  await page.getByRole('button', { name: 'Save & test connection', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Connected.' })).toBeVisible();
  expect(calls).toHaveLength(2);
  expect(calls[1].key).toBe('Bearer sk-fake-e2e-only');
  await page.getByLabel('Model ID', { exact: true }).fill('missing-model');
  await page.getByRole('button', { name: 'Save & test connection', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'HTTP 404: Endpoint or model not found',
  );
  expect(calls).toHaveLength(3);
  expect(calls[2].model).toBe('missing-model');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Export everything' }).click();
  await page.getByLabel('Also include readable API keys (sensitive)').check();
  page.on('dialog', (dialog) => dialog.accept());
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download complete backup' }).click(),
  ]);
  const fs = await import('node:fs/promises');
  const data = JSON.parse(await fs.readFile((await download.path())!, 'utf8'));
  expect(data.apiKeys.openai).toBe('sk-fake-e2e-only');
  expect(data.providers.find((p: { id: string }) => p.id === 'openai').model).toBe('missing-model');
  expect(data.vault.data.length).toBeGreaterThan(16);
  expect(data).not.toHaveProperty('vaultKey');
});

test('OpenRouter keeps a verified key and failed model diagnostic, then uses an explicitly chosen catalog model', async ({
  page,
}) => {
  const key = 'sk-or-fake-browser-only',
    calls: {
      path: string;
      method: string;
      model?: string;
      key?: string;
      body?: Record<string, unknown>;
    }[] = [];
  await page.route('https://openrouter.ai/**', async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization,content-type',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    };
    if (req.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    const body = req.method() === 'POST' ? req.postDataJSON() : undefined;
    calls.push({
      path,
      method: req.method(),
      key: req.headers().authorization,
      model: body?.model,
      body,
    });
    let response: unknown,
      status = 200;
    if (path.endsWith('/key')) response = { data: { label: 'private-account-metadata' } };
    else if (path.endsWith('/models'))
      response = {
        data: [
          { id: 'vendor/current:free', name: 'Current free model' },
          { id: 'vendor/paid', name: 'Paid model' },
        ],
      };
    else if (body?.model === 'vendor/missing') {
      status = 404;
      response = {
        error: {
          message: `No endpoints found for selected model. ${key}`,
          metadata: { raw: 'private-provider-metadata' },
        },
      };
    } else
      response = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                answers: [{ questionId: 'test', questionType: 'text', answer: '4', confidence: 1 }],
              }),
            },
          },
        ],
      };
    await route.fulfill({
      status,
      headers,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });
  await page.goto('/#providers');
  await page.getByRole('button', { name: 'Set up vault', exact: true }).click();
  await page.getByLabel('Vault passphrase', { exact: true }).fill('a long browser test passphrase');
  await page.getByRole('button', { name: 'Create vault', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your API vault is unlocked' })).toBeVisible();
  const card = page
    .locator('.provider-card')
    .filter({ has: page.getByRole('heading', { name: 'OpenRouter', exact: true }) });
  await card.getByRole('button', { name: 'Configure' }).click();
  await page.getByLabel('Model ID', { exact: true }).fill('vendor/missing');
  await page.getByLabel('API key', { exact: true }).fill(key);
  await page.getByRole('button', { name: 'Save & test connection', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toContainText('API key verified and saved');
  await expect(dialog.getByRole('alert')).toContainText('No endpoints found');
  await expect(dialog).not.toContainText(key);
  await expect(dialog).not.toContainText('private-provider-metadata');
  await expect(dialog).not.toContainText('private-account-metadata');
  await expect(dialog).toContainText('API key saved securely');
  expect(calls.map((c) => c.path)).toEqual(['/api/v1/key', '/api/v1/chat/completions']);
  expect(calls[1].body).not.toHaveProperty('response_format');
  expect(calls[1].body).not.toHaveProperty('temperature');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.reload();
  await expect(card).toContainText('Key verified · model test failed');
  await card.getByRole('button', { name: 'Configure' }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toContainText('No endpoints found');
  await expect(page.getByLabel('Replace API key (leave blank to keep)')).toHaveValue('');
  await expect(dialog).toContainText('API key saved securely');
  expect(await page.evaluate(() => localStorage.getItem('fp-test-local'))).not.toContain(key);
  await page.getByRole('button', { name: 'Load available OpenRouter models', exact: true }).click();
  await expect(
    page.getByRole('combobox', { name: 'Available OpenRouter models', exact: true }),
  ).toBeVisible();
  expect(calls[2].key).toBeUndefined();
  await expect(page.getByLabel('Model ID', { exact: true })).toHaveValue('vendor/missing');
  await page
    .getByRole('combobox', { name: 'Available OpenRouter models', exact: true })
    .selectOption('vendor/current:free');
  await page.getByRole('button', { name: 'Save & test connection', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Connected.' })).toBeVisible();
  expect(calls[4].key).toBe(`Bearer ${key}`);
  expect(calls[4].model).toBe('vendor/current:free');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.reload();
  await card.getByRole('button', { name: 'Configure' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Connected.' })).toBeVisible();
  await expect(page.getByLabel('Model ID', { exact: true })).toHaveValue('vendor/current:free');
});
