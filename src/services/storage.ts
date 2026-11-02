import { initialState } from '../shared/defaults';
import type { AppState, Failure, RunReport } from '../shared/types';
import { reports } from './memory';
import { getKeys } from './vault';
export async function loadState(): Promise<AppState> {
  const base = initialState();
  const [local, sync, session, history] = await Promise.all([
    chrome.storage.local.get(['profiles', 'providers', 'settings', 'failures', 'vault']),
    chrome.storage.sync.get('preferences').catch(() => ({ preferences: undefined })),
    chrome.storage.session.get('vaultKey'),
    reports.list(),
  ]);
  let unlocked = !!session.vaultKey;
  let providers = local.providers || base.providers;
  if (unlocked && local.vault) {
    try {
      const keys = await getKeys();
      providers = providers.map((p: AppState['providers'][number]) => ({
        ...p,
        hasKey: !!keys[p.id],
      }));
    } catch {
      unlocked = false;
    }
  }
  return {
    profiles: local.profiles || base.profiles,
    providers,
    settings: { ...base.settings, ...local.settings, ...sync.preferences },
    failures: local.failures || [],
    history: history.sort((a, b) => b.date.localeCompare(a.date)),
    vaultConfigured: !!local.vault,
    vaultUnlocked: unlocked,
  };
}
let queue = Promise.resolve();
export async function logFailure(failure: Failure) {
  queue = queue
    .catch(() => {})
    .then(async () => {
      const { failures = [] } = await chrome.storage.local.get('failures');
      await chrome.storage.local.set({ failures: [failure, ...failures].slice(0, 50) });
    });
  await queue;
}
export async function saveReport(report: RunReport) {
  queue = queue
    .catch(() => {})
    .then(async () => {
      await reports.save(report);
      const history = (await reports.list()).sort((a, b) => b.date.localeCompare(a.date));
      for (const old of history.slice(20)) await reports.remove(old.id);
      await chrome.storage.local.set({ historyRevision: Date.now() });
    });
  await queue;
}
