// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultProviders } from '../src/shared/defaults';
import { saveProviderConfiguration } from '../src/services/provider-config';
import { getKeys, lockVault, unlockVault } from '../src/services/vault';
let local: Record<string, unknown>, session: Record<string, unknown>;
function area(data: Record<string, unknown>) {
  return {
    get: vi.fn(async (key: string | string[] | null) =>
      key === null
        ? structuredClone(data)
        : Object.fromEntries(
            (Array.isArray(key) ? key : [key]).map((k) => [k, structuredClone(data[k])]),
          ),
    ),
    set: vi.fn(async (values: Record<string, unknown>) => {
      Object.assign(data, structuredClone(values));
    }),
    remove: vi.fn(async (key: string) => {
      delete data[key];
    }),
  };
}
beforeEach(() => {
  local = { providers: structuredClone(defaultProviders) };
  session = {};
  vi.stubGlobal('chrome', { storage: { local: area(local), session: area(session) } });
});
describe('provider and key save regressions', () => {
  it('persists model, endpoint and encrypted key together and survives a lock/unlock', async () => {
    await unlockVault('a sufficiently long passphrase');
    const saved = await saveProviderConfiguration(
      {
        ...defaultProviders.find((p) => p.id === 'openai')!,
        enabled: true,
        endpoint: 'https://api.openai.com/v1/chat/completions',
        model: 'my-model',
      },
      'private-key-value',
    );
    expect(saved).toMatchObject({
      hasKey: true,
      enabled: true,
      endpoint: 'https://api.openai.com/v1',
      model: 'my-model',
    });
    expect(JSON.stringify(local)).not.toContain('private-key-value');
    expect((await getKeys()).openai).toBe('private-key-value');
    await lockVault();
    await unlockVault('a sufficiently long passphrase');
    expect((await getKeys()).openai).toBe('private-key-value');
  });
  it('retains the existing key when editing only the model', async () => {
    await unlockVault('a sufficiently long passphrase');
    const p = defaultProviders.find((p) => p.id === 'groq')!;
    await saveProviderConfiguration(p, 'retained-key');
    await saveProviderConfiguration({ ...p, model: 'new-model' }, '');
    expect((await getKeys()).groq).toBe('retained-key');
  });
  it('does not partially save configuration if the key cannot be encrypted', async () => {
    const old = structuredClone(local);
    await expect(
      saveProviderConfiguration({ ...defaultProviders[0], model: 'changed' }, 'a-key'),
    ).rejects.toThrow('Unlock');
    expect(local).toEqual(old);
  });
  it('serializes concurrent saves so neither key is lost', async () => {
    await unlockVault('a sufficiently long passphrase');
    await Promise.all([
      saveProviderConfiguration(
        defaultProviders.find((p) => p.id === 'openai')!,
        'one',
      ),
      saveProviderConfiguration(
        defaultProviders.find((p) => p.id === 'gemini')!,
        'two',
      ),
    ]);
    expect(await getKeys()).toEqual({ openai: 'one', gemini: 'two' });
  });
});

describe('failed-save and metadata recovery', () => {
  it('recovers a saved key flag from the actual vault rather than trusting stale UI metadata', async () => {
    await unlockVault('a sufficiently long passphrase');
    const p = defaultProviders.find((p) => p.id === 'openai')!;
    await saveProviderConfiguration(p, 'kept-key');
    local.providers = (local.providers as typeof defaultProviders).map((p) => ({
      ...p,
      hasKey: false,
    }));
    const saved = await saveProviderConfiguration({ ...p, enabled: true });
    expect(saved.hasKey).toBe(true);
    expect((await getKeys()).openai).toBe('kept-key');
  });
  it('retains the original key and model if the atomic storage write is rejected', async () => {
    await unlockVault('a sufficiently long passphrase');
    const p = defaultProviders.find((p) => p.id === 'openai')!;
    await saveProviderConfiguration(p, 'original-key');
    const before = structuredClone(local);
    vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(new Error('Write rejected'));
    await expect(saveProviderConfiguration({ ...p, model: 'changed' }, 'new-key')).rejects.toThrow(
      'Write rejected',
    );
    expect(local).toEqual(before);
    expect((await getKeys()).openai).toBe('original-key');
  });
});
