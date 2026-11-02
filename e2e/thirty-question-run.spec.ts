import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import type { RunReport, Question } from '../src/shared/types';
import { initialState } from '../src/shared/defaults';
declare global {
  interface Window {
    runThirty: () => Promise<RunReport>;
    fixtureFilledCount: () => number;
  }
}
let script: string, html: string;
test.beforeAll(async () => {
  html = await readFile('tests/fixtures/google-forms-30.html', 'utf8');
  const result = await build({
    stdin: {
      contents: `import './src/extension/content'; import {runAll} from './src/extension/runner'; import {unlockVault} from './src/services/vault'; import {saveProviderConfiguration} from './src/services/provider-config'; import {defaultProviders} from './src/shared/defaults'; window.runThirty=async()=>{await unlockVault('synthetic test passphrase long'); await saveProviderConfiguration({...defaultProviders.find(p=>p.id==='custom'),model:'gemma4:31b',endpoint:'https://ollama.com/v1',enabled:true,retries:0,timeout:3000},'fake-browser-only-key');return runAll(1);};`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: 'iife',
    target: 'chrome120',
  });
  script = result.outputFiles[0].text;
});
test.beforeEach(async ({ page }) => {
  await page.addInitScript((state) => {
    const data: Record<string, Record<string, unknown>> = {
      local: state as unknown as Record<string, unknown>,
      session: {},
      sync: {},
    };
    const area = (name: string) => ({
      get: async (keys: string | string[] | null) =>
        keys === null
          ? structuredClone(data[name])
          : Object.fromEntries(
              (Array.isArray(keys) ? keys : [keys]).map((key) => [
                key,
                structuredClone(data[name][key]),
              ]),
            ),
      set: async (values: Record<string, unknown>) => {
        Object.assign(data[name], structuredClone(values));
      },
      remove: async (key: string) => {
        delete data[name][key];
      },
    });
    let handler: (message: unknown, sender: unknown, reply: (value: unknown) => void) => void;
    Object.defineProperty(window, 'chrome', {
      value: {
        runtime: {
          id: 'thirty-fixture',
          onMessage: {
            addListener: (fn: typeof handler) => {
              handler = fn;
            },
          },
        },
        tabs: {
          get: async () => ({ id: 1, url: location.href }),
          sendMessage: async (_id: number, message: unknown) =>
            new Promise((resolve) => handler(message, { id: 'thirty-fixture' }, resolve)),
        },
        webNavigation: { getAllFrames: async () => [{ frameId: 0 }] },
        storage: { local: area('local'), session: area('session'), sync: area('sync') },
      },
    });
  }, initialState());
  await page.route('https://docs.google.com/forms/d/e/thirty-fixture/viewform', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: html }),
  );
  await page.goto('https://docs.google.com/forms/d/e/thirty-fixture/viewform');
  await page.addScriptTag({ content: script });
});
function reply(q: Question & { questionId: string }, confidence = 0.99) {
  return {
    questionId: q.questionId,
    questionType: q.type,
    answer:
      q.type === 'radio'
        ? '4'
        : q.type === 'checkbox'
          ? ['2', '3']
          : q.type === 'select'
            ? 'Mars'
            : '9',
    confidence,
  };
}
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization,content-type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};
test('one run completes all 30 despite 4-of-10 partial answers, delayed choices and complete re-renders', async ({
  page,
}) => {
  test.setTimeout(60000);
  let requests = 0;
  const ids: string[][] = [];
  await page.route('https://ollama.com/v1/chat/completions', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    requests++;
    if (requests === 4) expect(await page.evaluate(() => window.fixtureFilledCount())).toBe(12);
    const body = route.request().postDataJSON();
    const questions = JSON.parse(
      body.messages[1].content.split('Untrusted question/profile data: ')[1],
    ).questions as (Question & { questionId: string })[];
    ids.push(questions.map((q) => q.questionId));
    await route.fulfill({
      status: 200,
      headers,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({ answers: questions.slice(0, 4).map((q) => reply(q)) }),
            },
          },
        ],
      }),
    });
  });
  const report = await page.evaluate(() => window.runThirty());
  expect(report.results).toHaveLength(30);
  expect(
    report.results.filter((r) => r.status === 'filled'),
    JSON.stringify(report.results.filter((r) => r.status !== 'filled')),
  ).toHaveLength(30);
  expect(await page.evaluate(() => window.fixtureFilledCount())).toBe(30);
  expect(requests).toBe(9);
  expect(ids.map((ids) => ids.length)).toEqual([10, 10, 10, 6, 6, 6, 2, 2, 2]);
  await expect(page.locator('#submissions')).toHaveText('0');
  const again = await page.evaluate(() => window.runThirty());
  expect(again.results.every((r) => r.status === 'skipped')).toBe(true);
  expect(requests).toBe(9);
});
test('a failed middle batch does not stop the last ten questions or undo completed answers', async ({
  page,
}) => {
  test.setTimeout(60000);
  let requests = 0;
  await page.route('https://ollama.com/v1/chat/completions', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    requests++;
    if (requests === 2) {
      await route.fulfill({ status: 503, headers, body: 'provider unavailable' });
      return;
    }
    const body = route.request().postDataJSON(),
      questions = JSON.parse(body.messages[1].content.split('Untrusted question/profile data: ')[1])
        .questions as (Question & { questionId: string })[];
    await route.fulfill({
      status: 200,
      headers,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [
          { message: { content: JSON.stringify({ answers: questions.map((q) => reply(q)) }) } },
        ],
      }),
    });
  });
  const report = await page.evaluate(() => window.runThirty());
  expect(requests).toBe(3);
  expect(report.results.filter((r) => r.status === 'filled')).toHaveLength(20);
  expect(report.results.slice(20).every((r) => r.status === 'filled')).toBe(true);
  expect(report.results.slice(10, 20).every((r) => r.status === 'review')).toBe(true);
  expect(await page.evaluate(() => window.fixtureFilledCount())).toBe(20);
  await expect(page.locator('#submissions')).toHaveText('0');
});
test('29 of 30 is correctly reported when one answer is uncertain, without retrying uncertainty', async ({
  page,
}) => {
  test.setTimeout(60000);
  let requests = 0;
  await page.route('https://ollama.com/v1/chat/completions', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    requests++;
    const body = route.request().postDataJSON(),
      questions = JSON.parse(body.messages[1].content.split('Untrusted question/profile data: ')[1])
        .questions as (Question & { questionId: string })[];
    await route.fulfill({
      status: 200,
      headers,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                answers: questions.map((q) =>
                  reply(q, q.text.startsWith('Question 30:') ? 0.2 : 0.99),
                ),
              }),
            },
          },
        ],
      }),
    });
  });
  const report = await page.evaluate(() => window.runThirty());
  expect(requests).toBe(3);
  expect(report.results.filter((r) => r.status === 'filled')).toHaveLength(29);
  expect(report.results[29].status).toBe('review');
  await expect(page.locator('[name="entry.30"]')).toHaveValue('');
  await expect(page.locator('#submissions')).toHaveText('0');
});
