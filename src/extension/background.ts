import { z } from 'zod';
import { profileSchema, providerSchema, savedAnswerSchema, settingsSchema } from '../shared/schema';
import { loadState, saveReport } from '../services/storage';
import { memory, reports } from '../services/memory';
import { getKeys, lockVault, setKey, unlockVault } from '../services/vault';
import { queryProvider, validateEndpoint } from '../services/providers';
import {
  beginDataReset,
  endDataReset,
  cancelAllRuns,
  cancelRun,
  fillTab,
  runAll,
  scanTab,
} from './runner';
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
      case 'SAVE_PROVIDERS': {
        const providers = z.array(providerSchema).length(7).parse(message.providers);
        if (new Set(providers.map((p) => p.id)).size !== 7)
          throw new Error('Provider IDs must be unique.');
        for (const p of providers) {
          if (p.endpoint) validateEndpoint(p.endpoint);
          if (p.enabled && (!p.model || !p.endpoint))
            throw new Error('Enabled providers need a model and endpoint.');
        }
        const s = await loadState();
        await chrome.storage.local.set({
          providers: providers.map((p) => ({
            ...p,
            hasKey: s.providers.find((x) => x.id === p.id)?.hasKey || false,
          })),
        });
        return loadState();
      }
      case 'UNLOCK':
        await unlockVault(z.string().max(1000).parse(message.passphrase));
        return loadState();
      case 'LOCK':
        cancelAllRuns();
        await lockVault();
        return loadState();
      case 'SET_KEY': {
        const id = providerSchema.shape.id.parse(message.id);
        await setKey(id, z.string().max(2000).parse(message.key));
        const s = await loadState();
        await chrome.storage.local.set({
          providers: s.providers.map((p) =>
            p.id === id
              ? {
                  ...p,
                  hasKey: !!message.key.trim(),
                  enabled: message.key.trim() ? p.enabled : false,
                }
              : p,
          ),
        });
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
        const p = providerSchema.parse(message.provider);
        const keys = await getKeys();
        if (!keys[p.id]) throw new Error('Save an API key first.');
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
        return 'Connected. API access and structured answers verified.';
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
      case 'EXPORT': {
        const s = await loadState();
        return {
          version: 1,
          profiles: s.profiles,
          settings: s.settings,
          answers: await memory.list(),
        };
      }
      default:
        throw new Error('Unknown extension request.');
    }
  })()
    .then((data) => respond({ ok: true, data }))
    .catch((error) => {
      const message =
        error instanceof z.ZodError
          ? 'Invalid settings. Check your input values.'
          : error instanceof Error
            ? error.message
            : 'Operation failed.';
      respond({ ok: false, error: message });
    });
  return true;
});
