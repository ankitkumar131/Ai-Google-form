import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import type { Answer, FillResult, Question } from '../src/shared/types';
declare global {
  interface Window {
    formpilotTest: {
      scan: () => Question[];
      fill: (answer: Answer, preserve: boolean) => Promise<FillResult>;
    };
  }
}
let script: string;
test.beforeAll(async () => {
  const result = await build({
    stdin: {
      contents:
        "import {FormDetector} from './src/extension/detector'; window.formpilotTest=new FormDetector();",
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: 'iife',
    target: 'chrome120',
  });
  script = result.outputFiles[0].text;
});
test('actual DOM fills, events, ARIA, shadow roots, and stale-field protection', async ({
  page,
}) => {
  await page.goto('/playground.html');
  await page.addScriptTag({ content: script });
  const scan = () => page.evaluate(() => window.formpilotTest.scan());
  const fill = (q: Question, value: string | string[]) =>
    page.evaluate(
      ({ q, value }) =>
        window.formpilotTest.fill(
          {
            questionId: q.id,
            questionType: q.type,
            answer: value,
            confidence: 1,
            source: 'Manual',
          },
          true,
        ),
      { q, value },
    );
  const questions = await scan();
  const first = questions.find((q) => q.name === 'firstName')!;
  expect((await fill(first, 'Alex')).success).toBe(true);
  await expect(page.getByLabel('First name', { exact: true })).toHaveValue('Alex');
  const arithmetic = questions.find((q) => q.text === 'What is 2 + 2?')!;
  expect((await fill(arithmetic, '4')).success).toBe(true);
  await expect(page.locator('input[name="arithmetic"][value="4"]')).toBeChecked();
  const primes = questions.find((q) => q.text === 'Select the prime numbers')!;
  expect((await fill(primes, ['2', '3'])).success).toBe(true);
  await expect(page.locator('input[name="primes"][value="2"]')).toBeChecked();
  await expect(page.locator('input[name="primes"][value="4"]')).not.toBeChecked();
  const custom = questions.find((q) => q.text === 'What is the capital of France?')!;
  expect((await fill(custom, 'Paris')).success).toBe(true);
  await expect(page.getByRole('radio', { name: 'Paris', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  const github = questions.find((q) => q.text === 'GitHub profile')!;
  expect((await fill(github, 'https://github.com/example')).success).toBe(true);
  await expect(page.getByLabel('GitHub profile')).toHaveValue('https://github.com/example');
  expect(questions.find((q) => q.name === 'creditCard')?.sensitive).toBe(true);
  expect(questions.find((q) => q.name === 'terms')?.sensitive).toBe(true);
  const existing = questions.find((q) => q.name === 'existing')!;
  expect((await fill(existing, 'Overwrite')).success).toBe(false);
  await expect(page.getByLabel('A field you have already answered')).toHaveValue(
    'Keep this answer',
  );
  await page.getByRole('button', { name: 'Load another field' }).click();
  const updated = await scan();
  expect(updated.some((q) => q.name === 'mobileNumber')).toBe(true);
  expect(updated.find((q) => q.name === 'firstName')?.id).toBe(first.id);
  await expect(page.locator('#submit-status')).toBeEmpty();
});

test('Google Forms: question titles, delayed choices, closed dropdowns and grid rows', async ({
  page,
}) => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile('tests/fixtures/google-forms.html', 'utf8');
  await page.route('https://docs.google.com/forms/d/e/regression/viewform', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: html }),
  );
  await page.goto('https://docs.google.com/forms/d/e/regression/viewform');
  await page.addScriptTag({ content: script });
  const questions = await page.evaluate(() => window.formpilotTest.scan());
  expect(questions).toHaveLength(6);
  const fill = (q: Question, value: string | string[]) =>
    page.evaluate(
      ({ q, value }) =>
        window.formpilotTest.fill(
          { questionId: q.id, questionType: q.type, answer: value, confidence: 1, source: 'AI' },
          true,
        ),
      { q, value },
    );
  const radio = questions.find((q) => q.text === 'What is 2 + 2?')!;
  expect(radio.options.map((o) => o.label)).toEqual(['3', '4', '5']);
  expect(radio.required).toBe(true);
  expect((await fill(radio, '4')).success).toBe(true);
  await expect(page.getByRole('radio', { name: '4', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  const checkbox = questions.find((q) => q.text === 'Select the prime numbers')!;
  expect((await fill(checkbox, ['2', '3'])).success).toBe(true);
  await expect(page.getByRole('checkbox', { name: '2', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByRole('checkbox', { name: '4', exact: true })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  const name = questions.find((q) => q.name === 'entry.3')!;
  expect(name.text).toBe('First name');
  expect((await fill(name, 'Alex')).success).toBe(true);
  await expect(page.getByLabel('Your answer')).toHaveValue('Alex');
  const dropdown = questions.find((q) => q.type === 'select')!;
  expect(dropdown.currentValue).toBe('');
  expect(dropdown.options.map((o) => o.label)).toEqual(['Venus', 'Mars']);
  expect((await fill(dropdown, 'Mars')).success).toBe(true);
  await expect(page.getByRole('option', { name: 'Mars', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const rows = questions.filter((q) => q.text.startsWith('Mark each statement'));
  expect(rows).toHaveLength(2);
  expect(rows.every((q) => q.options.length === 2)).toBe(true);
  expect((await fill(rows[0], 'True')).success).toBe(true);
  expect((await fill(rows[1], 'False')).success).toBe(true);
});
