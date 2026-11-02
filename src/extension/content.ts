import { FormDetector } from './detector';
import type { Answer } from '../shared/types';
const detector = new FormDetector();
let dirty = true;
let fillingStopped = false;
let url = location.href;
// Debounced invalidation, not repeated AI requests. Every user action gets a fresh scan.
let timer: ReturnType<typeof setTimeout>;
const invalidate = () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    dirty = true;
  }, 200);
};
const observers = new WeakSet<Node>();
function observe(root: Document | ShadowRoot) {
  if (!observers.has(root)) {
    observers.add(root);
    new MutationObserver(invalidate).observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden', 'disabled', 'aria-hidden', 'aria-disabled', 'aria-expanded'],
    });
  }
  for (const e of root.querySelectorAll('*')) if (e.shadowRoot) observe(e.shadowRoot);
}
observe(document);
window.addEventListener('popstate', invalidate);
window.addEventListener('hashchange', invalidate);
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message?.type === 'FP_SCAN') {
    if (location.href !== url) {
      dirty = true;
      url = location.href;
    }
    observe(document);
    const questions = detector.scan();
    dirty = false;
    respond({ questions });
    return;
  }
  if (message?.type === 'FP_STOP') {
    fillingStopped = true;
    respond({ stopped: true });
    return;
  }
  if (message?.type === 'FP_FILL') {
    fillingStopped = false;
    // Only extension-origin background messages can initiate fills, never window.postMessage.
    (async () => {
      const results = [];
      for (const answer of message.answers as Answer[]) {
        if (fillingStopped) {
          results.push({
            questionId: answer.questionId,
            success: false,
            reason: 'Run cancelled before filling.',
          });
          continue;
        }
        results.push(await detector.fill(answer, message.preserveExisting !== false));
      }
      respond({ results });
    })().catch(() => respond({ error: 'Content script could not fill fields.' }));
    return true;
  }
  if (message?.type === 'FP_STATUS') respond({ dirty });
});
