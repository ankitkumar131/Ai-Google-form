export const providerIds = [
  'openai',
  'anthropic',
  'gemini',
  'openrouter',
  'groq',
  'deepseek',
  'custom',
] as const;
export type ProviderId = (typeof providerIds)[number];
export interface Provider {
  id: ProviderId;
  name: string;
  model: string;
  endpoint: string;
  enabled: boolean;
  priority: number;
  timeout: number;
  retries: number;
  hasKey?: boolean;
}
export type Profile = {
  id: string;
  name: string;
  mandatory: string[];
  resumeName?: string;
  resumeText?: string;
} & Record<string, string | string[] | undefined>;
export type QuestionType =
  | 'text'
  | 'textarea'
  | 'email'
  | 'tel'
  | 'number'
  | 'date'
  | 'url'
  | 'radio'
  | 'checkbox'
  | 'select'
  | 'contenteditable'
  | 'unknown';
export interface Option {
  id: string;
  label: string;
  value: string;
}
export interface Question {
  id: string;
  frameId: number;
  text: string;
  type: QuestionType;
  options: Option[];
  required: boolean;
  context: string;
  name: string;
  autocomplete: string;
  currentValue: string;
  sensitive: boolean;
  constraints?: { min?: string; max?: string; pattern?: string; maxLength?: number };
}
export interface Answer {
  questionId: string;
  questionType: QuestionType;
  answer: string | string[];
  confidence: number;
  reason?: string;
  source: 'Profile' | 'Saved answer' | 'AI' | 'Manual';
}
export interface FieldResult {
  question: Question;
  answer?: Answer;
  status: 'filled' | 'review' | 'skipped' | 'failed';
  reason: string;
}
export interface RunReport {
  id: string;
  tabId: number;
  site: string;
  date: string;
  results: FieldResult[];
  provider?: string;
  duration: number;
}
export interface SavedAnswer {
  id: string;
  question: string;
  answer: string | string[];
  type: QuestionType;
  updatedAt: string;
  profileId: string;
}
export interface Failure {
  date: string;
  provider: string;
  message: string;
}
export interface Settings {
  onboardingComplete: boolean;
  activeProfileId: string;
  autoReuse: boolean;
  preserveExisting: boolean;
  confidence: number;
  aiEnabled: boolean;
}
export interface AppState {
  profiles: Profile[];
  providers: Provider[];
  settings: Settings;
  history: RunReport[];
  failures: Failure[];
  vaultConfigured: boolean;
  vaultUnlocked: boolean;
}
export interface FillResult {
  questionId: string;
  success: boolean;
  reason: string;
}
