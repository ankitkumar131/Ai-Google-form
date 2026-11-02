import type { Question, SavedAnswer } from '../src/shared/types';
export const question = (overrides: Partial<Question> = {}): Question => ({
  id: 'q1',
  frameId: 0,
  text: 'What is 2 + 2?',
  type: 'text',
  options: [],
  required: false,
  context: '',
  name: '',
  autocomplete: '',
  currentValue: '',
  sensitive: false,
  ...overrides,
});
export const saved = (overrides: Partial<SavedAnswer> = {}): SavedAnswer => ({
  id: 'a1',
  question: 'What is 2 + 2?',
  answer: '4',
  type: 'text',
  profileId: 'p1',
  updatedAt: new Date().toISOString(),
  ...overrides,
});
