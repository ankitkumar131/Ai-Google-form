import { providerSchema } from '../shared/schema';
import { defaultProviders } from '../shared/defaults';
import type { Provider } from '../shared/types';
import { prepareKeyUpdate, getKeys } from './vault';
import { normalizeProvider } from './providers';

// Serialize all provider/key writes. One storage.set publishes both the encrypted
// vault and its corresponding configuration, rather than leaving a partial save.
let writes = Promise.resolve();
function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const next = writes.catch(() => {}).then(operation);
  writes = next.then(
    () => {},
    () => {},
  );
  return next;
}
export function saveProviderConfiguration(input: unknown, newKey?: string): Promise<Provider> {
  return serialize(async () => {
    const provider = normalizeProvider(providerSchema.parse(input));
    if (provider.enabled && (!provider.model || !provider.endpoint))
      throw new Error('Enter a model and API endpoint before enabling this provider.');
    const { providers = defaultProviders } = await chrome.storage.local.get('providers');
    const existing = (providers as Provider[]).find((p) => p.id === provider.id);
    const values: Record<string, unknown> = {};
    const key = newKey?.trim();
    if (key) {
      values.vault = await prepareKeyUpdate(provider.id, key);
      provider.hasKey = true;
    } else {
      provider.hasKey = !!existing?.hasKey;
      const { vaultKey } = await chrome.storage.session.get('vaultKey');
      if (vaultKey) provider.hasKey = !!(await getKeys())[provider.id];
    }
    if (provider.enabled && !provider.hasKey)
      throw new Error('Add an API key before enabling this provider.');
    values.providers = (providers as Provider[]).map((p) => (p.id === provider.id ? provider : p));
    await chrome.storage.local.set(values);
    const saved = await chrome.storage.local.get('providers');
    const persisted = (saved.providers as Provider[]).find((p) => p.id === provider.id);
    if (
      !persisted ||
      persisted.model !== provider.model ||
      persisted.endpoint !== provider.endpoint
    )
      throw new Error('Provider configuration was not persisted. Please try again.');
    if (key && (await getKeys())[provider.id] !== key)
      throw new Error('API key could not be verified after saving. Please try again.');
    return provider;
  });
}
export function removeProviderKey(id: Provider['id']) {
  return serialize(async () => {
    const vault = await prepareKeyUpdate(id, '');
    const { providers = defaultProviders } = await chrome.storage.local.get('providers');
    await chrome.storage.local.set({
      vault,
      providers: (providers as Provider[]).map((p) =>
        p.id === id ? { ...p, hasKey: false, enabled: false } : p,
      ),
    });
  });
}
export function saveProviderOrder(input: unknown) {
  return serialize(async () => {
    const providers = providerSchema.array().length(7).parse(input).map(normalizeProvider);
    if (new Set(providers.map((p) => p.id)).size !== 7)
      throw new Error('Provider IDs must be unique.');
    const { providers: old = defaultProviders } = await chrome.storage.local.get('providers');
    const { vaultKey } = await chrome.storage.session.get('vaultKey');
    const keys = vaultKey ? await getKeys() : null;
    const merged = providers.map((p) => ({
      ...p,
      hasKey: keys ? !!keys[p.id] : !!(old as Provider[]).find((x) => x.id === p.id)?.hasKey,
    }));
    for (const p of merged)
      if (p.enabled && (!p.model || !p.endpoint || !p.hasKey))
        throw new Error('Enabled providers need a saved API key, model and endpoint.');
    await chrome.storage.local.set({ providers: merged });
  });
}

export function withProviderSettingsLock<T>(operation: () => Promise<T>): Promise<T> {
  return serialize(operation);
}
