// Trusted background only. Complete backups carry encrypted API keys by default.
import { backupSchema, type CompleteBackup } from '../shared/backup';
import { loadState } from './storage';
import { memory, reports, replaceLocalData } from './memory';
import { getKeys } from './vault';
import { normalizeProvider } from './providers';
import { withProviderSettingsLock } from './provider-config';
async function createBackupSnapshot(includePlaintextKeys = false): Promise<CompleteBackup> {
  const s = await loadState();
  const { vault } = await chrome.storage.local.get('vault');
  const backup: CompleteBackup = {
    format: 'formpilot-backup',
    version: 2,
    exportedAt: new Date().toISOString(),
    profiles: s.profiles,
    providers: s.providers,
    settings: s.settings,
    answers: await memory.list(),
    history: s.history,
    failures: s.failures,
    vault: vault || null,
  };
  if (includePlaintextKeys) {
    if (vault && !s.vaultUnlocked)
      throw new Error(
        'Unlock the vault before exporting readable API keys. Encrypted complete backup does not require unlocking.',
      );
    backup.apiKeys = await getKeys();
  }
  return backupSchema.parse(backup);
}
async function restoreBackupSnapshot(input: unknown) {
  const backup = backupSchema.parse(input);
  if (new Set(backup.providers.map((p) => p.id)).size !== 7)
    throw new Error('Backup must contain each provider exactly once.');
  if (new Set(backup.profiles.map((p) => p.id)).size !== backup.profiles.length)
    throw new Error('Backup contains duplicate profile IDs.');
  if (new Set(backup.answers.map((a) => a.id)).size !== backup.answers.length)
    throw new Error('Backup contains duplicate saved-answer IDs.');
  if (
    backup.settings.activeProfileId &&
    !backup.profiles.some((p) => p.id === backup.settings.activeProfileId)
  )
    throw new Error('Backup references a missing active profile.');
  if (backup.answers.some((a) => !backup.profiles.some((p) => p.id === a.profileId)))
    throw new Error('Backup contains answers for a missing profile.');
  if (!backup.vault && Object.keys(backup.apiKeys || {}).length)
    throw new Error('Backup is missing the encrypted API vault.');
  const providers = backup.providers
    .map(normalizeProvider)
    .map((p) => (backup.vault ? p : { ...p, hasKey: false, enabled: false }));
  const [oldLocal, oldSync, oldAnswers, oldReports] = await Promise.all([
    chrome.storage.local.get(null),
    chrome.storage.sync.get(null),
    memory.list(),
    reports.list(),
  ]);
  try {
    await replaceLocalData(backup.answers, backup.history);
    await chrome.storage.local.set({
      profiles: backup.profiles,
      providers,
      settings: backup.settings,
      failures: backup.failures,
      vault: backup.vault,
      historyRevision: Date.now(),
    });
    const { autoReuse, preserveExisting, confidence, aiEnabled } = backup.settings;
    await chrome.storage.sync.set({
      preferences: { autoReuse, preserveExisting, confidence, aiEnabled },
    });
  } catch (error) {
    await replaceLocalData(oldAnswers, oldReports);
    await chrome.storage.local.clear();
    await chrome.storage.local.set(oldLocal);
    await chrome.storage.sync.clear();
    await chrome.storage.sync.set(oldSync);
    throw error;
  }
  // Session unlocking material must never be exported or reused for a new vault.
  await chrome.storage.session.remove('vaultKey');
  return loadState();
}

export function createBackup(includePlaintextKeys = false) {
  return withProviderSettingsLock(() => createBackupSnapshot(includePlaintextKeys));
}
export function restoreBackup(input: unknown) {
  return withProviderSettingsLock(() => restoreBackupSnapshot(input));
}
