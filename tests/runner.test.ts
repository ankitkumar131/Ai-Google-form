// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initialState } from '../src/shared/defaults';
import type { AppState, Question } from '../src/shared/types';
import { question } from './helpers';
const mocked = vi.hoisted(() => ({
  loadState: vi.fn(),
  saveReport: vi.fn(),
  list: vi.fn(),
  withFallback: vi.fn(),
  getKeys: vi.fn(),
}));
vi.mock('../src/services/storage', () => ({
  loadState: mocked.loadState,
  saveReport: mocked.saveReport,
  logFailure: vi.fn(),
}));
vi.mock('../src/services/memory', () => ({ memory: { list: mocked.list } }));
vi.mock('../src/services/vault', () => ({ getKeys: mocked.getKeys }));
vi.mock('../src/services/providers', () => ({ withFallback: mocked.withFallback }));
import { runAll, scanTab } from '../src/extension/runner';
let state: AppState, questions: Question[], sent: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  state = initialState();
  state.profiles = [
    { id: 'p1', name: 'Personal', mandatory: [], firstName: 'Alex', email: 'alex@example.com' },
  ];
  state.settings.activeProfileId = 'p1';
  state.settings.aiEnabled = false;
  questions = [
    question({ id: 'fp-first', text: 'First name' }),
    question({ id: 'fp-email', text: 'Email address', type: 'email' }),
  ];
  mocked.loadState.mockImplementation(async () => state);
  mocked.list.mockResolvedValue([]);
  mocked.saveReport.mockResolvedValue(undefined);
  mocked.getKeys.mockResolvedValue({ openai: 'test-key' });
  sent = vi.fn(
    async (_tabId: number, message: { type: string; answers?: { questionId: string }[] }) =>
      message.type === 'FP_SCAN'
        ? { questions }
        : {
            results: message.answers?.map((a) => ({
              questionId: a.questionId,
              success: true,
              reason: 'Filled and verified.',
            })),
          },
  );
  vi.stubGlobal('chrome', {
    tabs: {
      get: vi.fn(async () => ({ id: 1, url: 'https://example.com/form' })),
      sendMessage: sent,
    },
    webNavigation: { getAllFrames: vi.fn(async () => [{ frameId: 0 }]) },
    storage: { session: { set: vi.fn(async () => {}) } },
  });
});
describe('Answer all orchestration', () => {
  it('fills profile matches locally and verifies results', async () => {
    const report = await runAll(1);
    expect(report.results.every((r) => r.status === 'filled')).toBe(true);
    expect(report.results.map((r) => r.answer?.source)).toEqual(['Profile', 'Profile']);
    expect(mocked.withFallback).not.toHaveBeenCalled();
    expect(mocked.saveReport).toHaveBeenCalledWith(report);
  });
  it('never calls AI for missing identity information or sensitive fields', async () => {
    state.settings.aiEnabled = true;
    questions = [
      question({ text: 'Last name' }),
      question({ id: 'q2', text: 'I agree to the terms', type: 'checkbox', sensitive: true }),
    ];
    const report = await runAll(1);
    expect(report.results.every((r) => r.status === 'review')).toBe(true);
    expect(mocked.withFallback).not.toHaveBeenCalled();
    expect(sent).not.toHaveBeenCalledWith(
      1,
      expect.objectContaining({ type: 'FP_FILL' }),
      expect.anything(),
    );
  });
  it('preserves existing values', async () => {
    questions = [
      question({ text: 'Email address', type: 'email', currentValue: 'existing@example.com' }),
    ];
    const report = await runAll(1);
    expect(report.results[0].status).toBe('skipped');
  });
  it('flags uncertainty without attempting to fill', async () => {
    state.settings.aiEnabled = true;
    questions = [question()];
    mocked.withFallback.mockResolvedValue({
      provider: 'OpenAI',
      answers: [
        {
          questionId: '0:q1',
          questionType: 'text',
          answer: '4',
          confidence: 0.3,
          reason: 'Unsure.',
          source: 'AI',
        },
      ],
    });
    const report = await runAll(1);
    expect(report.results[0].status).toBe('review');
    expect(report.results[0].reason).toBe('Unsure.');
    expect(mocked.withFallback).toHaveBeenCalledOnce();
  });
  it('records provider exhaustion as review and still fills local matches', async () => {
    state.settings.aiEnabled = true;
    questions.push(question());
    mocked.withFallback.mockRejectedValue(new Error('No provider succeeded.'));
    const report = await runAll(1);
    expect(report.results.filter((r) => r.status === 'filled')).toHaveLength(2);
    expect(report.results.find((r) => r.question.text === 'What is 2 + 2?')?.reason).toContain(
      'No provider succeeded',
    );
  });
  it('uses confirmed answers before requesting AI', async () => {
    state.settings.aiEnabled = true;
    questions = [question()];
    mocked.list.mockResolvedValue([
      { id: 's1', question: questions[0].text, answer: '4', type: 'text', profileId: 'p1' },
    ]);
    const report = await runAll(1);
    expect(report.results[0].answer?.source).toBe('Saved answer');
    expect(mocked.withFallback).not.toHaveBeenCalled();
  });
  it('namespaces question IDs across frames', async () => {
    chrome.webNavigation.getAllFrames = vi.fn(async () => [
      { frameId: 0 },
      { frameId: 2 },
    ]) as unknown as typeof chrome.webNavigation.getAllFrames;
    const result = await scanTab(1);
    expect(new Set(result.map((q) => q.id)).size).toBe(4);
  });
  it('rejects Chrome protected pages', async () => {
    chrome.tabs.get = vi.fn(async () => ({
      url: 'chrome://extensions',
    })) as unknown as typeof chrome.tabs.get;
    await expect(scanTab(1)).rejects.toThrow('regular website');
  });
  it('handles zero accessible controls with a useful error', async () => {
    questions = [];
    await expect(runAll(1)).rejects.toThrow('No accessible form fields');
  });
});

describe('existing-tab content script recovery', () => {
  it('injects the script on user action if a tab was open before extension installation', async () => {
    const executeScript = vi.fn(async () => []);
    Object.assign(chrome, { scripting: { executeScript } });
    sent.mockRejectedValueOnce(
      new Error('Could not establish connection. Receiving end does not exist.'),
    );
    const result = await scanTab(1);
    expect(result).toHaveLength(2);
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 1, frameIds: [0] },
      files: ['content.js'],
    });
  });
});
