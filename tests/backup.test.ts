// @vitest-environment node
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initialState } from '../src/shared/defaults';
import { createBackup, restoreBackup } from '../src/services/backup';
import { memory, reports } from '../src/services/memory';
import { getKeys, lockVault, unlockVault } from '../src/services/vault';
import { saveProviderConfiguration } from '../src/services/provider-config';
import { question, saved } from './helpers';
let local: Record<string, unknown>, sync: Record<string, unknown>, session: Record<string, unknown>;
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
    clear: vi.fn(async () => {
      for (const k of Object.keys(data)) delete data[k];
    }),
  };
}
beforeEach(async () => {
  const state = initialState();
  local = {
    ...state,
    profiles: [
      {
        id: 'p1',
        name: 'Personal',
        mandatory: ['email'],
        email: 'alex@example.com',
        resumeName: 'resume.txt',
        resumeText: 'Verified resume facts.',
      },
    ],
    settings: { ...state.settings, activeProfileId: 'p1', confidence: 0.95 },
    failures: [{ provider: 'OpenAI', date: '2026-11-02T12:00:00Z', message: 'HTTP 404' }],
  };
  sync = {};
  session = {};
  vi.stubGlobal('chrome', {
    storage: { local: area(local), sync: area(sync), session: area(session) },
  });
  await memory.clear();
  await reports.clear();
  await memory.save(saved());
  await reports.save({
    id: 'r1',
    tabId: 3,
    site: 'docs.google.com',
    date: '2026-11-02T12:00:00Z',
    duration: 500,
    provider: 'OpenAI',
    results: [{ question: question(), status: 'review', reason: 'Please confirm.' }],
  });
  await unlockVault('original private passphrase');
  await saveProviderConfiguration(
    {
      ...state.providers.find((p) => p.id === 'openai')!,
      model: 'my-model',
      enabled: true,
      priority: 0,
    },
    'sk-complete-private-key',
  );
});
describe('complete extension backups', () => {
  it('includes every persistent setting and the encrypted API keys even when locked', async () => {
    await lockVault();
    const backup = await createBackup();
    expect(backup).toMatchObject({
      format: 'formpilot-backup',
      version: 2,
      settings: { confidence: 0.95, activeProfileId: 'p1' },
    });
    expect(backup.providers.find((p) => p.id === 'openai')).toMatchObject({
      model: 'my-model',
      enabled: true,
      hasKey: true,
    });
    expect(backup.profiles[0].resumeText).toBe('Verified resume facts.');
    expect(backup.answers).toHaveLength(1);
    expect(backup.history).toHaveLength(1);
    expect(backup.failures).toHaveLength(1);
    expect(backup.vault?.data.length).toBeGreaterThan(16);
    expect(JSON.stringify(backup)).not.toContain('sk-complete-private-key');
    expect(backup).not.toHaveProperty('apiKeys');
    expect(backup).not.toHaveProperty('vaultKey');
  });
  it('exports readable API keys only on explicit request while unlocked', async () => {
    expect((await createBackup(true)).apiKeys).toEqual({ openai: 'sk-complete-private-key' });
    await lockVault();
    await expect(createBackup(true)).rejects.toThrow('Unlock');
  });
  it('round-trips profiles, all provider settings, answers, history and usable API keys', async () => {
    const backup = JSON.parse(JSON.stringify(await createBackup()));
    await memory.clear();
    await reports.clear();
    await chrome.storage.local.clear();
    await chrome.storage.sync.clear();
    const restored = await restoreBackup(backup);
    expect(restored.profiles).toEqual(backup.profiles);
    expect(restored.providers).toEqual(backup.providers);
    expect(restored.settings).toEqual(backup.settings);
    expect(restored.history).toEqual(backup.history);
    expect(await memory.list()).toEqual(backup.answers);
    expect(restored.vaultUnlocked).toBe(false);
    await expect(getKeys()).rejects.toThrow('Unlock');
    await unlockVault('original private passphrase');
    expect((await getKeys()).openai).toBe('sk-complete-private-key');
  });
  it('rejects corrupt or incomplete backups without replacing anything', async () => {
    const backup = await createBackup();
    const before = structuredClone(local);
    await expect(
      restoreBackup({
        ...backup,
        providers: [...backup.providers.slice(0, 6), backup.providers[0]],
      }),
    ).rejects.toThrow('exactly once');
    expect(local).toEqual(before);
    await expect(
      restoreBackup({ ...backup, settings: { ...backup.settings, activeProfileId: 'missing' } }),
    ).rejects.toThrow('missing active profile');
    expect(local).toEqual(before);
  });
  it('restores the original data if a persistent storage write fails', async () => {
    const backup = await createBackup();
    const before = structuredClone(local);
    const beforeAnswers = await memory.list();
    vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(new Error('Storage failed'));
    await expect(
      restoreBackup({
        ...backup,
        profiles: backup.profiles.map((p) => ({ ...p, name: 'Changed' })),
        answers: [],
      }),
    ).rejects.toThrow('Storage failed');
    expect(local).toEqual(before);
    expect(await memory.list()).toEqual(beforeAnswers);
  });
});
