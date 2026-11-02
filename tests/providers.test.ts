import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultProviders } from '../src/shared/defaults';
import {
  parseAnswers,
  queryProvider,
  validateEndpoint,
  withFallback,
} from '../src/services/providers';
import { question } from './helpers';
const valid = JSON.stringify({
  answers: [{ questionId: 'q1', questionType: 'text', answer: '4', confidence: 0.95 }],
});
const response = (text = valid) =>
  new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
afterEach(() => vi.unstubAllGlobals());
describe('strict answer validation', () => {
  it('accepts structured JSON and strips a code fence', () =>
    expect(parseAnswers('```json\n' + valid + '\n```', [question()])[0].answer).toBe('4'));
  it('accepts uncertainty as a valid response', () =>
    expect(parseAnswers(valid.replace('0.95', '0.1'), [question()])[0].confidence).toBe(0.1));
  it.each([
    ['missing questions', '{"answers":[]}'],
    ['unknown question', valid.replace('q1', 'q2')],
    ['wrong type', valid.replace('"text"', '"email"')],
    ['out-of-bounds confidence', valid.replace('0.95', '1.2')],
    ['extra properties', valid.replace('"confidence":0.95', '"confidence":0.95,"secret":"x"')],
    ['malformed JSON', 'oops'],
  ])('rejects %s', (_, raw) => expect(() => parseAnswers(raw, [question()])).toThrow());
  it('rejects duplicate IDs', () => {
    const a = JSON.parse(valid).answers[0];
    expect(() => parseAnswers(JSON.stringify({ answers: [a, a] }), [question()])).toThrow();
  });
  it('rejects unknown options', () =>
    expect(() =>
      parseAnswers(valid.replace('"text"', '"radio"'), [
        question({ type: 'radio', options: [{ id: '1', label: '5', value: '5' }] }),
      ]),
    ).toThrow());
  it('requires a scalar for non-checkbox fields', () =>
    expect(() => parseAnswers(valid.replace('"4"', '["4"]'), [question()])).toThrow());
});
describe('provider requests and fallback', () => {
  it('requires HTTPS and rejects embedded credentials', () => {
    expect(() => validateEndpoint('http://localhost/v1')).toThrow();
    expect(() => validateEndpoint('https://key@example.com')).toThrow();
    expect(() => validateEndpoint('https://example.com?key=secret')).toThrow();
    expect(validateEndpoint('https://example.com/v1/')).toBe('https://example.com/v1');
  });
  it('falls back on HTTP failure without leaking keys in logs', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('secret body', { status: 401 }))
      .mockResolvedValueOnce(response());
    vi.stubGlobal('fetch', fetch);
    const log = vi.fn().mockResolvedValue(undefined);
    const providers = defaultProviders
      .filter((p) => ['openai', 'groq'].includes(p.id))
      .map((p, i) => ({ ...p, enabled: true, priority: i, retries: 0 }));
    const result = await withFallback(
      providers,
      { openai: 'secret1', groq: 'secret2' },
      [question()],
      undefined,
      log,
    );
    expect(result.provider).toBe('Groq');
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ message: 'HTTP 401' }));
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
  });
  it('does not fall back merely because an answer is uncertain', async () => {
    const fetch = vi.fn().mockImplementation(async () => response(valid.replace('0.95', '0.2')));
    vi.stubGlobal('fetch', fetch);
    const providers = defaultProviders
      .filter((p) => ['openai', 'groq'].includes(p.id))
      .map((p, i) => ({ ...p, enabled: true, priority: i }));
    const result = await withFallback(
      providers,
      { openai: 'secret', groq: 'secret' },
      [question()],
      undefined,
      async () => {},
    );
    expect(result.answers[0].confidence).toBe(0.2);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('falls back on malformed JSON', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response('not JSON'))
      .mockResolvedValueOnce(response());
    vi.stubGlobal('fetch', fetch);
    const providers = defaultProviders
      .filter((p) => ['openai', 'groq'].includes(p.id))
      .map((p, i) => ({ ...p, enabled: true, priority: i }));
    expect(
      (
        await withFallback(
          providers,
          { openai: 'a', groq: 'b' },
          [question()],
          undefined,
          async () => {},
        )
      ).provider,
    ).toBe('Groq');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('retries a rate limit within its finite retry budget', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(response());
    vi.stubGlobal('fetch', fetch);
    const p = { ...defaultProviders.find((p) => p.id === 'openai')!, enabled: true, retries: 1 };
    await withFallback([p], { openai: 'key' }, [question()], undefined, async () => {});
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('reports exhausted providers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));
    const p = { ...defaultProviders[1], enabled: true, retries: 0 };
    await expect(
      withFallback([p], { [p.id]: 'key' }, [question()], undefined, async () => {}),
    ).rejects.toThrow('No provider succeeded');
  });
  it('sends Gemini keys in a header, never the URL', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: valid }] } }] })),
      );
    vi.stubGlobal('fetch', fetch);
    await queryProvider(defaultProviders[0], 'private-key', [question()]);
    expect(fetch.mock.calls[0][0]).not.toContain('private-key');
    expect(fetch.mock.calls[0][1].headers['x-goog-api-key']).toBe('private-key');
  });
  it('supports Anthropic message responses', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ content: [{ type: 'text', text: valid }] })),
      );
    vi.stubGlobal('fetch', fetch);
    expect((await queryProvider(defaultProviders[2], 'key', [question()]))[0].answer).toBe('4');
    expect(fetch.mock.calls[0][1].headers['x-api-key']).toBe('key');
  });
  it('honors abort signals', async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url, init) => {
        if (init.signal.aborted) throw new DOMException('aborted', 'AbortError');
        return response();
      }),
    );
    await expect(
      queryProvider(defaultProviders[1], 'key', [question()], undefined, controller.signal),
    ).rejects.toThrow('Run cancelled');
  });
});
