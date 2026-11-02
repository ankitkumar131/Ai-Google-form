// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultProviders } from '../src/shared/defaults';
import { diagnoseProvider, listProviderModels } from '../src/services/provider-diagnostics';
import { queryProvider, sanitizeProviderMessage } from '../src/services/providers';
import { question } from './helpers';
const p = {
  ...defaultProviders.find((p) => p.id === 'openrouter')!,
  model: 'vendor/current',
  timeout: 3000,
};
const key = 'sk-or-fake-unit-only';
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const success = (id = 'test') =>
  json({
    choices: [
      {
        message: {
          content: JSON.stringify({
            answers: [{ questionId: id, questionType: 'text', answer: '4', confidence: 1 }],
          }),
        },
      },
    ],
  });
afterEach(() => vi.unstubAllGlobals());
describe('OpenRouter authentication is not model availability', () => {
  it('verifies the key separately and exposes a sanitized model-routing 404', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ data: { label: 'never expose account metadata' } }))
      .mockResolvedValueOnce(
        json(
          {
            error: {
              message: `No endpoints found for model. Token ${key}. Bearer another-secret`,
              metadata: { raw: 'never expose metadata' },
            },
          },
          404,
        ),
      );
    vi.stubGlobal('fetch', fetch);
    const result = await diagnoseProvider(p, key);
    expect(result).toMatchObject({
      success: false,
      keyStatus: 'valid',
      httpStatus: 404,
      model: p.model,
      requestUrl: 'https://openrouter.ai/api/v1/chat/completions',
    });
    expect(result.message).toContain('API key verified');
    expect(result.message).toContain('No endpoints found');
    expect(JSON.stringify(result)).not.toMatch(/sk-or-fake|another-secret|never expose/);
    expect(fetch.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/key');
    expect(fetch.mock.calls[0][1].method).toBe('GET');
    expect(fetch.mock.calls[1][1].method).toBe('POST');
  });
  it('stops generation when the authentication endpoint rejects the key', async () => {
    const fetch = vi.fn().mockResolvedValue(json({ error: { message: 'Invalid key' } }, 401));
    vi.stubGlobal('fetch', fetch);
    const result = await diagnoseProvider(p, key);
    expect(result).toMatchObject({ success: false, keyStatus: 'invalid', httpStatus: 401 });
    expect(result.message).toContain('GET https://openrouter.ai/api/v1/key');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('still tests generation when a proxy has no key-metadata endpoint', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({}, 404)).mockResolvedValueOnce(success());
    vi.stubGlobal('fetch', fetch);
    expect(await diagnoseProvider(p, key)).toMatchObject({ success: true, keyStatus: 'valid' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('does not mark the key invalid when both metadata and model availability are unknown', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(json({}, 404)).mockResolvedValueOnce(json({}, 404)),
    );
    expect(await diagnoseProvider(p, key)).toMatchObject({
      success: false,
      keyStatus: 'unknown',
      httpStatus: 404,
    });
  });
  it('does not force JSON-mode or temperature routing on OpenRouter', async () => {
    const fetch = vi.fn().mockResolvedValue(success('q1'));
    vi.stubGlobal('fetch', fetch);
    await queryProvider(p, key, [question()]);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body).not.toHaveProperty('response_format');
    expect(body).not.toHaveProperty('temperature');
    expect(body.model).toBe(p.model);
    expect(body.messages[0].content).toContain('JSON');
  });
  it('retains strict answer validation even without forced native JSON mode', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(json({ data: {} }))
        .mockResolvedValueOnce(
          json({ choices: [{ message: { content: 'unstructured response' } }] }),
        ),
    );
    expect(await diagnoseProvider(p, key)).toMatchObject({
      success: false,
      keyStatus: 'valid',
      message: expect.stringContaining('malformed answer JSON'),
    });
  });
  it('ignores HTML and raw metadata while bounding and redacting JSON explanations', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(json({}, 404))
        .mockResolvedValueOnce(new Response(`<html>${key}</html>`, { status: 404 })),
    );
    const result = await diagnoseProvider(p, key);
    expect(result.message).not.toContain(key);
    expect(result.message).not.toContain('<html>');
    expect(
      sanitizeProviderMessage(
        `${key} Bearer unmarked-secret sk-other-token ${'a'.repeat(900)}`,
        key,
      ),
    ).toHaveLength(650);
  });
  it('aborts a stalled authentication probe and generation independently', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, options) =>
          new Promise((_resolve, reject) =>
            options.signal.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            ),
          ),
      ),
    );
    vi.useFakeTimers();
    try {
      const promise = diagnoseProvider(p, key);
      await vi.advanceTimersByTimeAsync(6001);
      expect(await promise).toMatchObject({
        success: false,
        keyStatus: 'unknown',
        message: expect.stringContaining('timed out'),
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
describe('explicit public model discovery', () => {
  it('loads exact IDs without sending keys or changing the chosen model', async () => {
    const fetch = vi.fn().mockResolvedValue(
      json({
        data: [
          { id: 'v/free:free', name: 'Free', supported_parameters: ['temperature', null] },
          { id: 'v/paid', name: 'Paid' },
          { id: 'v/paid', name: 'Paid' },
          { name: 'missing id' },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetch);
    expect(await listProviderModels(p)).toEqual([
      { id: 'v/free:free', name: 'Free', supportedParameters: ['temperature'] },
      { id: 'v/paid', name: 'Paid', supportedParameters: [] },
    ]);
    expect(fetch.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/models');
    expect(fetch.mock.calls[0][1].headers).toEqual({});
    expect(p.model).toBe('vendor/current');
  });
  it('rejects malformed catalogs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: 'not a catalog' })));
    await expect(listProviderModels(p)).rejects.toThrow('catalog');
  });
});
