import { z } from 'zod';
import { profileSchema, providerSchema, savedAnswerSchema, settingsSchema } from '../shared/schema';
import { loadState, saveReport } from '../services/storage';
import { memory, reports } from '../services/memory';
import { getKeys, lockVault, unlockVault } from '../services/vault';
import { queryProvider, providerRequestUrl, normalizeProvider } from '../services/providers';
import {
  beginDataReset,
  endDataReset,
  cancelAllRuns,
  cancelRun,
  fillTab,
  runAll,
  scanTab,
} from './runner';
import { createBackup, restoreBackup } from '../services/backup';
import {
  saveProviderConfiguration,
  saveProviderOrder,
  removeProviderKey,
} from '../services/provider-config';
import type { Answer } from '../shared/types';
const secureStorage = Promise.all([
  chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
  chrome.storage.sync.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
  chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
]);
chrome.runtime.onInstalled.addListener(async (details) => {
  await secureStorage;
  if (details.reason === 'install')
    await chrome.tabs.create({ url: chrome.runtime.getURL('index.html#profiles') });
});
const trusted = (sender: chrome.runtime.MessageSender) =>
  sender.id === chrome.runtime.id && !!sender.url?.startsWith(chrome.runtime.getURL(''));
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!trusted(sender)) return; // No webpage/content-script access to settings, vault, or provider APIs.
  (async () => {
    await secureStorage;
    const tabId = () => z.number().int().nonnegative().parse(message.tabId);
    switch (message.type) {
      case 'STATE':
        return loadState();
      case 'SAVE_PROFILE': {
        const profile = profileSchema.parse(message.profile);
        const s = await loadState();
        const index = s.profiles.findIndex((p) => p.id === profile.id);
        if (index >= 0) s.profiles[index] = profile;
        else s.profiles.push(profile);
        if (s.profiles.length > 10) throw new Error('Maximum 10 profiles.');
        await chrome.storage.local.set({
          profiles: s.profiles,
          settings: { ...s.settings, activeProfileId: profile.id, onboardingComplete: true },
        });
        return loadState();
      }
      case 'DELETE_PROFILE': {
        const id = z.string().parse(message.id);
        const s = await loadState();
        const profiles = s.profiles.filter((p) => p.id !== id);
        await chrome.storage.local.set({
          profiles,
          settings: { ...s.settings, activeProfileId: profiles[0]?.id || '' },
        });
        for (const entry of await memory.list())
          if (entry.profileId === id) await memory.remove(entry.id);
        return loadState();
      }
      case 'SAVE_SETTINGS': {
        const settings = settingsSchema.parse(message.settings);
        await chrome.storage.local.set({ settings });
        const { autoReuse, preserveExisting, confidence, aiEnabled } = settings;
        await chrome.storage.sync.set({
          preferences: { autoReuse, preserveExisting, confidence, aiEnabled },
        });
        return loadState();
      }
      case 'SAVE_PROVIDERS':
        await saveProviderOrder(message.providers);
        return loadState();
      case 'SAVE_PROVIDER':
        await saveProviderConfiguration(
          message.provider,
          message.key === undefined ? undefined : z.string().max(2000).parse(message.key),
        );
        return loadState();
      case 'UNLOCK':
        await unlockVault(z.string().max(1000).parse(message.passphrase));
        return loadState();
      case 'LOCK':
        cancelAllRuns();
        await lockVault();
        return loadState();
      case 'SET_KEY': {
        const id = providerSchema.shape.id.parse(message.id),
          key = z.string().max(2000).parse(message.key);
        if (key.trim()) {
          const s = await loadState();
          await saveProviderConfiguration(
            s.providers.find((p) => p.id === id),
            key,
          );
        } else await removeProviderKey(id);
        return loadState();
      }
      case 'RESET_VAULT': {
        cancelAllRuns();
        await lockVault();
        await chrome.storage.local.remove('vault');
        const s = await loadState();
        await chrome.storage.local.set({
          providers: s.providers.map((p) => ({ ...p, hasKey: false, enabled: false })),
        });
        return loadState();
      }
      case 'TEST_PROVIDER': {
        const started = performance.now();
        const candidate = normalizeProvider(providerSchema.parse(message.provider));
        if (!candidate.model || !candidate.endpoint)
          throw new Error('Enter a model and API endpoint before testing.');
        const p =
          message.save === true
            ? await saveProviderConfiguration(
                candidate,
                message.key === undefined ? undefined : z.string().max(2000).parse(message.key),
              )
            : candidate;
        const keys = await getKeys();
        if (!keys[p.id])
          throw new Error('No saved API key for this provider. Add a key and use Save & test.');
        const url = providerRequestUrl(p);
        try {
          await queryProvider(p, keys[p.id], [
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
        } catch (error) {
          throw new Error(
            `${message.save === true ? 'Settings and API key are saved. Connection test failed. ' : ''}${error instanceof Error ? error.message : 'Connection failed.'} (${Math.round(performance.now() - started)} ms)`,
          );
        }
        return {
          message: 'Connected. Saved key, model access and structured answers verified.',
          provider: p.name,
          model: p.model,
          requestUrl: url,
          durationMs: Math.round(performance.now() - started),
        };
      }
      case 'BANK_LIST':
        return memory.list();
      case 'BANK_SAVE': {
        const answer = savedAnswerSchema.parse(message.answer);
        await memory.save(answer);
        return memory.list();
      }
      case 'BANK_DELETE':
        await memory.remove(z.string().parse(message.id));
        return memory.list();
      case 'RUN':
        return runAll(tabId());
      case 'SCAN':
        return scanTab(tabId());
      case 'CANCEL':
        cancelRun(tabId());
        return true;
      case 'APPLY_REVIEW': {
        const s = await loadState();
        const report = s.history.find((r) => r.id === message.reportId);
        if (!report) throw new Error('Report not found.');
        const row = report.results.find((r) => r.question.id === message.questionId);
        if (!row) throw new Error('Question not found.');
        const answer: Answer = {
          questionId: row.question.id,
          questionType: row.question.type,
          answer: z.union([z.string().max(12000), z.array(z.string())]).parse(message.answer),
          confidence: 1,
          source: 'Manual',
        };
        const tab = await chrome.tabs.get(report.tabId);
        if (new URL(tab.url!).hostname !== report.site)
          throw new Error('Original website is no longer open.');
        const [result] = await fillTab(report.tabId, [row.question], [answer], false);
        if (!result?.success) throw new Error(result?.reason || 'Field changed; run a fresh scan.');
        row.answer = answer;
        row.status = 'filled';
        row.reason = 'Reviewed and verified.';
        await saveReport(report);
        return loadState();
      }
      case 'CLEAR_HISTORY':
        await reports.clear();
        await chrome.storage.local.set({ historyRevision: Date.now(), failures: [] });
        return loadState();
      case 'DELETE_ALL': {
        beginDataReset();
        try {
          await lockVault();
          await chrome.storage.local.clear();
          await chrome.storage.sync.clear();
          await memory.clear();
          await reports.clear();
          await chrome.storage.session.clear();
          return await loadState();
        } finally {
          endDataReset();
        }
      }
      case 'EXPORT':
        return createBackup(message.includePlaintextKeys === true);
      case 'IMPORT_BACKUP': {
        beginDataReset();
        try {
          return await restoreBackup(message.backup);
        } finally {
          endDataReset();
        }
      }
      default:
        throw new Error('Unknown extension request.');
    }
  })()
    .then((data) => respond({ ok: true, data }))
    .catch((error) => {
      const errorMessage =
        error instanceof z.ZodError
          ? message.type === 'IMPORT_BACKUP'
            ? 'Invalid or unsupported backup. Choose a complete FormPilot version 2 backup.'
            : `Invalid settings: ${error.issues
                .slice(0, 3)
                .map((issue) => `${issue.path.join('.') || 'value'}: ${issue.message}`)
                .join('; ')}`
          : error instanceof Error
            ? error.message
            : 'Operation failed.';
      respond({ ok: false, error: errorMessage });
    });
  return true;
});
