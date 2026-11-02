import type { AppState, RunReport, SavedAnswer } from '../shared/types';
export type Page = 'overview' | 'profiles' | 'providers' | 'bank' | 'activity' | 'settings';
export interface PageProps {
  state: AppState;
  bank: SavedAnswer[];
  go: (p: Page) => void;
  update: (type: string, payload: Record<string, unknown>, success?: string) => Promise<AppState>;
  notify: (m: string) => void;
  refresh: () => Promise<void>;
  setReport: (r: RunReport) => void;
}
