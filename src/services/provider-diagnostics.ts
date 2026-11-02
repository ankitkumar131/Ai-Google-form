// Trusted background only. Authentication and model capability are different checks.
import type { Provider, ProviderModel, ProviderTest } from '../shared/types';
import {
  normalizeProvider,
  providerRequestUrl,
  ProviderError,
  providerHttpError,
  queryProvider,
} from './providers';

async function getJson(url: string, timeout: number, key?: string): Promise<unknown> {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: key ? { Authorization: `Bearer ${key}` } : {},
      signal: controller.signal,
      credentials: 'omit',
      redirect: 'error',
    });
    if (!response.ok) throw await providerHttpError(response, url, key || '', 'GET');
    const text = await response.text();
    if (text.length > 8 * 1024 * 1024) throw new Error('Model catalog response is too large.');
    return JSON.parse(text);
  } catch (error) {
    if (controller.signal.aborted) throw new ProviderError('Request timed out.', true);
    if (error instanceof ProviderError) throw error;
    throw new ProviderError('Could not read the provider response.');
  } finally {
    clearTimeout(timer);
  }
}
export async function listProviderModels(provider: Provider): Promise<ProviderModel[]> {
  const p = normalizeProvider(provider);
  if (p.id !== 'openrouter')
    throw new Error('Model discovery is currently available for OpenRouter.');
  // OpenRouter's model catalog is public. Do not send an API key for discovery.
  const payload = (await getJson(`${p.endpoint}/models`, p.timeout)) as { data?: unknown[] };
  if (!Array.isArray(payload?.data))
    throw new Error('The endpoint did not return an OpenRouter model catalog.');
  const models: ProviderModel[] = [];
  for (const item of payload.data) {
    if (!item || typeof item !== 'object') continue;
    const value = item as Record<string, unknown>;
    if (typeof value.id !== 'string' || !value.id || value.id.length > 200) continue;
    models.push({
      id: value.id,
      name: typeof value.name === 'string' ? value.name.slice(0, 200) : value.id,
      supportedParameters: Array.isArray(value.supported_parameters)
        ? value.supported_parameters.filter((x): x is string => typeof x === 'string').slice(0, 100)
        : [],
    });
  }
  if (!models.length) throw new Error('This endpoint returned no usable model IDs.');
  return [...new Map(models.map((m) => [m.id, m])).values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}
export async function diagnoseProvider(provider: Provider, key: string): Promise<ProviderTest> {
  const p = normalizeProvider(provider),
    started = performance.now();
  let keyStatus: ProviderTest['keyStatus'] = 'unknown';
  const result = (success: boolean, message: string, httpStatus?: number): ProviderTest => ({
    checkedAt: new Date().toISOString(),
    model: p.model,
    endpoint: p.endpoint,
    requestUrl: providerRequestUrl(p),
    durationMs: Math.round(performance.now() - started),
    keyStatus,
    success,
    message,
    httpStatus,
  });
  if (p.id === 'openrouter') {
    try {
      const auth = (await getJson(`${p.endpoint}/key`, p.timeout, key)) as { data?: unknown };
      if (auth?.data && typeof auth.data === 'object') keyStatus = 'valid';
    } catch (error) {
      if (error instanceof ProviderError && error.httpStatus === 401) {
        keyStatus = 'invalid';
        return result(
          false,
          `The provider rejected the API key during its separate authentication check. ${error.message}`,
          401,
        );
      }
      // A proxy may not expose /key. Do not call a working key invalid just because
      // a metadata endpoint is missing; generation is still tested below.
    }
  }
  try {
    await queryProvider(p, key, [
      {
        id: 'test',
        frameId: 0,
        text: 'What is 2 + 2?',
        type: 'text',
        options: [],
        required: false,
        context: 'Connection test',
        name: '',
        autocomplete: '',
        currentValue: '',
        sensitive: false,
      },
    ]);
    keyStatus = 'valid';
    return result(true, 'Connected. Saved key, model access and structured answers verified.');
  } catch (error) {
    const status = error instanceof ProviderError ? error.httpStatus : undefined;
    if (status === 401) keyStatus = 'invalid';
    const reason = error instanceof ProviderError ? error.message : 'Connection test failed.';
    const prefix =
      keyStatus === 'valid'
        ? 'API key verified and saved. The selected model request failed. '
        : keyStatus === 'invalid'
          ? 'The API key was rejected. '
          : 'API key is saved; authentication could not be independently confirmed. ';
    const hint =
      p.id === 'openrouter' && status === 404
        ? ' Load available models, choose an exact current model ID, and retry. A model route can fail even with a valid API key.'
        : '';
    return result(false, prefix + reason + hint, status);
  }
}
