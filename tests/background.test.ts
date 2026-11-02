// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { initialState } from '../src/shared/defaults';
vi.mock('../src/services/memory', () => ({
  memory: { list: vi.fn(async () => []) },
  reports: { list: vi.fn(async () => []) },
}));
vi.mock('../src/services/vault', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/services/vault')>()),
  getKeys: vi.fn(async () => ({ openai: 'private-session-secret' })),
}));
type Reply = { ok: boolean; data?: Record<string, unknown>; error?: string };
let handler: (
  message: Record<string, unknown>,
  sender: chrome.runtime.MessageSender,
  respond: (reply: Reply) => void,
) => boolean | undefined;
const accessLevels: unknown[] = [];
const setAccessLevel = vi.fn(async (level: unknown) => {
  accessLevels.push(level);
});
const local = {
  ...initialState(),
  vault: { salt: [1], iv: [2], data: [3] },
  apiKey: 'should-never-return',
};
beforeAll(async () => {
  vi.stubGlobal('chrome', {
    runtime: {
      id: 'extension-id',
      getURL: (path: string) => `chrome-extension://extension-id/${path}`,
      onInstalled: { addListener: vi.fn() },
      onMessage: {
        addListener: (fn: typeof handler) => {
          handler = fn;
        },
      },
    },
    storage: {
      local: { setAccessLevel, get: vi.fn(async () => local) },
      sync: { setAccessLevel, get: vi.fn(async () => ({})) },
      session: {
        setAccessLevel,
        get: vi.fn(async () => ({ vaultKey: { k: 'private-session-secret' } })),
      },
    },
  });
  await import('../src/extension/background');
});
const trusted = { id: 'extension-id', url: 'chrome-extension://extension-id/index.html' };
function call(message: Record<string, unknown>) {
  return new Promise<Reply>((resolve) => handler(message, trusted, resolve));
}
describe('trusted background message boundary', () => {
  it('restricts all Chrome storage areas to trusted contexts', () => {
    expect(accessLevels).toHaveLength(3);
    expect(
      accessLevels.every(
        (level) => JSON.stringify(level) === JSON.stringify({ accessLevel: 'TRUSTED_CONTEXTS' }),
      ),
    ).toBe(true);
  });
  it('refuses same-extension content-script senders from webpages', () => {
    const respond = vi.fn();
    expect(
      handler({ type: 'STATE' }, { id: 'extension-id', url: 'https://untrusted.example' }, respond),
    ).toBeUndefined();
    expect(respond).not.toHaveBeenCalled();
  });
  it('refuses foreign extensions and deceptive prefix URLs', () => {
    const respond = vi.fn();
    handler({ type: 'STATE' }, { id: 'other', url: trusted.url }, respond);
    handler(
      { type: 'STATE' },
      { id: 'extension-id', url: 'chrome-extension://extension-id.evil/index.html' },
      respond,
    );
    expect(respond).not.toHaveBeenCalled();
  });
  it('exposes vault status, never ciphertext, API keys or session key material', async () => {
    const response = await call({ type: 'STATE' });
    expect(response.ok).toBe(true);
    expect(response.data?.vaultConfigured).toBe(true);
    expect(response.data?.vaultUnlocked).toBe(true);
    expect(response.data).not.toHaveProperty('vault');
    expect(response.data).not.toHaveProperty('apiKey');
    expect(JSON.stringify(response)).not.toContain('private-session-secret');
  });
  it('validates provider IDs before accepting keys', async () => {
    const response = await call({ type: 'SET_KEY', id: 'not-a-provider', key: 'never-store-this' });
    expect(response.ok).toBe(false);
    expect(response.error).toContain('Invalid settings');
    expect(JSON.stringify(response)).not.toContain('never-store-this');
  });
});
