import { initialState } from '../shared/defaults';
import type { AppState, SavedAnswer } from '../shared/types';
export const isExtension = typeof chrome !== 'undefined' && !!chrome.runtime?.id;
const PREVIEW_KEY = 'formpilot-preview-v1';
function demoState(): AppState {
  try {
    return { ...initialState(), ...JSON.parse(localStorage.getItem(PREVIEW_KEY) || '{}') };
  } catch {
    return initialState();
  }
}
export async function request<T = AppState>(
  type: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  if (isExtension) {
    const response = await chrome.runtime.sendMessage({ type, ...payload });
    if (!response?.ok)
      throw new Error(
        response?.error || 'Extension worker unavailable. Reload the extension and try again.',
      );
    return response.data as T;
  }
  const s = demoState();
  let data: unknown = s;
  const bank: SavedAnswer[] = JSON.parse(localStorage.getItem(`${PREVIEW_KEY}-bank`) || '[]');
  switch (type) {
    case 'STATE':
      break;
    case 'SAVE_PROFILE': {
      const p = payload.profile as AppState['profiles'][number];
      s.profiles = [...s.profiles.filter((x) => x.id !== p.id), p];
      s.settings.activeProfileId = p.id;
      s.settings.onboardingComplete = true;
      break;
    }
    case 'DELETE_PROFILE':
      s.profiles = s.profiles.filter((p) => p.id !== payload.id);
      s.settings.activeProfileId = s.profiles[0]?.id || '';
      localStorage.setItem(
        `${PREVIEW_KEY}-bank`,
        JSON.stringify(bank.filter((a) => a.profileId !== payload.id)),
      );
      break;
    case 'SAVE_SETTINGS':
      s.settings = payload.settings as AppState['settings'];
      break;
    case 'SAVE_PROVIDERS':
      s.providers = payload.providers as AppState['providers'];
      break;
    case 'BANK_LIST':
      return bank as T;
    case 'BANK_SAVE': {
      const answer = payload.answer as SavedAnswer;
      data = [...bank.filter((a) => a.id !== answer.id), answer];
      localStorage.setItem(`${PREVIEW_KEY}-bank`, JSON.stringify(data));
      return data as T;
    }
    case 'BANK_DELETE':
      data = bank.filter((a) => a.id !== payload.id);
      localStorage.setItem(`${PREVIEW_KEY}-bank`, JSON.stringify(data));
      return data as T;
    case 'CLEAR_HISTORY':
      s.history = [];
      s.failures = [];
      break;
    case 'DELETE_ALL':
      localStorage.removeItem(PREVIEW_KEY);
      localStorage.removeItem(`${PREVIEW_KEY}-bank`);
      return initialState() as T;
    case 'EXPORT':
      return { version: 1, profiles: s.profiles, settings: s.settings, answers: bank } as T;
    default:
      throw new Error(
        'This action needs the installed Chrome extension. API keys and website access are disabled in the web preview.',
      );
  }
  localStorage.setItem(PREVIEW_KEY, JSON.stringify(s));
  return data as T;
}
export function download(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
