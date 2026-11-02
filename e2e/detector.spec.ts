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
