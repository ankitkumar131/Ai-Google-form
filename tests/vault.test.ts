// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getKeys, lockVault, setKey, unlockVault } from '../src/services/vault';
let local: Record<string, unknown>, session: Record<string, unknown>;
beforeEach(() => {
  local = {};
  session = {};
  const area = (data: Record<string, unknown>) => ({
    get: vi.fn(async (key: string) => ({ [key]: data[key] })),
    set: vi.fn(async (values: Record<string, unknown>) => Object.assign(data, values)),
    remove: vi.fn(async (key: string) => {
      delete data[key];
    }),
  });
  vi.stubGlobal('chrome', { storage: { local: area(local), session: area(session) } });
});
describe('encrypted API key vault', () => {
  it('rejects short passphrases', async () =>
    await expect(unlockVault('short')).rejects.toThrow('at least 12'));
  it('never stores plaintext keys or passphrases at rest', async () => {
    await unlockVault('a long private passphrase');
    await setKey('openai', 'sk-private-test-value');
    expect(JSON.stringify(local)).not.toContain('sk-private');
    expect(JSON.stringify(local)).not.toContain('passphrase');
    expect((await getKeys()).openai).toBe('sk-private-test-value');
  });
  it('locks, rejects wrong passphrases and recovers with the correct one', async () => {
    await unlockVault('a long private passphrase');
    await setKey('gemini', 'private-key');
    await lockVault();
    await expect(getKeys()).rejects.toThrow('Unlock');
    await expect(unlockVault('a wrong long passphrase')).rejects.toThrow('Incorrect');
    await unlockVault('a long private passphrase');
    expect((await getKeys()).gemini).toBe('private-key');
  });
  it('generates a new IV on each key update and supports deletion', async () => {
    await unlockVault('a long private passphrase');
    const first = JSON.stringify(local.vault);
    await setKey('openai', 'key');
    expect(JSON.stringify(local.vault)).not.toBe(first);
    await setKey('openai', '');
    expect(await getKeys()).toEqual({});
  });
});
