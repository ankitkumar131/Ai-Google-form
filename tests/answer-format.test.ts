import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultProviders } from '../src/shared/defaults';
import { parseAnswers, queryProvider, SYSTEM_PROMPT } from '../src/services/providers';
import { diagnoseProvider } from '../src/services/provider-diagnostics';
import { question } from './helpers';
const p = {
  ...defaultProviders.find((p) => p.id === 'openrouter')!,
  model: 'google/gemma-4-26b-a4b-it:free',
};
const answer = (patch: Record<string, unknown> = {}) => ({
  answers: [{ questionId: 'q1', questionType: 'text', answer: 4, confidence: 0.95, ...patch }],
});
const complete = (content: unknown, finish_reason = 'stop') =>
  new Response(JSON.stringify({ choices: [{ finish_reason, message: { content } }] }));
afterEach(() => vi.unstubAllGlobals());
describe('numeric answer transport normalization without invented metadata', () => {
  it.each(['text', 'textarea', 'number', 'contenteditable'] as const)(
    'normalizes a numeric scalar for %s',
    (type) => {
      const result = parseAnswers(JSON.stringify(answer({ questionType: type })), [
        question({ type }),
      ]);
      expect(result[0]).toMatchObject({
        answer: '4',
        confidence: 0.95,
        questionId: 'q1',
        questionType: type,
        source: 'AI',
      });
    },
  );
  it('preserves explicit uncertainty instead of increasing confidence', () => {
    expect(
      parseAnswers(JSON.stringify(answer({ confidence: 0.1 })), [question()])[0].confidence,
    ).toBe(0.1);
  });
  it.each([
    ['wrong ID', { questionId: 'wrong' }],
    ['wrong type', { questionType: 'number' }],
    ['missing confidence', { confidence: undefined }],
    ['string confidence', { confidence: '0.95' }],
    ['confidence outside bounds', { confidence: 3 }],
    ['unexpected field', { secret: 'not allowed' }],
    ['boolean answer', { answer: true }],
    ['null answer', { answer: null }],
    ['unsafe integer', { answer: 9007199254740992 }],
  ])('still rejects %s', (_label, patch) => {
    expect(() => parseAnswers(JSON.stringify(answer(patch)), [question()])).toThrow();
  });
  it.each([
    '4',
    '"4"',
    '{"answer":"4"}',
    '{"answers":[]}',
    '[{"questionId":"q1","questionType":"text","answer":"4","confidence":1}]',
  ])('never creates an envelope/IDs/confidence from %s', (raw) =>
    expect(() => parseAnswers(raw, [question()])).toThrow(),
  );
  it('does not coerce choice or checkbox values', () => {
    expect(() =>
      parseAnswers(JSON.stringify(answer({ questionType: 'radio' })), [
        question({ type: 'radio', options: [{ id: '4', label: '4', value: '4' }] }),
      ]),
    ).toThrow();
    expect(() =>
      parseAnswers(JSON.stringify(answer({ questionType: 'checkbox', answer: [4] })), [
        question({ type: 'checkbox', options: [{ id: '4', label: '4', value: '4' }] }),
      ]),
    ).toThrow();
  });
  it('does not extract example JSON from prose or multiple answer objects', () => {
    const valid = JSON.stringify(answer());
    expect(() => parseAnswers('Here is an example: ' + valid, [question()])).toThrow();
    expect(() => parseAnswers(valid + '\n' + valid, [question()])).toThrow();
  });
});
describe('model request output contract and format diagnostics', () => {
  it('gives the real IDs/types and string rule in the user turn without forcing OpenRouter routing parameters', async () => {
    const fetch = vi.fn().mockResolvedValue(complete(JSON.stringify(answer())));
    vi.stubGlobal('fetch', fetch);
    await queryProvider(p, 'fake-test-key', [question()]);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.messages[0].content).toBe(SYSTEM_PROMPT);
    expect(SYSTEM_PROMPT).not.toContain('numbers numeric');
    expect(SYSTEM_PROMPT).toContain('NEVER "answer":4');
    expect(body.messages[1].content).toContain(
      '"questionId":"q1","questionType":"text","answer":"","confidence":0',
    );
    expect(body.messages[1].content).toContain('Scalar answers are STRINGS');
    expect(body).not.toHaveProperty('response_format');
    expect(body).not.toHaveProperty('temperature');
    expect(body.model).toBe(p.model);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('marks a plain-text HTTP 200 model as reachable but not structured-answer compatible', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"data":{}}'))
      .mockResolvedValueOnce(complete('4'));
    vi.stubGlobal('fetch', fetch);
    const result = await diagnoseProvider(p, 'fake-test-key');
    expect(result).toMatchObject({
      keyStatus: 'valid',
      success: false,
      httpStatus: 200,
      failureKind: 'format',
    });
    expect(result.message).toContain('Model responded');
    expect(result.message).toContain('answers array');
    expect(result.message).not.toContain('selected model request failed');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('accepts a fully identified numeric structured response from the reported model', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"data":{}}'))
      .mockResolvedValueOnce(complete(JSON.stringify(answer({ questionId: 'test' }))));
    vi.stubGlobal('fetch', fetch);
    expect(await diagnoseProvider(p, 'fake-test-key')).toMatchObject({
      keyStatus: 'valid',
      success: true,
      model: p.model,
    });
  });
  it('does not leak generated personal text or credentials through validation errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          complete(
            JSON.stringify(
              answer({ confidence: 'private-generated-value', secret: 'private-test-key' }),
            ),
          ),
        ),
    );
    try {
      await queryProvider(p, 'private-test-key', [question()]);
      throw new Error('Unexpected success');
    } catch (error) {
      expect((error as Error).message).toContain('confidence');
      expect((error as Error).message).not.toContain('private-generated-value');
      expect((error as Error).message).not.toContain('private-test-key');
    }
  });
  it('accepts text content blocks but never substitutes hidden reasoning for an answer', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(complete([{ type: 'text', text: JSON.stringify(answer()) }]))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              choices: [{ message: { content: null, reasoning: JSON.stringify(answer()) } }],
            }),
          ),
        ),
    );
    expect((await queryProvider(p, 'fake-key', [question()]))[0].answer).toBe('4');
    await expect(queryProvider(p, 'fake-key', [question()])).rejects.toThrow(
      'no assistant answer text',
    );
  });
  it('rejects truncated output even if a complete-looking JSON prefix is present', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(complete(JSON.stringify(answer()), 'length')));
    await expect(queryProvider(p, 'fake-key', [question()])).rejects.toMatchObject({
      httpStatus: 200,
      failureKind: 'format',
      message: expect.stringContaining('truncated'),
    });
  });
  it.each(['not JSON', 'null', '[]'])(
    'distinguishes a malformed HTTP 200 API envelope (%s) from a network failure',
    async (raw) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(raw)));
      await expect(queryProvider(p, 'fake-key', [question()])).rejects.toMatchObject({
        httpStatus: 200,
        failureKind: 'format',
      });
    },
  );
});

