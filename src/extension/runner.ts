import type { Answer, FieldResult, FillResult, Question, RunReport } from '../shared/types';
import { loadState, logFailure, saveReport } from '../services/storage';
import { memory } from '../services/memory';
import { memoryAnswer, profileAnswer, profileKey, relevantProfile } from '../services/profile';
import { getKeys } from '../services/vault';
import { withFallback } from '../services/providers';
const active = new Map<number, AbortController>();
let maintenance = false;
export function cancelRun(tabId: number) {
  active.get(tabId)?.abort();
  // Broadcast to every frame so cancellation also stops an in-progress fill batch.
  void chrome.tabs.sendMessage(tabId, { type: 'FP_STOP' }).catch(() => {});
}
export function cancelAllRuns() {
  for (const tabId of active.keys()) cancelRun(tabId);
}
export function beginDataReset() {
  if (active.size)
    throw new Error('Cancel active runs and wait for them to finish before deleting data.');
  maintenance = true;
}
export function endDataReset() {
  maintenance = false;
}
export async function scanTab(tabId: number): Promise<Question[]> {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url || !/^https?:\/\//.test(tab.url))
    throw new Error(
      'Open a regular website first. Chrome system pages and the Web Store cannot be filled.',
    );
  const frames = (await chrome.webNavigation.getAllFrames({ tabId })) || [{ frameId: 0 }];
  const groups = await Promise.all(
    frames.map(async (frame) => {
      try {
        let response;
        try {
          response = await chrome.tabs.sendMessage(
            tabId,
            { type: 'FP_SCAN' },
            { frameId: frame.frameId },
          );
        } catch {
          // Existing tabs do not receive declarative scripts after installation.
          // Recover on user action instead of requiring a manual page reload.
          if (!chrome.scripting?.executeScript) throw new Error('Content script unavailable.');
          await chrome.scripting.executeScript({
            target: { tabId, frameIds: [frame.frameId] },
            files: ['content.js'],
          });
          response = await chrome.tabs.sendMessage(
            tabId,
            { type: 'FP_SCAN' },
            { frameId: frame.frameId },
          );
        }
        if (!response?.questions) return [];
        return (response.questions as Question[]).map((q) => ({
          ...q,
          id: `${frame.frameId}:${q.id}`,
          frameId: frame.frameId,
        }));
      } catch {
        return [];
      }
    }),
  );
  const questions = groups.flat().slice(0, 200);
  if (!questions.length)
    throw new Error(
      'No accessible form fields found. Reload the page if the extension was just installed, expand the form, then try again.',
    );
  return questions;
}
export async function fillTab(
  tabId: number,
  questions: Question[],
  answers: Answer[],
  preserveExisting: boolean,
  signal?: AbortSignal,
  verifyOnly = false,
): Promise<FillResult[]> {
  const results: FillResult[] = [];
  for (const frameId of new Set(questions.map((q) => q.frameId))) {
    const batch = answers
      .filter((a) => questions.some((q) => q.frameId === frameId && q.id === a.questionId))
      .map((a) => ({ ...a, questionId: a.questionId.replace(/^\d+:/, '') }));
    if (!batch.length) continue;
    if (signal?.aborted) {
      results.push(
        ...batch.map((a) => ({
          questionId: `${frameId}:${a.questionId}`,
          success: false,
          reason: 'Run cancelled before filling.',
        })),
      );
      continue;
    }
    try {
      const response = await chrome.tabs.sendMessage(
        tabId,
        { type: verifyOnly ? 'FP_VERIFY' : 'FP_FILL', answers: batch, preserveExisting },
        { frameId },
      );
      if (!Array.isArray(response?.results)) throw new Error();
      results.push(
        ...response.results.map((r: FillResult) => ({
          ...r,
          questionId: `${frameId}:${r.questionId}`,
        })),
      );
    } catch {
      results.push(
        ...batch.map((a) => ({
          questionId: `${frameId}:${a.questionId}`,
          success: false,
          reason: 'The page navigated or this frame is no longer available.',
        })),
      );
    }
  }
  return results;
}
async function progress(tabId: number, message: string) {
  await chrome.storage.session.set({
    [`run-${tabId}`]: { running: true, message, startedAt: Date.now() },
  });
}
export async function runAll(tabId: number): Promise<RunReport> {
  if (maintenance) throw new Error('Data is being deleted. Try again in a moment.');
  if (active.has(tabId)) throw new Error('A run is already in progress on this tab.');
  const controller = new AbortController();
  active.set(tabId, controller);
  const budget = setTimeout(() => cancelRun(tabId), 120000);
  const started = Date.now();
  try {
    await progress(tabId, 'Finding accessible form fields…');
    const questions = await scanTab(tabId);
    const state = await loadState();
    const profile = state.profiles.find((p) => p.id === state.settings.activeProfileId);
    const bank = state.settings.autoReuse ? await memory.list() : [];
    const results: FieldResult[] = questions.map((question) => ({
      question,
      status: 'review',
      reason: 'No answer available.',
    }));
    const pending: Question[] = [];
    for (const result of results) {
      const q = result.question;
      if (q.sensitive) {
        result.reason = 'Sensitive information or consent: answer manually.';
        continue;
      }
      if (state.settings.preserveExisting && q.currentValue) {
        result.status = 'skipped';
        result.reason = 'Existing answer preserved.';
        continue;
      }
      if (q.type === 'unknown') {
        result.reason = 'This custom control needs manual input.';
        continue;
      }
      const answer = profileAnswer(q, profile) || memoryAnswer(q, bank, profile?.id || '');
      if (answer) {
        result.answer = answer;
        continue;
      }
      if (profileKey(q)) {
        result.reason = 'This personal detail is missing from your profile.';
        continue;
      }
      if (
        /experience|skills|background|qualifications?|education|degree|employment|work history|certifications?|why.*(hire|join)|about (you|yourself)|cover letter/i.test(
          q.text,
        ) &&
        !Object.keys(relevantProfile([q], profile)).length
      ) {
        result.reason = 'Add relevant professional facts to your profile first.';
        continue;
      }
      pending.push(q);
    }
    let usedProvider: string | undefined;
    const isReady = (row: FieldResult) =>
      row.answer &&
      row.answer.confidence >= state.settings.confidence &&
      (Array.isArray(row.answer.answer)
        ? row.answer.answer.length > 0
        : row.answer.answer.trim().length > 0);
    // Commit local and each completed AI batch immediately. A later failure or
    // the global deadline must not discard answers already obtained safely.
    const commit = async (rows: FieldResult[]) => {
      const ready = rows.filter((row) => row.status === 'review' && isReady(row));
      for (const row of rows.filter((row) => row.answer && !isReady(row)))
        row.reason = row.answer?.reason || 'Not confident enough. Review this answer.';
      if (!ready.length) return;
      if (controller.signal.aborted) {
        for (const row of ready) row.reason = 'Run cancelled before filling.';
        return;
      }
      await progress(tabId, `Filling and verifying ${ready.length} answers…`);
      const filled = await fillTab(
        tabId,
        ready.map((r) => r.question),
        ready.map((r) => r.answer!),
        state.settings.preserveExisting,
        controller.signal,
      );
      for (const row of ready) {
        const outcome = filled.find((f) => f.questionId === row.question.id);
        row.status = outcome?.success ? 'filled' : 'failed';
        row.reason = outcome?.reason || 'Could not verify this field.';
      }
    };
    await commit(results.filter((row) => row.answer));
    if (pending.length && state.settings.aiEnabled) {
      let keys: Record<string, string> | undefined;
      try {
        keys = await getKeys();
      } catch (error) {
        for (const row of results.filter((row) => pending.includes(row.question)))
          row.reason = error instanceof Error ? error.message : 'Unlock your API key vault.';
      }
      if (keys) {
        const queue: { questions: Question[]; round: number }[] = [];
        for (let i = 0; i < pending.length; i += 10)
          queue.push({ questions: pending.slice(i, i + 10), round: 0 });
        let recoveries = 0;
        const enqueue = (questions: Question[], round: number) => {
          if (!questions.length || round > 2 || recoveries >= 6) return;
          recoveries++;
          queue.push({ questions, round });
        };
        for (let index = 0; index < queue.length && !controller.signal.aborted; index++) {
          const task = queue[index],
            rows = task.questions.map((q) => results.find((row) => row.question.id === q.id)!);
          await progress(
            tabId,
            `${task.round ? 'Recovering missing' : 'Preparing'} answers: ${results.filter((r) => r.answer).length} of ${questions.length} ready…`,
          );
          try {
            const response = await withFallback(
              state.providers,
              keys,
              task.questions,
              profile,
              logFailure,
              controller.signal,
              true,
            );
            usedProvider = response.provider;
            for (const answer of response.answers) {
              const row = rows.find(
                (row) =>
                  row.question.id === answer.questionId &&
                  row.question.type === answer.questionType,
              );
              if (row && !row.answer) {
                row.answer = answer;
                row.reason = answer.reason || 'AI suggestion ready for review.';
              }
            }
            await commit(rows);
            const missing = rows.filter((row) => !row.answer);
            for (const row of missing)
              row.reason =
                'The provider omitted or returned an invalid answer for this question. Review manually if bounded recovery cannot resolve it.';
            // Retry ONLY omitted/invalid rows, never low-confidence/empty answers
            // or already-filled fields. Other initial batches get their turn first.
            enqueue(
              missing.map((row) => row.question),
              task.round + 1,
            );
          } catch (error) {
            for (const row of rows.filter((row) => !row.answer))
              row.reason =
                error instanceof Error ? error.message : 'AI is unavailable for this batch.';
            // Smaller requests can recover a malformed batch. Authentication,
            // network and quota errors already have provider-level retry policy.
            if (
              error instanceof Error &&
              'failureKind' in error &&
              error.failureKind === 'format' &&
              task.questions.length > 1
            ) {
              const half = Math.ceil(task.questions.length / 2);
              enqueue(task.questions.slice(0, half), task.round + 1);
              enqueue(task.questions.slice(half), task.round + 1);
            }
          }
        }
      }
    } else if (pending.length) {
      for (const row of results.filter((row) => pending.includes(row.question)))
        row.reason = 'AI answers are disabled.';
    }
    if (controller.signal.aborted)
      for (const row of results.filter((row) => row.status === 'review' && !row.answer))
        row.reason =
          'Run cancelled or reached its 120-second limit before this question could be answered. Completed answers were retained.';
    // Read-only final audit: a later re-render must not make an earlier success
    // look completed when its value disappeared. Never overwrite a user edit.
    const completed = results.filter((row) => row.status === 'filled' && row.answer);
    if (completed.length) {
      const retained = await fillTab(
        tabId,
        completed.map((row) => row.question),
        completed.map((row) => row.answer!),
        true,
        undefined,
        true,
      );
      for (const row of completed) {
        const verified = retained.find((result) => result.questionId === row.question.id);
        if (!verified?.success) {
          row.status = 'review';
          row.reason =
            verified?.reason || 'Answer was not retained at the final check. Review this field.';
        }
      }
    }
    const tab = await chrome.tabs.get(tabId);
    const report: RunReport = {
      id: crypto.randomUUID(),
      tabId,
      site: new URL(tab.url!).hostname,
      date: new Date().toISOString(),
      results,
      provider: usedProvider,
      duration: Date.now() - started,
    };
    await saveReport(report);
    return report;
  } finally {
    clearTimeout(budget);
    active.delete(tabId);
    await chrome.storage.session.set({
      [`run-${tabId}`]: { running: false, message: '', startedAt: Date.now() },
    });
  }
}