describe('run-only partial-batch validation', () => {
  const second = question({ id: 'q2' }),
    good = answer().answers[0];
  it('salvages valid rows but the default parser still rejects an omitted question', () => {
    const raw = JSON.stringify({ answers: [good] });
    expect(() => parseAnswers(raw, [question(), second])).toThrow();
    expect(parseAnswers(raw, [question(), second], true)).toHaveLength(1);
  });
  it('keeps a valid row when another has invalid confidence, without fabricating the missing row', () => {
    const raw = JSON.stringify({
      answers: [good, { ...good, questionId: 'q2', confidence: 'invalid' }],
    });
    expect(parseAnswers(raw, [question(), second], true).map((a) => a.questionId)).toEqual(['q1']);
  });
  it('discards every duplicate ID rather than arbitrarily selecting an answer', () => {
    const raw = JSON.stringify({
      answers: [good, { ...good, answer: 'different' }, { ...good, questionId: 'q2' }],
    });
    expect(parseAnswers(raw, [question(), second], true).map((a) => a.questionId)).toEqual(['q2']);
  });
  it('never maps unknown IDs to a missing question', () => {
    const raw = JSON.stringify({ answers: [good, { ...good, questionId: 'unknown' }] });
    expect(parseAnswers(raw, [question(), second], true).map((a) => a.questionId)).toEqual(['q1']);
  });
  it('never accepts an unknown option merely to improve completion counts', () => {
    const q = question({
      id: 'q2',
      type: 'radio',
      options: [{ id: 'one', label: '4', value: '4' }],
    });
    const raw = JSON.stringify({
      answers: [good, { ...good, questionId: 'q2', questionType: 'radio', answer: 'not a choice' }],
    });
    expect(parseAnswers(raw, [question(), q], true).map((a) => a.questionId)).toEqual(['q1']);
  });
  it('does not retry by increasing low confidence or replacing explicit uncertainty', () => {
    const raw = JSON.stringify({ answers: [{ ...good, confidence: 0.1, answer: '' }] });
    expect(parseAnswers(raw, [question()], true)[0]).toMatchObject({ answer: '', confidence: 0.1 });
  });
  it('still rejects malformed syntax and extra envelope metadata', () => {
    expect(() => parseAnswers('not JSON', [question()], true)).toThrow();
    expect(() =>
      parseAnswers(JSON.stringify({ answers: [good], other: true }), [question()], true),
    ).toThrow();
  });
  it('rejects an entirely invalid or oversized batch', () => {
    expect(() =>
      parseAnswers(
        JSON.stringify({ answers: [{ ...good, confidence: undefined }] }),
        [question()],
        true,
      ),
    ).toThrow();
    expect(() =>
      parseAnswers(JSON.stringify({ answers: Array(101).fill(good) }), [question()], true),
    ).toThrow();
  });
});
